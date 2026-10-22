/**
 * A lap, which is the unit a ghost is made of, and the two readings of one.
 *
 * Not a ride. On a loop "fastest ride" rewards whoever stopped soonest, so it is the only
 * reading of a history that means nothing at all; a point-to-point ride simply has one
 * lap and the same arithmetic holds. Everything downstream — resolving the slots, the
 * gap, the position on the map — is addressed by (rideId, lapIndex).
 */

import type { Ride, RideSample } from '../storage/types';

/** One completed lap of one route, identified by where it sits in its ride. */
export interface GhostLap {
  rideId: string;
  /** Index into the ride's `lapSplits`: 0 is the first time round. */
  lapIndex: number;
  /** The split, in ride seconds. */
  durationS: number;
  /** When the lap was crossed off, epoch ms, so the window and the ordering have a clock
   * to work against without this module having one of its own. */
  completedAtMs: number;
}

/**
 * Every lap in a history that could fill a slot for this route.
 *
 * A ride with no splits completed no length and so is not a candidate — that absence is
 * the whole of the eligibility rule, which is why `Ride` carries no flag beside it. It
 * can still be raced through the picked slot, which takes a ride rather than a record of
 * having finished one.
 *
 * The ride in progress needs no special case: it is a `Ride` like the rest, its
 * `lapSplits` grow as it rides, and the caller passes it in with the others. Which is
 * why this takes rides rather than reading them — the live one is not in storage yet.
 *
 * Completion instants are the ride's start plus the splits, so they ignore time spent
 * paused and land a little early on a ride with a long stop in it. That only moves a lap
 * within its own afternoon, and nothing here reads finer than a day.
 */
export function candidateLaps(rides: readonly Ride[], routeId: string): GhostLap[] {
  const laps: GhostLap[] = [];

  for (const ride of rides) {
    if (ride.routeId !== routeId) continue;
    const startedMs = Date.parse(ride.startedAt);
    if (Number.isNaN(startedMs)) continue;

    let intoRideS = 0;
    ride.lapSplits.forEach((durationS, lapIndex) => {
      // Checked before it is added up: a split that is not a number would otherwise
      // poison the completion instant of every lap after it in the same ride.
      if (!Number.isFinite(durationS) || durationS <= 0) return;
      intoRideS += durationS;
      laps.push({
        rideId: ride.id,
        lapIndex,
        durationS,
        completedAtMs: startedMs + intoRideS * 1000,
      });
    });
  }

  return laps;
}

/** One point of a ghost's lap, rebased so both figures start at nought on the line. */
export interface GhostPoint {
  /** Seconds since this lap began. */
  t: number;
  /** Metres since this lap began. */
  distanceM: number;
}

/** A ghost's series, from the line to wherever it got to. */
export interface GhostSeries {
  points: readonly GhostPoint[];
  /** How long the ghost rode for; the last point's `t`. */
  durationS: number;
  /** How far the ghost got; the last point's `distanceM`. */
  lengthM: number;
  /**
   * Whether it reached the end of the route length. The one thing that separates the two
   * end states downstream: a ghost that finished parks at the line having won, and one
   * that stopped marks where it gave up. Carried on the series rather than inferred from
   * `lengthM` against the route, because by the time a renderer has the ghost it no
   * longer has the route to compare it with.
   */
  finished: boolean;
}

/**
 * The series for one lap of a ride, rebased to that lap's start line.
 *
 * Everything on a loop is lap-relative. The rider's `elapsedS` is cumulative, so on lap
 * three at 42 minutes, asking where a ghost was at 42 minutes asks about a lap that
 * lasted nine. Rebasing here is what lets the ghost restart at the line each time the
 * rider crosses it, and what makes the gap reset with it.
 *
 * The boundaries come from the stored splits rather than from the samples again: the
 * splits were interpolated across the crossing when the ride was written, and
 * re-deriving them here from rounded sample distances would put the ghost's start line
 * up to a second away from the one its own split was measured to.
 *
 * Both ends are synthesised rather than taken from a sample, so every series begins at
 * (0, 0) and finishes at (durationS, lengthM) exactly. That is what the two readings
 * below clamp against, and what lets a lap with sparse samples still park at the finish.
 */
