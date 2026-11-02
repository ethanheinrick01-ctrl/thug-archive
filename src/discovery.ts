import { normalize, type Track } from './model';
import { trackArtists, trackContexts } from './track-context';
import { soundFamilies, type SoundFamily } from './sound-families';

export const soundOptions = [
  { id: 'guitar-led', label: 'Guitar-led', note: 'Listening picks' },
  { id: 'guitar', label: 'Guitar-like', note: 'Audio estimate' },
  { id: 'keys', label: 'Keyboard-like', note: 'Audio estimate' },
  { id: 'synth', label: 'Synth-like', note: 'Audio estimate' },
  { id: 'drums', label: 'Hard drums', note: 'Audio estimate' },
] as const;
export type Sound = typeof soundOptions[number]['id'];
export type DateKind = 'recorded' | 'file' | 'preview' | 'released';
export const dateLabels: Record<DateKind, string> = {
  recorded: 'Recording year', file: 'Source-file year', preview: 'Preview / public-play year', released: 'Song-release year',
};
export interface DatedEvidence { kind: DateKind; from: number; to: number; label: string; source: string; tentative: boolean }
export interface DiscoveryFilters {
  artists: string[];
  role: 'any' | 'lead' | 'featured';
  sounds: Sound[];
  eras: string[];
  types: string[];
  evidence: string[];
  dateKind: DateKind;
  year: string;
  available: boolean;
}
export const emptyFilters = (): DiscoveryFilters => ({ artists: [], role: 'any', sounds: [], eras: [], types: [], evidence: [], dateKind: 'file', year: '', available: false });
export const filterCount = (f: DiscoveryFilters) => f.artists.length + f.sounds.length + f.eras.length + f.types.length + f.evidence.length + Number(!!f.year) + Number(f.available);

export function datedEvidence(id: string): DatedEvidence[] {
  const c = trackContexts[id];
  if (!c) return [];
  const result: DatedEvidence[] = [];
  for (const [label, source, release] of [[c.date, c.source, false], [c.release, c.releaseSource || c.source, true]] as const) {
    if (!label) continue;
    const years = [...label.matchAll(/\b(?:19|20)\d{2}\b/g)].map(x => Number(x[0]));
    const kind: DateKind | undefined = release ? 'released' : /recorded/i.test(label) ? 'recorded' : /file/i.test(label) ? 'file' : /preview|radio|public|played/i.test(label) ? 'preview' : undefined;
    if (years.length && kind) result.push({ kind, from: Math.min(...years), to: Math.max(...years), label, source, tentative: !!c.possible });
  }
  return result;
}

