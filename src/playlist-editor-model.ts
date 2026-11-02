import { moveItem } from './model';

export function playlistDragOrder(
  ids: string[],
  draggedId: string,
  pointerY: number,
  rows: { id: string; center: number }[],
): string[] {
  const from = ids.indexOf(draggedId);
  if (from < 0 || !Number.isFinite(pointerY)) return ids;
  const others = rows.filter(row => row.id !== draggedId && ids.includes(row.id));
  if (others.length !== ids.length - 1) return ids;
  const to = others.filter(row => pointerY > row.center).length;
  return from === to ? ids : moveItem(ids, from, to);
}
