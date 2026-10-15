import type { Ride, RideSample } from '../../storage/types';
import type { PowerSample } from '../charts/power';

/**
 * A finished ride's samples in the shape the power strip reads. Samples with no power —
 * a dropped trainer, or the seconds before the first notification — are left out rather
 * than drawn as zero watts, which the strip would shade as a genuine zone 1 effort.
 */
export function powerSamplesFrom(samples: readonly RideSample[]): PowerSample[] {
  const out: PowerSample[] = [];
  for (const sample of samples) {
    if (sample.powerW === null || !Number.isFinite(sample.powerW)) continue;
    out.push({ distM: sample.distanceM, watts: sample.powerW });
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