export interface TrackFacts {
  artists: string[]; lead: string[]; featured: string[];
  sounds: Sound[]; era: string; dates: DatedEvidence[];
  evidence: string[]; types: string[]; search: string;
}
export function createDiscoveryIndex(tracks: Track[]) {
  const byId = new Map(tracks.map(t => [t.id, t]));
  const groups = new Map<string, Track[]>();
  for (const t of tracks) groups.set(t.group_key, [...(groups.get(t.group_key) || []), t]);
  const facts = new Map<string, TrackFacts>();
  for (const t of tracks) {
    const c = trackContexts[t.id];
    const artists = trackArtists(t);
    const canonical = (name: string) => artists.find(x=>normalize(x)===normalize(name)) || name;
    const lead = [c?.artist || t.artist, ...(c?.coArtists || [])].filter((x): x is string => !!x).map(canonical);
    const featured = [...new Set([...t.features, ...(c?.features || [])].map(canonical))];
    const sounds: Sound[] = c?.guitar ? ['guitar-led'] : [];
    for (const family of Object.keys(soundFamilies) as SoundFamily[]) if (soundFamilies[family].includes(t.id)) sounds.push(family);
    const dates = datedEvidence(t.id);
    const evidence = [c?.guitar && 'listening', sounds.some(s => s !== 'guitar-led') && 'estimated', c?.era && 'community', c?.possible && 'tentative', c?.release && 'release'].filter((x): x is string => !!x);
    if (!evidence.length) evidence.push('unassigned');
    const types = [t.tags.includes('edit') && 'edit', (t.version || t.tags.includes('version') || (groups.get(t.group_key)?.length || 0) > 1) && 'version'].filter((x): x is string => !!x);
    facts.set(t.id, { artists, lead, featured, sounds, era: c?.era || '', dates, evidence, types,
      search: normalize([t.title, ...t.aliases, ...artists, t.version, c?.era, ...dates.map(x => x.label), ...soundOptions.filter(x => sounds.includes(x.id)).map(x => x.label)].filter(Boolean).join(' ')),
    });
  }
  return { byId, groups, facts };
}
export type DiscoveryIndex = ReturnType<typeof createDiscoveryIndex>;
export function matchesDiscovery(t: Track, query: string, f: DiscoveryFilters, index: DiscoveryIndex): boolean {
  const fact = index.facts.get(t.id);
  if (!fact) return false;
  const includesAny = (selected: string[], actual: string[]) => !selected.length || selected.some(x => actual.includes(x));
  const artists = f.role === 'lead' ? fact.lead : f.role === 'featured' ? fact.featured : fact.artists;
  const dated = fact.dates.filter(d => d.kind === f.dateKind);
  return fact.search.includes(normalize(query))
    && includesAny(f.artists, artists) && includesAny(f.sounds, fact.sounds)
    && includesAny(f.eras, [fact.era || 'unknown']) && includesAny(f.types, fact.types)
    && includesAny(f.evidence, fact.evidence) && (!f.available || t.available)
    && (!f.year || (f.year === 'unknown' ? !dated.length : dated.some(d => Number(f.year) >= d.from && Number(f.year) <= d.to)));
}
export function selectRecordings(tracks: Track[], query: string, filters: DiscoveryFilters, sort: string, index: DiscoveryIndex) {
  const result = tracks.filter(t => matchesDiscovery(t, query, filters, index));
  if (sort === 'title') result.sort((a,b) => a.title.localeCompare(b.title));
  if (sort === 'artist') result.sort((a,b) => {
    const aa = index.facts.get(a.id)?.artists[0], bb = index.facts.get(b.id)?.artists[0];
    return aa && bb ? aa.localeCompare(bb) || a.title.localeCompare(b.title) : aa ? -1 : bb ? 1 : a.title.localeCompare(b.title);
  });
  return result;
}
export function rowContext(t: Track, index: DiscoveryIndex): string {
  const fact = index.facts.get(t.id);
  if (!fact) return '';
  const c = trackContexts[t.id];
  const historical = fact.era ? `${fact.era} · ${c?.possible ? 'possible era match' : 'community era'}` : fact.dates[0] ? `${fact.dates[0].label}${c?.possible ? ' · possible song match' : ''}` : '';
  const sounds = soundOptions.filter(x => fact.sounds.includes(x.id));
  const sound = sounds.find(x => x.id === 'guitar-led') || sounds[0];
  return [historical, sound && `${sound.label} · ${sound.note.toLowerCase()}`].filter(Boolean).join(' / ');
}
export function activeFilters(f: DiscoveryFilters): { key: string; label: string; remove: DiscoveryFilters }[] {
  const items: { key: string; label: string; remove: DiscoveryFilters }[] = [];
  const labels: Record<string,string> = { edit:'Edits / mixes',version:'Alternate versions',listening:'Listening picks',estimated:'Audio estimates',community:'Community-era leads',tentative:'Tentative matches',release:'Release references',unassigned:'Context unassigned',unknown:'Era unknown' };
  for (const key of ['artists','sounds','eras','types','evidence'] as const) for (const value of f[key]) {
    const label = key === 'sounds' ? soundOptions.find(x => x.id === value)?.label || value : labels[value] || value;
    items.push({ key:`${key}:${value}`, label: key === 'artists' && f.role !== 'any' ? `${label} (${f.role})` : label, remove:{...f,[key]:f[key].filter(x=>x!==value)} });
  }
  if (f.year) items.push({key:'year',label:`${dateLabels[f.dateKind]}: ${f.year === 'unknown' ? 'unknown' : f.year}`,remove:{...f,year:''}});
  if (f.available) items.push({key:'available',label:'Ready to play',remove:{...f,available:false}});
  return items;
}
