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
