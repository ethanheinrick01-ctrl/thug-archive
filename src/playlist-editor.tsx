import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-preact';
import { moveItem, type Playlist, type Track } from './model';
import { trackCreditLabel } from './track-context';
import { IconButton } from './ui';
import { playlistDragOrder } from './playlist-editor-model';
import './playlist-editor.css';

export type PlaylistEdit = Pick<Playlist, 'title' | 'description' | 'track_ids'>;

export function PlaylistEditor({ playlist, tracks, onSave, onCancel }: {
  playlist: Playlist;
  tracks: Track[];
  onSave: (patch: PlaylistEdit) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description);
  const [ids, setIds] = useState([...playlist.track_ids]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragged, setDragged] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const currentIds = useRef(ids);
  const active = useRef(true);
  const frame = useRef(0);
  const drag = useRef<{
    id: string; pointerId: number; startY: number; y: number;
    original: string[]; element: HTMLElement; started: boolean;
  } | null>(null);
  const byId = new Map(tracks.map(track => [track.id, track]));
  const name = (id: string) => byId.get(id)?.title || 'Unavailable song';
  const dirty = title !== playlist.title || description !== playlist.description ||
    ids.length !== playlist.track_ids.length || ids.some((id, index) => id !== playlist.track_ids[index]);

  useEffect(() => {
    active.current = true;
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => {
      active.current = false;
      cancelAnimationFrame(frame.current);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function order(next: string[]) {
    currentIds.current = next;
    setIds(next);
  }

  function move(id: string, to: number) {
    const next = moveItem(currentIds.current, currentIds.current.indexOf(id), to);
    order(next);
    setAnnouncement(`${name(id)} moved to position ${next.indexOf(id) + 1} of ${next.length}.`);
    requestAnimationFrame(() => {
      const row = [...(list.current?.children || [])].find(item => (item as HTMLElement).dataset.editTrack === id) as HTMLElement | undefined;
      row?.querySelector<HTMLButtonElement>('.playlist-edit-handle')?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    });
  }

  function cancel() {
    if (saving) return;
    if (!dirty || window.confirm(`Discard changes to “${playlist.title}”?`)) onCancel();
  }

  function reorderUnderPointer() {
    const state = drag.current;
    if (!state?.started || !list.current) return;
    const rows = [...list.current.querySelectorAll<HTMLElement>('[data-edit-track]')].map(row => {
      const box = row.getBoundingClientRect();
      return { id: row.dataset.editTrack!, center: box.top + box.height / 2 };
    });
    const next = playlistDragOrder(currentIds.current, state.id, state.y, rows);
    if (next !== currentIds.current) order(next);
  }

  function autoScroll() {
    const state = drag.current;
    if (!state) return;
    if (state.started && list.current) {
      const box = list.current.getBoundingClientRect();
      const top = Math.max(box.top, 0), bottom = Math.min(box.bottom, window.innerHeight);
      const speed = state.y < top + 48 ? -Math.min(18, (top + 48 - state.y) / 3)
        : state.y > bottom - 48 ? Math.min(18, (state.y - bottom + 48) / 3) : 0;
      if (speed) {
        list.current.scrollTop += speed;
        reorderUnderPointer();
      }
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function startDrag(event: PointerEvent, id: string) {
    if (saving || !event.isPrimary || event.button !== 0) return;
    const target = event.target as Element;
    const handle = target.closest('.playlist-edit-handle');
    if (!handle && (event.pointerType !== 'mouse' || target.closest('button, input, textarea, a'))) return;
    event.preventDefault();
    const element = list.current!;
    element.setPointerCapture(event.pointerId);
    ((handle || (event.currentTarget as HTMLElement).querySelector('.playlist-edit-handle')) as HTMLElement).focus({ preventScroll: true });
    drag.current = { id, pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
      original: [...currentIds.current], element, started: false };
    frame.current = requestAnimationFrame(autoScroll);
  }

  function moveDrag(event: PointerEvent) {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    state.y = event.clientY;
    if (!state.started && Math.abs(state.y - state.startY) >= 6) {
      state.started = true;
      setDragged(state.id);
    }
    if (state.started) { event.preventDefault(); reorderUnderPointer(); }
  }

  function finishDrag(cancelled = false) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    if (state.element.hasPointerCapture(state.pointerId)) state.element.releasePointerCapture(state.pointerId);
    setDragged('');
    if (cancelled) {
      order(state.original);
      setAnnouncement('Move cancelled.');
    } else if (state.started) {
      setAnnouncement(`${name(state.id)} moved to position ${currentIds.current.indexOf(state.id) + 1} of ${currentIds.current.length}.`);
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 80) { setError('Give your playlist a name between 1 and 80 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ title: cleanTitle, description, track_ids: [...currentIds.current] });
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Could not save your playlist. Your changes are still here. Try again.');
    } finally {
      if (active.current) setSaving(false);
    }
  }

  return <section class="playlist-editor" aria-labelledby="playlist-edit-title" onKeyDown={event => {
    if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); finishDrag(true); }
  }}>
    <h2 id="playlist-edit-title" ref={heading} tabIndex={-1}>Edit playlist</h2>
    <form onSubmit={save}>
      <div class="playlist-edit-fields">
        <label>Name<input value={title} maxLength={80} disabled={saving} onInput={event => { setTitle(event.currentTarget.value); setError(''); }}/></label>
        <label>Description <span class="muted">(optional)</span><textarea value={description} maxLength={300} rows={2} disabled={saving} onInput={event => { setDescription(event.currentTarget.value); setError(''); }}/></label>
      </div>
      <p class="playlist-edit-help" id="playlist-edit-help">Drag songs to reorder. On a phone, use the grip. You can also use the arrows.</p>
      <ol class="playlist-edit-list" ref={list} aria-label="Playlist song order" onPointerMove={moveDrag}
        onPointerUp={() => finishDrag()} onPointerCancel={() => finishDrag(true)} onLostPointerCapture={() => finishDrag(true)}>
        {ids.map((id, index) => {
          const track = byId.get(id);
          return <li key={id} data-edit-track={id} class={`playlist-edit-row ${dragged === id ? 'is-dragging' : ''}`}
            onPointerDown={event => startDrag(event, id)}>
            <button class="icon-button playlist-edit-handle" type="button" disabled={saving}
              aria-label={`Reorder ${name(id)}, position ${index + 1} of ${ids.length}`}
              aria-describedby="playlist-edit-help" onKeyDown={event => {
                const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1
                  : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : null;
                if (to === null) return;
                event.preventDefault();
                move(id, to);
              }}><GripVertical size={20}/><span class="button-tooltip" aria-hidden="true">Drag to reorder</span></button>
            <div class="playlist-edit-copy"><strong>{name(id)}</strong>{track && <span>{trackCreditLabel(track)}{track.version ? ` · ${track.version}` : ''}</span>}</div>
            <div class="playlist-edit-actions">
              <IconButton label={`Move ${name(id)} up`} disabled={saving || index === 0} onClick={() => move(id, index - 1)}><ArrowUp size={18}/></IconButton>
              <IconButton label={`Move ${name(id)} down`} disabled={saving || index === ids.length - 1} onClick={() => move(id, index + 1)}><ArrowDown size={18}/></IconButton>
              <IconButton label={`Remove ${name(id)} from playlist`} disabled={saving} onClick={() => {
                order(currentIds.current.filter(value => value !== id));
                setAnnouncement(`${name(id)} removed. Save changes to keep this edit.`);
                requestAnimationFrame(() => {
                  const handles = list.current?.querySelectorAll<HTMLButtonElement>('.playlist-edit-handle');
                  if (handles?.length) handles[Math.min(index, handles.length - 1)].focus();
                  else heading.current?.focus();
                });
              }}><X size={18}/></IconButton>
            </div>
          </li>;
        })}
      </ol>
      {!ids.length && <p class="playlist-edit-empty">No songs in this playlist. You can save it empty and add songs later.</p>}
      <p role="status" class="sr-only" aria-live="polite">{announcement}</p>
      {error && <p class="form-error" role="alert">{error}</p>}
      <div class="playlist-edit-footer"><button class="secondary" type="button" disabled={saving} onClick={cancel}>Cancel</button><button class="primary" type="submit" disabled={saving || !!dragged}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </section>;
}
