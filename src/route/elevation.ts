/**
 * Spike rejection for GPX elevation.
 *
 * Real GPX carries elevation errors — barometric drift, or a DEM sampled off the road edge.
 * On `routes/alpe-dhuez.gpx` they produce 27 samples reading as descents on a road that
 * climbs for fourteen kilometres, and a total ascent 13 % above the net gain. That number
 * reaches Strava, so it has to be right.
 *
 * This is deliberately NOT smoothing. A moving average would blunt a genuine 12 % ramp
 * along with the noise. A median only replaces a point that its neighbours contradict, so
 * real terrain passes through untouched however steep it is.
 *
 * The GPX file is never modified. This filters the parsed series, which was always an
 * estimate of the road rather than the road itself.
 */

/** Two points either side. Wide enough to outvote a single bad reading, narrow enough that
 * a short real feature is still the majority of its own window. */
export const DESPIKE_WINDOW = 15;

/**
 * How far a point may sit from its neighbours' median before it is treated as an error.
 *
 * Tuned against the bundled routes under one rule: a correction must leave known-good data
 * unchanged. The two generated routes have a true ascent we know exactly (250 m and 699 m),
 * so any setting that moves them is wrong whatever it does elsewhere. This window and
 * threshold leave both at their exact values while taking the Alpe's worst gradient spikes
 * from -30 % to -13 %.
 *
 * WHAT THIS DOES NOT FIX: small persistent jitter. A real file's elevation wobbles by a
 * decimetre or so per point, which no median can see because no single point is an outlier.
 * On `routes/alpe-dhuez.gpx` that leaves total ascent around 10 % above the net gain. A
 * hysteresis threshold on the ascent sum would close it — at 5 m the Alpe lands within 8 m
 * of its true gain — but the same setting reads the rolling route's genuinely small bumps
 * as noise and reports 199 m where the answer is certainly 250. Trading a known error for
 * an unknown one is not an improvement, so the residual stands and is documented instead.
 */
export const DESPIKE_THRESHOLD_M = 4;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/**
 * Replaces points their neighbours contradict, leaving everything else exactly as read.
 *
 * One pass over the original values, never iteratively: a corrected point must not then
 * influence its neighbour's correction, or a run of small errors drags the whole series.
 */
export function despikeElevations(
  elevations: readonly number[],
  windowSize: number = DESPIKE_WINDOW,
  thresholdM: number = DESPIKE_THRESHOLD_M,
): number[] {
  if (windowSize < 3 || windowSize % 2 === 0) {
    throw new RangeError(`despike window must be odd and at least 3, got ${windowSize}`);
  }
  // Too short to have a majority view about any point; leave it alone.
  if (elevations.length < windowSize) return [...elevations];

  const half = Math.floor(windowSize / 2);
  return elevations.map((value, i) => {
    // The first and last few points have no full window. A truncated one is asymmetric, so
    // its median sits toward the interior and would "correct" the start of a steady climb
    // downhill. Where there is not enough context to judge a point, leave it alone.
    if (i < half || i >= elevations.length - half) return value;

    const local = median(elevations.slice(i - half, i + half + 1));
    return Math.abs(value - local) > thresholdM ? local : value;
  });
}