export function lapSeries(
  samples: readonly RideSample[],
  splits: readonly number[],
  lapIndex: number,
  routeLengthM: number,
): GhostSeries | null {
  const durationS = splits[lapIndex];
  if (durationS === undefined || !(durationS > 0) || !(routeLengthM > 0)) return null;

  const startM = lapIndex * routeLengthM;
  const endM = startM + routeLengthM;
  let startS = 0;
  for (let i = 0; i < lapIndex; i += 1) startS += splits[i] ?? 0;

  const points: GhostPoint[] = [{ t: 0, distanceM: 0 }];
  for (const sample of samples) {
    if (sample.distanceM <= startM || sample.distanceM >= endM) continue;
    const t = sample.t - startS;
    // A sample outside its own lap's clock is a record whose splits and series disagree;
    // dropping it keeps the series monotonic rather than propagating the contradiction.
    if (!(t > 0) || !(t < durationS)) continue;
    points.push({ t, distanceM: sample.distanceM - startM });
  }
  points.push({ t: durationS, distanceM: routeLengthM });

  return { points, durationS, lengthM: routeLengthM, finished: true };
}

/**
 * The series for a ride that never completed a length: everything it recorded, ending
 * where it stopped.
 *
 * SPEC.md > Ghosts: such a ride cannot be best, because there is no comparable time, but
 * it can still be raced individually — your climb-then-quit is still something to beat up
 * the climb. So this is the picked slot's fallback and nothing else's; the three resolved
 * slots go on taking completed laps only.
 *
 * Only the first lap's worth is taken. A ride with no splits never crossed the line, so
 * on a loop as on a point-to-point everything it recorded is lap one, and the clamp below
 * is a guard against a record whose samples and splits disagree rather than a case.
 */
export function rideSeries(
  samples: readonly RideSample[],
  routeLengthM: number,
): GhostSeries | null {
  if (!(routeLengthM > 0)) return null;

  const points: GhostPoint[] = [{ t: 0, distanceM: 0 }];
  let last = points[0] as GhostPoint;
  for (const sample of samples) {
    // Monotonic in both axes, for the reason lapSeries drops an out-of-clock sample: the
    // two readings below binary-search this series, and a step backwards in either makes
    // them answer questions about a ride that cannot have happened.
    if (!(sample.t > last.t) || !(sample.distanceM > last.distanceM)) continue;
    if (sample.distanceM >= routeLengthM) break;
    last = { t: sample.t, distanceM: sample.distanceM };
    points.push(last);
  }

  // One point is a ride that recorded nothing to race: a ghost parked on the start line
  // would read as a rider sitting there rather than as a ride that never set off.
  if (points.length < 2) return null;
  return { points, durationS: last.t, lengthM: last.distanceM, finished: false };
}

/** First index whose key is at or above `value`, by binary search. Never 0 when the
 * series genuinely passes `value`, so the caller always has a point behind it. */
function lowerBound(
  points: readonly GhostPoint[],
  value: number,
  key: (point: GhostPoint) => number,
): number {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    const point = points[mid];
    if (point !== undefined && key(point) < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * How far round the ghost was at a given time into its lap — where to draw its symbol.
 *
 * Interpolated between samples rather than snapped to the nearer one. At 1 Hz and 30 km/h
 * snapping moves the symbol by up to four metres a tick, which on a map reads as a ghost
 * that twitches rather than rides.
 */
export function distanceAtLapTime(series: GhostSeries, lapS: number): number {
  const points = series.points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (lapS <= first.t) return first.distanceM;
  if (lapS >= last.t) return last.distanceM;

  const index = lowerBound(points, lapS, (point) => point.t);
  const ahead = points[index];
  const behind = points[index - 1];
  if (ahead === undefined || behind === undefined) return last.distanceM;
  const span = ahead.t - behind.t;
  if (span <= 0) return ahead.distanceM;
  return behind.distanceM + ((lapS - behind.t) / span) * (ahead.distanceM - behind.distanceM);
}

/**
 * When the ghost reached a given distance into its lap — what the gap is built from.
 *
 * The earliest time it was there, which is the honest answer where the series sits still:
 * a ghost that stopped for a minute at this metre reached it when it arrived, not when it
 * set off again.
 */
export function lapTimeAtDistance(series: GhostSeries, distanceM: number): number {
  const points = series.points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (distanceM <= first.distanceM) return first.t;
  if (distanceM >= last.distanceM) return last.t;

  const index = lowerBound(points, distanceM, (point) => point.distanceM);
  const ahead = points[index];
  const behind = points[index - 1];
  if (ahead === undefined || behind === undefined) return last.t;
  const span = ahead.distanceM - behind.distanceM;
  if (span <= 0) return behind.t;
  return behind.t + ((distanceM - behind.distanceM) / span) * (ahead.t - behind.t);
}
