export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  coverUrl: string;
  genres: string[];
  language?: string;
  releasedAt?: string;
  durationSeconds: number;
  streamUrl?: string;
  licenseUrl: string;
  attributionUrl: string;
  attributionProvider: string;
};

export interface MusicPlayer {
  readonly duration: number | undefined;
  readonly position: number;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  playClip(startSeconds: number, lengthSeconds: number): Promise<void>;
  destroy(): void;
}

export interface MusicProvider {
  readonly id: string;
  readonly capabilities: {
    searchTracks: boolean;
    searchArtists: boolean;
    streamAudio: boolean;
    seek: boolean;
    clipPlayback: boolean;
  };
  searchTracks(query: string, signal?: AbortSignal, country?: string, searchAsArtist?: boolean): Promise<MusicTrack[]>;
  createPlayer(streamUrl: string, onEnded?: () => void, onError?: (error: Error) => void): MusicPlayer;
}

const ITUNES_SEARCH_API = 'https://itunes.apple.com/search';

type ITunesSong = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artistId?: number;
  collectionName?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
  wrapperType?: string;
};

type ITunesArtist = { artistId?: number; artistName?: string; wrapperType?: string };

const normalizeArtist = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[.,]/g, '').trim().replace(/\s+/g, ' ');

export function splitArtistCredits(credit: string) {
  return credit.split(/\s*(?:&|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\be\b|,(?!\s*the creator\b))\s*/i).map(name => name.trim()).filter(Boolean);
}

export function artistNameMatches(candidate: string, expected: string) {
  const expectedName = normalizeArtist(expected);
  return normalizeArtist(candidate) === expectedName || splitArtistCredits(candidate).some(name => normalizeArtist(name) === expectedName);
}

const RNB_ARTISTS = [
  'Frank Ocean', 'Daniel Caesar', 'Brent Faiyaz', 'Bryson Tiller', 'PARTYNEXTDOOR',
  'SZA', 'The Weeknd', 'Giveon', 'Miguel', 'Summer Walker', 'H.E.R.', '6LACK',
  'Jhené Aiko', 'Lucky Daye', 'Coco Jones', 'Kehlani', 'Alicia Keys', 'Usher',
  'Chris Brown', 'Trey Songz', 'Aaliyah', 'Mary J. Blige', 'Toni Braxton',
  'Erykah Badu', 'DVSN', 'Ty Dolla $ign', 'Jorja Smith', 'Ravyn Lenae',
];

const GENRE_ALIASES: Record<string, string[]> = {
  'r&b': ['r&b/soul', 'r&b', 'soul', 'contemporary r&b'],
  rnb: ['r&b/soul', 'r&b', 'soul', 'contemporary r&b'],
  trap: ['hip-hop/rap', 'hip-hop', 'rap'],
  'k-pop': ['k-pop'],
  pop: ['pop'],
  rock: ['rock'],
  'hip-hop': ['hip-hop/rap', 'hip-hop', 'rap'],
  electronic: ['electronic', 'eletrônica', 'dance', 'house', 'techno'],
  indie: ['indie', 'alternative', 'alternativo'],
  funk: ['funk', 'baile funk'],
  samba: ['samba'],
  mpb: ['mpb', 'música brasileira', 'brasileira'],
};

export function filterMusicByGenre(tracks: MusicTrack[], genre: string): MusicTrack[] {
  if (!genre || ['r&b', 'rnb'].includes(normalizeArtist(genre))) return tracks;
  const accepted = GENRE_ALIASES[normalizeArtist(genre)] || [normalizeArtist(genre)];
  return tracks.filter(track => track.genres.some(value => accepted.includes(normalizeArtist(value))));
}

