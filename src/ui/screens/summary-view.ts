import type { Ride } from '../../storage/types';

/**
 * Which way a workout was ridden, for the footer beside the frozen difficulty. Null for a
 * ride with no workout: there was no target for anything to hold, so naming a mode there
 * would answer a question the session never asked.
 */
export function ergModeNote(ride: Ride): string | null {
  if (ride.workoutId === null) return null;
  return ride.settings.ergMode === 'manual' ? 'ERG off' : 'ERG';
}
