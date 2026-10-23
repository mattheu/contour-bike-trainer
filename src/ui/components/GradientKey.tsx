import { LABEL, MONO } from './styles';

/**
 * Uphill bins from design/DESIGN.md Marks: 2–4, 4–7, 7–10, >10 %.
 *
 * Each threshold is printed inside the wash it opens, rather than listed beside the row.
 * The old form — four swatches and "2 · 4 · 7 · 10 %" after them — left the reader to pair
 * figure to shade by position, and cost the width that the ghosts now occupy in the ride
 * band. Putting the figure in its own band answers both at once.
 */
const BINS = [
  { x: 0, opacity: 0.07, threshold: 2 },
  { x: 31, opacity: 0.13, threshold: 4 },
  { x: 62, opacity: 0.2, threshold: 7 },
  { x: 93, opacity: 0.28, threshold: 10 },
];

const SWATCH_W = 28;
const SWATCH_H = 16;
/** The last swatch's right edge: three gaps of 3 px between four swatches. */
const WIDTH = 121;
/** Sits the figure on the swatch's optical centre rather than its box centre. */
const BASELINE_Y = 12;

interface GradientKeyProps {
  label?: string;
}

export function GradientKey({ label = 'Gradient' }: GradientKeyProps) {
  return (
    <div className="flex items-center gap-[10px]">
      <div className={`${LABEL} text-micro`}>{label}</div>
      {/* Hidden from assistive tech, which gets the thresholds as text below: an SVG of
          four shaded boxes is a picture of the scale, not the scale itself. */}
      <svg width={WIDTH} height={SWATCH_H} viewBox={`0 0 ${WIDTH} ${SWATCH_H}`} aria-hidden="true">
        {BINS.map((bin) => (
          <g key={bin.threshold}>
            <rect
              x={bin.x}
              y="0"
              width={SWATCH_W}
              height={SWATCH_H}
              fill="var(--color-ink)"
              opacity={bin.opacity}
            />
            <text
              x={bin.x + SWATCH_W / 2}
              y={BASELINE_Y}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill="var(--color-muted)"
            >
              {bin.threshold}
            </text>
          </g>
        ))}
      </svg>
      <div className={`${MONO} text-micro text-muted`} aria-hidden="true">
        %
      </div>
      <span className="sr-only">
        {BINS.map((bin) => bin.threshold).join(', ')} per cent and above
      </span>
    </div>
  );
}
