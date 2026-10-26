export interface LyricLine { start: number; end: number; text: string }
export function activeLyric(lines: LyricLine[], position: number): number {
  return lines.findIndex(line => position >= line.start && position < line.end);
}
export function parseLyrics(value: unknown): LyricLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is LyricLine =>
    line && Number.isFinite(line.start) && Number.isFinite(line.end) &&
    line.start >= 0 && line.end >= line.start && typeof line.text === 'string'
  ).sort((a,b) => a.start-b.start);
}
