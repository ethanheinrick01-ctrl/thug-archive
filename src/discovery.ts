import { normalize, type Track } from './model';
import { trackArtists } from './track-context';

export const styleOptions = [
  { id: 'pace-slower', label: 'Slower paced' },
  { id: 'pace-upbeat', label: 'Upbeat' },
  { id: 'pace-harder', label: 'Harder tracks' },
] as const;
export interface DiscoveryFilters { artists: string[]; styles: string[] }
export const emptyFilters = (): DiscoveryFilters => ({ artists: [], styles: [] });
export const filterCount = (f: DiscoveryFilters) => f.artists.length + f.styles.length;

export function createDiscoveryIndex(tracks: Track[]) {
  const byId = new Map(tracks.map(t => [t.id, t]));
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const group = groups.get(t.group_key) || [];
    group.push(t);
    groups.set(t.group_key, group);
  }
  const facts = new Map(tracks.map(t => {
    const artists = trackArtists(t);
    const styles = styleOptions.filter(style => t.tags.includes(style.id));
    return [t.id, { artists, styles: styles.map(style => style.id),
      search: normalize([t.title, ...t.aliases, ...artists, t.version, ...styles.map(style => style.label)].filter(Boolean).join(' ')),
    }];
  }));
  return { byId, groups, facts };
}
export type DiscoveryIndex = ReturnType<typeof createDiscoveryIndex>;
export function matchesDiscovery(t: Track, query: string, f: DiscoveryFilters, index: DiscoveryIndex): boolean {
  const fact = index.facts.get(t.id);
  return !!fact && fact.search.includes(normalize(query))
    && (!f.artists.length || f.artists.some(name => fact.artists.includes(name)))
    && (!f.styles.length || f.styles.some(style => fact.styles.includes(style as typeof styleOptions[number]['id'])));
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
export function activeFilters(f: DiscoveryFilters) {
  return (['artists', 'styles'] as const).flatMap(key => f[key].map(value => ({
    key: `${key}:${value}`, label: key === 'styles' ? styleOptions.find(style => style.id === value)?.label || value : value,
    remove: {...f, [key]: f[key].filter(item => item !== value)},
  })));
}
export function rankedChoices(options: {id: string; label: string}[], count: (id: string) => number) {
  return options.map(option => ({...option, count: count(option.id)})).sort((a,b) => b.count - a.count || a.label.localeCompare(b.label));
}