export function mapITunesSong(song: ITunesSong): MusicTrack | undefined {
  if (!song.trackId || !song.trackName || !song.artistName) return undefined;
  return {
    id: `itunes-${song.trackId}`,
    title: song.trackName,
    artist: song.artistName,
    artistId: String(song.artistId ?? song.artistName),
    album: song.collectionName || '',
    coverUrl: song.artworkUrl100?.replace('100x100', '600x600') || '',
    genres: song.primaryGenreName ? [song.primaryGenreName] : [],
    releasedAt: song.releaseDate,
    durationSeconds: song.trackTimeMillis ? song.trackTimeMillis / 1000 : 0,
    streamUrl: song.previewUrl,
    licenseUrl: '',
    attributionUrl: song.trackViewUrl || 'https://music.apple.com/',
    attributionProvider: 'Apple Music',
  };
}

export class AppleMusicProvider implements MusicProvider {
  readonly id = 'apple-itunes';
  readonly capabilities = { searchTracks: true, searchArtists: true, streamAudio: true, seek: true, clipPlayback: true };

  async searchTracks(query = '', signal?: AbortSignal, country = 'BR', searchAsArtist = true): Promise<MusicTrack[]> {
    const countries = [...new Set(country.split(/[,+]/).map(value => value.trim().toUpperCase()).filter(Boolean))];
    if (countries.length > 1) {
      const catalogs = await Promise.all(countries.map(async storefront => {
        try { return await this.searchTracks(query, signal, storefront, searchAsArtist); }
        catch (error) { if (signal?.aborted) throw error; return []; }
      }));
      return [...new Map(catalogs.flat().map(track => [track.id, track])).values()];
    }
    const storefront = countries[0] || 'BR';
    const url = new URL(ITUNES_SEARCH_API);
    const term = query.trim() || 'pop hits';
    const isRnBSearch = /^(?:r&b|rnb|r&b\/soul)$/i.test(term);
    const artistTracks = query.trim() && searchAsArtist
      ? await this.searchArtistTracks(term, signal, storefront)
      : isRnBSearch ? await this.searchRnBTracks(signal, storefront) : [];
    url.searchParams.set('term', term);
    url.searchParams.set('entity', 'song');
    url.searchParams.set('country', storefront);
    url.searchParams.set('limit', '200');
    let response: Response;
    try {
      response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (artistTracks.length) return artistTracks;
      throw new Error('Não foi possível acessar a busca de músicas da Apple. Verifique sua conexão e tente novamente.');
    }
    if (response.status === 429) {
      if (artistTracks.length) return artistTracks;
      throw new Error('A Apple limitou temporariamente as buscas. Aguarde e tente novamente.');
    }
    if (!response.ok) {
      if (artistTracks.length) return artistTracks;
      throw new Error(`A busca da Apple respondeu HTTP ${response.status}.`);
    }
    const body = await response.json() as { results?: ITunesSong[] };
    const searchedTracks = (body.results || []).map(mapITunesSong).filter((track): track is MusicTrack => !!track);
    if (!artistTracks.length) return searchedTracks;
    const matchingSearchTracks = isRnBSearch
      ? searchedTracks.filter(track => RNB_ARTISTS.some(artist => artistNameMatches(track.artist, artist)))
      : searchedTracks.filter(track => artistNameMatches(track.artist, term));
    return [...new Map([...artistTracks, ...matchingSearchTracks].map(track => [track.id, track])).values()];
  }

  private async searchRnBTracks(signal?: AbortSignal, country = 'BR'): Promise<MusicTrack[]> {
    const tracks: MusicTrack[] = [];
    for (let index = 0; index < RNB_ARTISTS.length; index += 4) {
      const batch = RNB_ARTISTS.slice(index, index + 4);
      const results = await Promise.all(batch.map(artist => this.searchArtistTracks(artist, signal, country)));
      tracks.push(...results.flat());
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    }
    return [...new Map(tracks.map(track => [track.id, track])).values()];
  }

