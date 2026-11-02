export type Relationship = 'none' | 'incoming' | 'outgoing' | 'friends' | 'blocked';
export type FriendAction = 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';
export interface ArchiveMember {
  user_id: string;
  display_name: string;
  relationship: Relationship;
  revision: number;
}
export interface FriendMessage {
  id: string;
  sender_id: string;
  body: string;
  room_id: string | null;
  is_invite: boolean;
  track_id: string | null;
  is_song: boolean;
  room_active: boolean;
  created_at: string;
}
export interface PendingFriendMessage {
  id: string;
  peer: string;
  body: string;
  room: string | null;
  track: string | null;
}

export function prepareFriendMessage(previous: PendingFriendMessage | null, peer: string, text: string, room: string | null = null, track: string | null = null): PendingFriendMessage {
  const body = text.trim();
  if ((!body && !room && !track) || Array.from(body).length > 1000) throw new Error('Write a message up to 1,000 characters, or choose a song to send.');
  if (room && track) throw new Error('Send a song or a room invitation separately.');
  if (previous?.peer === peer && previous.body === body && previous.room === room && previous.track === track) return previous;
  return {id: crypto.randomUUID(), peer, body, room, track};
}

export function friendError(error: unknown): string {
  const value = error as {code?: string; message?: string};
  if (value?.code === '42501' || value?.code === 'P0001') return value.message || 'Refresh your friends and try again.';
  return 'Couldn’t reach your friends. Your message draft is still here. Try again.';
}
