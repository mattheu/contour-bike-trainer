/**
 * The six Coggan power zones, as fractions of FTP:
 *
 *   1 active recovery  < 55 %      4 threshold   90-105 %
 *   2 endurance       55-75 %      5 VO2 max    105-120 %
 *   3 tempo           75-90 %      6 anaerobic    > 120 %
 *
 * Uneven because the physiology is: threshold work sits at 90-105 % of FTP, not wherever
 * an even split would put it. An earlier version used five even 20 % splits on the grounds
 * that the ladder was only an orientation aid. That stopped being true once a workout
 * states its targets as a percentage of FTP and the ladder has to show whether 90 % is
 * threshold.
 *
 * Six rather than five: zone 5 and zone 6 are different systems, and a 5x3 at 115 % is not
 * the session that 30-second efforts at 140 % are. Merging them is a display simplification
 * rather than the science.
 */
export const ZONE_FRACTIONS = [0.55, 0.75, 0.9, 1.05, 1.2];

export const ZONE_COUNT = 6;

/**
 * Zones 1 and 5 are open-ended, so the ladder needs somewhere to pin them. The marker no
 * longer travels at one rate across the ladder — five equal segments over uneven zones
 * cannot — so these are chosen to keep a plausible ride clear of both edges rather than to
 * equalise anything. At FTP 200 that is 80 W to 300 W: a recovery spin sits inside zone 1,
 * and only a sprint reaches the right-hand end.
 */
const LOW_FRACTION = 0.4;
const HIGH_FRACTION = 1.5;

export type PowerZone = 1 | 2 | 3 | 4 | 5 | 6;

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value))
    throw new RangeError(`${name} must be a finite number, got ${value}`);
}

function requireFtp(ftp: number): void {
  requireFinite('ftp', ftp);
  if (ftp <= 0) throw new RangeError(`ftp must be greater than zero, got ${ftp}`);
}

/**
 * The four watt values where one zone becomes the next, ascending. Rounded to a hundredth
 * of a watt, far below anything a trainer reports, to keep binary floating point out of the
 * boundary comparisons: 0.6 * 200 is otherwise 120.00000000000001 and a rider at exactly
 * 120 W would land in the zone below.
 */
export function zoneBoundaries(ftp: number): number[] {
  requireFtp(ftp);
  return ZONE_FRACTIONS.map((fraction) => Math.round(fraction * ftp * 100) / 100);
}

/**
 * 1–6. A value exactly on a boundary belongs to the zone above it: the boundary is where
 * the next zone starts, which is how the ladder renders its segments.
 */
export function zoneForPower(watts: number, ftp: number): PowerZone {
  requireFinite('watts', watts);
  let zone = 1;
  for (const boundary of zoneBoundaries(ftp)) {
    if (watts < boundary) break;
    zone += 1;
  }
  return zone as PowerZone;
}

/**
 * 0–1 along a ladder of six equal segments: the zone gives the segment, and how far
 * through the zone the value sits gives the position within it. No absolute axis.
 */
export function ladderFraction(watts: number, ftp: number): number {
  const zone = zoneForPower(watts, ftp);
  const edges = [LOW_FRACTION * ftp, ...zoneBoundaries(ftp), HIGH_FRACTION * ftp];
  const lower = edges[zone - 1]!;
  const upper = edges[zone]!;
  const within = Math.min(1, Math.max(0, (watts - lower) / (upper - lower)));
  return (zone - 1 + within) / ZONE_COUNT;
}

/**
 * The accent band the marker is aiming at. The margin is a percentage of the target, not
 * of FTP, because that is how a trainer's ERG accuracy is quoted and what the rider is
 * actually being asked to hold.
 */
export function targetBand(
  target: number,
  ftp: number,
  marginPct: number,
): { from: number; to: number } {
  requireFinite('target', target);
  requireFinite('marginPct', marginPct);
  if (marginPct < 0) throw new RangeError(`marginPct must not be negative, got ${marginPct}`);
  const margin = (marginPct / 100) * target;
  return {
    from: ladderFraction(target - margin, ftp),
    to: ladderFraction(target + margin, ftp),
  };
}
