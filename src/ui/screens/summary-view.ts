import type { Ride, RideSample } from '../../storage/types';
import type { PowerSample } from '../charts/power';

/**
 * A finished ride's samples in the shape the power strip reads. Samples with no power —
 * a dropped trainer, or the seconds before the first notification — are left out rather
 * than drawn as zero watts, which the strip would shade as a genuine zone 1 effort.
 *
 * `fromM` is where the strip's x-axis begins in ride distance, which is zero everywhere
 * except a lapped ride: a sample carries how far the rider had gone, the strip's axis is
 * the route, and on a second lap those stop being the same number. Samples before it are
 * the previous lap and are dropped rather than folded back over this one, which would
 * draw the series running backwards.
 */
export function powerSamplesFrom(samples: readonly RideSample[], fromM = 0): PowerSample[] {
  const out: PowerSample[] = [];
  for (const sample of samples) {
    if (sample.powerW === null || !Number.isFinite(sample.powerW)) continue;
    if (sample.distanceM < fromM) continue;
    out.push({ distM: sample.distanceM - fromM, watts: sample.powerW });
  }
  return out;
}

/**
 * Which way a workout was ridden, for the footer beside the frozen difficulty. Null for a
 * ride with no workout: there was no target for anything to hold, so naming a mode there
 * would answer a question the session never asked.
 */
export function ergModeNote(ride: Ride): string | null {
  if (ride.workoutId === null) return null;
  return ride.settings.ergMode === 'manual' ? 'ERG off' : 'ERG';
}
