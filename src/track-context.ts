import type { Track } from './model';

const artistName = (name: string) => ({'young thug':'Young Thug', 'est gee':'EST Gee'}[name.trim().toLowerCase()] || name.trim());
export const trackArtists = (track: Track) => [...new Set([track.artist, ...track.features].filter((name): name is string => !!name?.trim()).map(artistName))];

export function trackCreditLabel(track: Track) {
  const names = trackArtists(track);
  // A known feature does not establish the recording's lead performer.
  return names.length ? `${track.artist?.trim() ? '' : 'feat. '}${names.join(' · ')}` : '';
}

export const trackCaption = (track: Track) => [trackCreditLabel(track), track.version].filter(Boolean).join(' · ');
