export interface ListeningRoom {
  id: string;
  host_id: string;
  queue: string[];
  queue_index: number;
  position: number;
  playing: boolean;
  shuffle: boolean;
  repeat_mode: "off" | "all" | "one";
  anchor_at: string;
  revision: number;
  expires_at: string;
  ended_at: string | null;
}
export interface RoomSnapshot {
  room: ListeningRoom;
  members: { user_id: string; display_name: string }[];
  server_now: string;
}
export type RoomCommand =
  | { type: "playQueue"; ids: string[]; start: number; shuffle: boolean }
  | { type: "toggle" | "play" | "pause" | "previous" | "shuffle" | "repeat" }
  | { type: "next"; ended: boolean }
  | { type: "seek"; position: number }
  | { type: "add"; id: string; next: boolean }
  | { type: "remove" | "jump"; index: number };

export function roomPosition(
  room: ListeningRoom,
  serverNow: number,
  duration: number,
) {
  const elapsed = room.playing
    ? Math.max(0, serverNow - Date.parse(room.anchor_at)) / 1000
    : 0;
  return Math.min(Math.max(0, room.position + elapsed), Math.max(0, duration));
}
export function roomIdFromLink(value: string): string | null {
  let candidate = value.trim();
  try {
    const url = new URL(candidate);
    candidate = new URLSearchParams(url.hash.slice(1)).get("room") || "";
  } catch {
    /* A plain room code is accepted too. */
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    candidate,
  )
    ? candidate
    : null;
}
export function terminalRoomError(error: unknown): boolean {
  const value = error as { code?: string; message?: string };
  return (
    ["42501", "PGRST301", "PGRST302"].includes(value?.code || "") ||
    /room has ended or expired|join this listening room first|invited archive account/i.test(
      value?.message || "",
    )
  );
}
