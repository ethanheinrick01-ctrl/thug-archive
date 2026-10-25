import type { Track } from "./model";
export function Sleeve({
  kind = "archive",
  label,
  small = false,
}: {
  kind?: string;
  label?: string;
  small?: boolean;
}) {
  const themes: Record<string, [string, string]> = {
    archive: ["#c7f36a", "#172313"],
    gunna: ["#a8bcce", "#233344"],
    edits: ["#e8a578", "#583a2d"],
    versions: ["#c6b5ce", "#3e3046"],
    liked: ["#cc9d91", "#4e2d2d"],
    playlist: ["#ceb970", "#40371f"],
  };
  const [paper, ink] = themes[kind] || themes.archive;
  return (
    <svg
      class={`sleeve ${small ? "small" : ""}`}
      viewBox="0 0 320 320"
      role="img"
      aria-label={label || "Archive sleeve"}
    >
      <rect width="320" height="320" fill={paper} />
      <path d="M0 0H320V320H0Z" fill="none" stroke={ink} stroke-width="2" />
      <g fill="none" stroke={ink} opacity=".27">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle
            key={i}
            cx={kind === "edits" ? 70 : 225}
            cy="183"
            r={34 + i * 17}
          />
        ))}
      </g>
      <path
        d={
          kind === "versions"
            ? "M48 240L148 56L198 240ZM138 240L238 56L288 240Z"
            : kind === "edits"
              ? "M40 220L90 180L130 220L180 80L230 220L280 160"
              : "M56 222V110H90V222ZM110 264V68H144V264ZM164 236V96H198V236ZM218 202V130H252V202Z"
        }
        fill={kind === "edits" ? "none" : ink}
        stroke={ink}
        stroke-width={kind === "edits" ? "13" : "0"}
      />
      <text
        x="21"
        y="30"
        fill={ink}
        font-family="Arial,sans-serif"
        font-weight="700"
        font-size="10"
        letter-spacing="3"
      >
        THUG ARCHIVE
      </text>
      <text
        x="21"
        y="297"
        fill={ink}
        font-family="Arial,sans-serif"
        font-weight="700"
        font-size="10"
        letter-spacing="2"
      >
        {(label || "THE COLLECTION").toUpperCase().slice(0, 28)}
      </text>
      <text
        x="298"
        y="30"
        text-anchor="end"
        fill={ink}
        font-family="monospace"
        font-size="10"
      >
        TA
      </text>
    </svg>
  );
}
export function TrackArt({ track }: { track: Track }) {
  return track.artwork ? (
    <img class="track-art" src={track.artwork} alt="" loading="lazy" />
  ) : (
    <Sleeve
      kind={
        track.tags.includes("edit")
          ? "edits"
          : track.features.some((f) => f.toLowerCase().includes("gunna"))
            ? "gunna"
            : "archive"
      }
      label={track.title}
      small
    />
  );
}
