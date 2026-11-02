import type { Track } from './model';
import { researchedContexts } from './researched-context';
import { soundTags } from './sound-families';

export interface TrackContext {
  artist?: string;
  coArtists?: string[];
  features?: string[];
  era?: string;
  date?: string;
  guitar?: boolean;
  source: string;
  possible?: boolean;
  matchNote?: string;
  release?: string;
  releaseSource?: string;
}
const tracker = 'https://www.unreleased.world/youngthug';
const btg = `${tracker}/beautiful-thugger-girls`;
// Community era assignments describe the song; they do not authenticate an archive mix.
const curatedContexts: Record<string, TrackContext> = {
  t013: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t011: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t009: { artist: 'Young Thug', features: ['Young Dolph'], era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t064: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'Source file dated 2016 (tracker)', source: btg },
  t008: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t042: { artist: 'Young Thug', features: ['Young Trez'], era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t078: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t041: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t119: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', source: btg },
  t015: { artist: 'Young Thug', features: ['Gunna'], era: 'BEAUTIFUL THUGGER GIRLS', date: 'File dated 2016', source: btg },
  t226: { artist: 'Young Thug', era: 'BEAUTIFUL THUGGER GIRLS', date: 'Previewed 2017', guitar: true, source: btg },
  t239: { artist: 'Young Thug', features: ['Mariah the Scientist'], era: 'UY SCUTI', date: 'File dated 2025', guitar: true, matchNote: 'The community tracker has conflicting file and leak dates for this title.', source: `${tracker}/uy-scuti` },
  t115: { artist: 'Young Thug', era: 'Hy!£UN35 [V4]', date: 'File dated 2018', guitar: true, source: `${tracker}/hy-un35-v4` },
  t094: { artist: 'Young Thug', era: 'Hy!£UN35 [V2]', date: 'Previewed 2015', source: tracker },
  t165: { artist: 'Young Thug', features: ['Future'], era: 'SUPER SLIMEY', source: `${tracker}/super-slimey` },
};
export const trackContexts: Record<string, TrackContext> = Object.fromEntries(
  [...new Set([...Object.keys(researchedContexts), ...Object.keys(curatedContexts)])].map(id => [id, { ...researchedContexts[id], ...curatedContexts[id] }]),
);
export const trackArtists = (track: Track) => {
  const context = trackContexts[track.id];
  return [...new Set([context?.artist || track.artist, ...(context?.coArtists || []), ...track.features, ...(context?.features || [])].filter((x): x is string => !!x).map(name => ({'young thug':'Young Thug', 'est gee':'EST Gee'}[name.toLowerCase()] || name)))];
};
export function trackCreditLabel(track: Track) {
  const names = trackArtists(track);
  return names.length ? names.join(' · ') + (trackContexts[track.id]?.possible ? ' · possible credits' : '') : 'Credits unconfirmed';
}
export function trackCaption(track: Track) {
  const context = trackContexts[track.id];
  return [trackCreditLabel(track), track.version,
    context?.date && `${context.date}${context.possible ? ' (possible song match)' : ''}`, context?.era && `${context.era} era (${context.possible ? 'possible tracker match' : 'community'})`, context?.release && `${context.release}${context.possible ? ' (possible song match)' : ''}`, context?.guitar && 'Guitar-led', ...soundTags(track.id).map(x => `Audio estimate: ${x}`)].filter(Boolean).join(' · ');
}
