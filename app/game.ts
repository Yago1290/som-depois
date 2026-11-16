export const STAGES = [0.1, 0.5, 1, 3, 15, 30] as const;
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';
export type Track = { id:string; title:string; artist:string; artistIds:string[]; genres:string[]; year:number; language:string; popularity?:number; audioUrl?:string; provider?:string; album?:string; coverUrl?:string; licenseUrl?:string; attributionUrl?:string; attributionProvider?:string };
export type Filters = { artists:string[]; genres:string[]; eras:string[]; languages:string[]; difficulty:Difficulty|'all' };
export const EMPTY_FILTERS:Filters={artists:[],genres:[],eras:[],languages:[],difficulty:'all'};
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim().replace(/\s+/g,' ');
export function matchesFilters(t:Track,f:Filters){const era=!f.eras.length||f.eras.some(e=>e==='recent'?t.year>=2024:t.year>=Number(e)&&t.year<Number(e)+10);const d=f.difficulty==='all'||(t.popularity!=null&&(f.difficulty==='easy'?t.popularity>=75:f.difficulty==='medium'?t.popularity>=50&&t.popularity<75:f.difficulty==='hard'?t.popularity>=25&&t.popularity<50:f.difficulty==='expert'?t.popularity>=10&&t.popularity<25:t.popularity<10));return(!f.artists.length||f.artists.some(a=>t.artistIds.includes(a)))&&(!f.genres.length||f.genres.some(g=>t.genres.includes(g)))&&era&&(!f.languages.length||f.languages.includes(t.language))&&d}
export const filterTracks=(tracks:Track[],f:Filters)=>tracks.filter(t=>matchesFilters(t,f));
export const songKey=(track:Pick<Track,'title'|'artist'>)=>`${normalize(track.title)}::${normalize(track.artist)}`;
export const findSongGuess=<T extends Pick<Track,'id'|'title'|'artist'>>(input:string,tracks:T[])=>{const answer=normalize(input);return answer?tracks.find(track=>normalize(track.title)===answer):undefined};
export const scoreForStage=(stage:number)=>Math.max(1,6-stage)*100;
export function chooseDaily<T extends {id:string}>(items:T[],date=new Date()):T|undefined{if(!items.length)return;const day=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/86400000);let h=2166136261;for(const c of `somspot-v1-${day}`)h=Math.imul(h^c.charCodeAt(0),16777619);return items[(h>>>0)%items.length]}
export const shareResult=(n:number,used:number[],won:boolean)=>`Somspot · #${n}\n${STAGES.map((_,i)=>won&&i===used[used.length-1]?'🟩':used.includes(i)?'🟥':'⬛').join(' ')}\n${won?`${used.length}/6 tentativas`:'Não foi dessa vez'}`;
