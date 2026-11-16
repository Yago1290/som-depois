import { describe, expect, it, vi } from 'vitest';
import { AppleMusicProvider, artistNameMatches, filterMusicByGenre, mapITunesSong } from './music/provider';
import { EMPTY_FILTERS, STAGES, chooseDaily, filterTracks, findSongGuess, normalize, scoreForStage, shareResult, songKey, type Track } from './game';
const catalog:Track[]=[{id:'a',title:'Água Clara',artist:'Maré',artistIds:['mare'],genres:['MPB'],year:2014,language:'pt',popularity:80},{id:'b',title:'Night Drive',artist:'Nova',artistIds:['nova'],genres:['Pop'],year:2004,language:'en',popularity:5}];
describe('Apple artist catalogue matching',()=>{
 it('matches main and featured artists without case or accent sensitivity',()=>{expect(artistNameMatches('Drake & 21 Savage','drake')).toBe(true);expect(artistNameMatches('Matuê, Raonir Braz','matue')).toBe(true);expect(artistNameMatches('Tyler, The Creator','tyler the creator')).toBe(true);expect(artistNameMatches('The Weeknd','Drake')).toBe(false)});
 it('loads an artist catalogue through Apple artist search and lookup',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
   const url=new URL(String(input));
   if(url.pathname.endsWith('/search')&&url.searchParams.get('entity')==='musicArtist') return new Response(JSON.stringify({results:[{artistId:271256,artistName:'Drake'}]}),{status:200});
   if(url.pathname.endsWith('/lookup')) return new Response(JSON.stringify({results:[{wrapperType:'artist',artistName:'Drake'},{wrapperType:'track',trackId:1,trackName:'God’s Plan',artistName:'Drake',artistId:271256,previewUrl:'https://preview.test/1'},{wrapperType:'track',trackId:2,trackName:'One Dance',artistName:'Drake',artistId:271256,previewUrl:'https://preview.test/2'}]}),{status:200});
   if(url.pathname.endsWith('/search')) return new Response(JSON.stringify({results:[{trackId:3,trackName:'Passionfruit',artistName:'Drake',artistId:271256,previewUrl:'https://preview.test/3'},{trackId:4,trackName:'Unrelated',artistName:'Other Artist',artistId:99,previewUrl:'https://preview.test/4'}]}),{status:200});
   return new Response(JSON.stringify({results:[]}),{status:200});
  });
  try { const tracks=await new AppleMusicProvider().searchTracks('Drake'); expect(tracks.map(track=>track.title)).toEqual(['God’s Plan','One Dance','Passionfruit']); expect(fetchMock).toHaveBeenCalledTimes(3); }
  finally { fetchMock.mockRestore(); }
 });
});
describe('Apple multi-storefront catalogue',()=>{
 it('combines Brazil and US search results and removes duplicate tracks',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
   const url=new URL(String(input));
   const country=url.searchParams.get('country');
   const track={trackId:country==='BR'?1:2,trackName:country==='BR'?'Faixa Brasil':'US Track',artistName:'Artist',artistId:7,previewUrl:'https://preview.test/audio'};
   return new Response(JSON.stringify({results:[track]}),{status:200});
  });
  try { const tracks=await new AppleMusicProvider().searchTracks('pop hits',undefined,'BR,US',false); expect(tracks.map(track=>track.title)).toEqual(['Faixa Brasil','US Track']); expect(fetchMock).toHaveBeenCalledTimes(2); }
  finally { fetchMock.mockRestore(); }
 });
});
describe('Apple genre filtering',()=>{
 const tracks=[{id:'1',title:'Rap',artist:'A',artistId:'1',album:'',coverUrl:'',genres:['Hip-Hop/Rap'],durationSeconds:100,licenseUrl:'',attributionUrl:'',attributionProvider:'Apple Music'},{id:'2',title:'K-pop',artist:'B',artistId:'2',album:'',coverUrl:'',genres:['K-pop'],durationSeconds:100,licenseUrl:'',attributionUrl:'',attributionProvider:'Apple Music'}];
 it('filters broad Trap/Rap category and exact K-pop category using Apple genre metadata',()=>{expect(filterMusicByGenre(tracks,'trap').map(track=>track.id)).toEqual(['1']);expect(filterMusicByGenre(tracks,'k-pop').map(track=>track.id)).toEqual(['2']);expect(filterMusicByGenre(tracks,'')).toHaveLength(2)});
});
describe('Apple iTunes track mapping',()=>{
 it('maps Apple metadata and marks tracks without preview as unavailable',()=>{
  const track=mapITunesSong({trackId:42,trackName:'Quer Voar',artistName:'Matuê',artistId:7,collectionName:'Máquina do Tempo',artworkUrl100:'https://example.test/100x100bb.jpg',primaryGenreName:'Hip-Hop/Rap',releaseDate:'2021-09-09T07:00:00Z',trackTimeMillis:180000,trackViewUrl:'https://music.apple.com/br/song/example'});
  expect(track).toMatchObject({id:'itunes-42',title:'Quer Voar',artist:'Matuê',album:'Máquina do Tempo',genres:['Hip-Hop/Rap'],durationSeconds:180,streamUrl:undefined,attributionProvider:'Apple Music'});
  expect(track?.coverUrl).toContain('600x600');
 });
 it('maps a provided preview URL for playback',()=>expect(mapITunesSong({trackId:1,trackName:'Track',artistName:'Artist',previewUrl:'https://audio-ssl.itunes.apple.com/preview.mp3'})?.streamUrl).toBe('https://audio-ssl.itunes.apple.com/preview.mp3'));
 it('rejects incomplete search results',()=>expect(mapITunesSong({trackId:1,artistName:'Artist'})).toBeUndefined());
});
describe('Somspot game helpers',()=>{
 it('retains exact six clip steps',()=>expect(STAGES).toEqual([.1,.5,1,3,15,30]));
 it('normalizes accents, case and whitespace',()=>expect(normalize('  ÁGUA   Clara ')).toBe('agua clara'));
 it('accepts only exact song titles from the catalog as guesses',()=>{expect(findSongGuess('AGUA CLARA',catalog)?.id).toBe('a');expect(findSongGuess('Maré',catalog)).toBeUndefined();expect(findSongGuess('any random text',catalog)).toBeUndefined()});
 it('uses title and artist to identify a song and prevent duplicate guesses',()=>{expect(songKey({title:'Água Clara',artist:'Maré'})).toBe(songKey({title:'agua clara',artist:'maré'}));expect(songKey({title:'Água Clara',artist:'Maré'})).not.toBe(songKey({title:'Água Clara',artist:'Nova'}))});
 it('scores earlier guesses higher',()=>{expect(scoreForStage(0)).toBe(600);expect(scoreForStage(5)).toBe(100)});
 it('combines artist, genre, era and language as intersections',()=>{const result=filterTracks(catalog,{...EMPTY_FILTERS,artists:['mare'],genres:['MPB'],eras:['2010'],languages:['pt']});expect(result.map(t=>t.id)).toEqual(['a']);expect(filterTracks(catalog,{...EMPTY_FILTERS,artists:['mare'],genres:['Pop']})).toEqual([])});
 it('filters difficulty only where popularity is known',()=>{expect(filterTracks(catalog,{...EMPTY_FILTERS,difficulty:'impossible'}).map(t=>t.id)).toEqual(['b']);const unknown={...catalog[0],popularity:undefined};expect(filterTracks([unknown],{...EMPTY_FILTERS,difficulty:'expert'})).toEqual([])});
 it('returns deterministic daily choice independent of object identity',()=>{expect(chooseDaily(catalog,new Date('2025-04-03'))?.id).toBe(chooseDaily([...catalog],new Date('2025-04-03'))?.id)});
 it('returns no daily item for an empty catalog',()=>expect(chooseDaily([])).toBeUndefined());
 it('shares progress without including song answer',()=>{const result=shareResult(4,[0,2],true);expect(result).toContain('2/6 tentativas');expect(result).toContain('🟥');expect(result).toContain('🟩');expect(result).not.toContain('Água Clara')});
});
