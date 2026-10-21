import { MONO } from './styles';
import { FADE, SLIDE, SLIDE_SIZE } from './motion';

export interface LadderSegment {
  zone: number;
  /** Percentages across the ladder, ready for a style attribute. */
  leftPct: number;
  widthPct: number;
  centrePct: number;
  lit: boolean;
}

/**
 * The segments, as a pure function of how many there are and which one is lit.
 *
 * Split out of the render because the count is the thing that went wrong: the ladder
 * drew five segments while src/zones/power.ts computed the marker against six, so above
 * zone 1 the tick and the lit segment disagreed and zone 6 lit nothing at all. Pure, so
 * the count can be asserted against the modules that own it rather than in a browser.
 *
 * At least one segment: a zero count is a caller bug, and dividing by it would render
 * NaN percentages rather than fail.
 */
export function ladderSegments(count: number, zone: number): LadderSegment[] {
  const segments = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const width = 100 / segments;
  return Array.from({ length: segments }, (_, index) => {
    const z = index + 1;
    return {
      zone: z,
      leftPct: index * width,
      widthPct: width,
      centrePct: (z - 0.5) * width,
      lit: z === zone,
    };
  });
}

/** `Zone 4 of 6`, counted against the caller's zones rather than the ladder's own idea. */
export function ladderLabel(zone: number, count: number): string {
  return `Zone ${String(zone)} of ${String(ladderSegments(count, zone).length)}`;
}

interface TargetBand {
  /** Fraction of the ladder, 0–1. */
  from: number;
  to: number;
}

interface ZoneLadderProps {
  /**
   * How many segments the ladder has. No default: power has six zones and heart rate
   * five, and the caller passes its own module's ZONE_COUNT so the two cannot drift.
   */
  count: number;
  /** The lit zone, 1–count. */
  zone: number;
  /** Where the tick sits, 0–1. src/zones supplies this; the ladder does not compute it. */
  marker: number;
  /** The accent window to aim at, as fractions of the ladder. */
  target?: TargetBand;
  label?: string;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** Keeps float noise out of the style attribute, so the DOM does not churn on every tick. */
const pct = (fraction: number) => `${(fraction * 100).toFixed(4)}%`;

/**
 * Equal segments over a hairline, one lit. Absolutely-positioned divs rather than
 * SVG: the ladder sits in the text flow beside a hero and has to share its width.
 * Marker and band slide by transform, so nothing animates layout.
 *
 * The step change as design/mockups/animation-guide.html runs it: the band slides to the
 * new window — both edges, so a window that narrows does not jump its far end — the tick
 * follows the rider's own power, and the lit segment cross-fades as the tick crosses a
 * boundary rather than snapping under it. All three at 0.3 s on the one ease-out curve,
 * and all three cuts under prefers-reduced-motion, where the band's new position and the
 * lit segment's new opacity are the still equivalent: both are states, not announcements.
 *
 * The guide holds the tick 0.5 s and then moves it over 0.5 s, "to simulate the rider
 * adjusting". Not reproduced, and deliberately: here the tick is the rider's measured
 * power, which already takes as long as it takes to arrive and is smoothed over three
 * seconds before it does. Delaying it again would be the app inventing a lag on a live
 * reading, which design/DESIGN.md > Motion rules out in the same breath — "live readings
 * carry no effect".
 */
export function ZoneLadder({ count, zone, marker, target, label }: ZoneLadderProps) {
  const tick = clamp(marker);
  const from = target ? clamp(target.from) : 0;
  const width = target ? Math.max(0, clamp(target.to) - from) : 0;
  const segments = ladderSegments(count, zone);

  return (
    <div className="relative h-[30px]" role="img" aria-label={label ?? ladderLabel(zone, count)}>
      <div className="bg-hairline absolute top-[5px] right-0 left-0 h-px" />

      {segments.map((segment) => (
        <div key={segment.zone}>
          <div
            className={`bg-ink absolute top-[4px] h-[3px] ${FADE}`}
            style={{
              left: `${String(segment.leftPct)}%`,
              width: `${String(segment.widthPct)}%`,
              opacity: segment.lit ? 0.45 : 0.1,
            }}
          />
          <div
            className={`${MONO} text-micro text-muted absolute top-[17px] -translate-x-1/2 ${FADE}`}
            style={{ left: `${String(segment.centrePct)}%`, opacity: segment.lit ? 0.9 : 0.45 }}
          >
            {segment.zone}
          </div>
        </div>
      ))}

      {target && (
        <div
          className={`absolute top-[3px] left-0 w-full ${SLIDE}`}
          style={{ transform: `translateX(${pct(from)})` }}
        >
          <div className={`bg-accent h-[5px] ${SLIDE_SIZE}`} style={{ width: pct(width) }} />
        </div>
      )}

      <div
        className={`absolute top-0 left-0 w-full ${SLIDE}`}
        style={{ transform: `translateX(${pct(tick)})` }}
      >
        <div className="bg-ink h-[12px] w-[2px]" />
      </div>
    </div>
  );
}
