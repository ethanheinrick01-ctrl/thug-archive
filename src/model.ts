export interface Track {
  id: string;
  title: string;
  artist: string | null;
  features: string[];
  version: string | null;
  group_key: string;
  tags: string[];
  aliases: string[];
  duration: number | null;
  artwork: string | null;
  audio_key: string | null;
  available: boolean;
  archive_order: number;
}
export interface Playlist {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  track_ids: string[];
  shared: boolean;
  updated_at: string;
}
export interface History {
  track_id: string;
  last_played: string;
  play_count: number;
}
export interface Library {
  tracks: Track[];
  playlists: Playlist[];
  likes: string[];
  history: History[];
}
export const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const matches = (track: Track, query: string) =>
  normalize(
    [track.title, track.artist, ...track.features, ...track.aliases].join(" "),
  ).includes(normalize(query));
export function groupTracks(tracks: Track[]): Track[][] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const group = groups.get(track.group_key) || [];
    group.push(track);
    groups.set(track.group_key, group);
  }
  return [...groups.values()];
}
export const formatTime = (seconds: number | null | undefined) =>
  !Number.isFinite(seconds) || seconds == null
    ? "—"
    : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length)
    return items;
  const next = [...items],
    [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export function shuffled<T>(items: T[], random = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
