import { useEffect, useRef, useState } from 'preact/hooks';
import { supabase } from './data';
import { activeLyric, parseLyrics, type LyricLine } from './lyrics-model';

export function Lyrics({ trackId, position, canSeek, seek }: {
  trackId: string; position: number; canSeek: boolean; seek: (position: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [follow, setFollow] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const active = activeLyric(lines, position);
  useEffect(() => {
    setLines([]); setStatus(''); setFollow(true);
    if (!open || trackId !== 't001') return;
    let cancelled = false;
    setStatus('Loading lyrics…');
    void (async () => {
      try {
        if (!supabase) throw new Error('Unavailable');
        const {data, error} = await supabase.from('track_lyrics').select('lines').eq('track_id',trackId).maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const next = parseLyrics(data?.lines);
        setLines(next); setStatus(next.length ? '' : 'Lyrics aren’t available yet.');
      } catch {
        if (!cancelled) setStatus('Couldn’t load lyrics. Try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [trackId, open, attempt]);
  useEffect(() => {
    if (!open || !follow || active < 0) return;
    const box = viewport.current;
    const line = box?.children[active] as HTMLElement | undefined;
    if (box && line) box.scrollTo({
      top: box.scrollTop + line.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [active, open, follow]);
  if (trackId !== 't001') return null;
  return <section class="lyrics-panel">
    <button class="secondary wide" aria-expanded={open} aria-controls="timed-lyrics" onClick={() => setOpen(!open)}>{open ? 'Hide lyrics' : 'Lyrics'}</button>
    {open && <div id="timed-lyrics">
      <div class="lyrics-toolbar"><span>LYRICS · BETA</span><label><input type="checkbox" checked={follow} onChange={e=>setFollow(e.currentTarget.checked)} /> Follow song</label></div>
      <p class="lyrics-hint">{canSeek ? 'Tap a line to jump to it.' : 'Following the host. Only the host can seek.'}</p>
      {status && <p role="status" class="muted">{status}</p>}
      {status.startsWith('Couldn’t') && <button class="secondary" onClick={()=>setAttempt(attempt+1)}>Try again</button>}
      {!!lines.length && <div class="lyrics-lines" ref={viewport} aria-label="Timed lyrics" tabIndex={0}>
        {lines.map((line,i)=><button key={`${line.start}:${i}`} class={`lyric-line ${active===i ? 'active' : ''}`} aria-current={active===i ? 'true' : undefined} disabled={!canSeek} onClick={()=>seek(line.start)}>{line.text}</button>)}
      </div>}
    </div>}
  </section>;
}
