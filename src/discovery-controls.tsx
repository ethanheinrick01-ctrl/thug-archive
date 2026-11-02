import { useEffect, useState } from 'preact/hooks';
import { Search, SlidersHorizontal, X } from 'lucide-preact';
import type { Track } from './model';
import { normalize } from './model';
import { Modal } from './ui';
import { activeFilters, dateLabels, emptyFilters, filterCount, matchesDiscovery, soundOptions, type DateKind, type DiscoveryFilters, type DiscoveryIndex } from './discovery';

interface Props {
  tracks: Track[]; index: DiscoveryIndex; query: string; setQuery: (value: string) => void;
  filters: DiscoveryFilters; setFilters: (value: DiscoveryFilters) => void;
  resultCount: number; scope: string; sort?: string; setSort?: (value: string) => void; defaultSort?: string;
  scopes?: {value: string; label: string}[]; onScope?: (value: string) => void;
  unit?: string; openFilters?: boolean; onOpened?: () => void;
}
export function DiscoveryControls(p: Props) {
  const [draft, setDraft] = useState<DiscoveryFilters | null>(null);
  const [artistSearch, setArtistSearch] = useState(''), [eraSearch, setEraSearch] = useState('');
  useEffect(() => { if (p.openFilters) { setDraft({...p.filters}); p.onOpened?.(); } }, [p.openFilters]);
  const selections = activeFilters(p.filters);
  const count = (f: DiscoveryFilters) => p.tracks.filter(t => matchesDiscovery(t, p.query, f, p.index)).length;
  const artists = [...new Set(p.tracks.flatMap(t => p.index.facts.get(t.id)?.artists || []))].sort((a,b)=>a.localeCompare(b));
  const eras = [...new Set(p.tracks.map(t => p.index.facts.get(t.id)?.era).filter((x): x is string => !!x))].sort((a,b)=>a.localeCompare(b));
  const unit = p.unit || 'recordings';
  const noun = (n: number) => n === 1 ? (p.unit ? 'queue entry' : 'recording') : unit;
  const draftCount = draft ? count(draft) : 0;
  const clear = () => {p.setQuery('');p.setFilters(emptyFilters());};
  function choices(key: 'artists' | 'sounds' | 'eras' | 'types' | 'evidence', options: {id:string;label:string;note?:string}[]) {
    if (!draft) return null;
    return <div class="facet-options">{options.map(option => {
      const selected = (draft[key] as string[]).includes(option.id);
      const matching = count({...draft,[key]:[option.id]});
      return <label class={`facet-option ${selected ? 'selected' : ''}`} key={option.id}>
        <input type="checkbox" checked={selected} onChange={()=>setDraft({...draft,[key]:selected ? draft[key].filter(x=>x!==option.id) : [...draft[key],option.id]})}/>
        <span><span>{option.label}</span>{option.note && <small>{option.note}</small>}</span>
        <span class="facet-count" aria-label={`${matching} ${noun(matching)}`}>{matching}</span>
      </label>;
    })}</div>;
  }
  return <section class="discovery-controls" aria-label={`Filter ${p.scope}`}>
    <div class="discovery-toolbar">
      {p.scopes && <label class="scope-control">Search in<select value={p.scope} onChange={e=>p.onScope?.(e.currentTarget.value)}>{p.scopes.map(s=><option value={s.value} key={s.value}>{s.label}</option>)}</select></label>}
      <label class="discovery-search"><span>Search {p.unit ? 'queue' : 'songs'}</span><div><Search size={18}/><input type="search" value={p.query} onInput={e=>p.setQuery(e.currentTarget.value)} placeholder="Title, artist, sound or era"/></div></label>
      <button class="secondary filter-toggle" onClick={()=>{setDraft({...p.filters});setArtistSearch('');setEraSearch('');}}><SlidersHorizontal size={18}/>Filters{filterCount(p.filters)>0 && <span class="filter-number">{filterCount(p.filters)}</span>}</button>
      {p.setSort && <label class="discovery-sort">Sort<select value={p.sort} onChange={e=>p.setSort?.(e.currentTarget.value)}><option value="archive">{p.defaultSort || 'Archive order'}</option><option value="title">Title A–Z</option><option value="artist">Artist A–Z</option></select></label>}
    </div>
    <div class="discovery-status"><p role="status" aria-live="polite" aria-atomic="true">{p.resultCount} of {p.tracks.length} {unit}</p>{(selections.length>0 || p.query) && <button class="text-button" onClick={clear}>Clear search & filters</button>}</div>
    {selections.length>0 && <div class="applied-filters" aria-label="Applied filters">{selections.map(item=><button key={item.key} aria-label={`Remove ${item.label} filter`} onClick={()=>p.setFilters(item.remove)}>{item.label}<X size={14}/></button>)}</div>}
    {draft && <Modal title="Filter songs" className="filter-dialog" close={()=>setDraft(null)}>
      <p class="filter-help">Match any choice within a section. Different sections narrow the results together.</p>
      <div class="filter-sections">
        <details open><summary>Sound families{draft.sounds.length ? ` · ${draft.sounds.length} selected` : ''}</summary><p class="muted">Listening picks and audio estimates are separate. An untagged song may still contain guitar.</p>{choices('sounds',[...soundOptions])}</details>
        <details><summary>Artist & featured credits{draft.artists.length ? ` · ${draft.artists.length} selected` : ''}</summary>
          <label>Credit role<select value={draft.role} onChange={e=>setDraft({...draft,role:e.currentTarget.value as DiscoveryFilters['role']})}><option value="any">All appearances</option><option value="lead">Lead / co-artist</option><option value="featured">Featured artist</option></select></label>
          <label>Find an artist<input type="search" value={artistSearch} onInput={e=>setArtistSearch(e.currentTarget.value)}/></label>
          {choices('artists',artists.filter(x=>normalize(x).includes(normalize(artistSearch))).map(x=>({id:x,label:x})))}
        </details>
        <details><summary>Album / project era{draft.eras.length ? ` · ${draft.eras.length} selected` : ''}</summary><p class="muted">Community attributions and possible matches. These do not confirm intended album placement.</p>
          <label>Find an era<input type="search" value={eraSearch} onInput={e=>setEraSearch(e.currentTarget.value)}/></label>
          {choices('eras',eras.filter(x=>normalize(x).includes(normalize(eraSearch))).map(x=>({id:x,label:x})).concat({id:'unknown',label:'Era unknown'}))}
        </details>
        <details><summary>Dated evidence{draft.year ? ` · ${draft.year}` : ''}</summary>
          <label>Date meaning<select value={draft.dateKind} onChange={e=>setDraft({...draft,dateKind:e.currentTarget.value as DateKind,year:''})}>{Object.entries(dateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Year<select value={draft.year} onChange={e=>setDraft({...draft,year:e.currentTarget.value})}><option value="">Any year</option><option value="unknown">Unknown</option>{[...new Set(p.tracks.flatMap(t=>(p.index.facts.get(t.id)?.dates || []).filter(d=>d.kind===draft.dateKind).flatMap(d=>Array.from({length:d.to-d.from+1},(_,i)=>d.from+i))))].sort((a,b)=>a-b).map(year=><option value={year} key={year}>{year}</option>)}</select></label>
          <p class="muted">A date range matches every year it spans. A file date is not a recording or release date. Release references may describe a different mix.</p>
        </details>
        <details><summary>Version & availability</summary>{choices('types',[{id:'version',label:'Alternate versions'},{id:'edit',label:'Edits / mixes'}])}<label class="facet-option"><input type="checkbox" checked={draft.available} onChange={e=>setDraft({...draft,available:e.currentTarget.checked})}/><span>Ready to play</span></label></details>
        <details><summary>Evidence behind the grouping</summary>{choices('evidence',[{id:'listening',label:'Listening picks'},{id:'estimated',label:'Audio estimates'},{id:'community',label:'Community-era leads'},{id:'tentative',label:'Tentative song matches'},{id:'release',label:'Song-release references'},{id:'unassigned',label:'Context unassigned'}])}</details>
      </div>
      <div class="filter-footer"><p role="status" aria-live="polite">{draftCount} matching {noun(draftCount)}</p><div><button class="secondary" onClick={()=>setDraft(emptyFilters())}>Reset filters</button><button class="primary" onClick={()=>{p.setFilters(draft);setDraft(null);}}>Show {draftCount} {noun(draftCount)}</button></div></div>
    </Modal>}
  </section>;
}
