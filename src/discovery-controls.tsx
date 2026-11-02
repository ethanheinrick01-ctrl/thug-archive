import { useEffect, useState } from 'preact/hooks';
import { Search, SlidersHorizontal, X } from 'lucide-preact';
import type { Track } from './model';
import { normalize } from './model';
import { Modal } from './ui';
import { activeFilters, emptyFilters, filterCount, matchesDiscovery, rankedChoices, styleOptions, type DiscoveryFilters, type DiscoveryIndex } from './discovery';

interface Props {
  tracks: Track[]; index: DiscoveryIndex; query: string; setQuery: (value: string) => void;
  filters: DiscoveryFilters; setFilters: (value: DiscoveryFilters) => void;
  resultCount: number; scope: string; sort?: string; setSort?: (value: string) => void; defaultSort?: string;
  unit?: string; openFilters?: boolean; onOpened?: () => void;
}
export function DiscoveryControls(p: Props) {
  const [draft, setDraft] = useState<DiscoveryFilters | null>(null);
  const [artistSearch, setArtistSearch] = useState('');
  useEffect(() => { if (p.openFilters) { setDraft({...p.filters}); setArtistSearch(''); p.onOpened?.(); } }, [p.openFilters]);
  const selections = activeFilters(p.filters);
  const count = (f: DiscoveryFilters) => p.tracks.filter(t => matchesDiscovery(t, p.query, f, p.index)).length;
  const artists = [...new Set(p.tracks.flatMap(t => p.index.facts.get(t.id)?.artists || []))];
  const unit = p.unit || 'songs';
  const counted = (n: number) => `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
  const draftCount = draft ? count(draft) : 0;
  function choices(key: keyof DiscoveryFilters, options: {id:string;label:string}[]) {
    if (!draft) return null;
    const ranked = rankedChoices(options, id => count({...draft,[key]:[id]}));
    return <div class="facet-options">{ranked.map(option => {
      const selected = draft[key].includes(option.id);
      return <label class={`facet-option ${selected ? 'selected' : ''}`} key={option.id}>
        <input type="checkbox" checked={selected} disabled={!selected && option.count === 0} onChange={()=>setDraft({...draft,[key]:selected ? draft[key].filter(x=>x!==option.id) : [...draft[key],option.id]})}/>
        <span>{option.label}</span><span class="facet-count" aria-label={counted(option.count)}>{option.count}</span>
      </label>;
    })}</div>;
  }
  return <section class="discovery-controls" aria-label="Find songs">
    <div class="discovery-toolbar">
      <label class="discovery-search"><span>Search {p.unit ? 'queue' : 'songs'}</span><div><Search size={18}/><input type="search" value={p.query} onInput={e=>p.setQuery(e.currentTarget.value)} placeholder="Song or artist"/></div></label>
      <button class="secondary filter-toggle" onClick={()=>{setDraft({...p.filters});setArtistSearch('');}}><SlidersHorizontal size={18}/>Filters{filterCount(p.filters)>0 && <span class="filter-number">{filterCount(p.filters)}</span>}</button>
      {p.setSort && <label class="discovery-sort">Sort<select value={p.sort} onChange={e=>p.setSort?.(e.currentTarget.value)}><option value="archive">{p.defaultSort || 'Archive order'}</option><option value="title">Title A–Z</option><option value="artist">Artist A–Z</option></select></label>}
    </div>
    <div class="discovery-status"><p role="status" aria-live="polite" aria-atomic="true">{counted(p.resultCount)}</p>{(selections.length>0 || p.query) && <button class="text-button" onClick={()=>{p.setQuery('');p.setFilters(emptyFilters());}}>Clear filters</button>}</div>
    {selections.length>0 && <div class="applied-filters" aria-label="Applied filters">{selections.map(item=><button key={item.key} aria-label={`Remove ${item.label} filter`} onClick={()=>p.setFilters(item.remove)}>{item.label}<X size={14}/></button>)}</div>}
    {draft && <Modal title="Filter songs" className="filter-dialog" close={()=>setDraft(null)}>
      <div class="filter-sections">
        <section aria-labelledby="style-filter"><h3 id="style-filter">Pace & energy</h3>{choices('styles',[...styleOptions])}</section>
        <section aria-labelledby="artist-filter"><h3 id="artist-filter">Artists</h3>
          <label>Find an artist<input type="search" value={artistSearch} onInput={e=>setArtistSearch(e.currentTarget.value)} placeholder="Artist name"/></label>
          {choices('artists',artists.filter(x=>normalize(x).includes(normalize(artistSearch))).map(x=>({id:x,label:x})))}
          {!artists.some(x=>normalize(x).includes(normalize(artistSearch))) && <p class="muted">No artists match that name.</p>}
        </section>
      </div>
      <div class="filter-footer"><button class="secondary" onClick={()=>setDraft(emptyFilters())}>Reset</button><button class="primary" onClick={()=>{p.setFilters(draft);setDraft(null);}}>Show {counted(draftCount)}</button></div>
    </Modal>}
  </section>;
}
