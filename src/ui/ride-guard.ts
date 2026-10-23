import type { RideState } from '../ride/types';

/**
 * Whether a reload would destroy a ride.
 *
 * Autosave checkpoints the ride every half-minute, so a reload no longer costs all of
 * it — but the seconds since the last checkpoint are still only in this tab, and until
 * `endRide` writes the ride the rider has no summary to come back to.
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

/**
 * What in-app back asks before it leaves a ride. Two guards answer the same question
 * through different plumbing (ADR-0018): `beforeunload` covers reload and tab close and
 * is worded by the browser, `popstate` covers back and is worded here.
 *
 * It says what is actually at stake rather than "your ride will be lost": leaving does
 * not end the ride, and forward comes straight back to it. Starting another one is what
 * tears this one down.
 */
export const LEAVE_RIDE_PROMPT =
  'Leave this ride? It has not been saved, and starting another ride would discard it.';
