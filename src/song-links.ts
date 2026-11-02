export function linkedSong(hash: string): string | null {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('song');
  return id && /^t\d{3}$/.test(id) ? id : null;
}
export function songLink(id: string, base: string): string {
  if (!/^t\d{3}$/.test(id)) throw new Error('Choose an archive song to share.');
  const url = new URL(base);
  url.search = '';
  url.hash = new URLSearchParams({song: id}).toString();
  return url.href;
}

export function linkedPlaylist(hash: string): string | null {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('playlist');
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
export function playlistLink(id: string, base: string): string {
  if (!linkedPlaylist('#playlist=' + id)) throw new Error('Choose a playlist to share.');
  const url = new URL(base); url.search = ''; url.hash = new URLSearchParams({playlist:id}).toString(); return url.href;
}
