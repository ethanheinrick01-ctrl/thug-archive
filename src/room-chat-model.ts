export interface RoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}

export function mergeRoomMessages(
  roomId: string,
  current: RoomMessage[],
  incoming: RoomMessage[],
): RoomMessage[] {
  const messages = new Map<string, RoomMessage>();
  for (const message of [...current, ...incoming]) {
    if (message.room_id === roomId) messages.set(message.id, message);
  }
  return [...messages.values()]
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .slice(-100);
}

export function roomMessageError(error: unknown): string {
  const value = error as { code?: string; message?: string };
  if (value?.code === "42501")
    return "This room has ended or you’ve left it. Rejoin an active room to chat.";
  if (value?.code === "P0001")
    return value.message || "Couldn’t send your message. Try again.";
  return "Couldn’t reach room chat. Your draft is still here. Try again.";
}
