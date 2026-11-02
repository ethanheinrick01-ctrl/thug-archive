import type { Track } from './model';

const performerNames = ['Young Thug', 'Lil Uzi Vert', 'Lil Durk', 'Lil Keed', 'Lil Pump', 'Gucci Mane', 'Meek Mill', 'Babyface Ray', 'Pooh Shiesty', 'EST Gee', 'Future', 'Gunna'];
const clean = (value: string) => value.replace(/(?:\.(?:mp3|m4a|wav|mp4|flac)(?:-\d+)?)+$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const names = (value: string) => value.split(/\s*(?:,|&|\band\b)\s*/i).map(name => name.trim()).filter(Boolean);
const canonical = (value: string) => performerNames.find(name => name.toLowerCase() === value.toLowerCase()) || value;
const distinct = (values: string[]) => [...new Map(values.map(value => [value.toLowerCase(), canonical(value)])).values()];

/** Listener presentation only; original filenames, credits, versions and IDs stay unchanged. */
export function trackDisplay(track: Pick<Track, 'title' | 'artist' | 'features' | 'aliases' | 'version'>) {
  let title = clean(track.title);
  let artist = track.artist?.trim() ? canonical(track.artist.trim()) : null;
  const sources = [title, ...track.aliases.map(clean)];
  const completeFeatures = distinct(sources.flatMap(source =>
    [...source.matchAll(/[\[(](?:feat\.?|ft\.?)\s+([^\])]+)[\])]/gi)].flatMap(match => names(match[1])),
  ));
  const unfinishedTails = sources.flatMap(source => {
    const match = source.match(/[\[(](?:feat\.?|ft\.?)\s+([^\])]*?)$/i);
    if (!match || /(?:&|,|\band)\s*$/i.test(match[1])) return [];
    return names(match[1]).slice(-1).map(name => name.toLowerCase());
  });
  const features = track.features.flatMap(value => {
    const feature = value.trim();
    const fullNames = completeFeatures.filter(name => name.toLowerCase().startsWith(feature.toLowerCase()));
    if (fullNames.length === 1) return fullNames;
    return unfinishedTails.includes(feature.toLowerCase()) && !completeFeatures.some(name => name.toLowerCase() === feature.toLowerCase()) ? [] : [feature];
  });
  features.push(...completeFeatures);

  // A zero-padded export number is distinct from titles such as “10 Years”.
  title = title.replace(/^0\d{1,2}[.\s_-]+(?=\S)/, '');
  title = title.replace(/\s+[\[(]?prod(?:uced)?\.?(?:\s+by)?\s+(.+)$/i, (_whole, credit: string) => {
    const versions = credit.match(/\b(?:v\d+|version\s+\d+|(?:rough|new|alternate)\s+mix)\b/gi) || [];
    return versions.filter(value => value.toLowerCase() !== track.version?.toLowerCase()).map(value => ` (${value})`).join('');
  }).trim();
  title = title.replace(/\s*[\[(](?:feat\.?|ft\.?)\b[^\])]*(?:[\])]|$)/gi, '').trim();
  if (track.version) {
    title = title.replace(/[\[(]([^\])]+)[\])]/g, (whole, label: string) => label.toLowerCase() === track.version!.toLowerCase() ? '' : whole).trim();
  }

  const prefix = [artist, ...performerNames].filter((name): name is string => !!name)
    .find(name => title.toLowerCase().startsWith(name.toLowerCase()) && /^[\s–—-]/.test(title.slice(name.length)));
  if (prefix && (!artist || artist.toLowerCase() === prefix.toLowerCase())) {
    const remainder = title.slice(prefix.length);
    const explicit = remainder.match(/^\s*(?:[-–—]\s*|((?:feat\.?|ft\.?)\s+.+?)\s+[-–—]\s*)(.+)$/i);
    const plain = /^\s+/.test(remainder) && prefix.includes(' ') && !/^(?:x\b|&|feat\.?\b|ft\.?\b)/i.test(remainder.trim());
    if (explicit || plain) {
      artist ||= canonical(prefix);
      if (explicit?.[1]) features.push(...names(explicit[1].replace(/^(?:feat\.?|ft\.?)\s+/i, '')));
      title = explicit?.[2] || remainder.trim();
    }
  }
  return {
    title: title.replace(/\s+/g, ' ').trim() || clean(track.title),
    artist,
    features: distinct(features.filter(Boolean)).filter(name => name.toLowerCase() !== artist?.toLowerCase()),
  };
}