  private async searchArtistTracks(query: string, signal?: AbortSignal, country = 'BR'): Promise<MusicTrack[]> {
    const artistUrl = new URL(ITUNES_SEARCH_API);
    artistUrl.searchParams.set('term', query);
    artistUrl.searchParams.set('entity', 'musicArtist');
    artistUrl.searchParams.set('attribute', 'artistTerm');
    artistUrl.searchParams.set('country', country);
    artistUrl.searchParams.set('limit', '25');
    try {
      const artistResponse = await fetch(artistUrl, { signal, headers: { Accept: 'application/json' } });
      if (!artistResponse.ok) return [];
      const artists = (await artistResponse.json() as { results?: ITunesArtist[] }).results || [];
      const exactArtist = artists.find(artist => artist.artistId && artist.artistName && normalizeArtist(artist.artistName) === normalizeArtist(query));
      if (!exactArtist?.artistId) return [];

      const lookupUrl = new URL('https://itunes.apple.com/lookup');
      lookupUrl.searchParams.set('id', String(exactArtist.artistId));
      lookupUrl.searchParams.set('entity', 'song');
      lookupUrl.searchParams.set('country', country);
      lookupUrl.searchParams.set('limit', '200');
      const tracksResponse = await fetch(lookupUrl, { signal, headers: { Accept: 'application/json' } });
      if (!tracksResponse.ok) return [];
      const songs = (await tracksResponse.json() as { results?: ITunesSong[] }).results || [];
      return songs.filter(song => song.wrapperType === 'track').map(mapITunesSong).filter((track): track is MusicTrack => !!track);
    } catch (error) {
      if (signal?.aborted) throw error;
      return [];
    }
  }

  createPlayer(streamUrl: string, onEnded?: () => void, onError?: (error: Error) => void): MusicPlayer {
    return new HtmlAudioClipPlayer(streamUrl, onEnded, onError);
  }
}

export class HtmlAudioClipPlayer implements MusicPlayer {
  private audio: HTMLAudioElement;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(src: string, private readonly onEnded?: () => void, private readonly onError?: (error: Error) => void) {
    this.audio = new Audio(src);
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => { this.clearTimer(); this.onEnded?.(); });
    this.audio.addEventListener('error', () => onError?.(new Error('O preview da Apple não está acessível ou foi removido.')));
  }

  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : undefined; }
  get position() { return this.audio.currentTime; }
  get volume() { return this.audio.volume; }
  set volume(value: number) { this.audio.volume = Math.min(1, Math.max(0, value)); }
  async play() { await this.audio.play(); }
  pause() { this.clearTimer(); this.audio.pause(); }
  seek(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('A posição deve ser um número positivo.');
    this.audio.currentTime = seconds;
  }

  async playClip(startSeconds: number, lengthSeconds: number) {
    if (!Number.isFinite(startSeconds) || !Number.isFinite(lengthSeconds) || startSeconds < 0 || lengthSeconds <= 0) {
      throw new RangeError('Intervalo de trecho inválido.');
    }
    this.pause();
    const startPlayback = async () => {
      const duration = this.duration;
      if (duration !== undefined && startSeconds >= duration) throw new RangeError('O trecho solicitado está fora da duração do preview.');
      this.seek(startSeconds);
      await this.audio.play();
      const availableLength = duration === undefined ? lengthSeconds : Math.min(lengthSeconds, duration - startSeconds);
      this.timer = setTimeout(() => { this.audio.pause(); this.onEnded?.(); }, availableLength * 1000);
    };
    if (this.audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Não foi possível carregar o preview da Apple.')); };
        const cleanup = () => {
          this.audio.removeEventListener('loadedmetadata', onReady);
          this.audio.removeEventListener('error', onError);
        };
        this.audio.addEventListener('loadedmetadata', onReady, { once: true });
        this.audio.addEventListener('error', onError, { once: true });
        this.audio.load();
      });
    }
    await startPlayback();
  }

  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  destroy() { this.pause(); this.audio.removeAttribute('src'); this.audio.load(); }
}
