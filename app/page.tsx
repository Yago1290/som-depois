'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Moon, Music2, Pause, Play, RotateCw, Sun, Volume2 } from 'lucide-react';
import { STAGES, findSongGuess, normalize, songKey } from './game';
import { AppleMusicProvider, artistNameMatches, filterMusicByGenre, splitArtistCredits, type MusicPlayer, type MusicTrack } from './music/provider';

const provider = new AppleMusicProvider();


export default function Home() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [round, setRound] = useState<MusicTrack | null>(null);
  const [stage, setStage] = useState(0);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [easySearch, setEasySearch] = useState(false);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [genre, setGenre] = useState('');
  const [origin, setOrigin] = useState('');
  const [artist, setArtist] = useState('');
  const [artistQuery, setArtistQuery] = useState('');
  const [artistMenuOpen, setArtistMenuOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'expert' | 'impossible'>('medium');
  const playerRef = useRef<MusicPlayer | null>(null);
  const playedSongsRef = useRef(new Set<string>());
  const guessedSongsRef = useRef(new Set<string>());
  const startingStage = 0;

  const startRound = useCallback((catalog: MusicTrack[]) => {
    const unseenTracks = catalog.filter(track => !playedSongsRef.current.has(songKey(track)));
    if (!unseenTracks.length) {
      setRound(null);
      setMessage('Você já jogou todas as músicas disponíveis neste catálogo. Troque o artista, gênero ou localidade para continuar sem repetir.');
      return false;
    }
    const next = unseenTracks[Math.floor(Math.random() * unseenTracks.length)];
    playedSongsRef.current.add(songKey(next));
    setRound(next);
    setStage(startingStage);
    setGuess('');
    setResult(null);
    setMessage('');
    setPlaying(false);
    return true;
  }, [startingStage]);

  const chooseTrack = useCallback((catalog = tracks) => {
    if (!catalog.length) return;
    playerRef.current?.destroy();
    playerRef.current = null;
    const playableCatalog = catalog.filter(track => !!track.streamUrl);
    if (!playableCatalog.length) {
      setRound(null);
      setMessage('A busca da Apple encontrou músicas, mas nenhuma nesta busca tem preview disponível. Tente outro artista ou busca.');
      return;
    }
    const artistTracks = artist ? playableCatalog.filter(track => artistNameMatches(track.artist, artist)) : playableCatalog;
    if (!artistTracks.length) {
      setRound(null);
      setMessage('Não há faixas deste artista na busca. Escolha outro artista ou “Qualquer artista”.');
      return;
    }
    startRound(artistTracks);
  }, [artist, startRound, tracks]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('som-depois-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('som-depois-theme', theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    playerRef.current?.destroy();
    playerRef.current = null;
    const timer = setTimeout(() => {
      const terms = artistQuery.trim() || genre || 'pop hits';
      const country = origin === 'international' ? 'US' : origin === 'both' ? 'BR,US' : 'BR';
      provider.searchTracks(terms, controller.signal, country, !!artistQuery.trim()).then(found => {
      if (!found.length) throw new Error('A Apple não encontrou faixas para essa busca e região. Tente outro filtro.');
      const genreMatches = filterMusicByGenre(found, genre);
      setTracks(genreMatches);
      if (!genreMatches.length) throw new Error(`A Apple não classificou resultados no gênero “${genre}” para essa busca.`);
      const playable = genreMatches.filter(track => !!track.streamUrl);
      const candidates = artist ? playable.filter(track => artistNameMatches(track.artist, artist)) : playable;
      if (!candidates.length) {
        setRound(null);
        setMessage(found.some(track => artistNameMatches(track.artist, artist))
          ? 'A Apple encontrou esse artista, mas as faixas retornadas não têm preview disponível. Escolha outro artista.'
          : 'Este artista não apareceu nesta busca. Escolha outro ou “Qualquer artista”.');
      } else {
        startRound(candidates);
      }
      }).catch(error => {
        if (!controller.signal.aborted) {
          setRound(null);
          setMessage(error instanceof Error ? error.message : 'Falha ao buscar músicas.');
        }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, artistQuery ? 450 : 0);
    return () => { clearTimeout(timer); controller.abort(); playerRef.current?.destroy(); };
  }, [artistQuery, genre, origin, startRound]);

  useEffect(() => () => playerRef.current?.destroy(), []);

  const changeArtist = (value: string) => {
    setArtist(value);
    setArtistQuery(value);
    setArtistMenuOpen(false);
    const playableTracks = tracks.filter(track => !!track.streamUrl);
    const candidates = value ? playableTracks.filter(track => artistNameMatches(track.artist, value)) : playableTracks;
    if (!candidates.length) return;
    playerRef.current?.destroy();
    playerRef.current = null;
    startRound(candidates);
  };

  const play = async () => {
    if (!round?.streamUrl) {
      setMessage('Esta música não tem preview disponível na Apple. Sorteie outra faixa.');
      return;
    }
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!playerRef.current) {
      playerRef.current = provider.createPlayer(round.streamUrl, () => setPlaying(false), error => {
        setPlaying(false);
        setMessage(`${error.message} Tente outra faixa.`);
      });
      playerRef.current.volume = volume;
    }
    try {
      await playerRef.current.playClip(0, STAGES[stage]);
      setPlaying(true);
      setMessage('');
    } catch {
      playerRef.current?.destroy();
      playerRef.current = null;
      setMessage('Esta faixa não pode ser reproduzida neste momento. Tente outra.');
    }
  };

  const advanceStage = () => {
    if (!round || result) return;
    playerRef.current?.pause();
    setPlaying(false);
    if (stage < STAGES.length - 1) {
      setStage(current => current + 1);
      setMessage('Trecho ampliado.');
    } else {
      setResult('lose');
      setMessage(`Era “${round.title}”, de ${round.artist}.`);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!round || !guess.trim() || result) return;
    const guessableTracks = tracks.filter(track => !!track.streamUrl);
    const guessedTrack = findSongGuess(guess, guessableTracks);
    if (!guessedTrack) {
      setMessage('Esse título não está no catálogo. Escolha uma música da lista para tentar.');
      return;
    }
    const guessedSongKey = songKey(guessedTrack);
    if (guessedSongsRef.current.has(guessedSongKey)) {
      setMessage('Você já tentou essa música nesta partida. Escolha outra.');
      return;
    }
    guessedSongsRef.current.add(guessedSongKey);
    playedSongsRef.current.add(guessedSongKey);
    if (normalize(guess) === normalize(round.title)) {
      setResult('win');
      setMessage('Acertou!');
      playerRef.current?.pause();
      setPlaying(false);
    } else {
      advanceStage();
      setMessage(stage < STAGES.length - 1 ? 'Música errada — trecho ampliado.' : `Era “${round.title}”, de ${round.artist}.`);
    }
  };

  const skip = () => advanceStage();

  const suggestions = easySearch && guess.trim()
    ? tracks.filter(track => normalize(`${track.title} ${track.artist}`).includes(normalize(guess)) || artistNameMatches(track.artist, guess)).slice(0, 10)
    : [];

  return <main className="game-shell game-layout">
    <header className="masthead"><a className="wordmark" href="/">som<span>•</span>depois</a><span className="masthead-note">UM JOGO DE ESCUTA</span><button className="theme-switch" type="button" role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>{theme === 'dark' ? <Moon size={15}/> : <Sun size={15}/>}<span>{theme === 'dark' ? 'Escuro' : 'Claro'}</span></button></header>
    <aside className="side-panel filters-panel" aria-label="Filtros da partida">
      <label>GÊNERO<select value={genre} onChange={event => { setGenre(event.target.value); setArtist(''); setArtistQuery(''); }}><option value="">Todos os gêneros</option><option value="r&b">R&B</option><option value="trap">Trap / Rap</option><option value="k-pop">K-pop</option><option value="pop">Pop</option><option value="rock">Rock</option><option value="hip-hop">Hip-hop / Rap</option><option value="electronic">Eletrônica</option><option value="indie">Indie</option><option value="funk">Funk</option><option value="samba">Samba</option><option value="mpb">MPB</option></select></label>
      <label>LOJA DO CATÁLOGO<select value={origin} onChange={event => { setOrigin(event.target.value); setArtist(''); setArtistQuery(''); }}><option value="">Brasil</option><option value="international">Estados Unidos</option><option value="both">Geral (Brasil + Estados Unidos)</option></select><small className="control-hint">Geral reúne resultados das lojas do Brasil e dos Estados Unidos.</small></label>
      <label className="artist-search-label">ARTISTA<div className="artist-search"><input role="combobox" aria-autocomplete="list" aria-expanded={artistMenuOpen} aria-label="Buscar artista" placeholder="Digite um artista" value={artistQuery} onFocus={() => setArtistMenuOpen(true)} onBlur={() => setTimeout(() => setArtistMenuOpen(false), 120)} onChange={event => { setArtistQuery(event.target.value); setArtist(''); setArtistMenuOpen(true); }}/>{artistQuery && <button type="button" className="clear-artist" aria-label="Limpar artista" onClick={() => changeArtist('')}>×</button>}{artistMenuOpen && <div className="artist-suggestions" role="listbox">{Array.from(new Set(tracks.flatMap(track => splitArtistCredits(track.artist)))).filter(name => !artistQuery || normalize(name).includes(normalize(artistQuery))).slice(0, 8).map(name => <button type="button" role="option" key={name} onMouseDown={event => event.preventDefault()} onClick={() => changeArtist(name)}>{name}</button>)}{artistQuery.trim() && <button type="button" className="artist-search-action" onMouseDown={event => event.preventDefault()} onClick={() => changeArtist(artistQuery.trim())}>Buscar “{artistQuery.trim()}”</button>}{!artistQuery && <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { changeArtist(''); setArtistMenuOpen(false); }}>Qualquer artista</button>}</div>}</div></label>
      <div className="difficulty-group"><span className="panel-label">DIFICULDADE · TODAS AS FAIXAS</span>{([['easy','Fácil'],['medium','Médio'],['hard','Difícil'],['expert','Expert'],['impossible','Impossível']] as const).map(([value,label])=><button key={value} type="button" className={`difficulty-option ${difficulty===value?'selected':''}`} onClick={()=>{setDifficulty(value);if(round&&!result){setStage(0);const playableTracks=tracks.filter(track=>!!track.streamUrl);const pool=artist?playableTracks.filter(track=>artistNameMatches(track.artist,artist)):playableTracks;playerRef.current?.destroy();playerRef.current=null;startRound(pool);}}}><span>{label}</span><small>Repertório completo</small></button>)}</div>
      <button className="quiet-action" type="button" onClick={()=>chooseTrack()} disabled={!tracks.length}><RotateCw size={14}/> Sortear outra</button>
    </aside>
    <section className="center-stage" aria-label="Jogo">
      <div className="game-brand">som<span>•</span>depois</div>
      <div className={`record-art ${result?'revealed':''}`} aria-label={result?'Capa da música':'Capa escondida'}>{result&&round?.coverUrl?<img src={round.coverUrl} alt="Capa do álbum"/>:<div className="record-disc"><Music2 size={44}/><span/></div>}</div>
      {result ? <div className="round-reveal"><span className={`result-badge ${result}`}>{result==='win'?'ACERTOU':'FIM DE JOGO'}</span><h1>{round?.title}</h1><p>{round?.artist}</p><a className="source-link" href={round?.attributionUrl} target="_blank" rel="noreferrer">Abrir no Apple Music ↗</a></div> : <div className="round-prompt"><span className="round-kicker">{loading?'BUSCANDO FAIXA':'QUAL É A MÚSICA?'}</span><h1>{loading?'Preparando a rodada…':'Ouça. Pense. Acerte.'}</h1><p>{loading?'Já vamos começar.':'Cada tentativa revela um trecho maior.'}</p></div>}
      {!result && <form className="guess-form" onSubmit={submit}><div className="guess-wrap"><input id="guess" value={guess} onFocus={()=>setSearchMenuOpen(true)} onBlur={()=>setTimeout(()=>setSearchMenuOpen(false),120)} onChange={event=>{setGuess(event.target.value);setSearchMenuOpen(true);}} placeholder="Digite o título de uma música" autoComplete="off" disabled={loading||!round}/>{searchMenuOpen&&suggestions.length>0&&<div className="guess-suggestions" role="listbox">{suggestions.map(track=><button type="button" role="option" key={track.id} onMouseDown={event=>event.preventDefault()} onClick={()=>{setGuess(track.title);setSearchMenuOpen(false);}}><strong>{track.title}</strong><span>{track.artist}</span></button>)}</div>}</div><button type="submit" className="submit-guess" disabled={!guess.trim()||!round}>Tentar <ArrowRight size={16}/></button><button type="button" className="skip-guess" onClick={skip} disabled={!round||!!result}>Pular <ArrowRight size={16}/></button><button type="button" className="mobile-playback" onClick={play} disabled={loading||!round?.streamUrl||!!result}>{playing?<Pause size={16}/>:<Play size={16}/>}<span>{playing?'Pausar trecho':`Ouvir ${STAGES[stage]}s`}</span></button></form>}
      <p className="message" aria-live="polite">{message||(!result?'A cada erro, o trecho fica um pouco maior.':'')}</p>
      {result&&<div className="round-actions"><button type="button" className="challenge-button" onClick={()=>{if(round)navigator.clipboard?.writeText(`Jogue Som depois: ${window.location.href}`);setMessage('Desafio copiado para compartilhar!');}}>Desafiar alguém</button><button type="button" className="next-button" onClick={()=>chooseTrack()}><RotateCw size={15}/> Próxima música</button></div>}
      {!loading&&!round&&<button type="button" className="next-button" onClick={()=>{setLoading(true);const country=origin==='international'?'US':origin==='both'?'BR,US':'BR';const terms=artistQuery.trim()||genre||'pop hits';provider.searchTracks(terms,undefined,country,!!artistQuery.trim()).then(found=>{const filtered=filterMusicByGenre(found,genre);setTracks(filtered);chooseTrack(filtered);}).catch(error=>setMessage(error instanceof Error?error.message:'Falha na busca.')).finally(()=>setLoading(false));}}>Tentar novamente</button>}
      {round&&<div className="track-credit"><a href={round.attributionUrl} target="_blank" rel="noreferrer">Abrir faixa no Apple Music ↗</a>{round.durationSeconds > 0 && <span>Preview de até {Math.round(round.durationSeconds)}s</span>}</div>}
    </section>
    <aside className="side-panel playback-panel" aria-label="Controles de reprodução">
      <section className="control-section"><span className="panel-label">REPRODUÇÃO</span><button type="button" className="playback-main" onClick={play} disabled={loading||!round?.streamUrl||!!result}>{playing?<Pause size={16}/>:<Play size={16}/>}<span>{playing?'Pausar trecho':`Ouvir ${STAGES[stage]}s`}</span></button><p className="control-hint">Trecho reproduzido desde o início.</p></section>
      <section className="control-section"><span className="panel-label">BUSCA FÁCIL</span><button type="button" role="switch" aria-checked={easySearch} className={`easy-search-switch ${easySearch?'enabled':''}`} onClick={()=>setEasySearch(value=>!value)}><span>Mostrar sugestões de músicas</span><i/></button></section>
      <section className="control-section"><span className="panel-label">OUVIR ATÉ</span><div className="clip-grid">{STAGES.map((seconds,index)=><button type="button" key={seconds} className={index===stage?'clip-option active':index<stage?'clip-option used':'clip-option'} onClick={()=>{if(index<=stage&&!result){setStage(index);playerRef.current?.pause();setPlaying(false);}}} disabled={index>stage||!!result}>{seconds}s</button>)}</div></section>
      <section className="control-section volume-section"><label htmlFor="volume" className="panel-label">VOLUME <Volume2 size={14}/></label><input id="volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event=>{const value=Number(event.target.value);setVolume(value);if(playerRef.current)playerRef.current.volume=value;}}/></section>
      <button type="button" className="theme-switch side-theme" role="switch" aria-checked={theme==='dark'} onClick={()=>setTheme(current=>current==='light'?'dark':'light')}>{theme==='dark'?<Moon size={15}/>:<Sun size={15}/>}<span>Tema {theme==='dark'?'escuro':'claro'}</span></button>
    </aside>
    <footer className="credits">PRÉVIAS DE MÚSICAS <span>·</span><a href="https://www.apple.com/legal/internet-services/itunes/us/terms.html" target="_blank" rel="noreferrer">APPLE ITUNES SEARCH API</a></footer>
  </main>;
}
