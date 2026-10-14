import type { RideState } from '../ride/types';

/**
 * Whether a reload would destroy a ride.
 *
 * The recorder holds its samples in memory until the ride ends and `endRide` writes
 * them, so until that write lands the only copy of the ride is in this tab.
 */
export interface GuardedRide {
  state: RideState;
  /** How many 1 Hz samples the recorder has taken, which is the ride so far. */
  sampleCount: number;
  /** The id the ride was stored under, null until the save lands. */
  savedRideId: string | null;
}

/**
 * Three clauses, in the order they rule a ride out:
 *
 * - `idle` is a route chosen and nothing ridden. The rider is still on the list screen's
 *   decision, and the next screen after a reload is the same route.
 * - a saved ride is in storage. A reload re-reads it, and the summary is still there.
 * - what is left — running, paused, or finished but not written, which is a save that
 *   failed and left its fault strip on the ride screen — is worth a warning exactly when
 *   something has actually been recorded. Pressing Start and reloading before the first
 *   sample loses nothing, and a dialog over nothing teaches the rider to dismiss it.
 */
export function rideAtRisk({ state, sampleCount, savedRideId }: GuardedRide): boolean {
  if (state === 'idle') return false;
  if (savedRideId !== null) return false;
  return sampleCount > 0;
}
