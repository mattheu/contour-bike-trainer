/**
 * Five heart rate zones at even 20 % splits of the working range between 50 % and 100 %
 * of hrMax, which lands on the classic 60/70/80/90 model. Splitting the whole 0–100 % into
 * fifths would put zone 1 at nought to 20 % of max, which nobody occupies; the usable range
 * is the top half, so the fifths go there. At the default hrMax of 190: 114/133/152/171.
 */
export const ZONE_FRACTIONS = [0.6, 0.7, 0.8, 0.9];

export const ZONE_COUNT = 5;

/**
 * Zones 1 and 5 are open-ended. The bounds are the ends of the working range itself, which
 * gives every segment the same 10 points of hrMax so the marker travels at one speed across
 * the ladder. At hrMax 190 that is 95 to 190 bpm: a warm-up sits inside zone 1, and only a
 * genuine maximal effort reaches the right-hand edge.
 */
const LOW_FRACTION = 0.5;
const HIGH_FRACTION = 1.0;

export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value))
    throw new RangeError(`${name} must be a finite number, got ${value}`);
}

function requireHrMax(hrMax: number): void {
  requireFinite('hrMax', hrMax);
  if (hrMax <= 0) throw new RangeError(`hrMax must be greater than zero, got ${hrMax}`);
}

/**
 * The four bpm values where one zone becomes the next, ascending. Rounded to whole beats
 * because that is the resolution a strap reports and what the readout shows.
 */
export function zoneBoundaries(hrMax: number): number[] {
  requireHrMax(hrMax);
  return ZONE_FRACTIONS.map((fraction) => Math.round(fraction * hrMax));
}

/** 1–5, a value exactly on a boundary belonging to the zone above it, as for power. */
export function zoneForHeartRate(bpm: number, hrMax: number): HeartRateZone {
  requireFinite('bpm', bpm);
  let zone = 1;
  for (const boundary of zoneBoundaries(hrMax)) {
    if (bpm < boundary) break;
    zone += 1;
  }
  return zone as HeartRateZone;
}

/**
 * 0–1 along a ladder of five equal segments: the zone gives the segment, and how far
 * through the zone the value sits gives the position within it. No absolute axis.
 */
export function ladderFraction(bpm: number, hrMax: number): number {
  const zone = zoneForHeartRate(bpm, hrMax);
  const edges = [LOW_FRACTION * hrMax, ...zoneBoundaries(hrMax), HIGH_FRACTION * hrMax];
  const lower = edges[zone - 1]!;
  const upper = edges[zone]!;
  const within = Math.min(1, Math.max(0, (bpm - lower) / (upper - lower)));
  return (zone - 1 + within) / ZONE_COUNT;
}

/** The accent band the marker is aiming at. The margin is a percentage of the target. */
export function targetBand(
  target: number,
  hrMax: number,
  marginPct: number,
): { from: number; to: number } {
  requireFinite('target', target);
  requireFinite('marginPct', marginPct);
  if (marginPct < 0) throw new RangeError(`marginPct must not be negative, got ${marginPct}`);
  const margin = (marginPct / 100) * target;
  return {
    from: ladderFraction(target - margin, hrMax),
    to: ladderFraction(target + margin, hrMax),
  };
}
