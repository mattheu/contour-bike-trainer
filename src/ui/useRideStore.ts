import { useSyncExternalStore } from 'react';
import { rideStore, type RideSnapshot } from './store';

/**
 * The only connection between the engine side and React. No effect polling, no
 * interval in a component: the subscription is it.
 */
export function useRideStore(): Readonly<RideSnapshot> {
  return useSyncExternalStore(rideStore.subscribe, rideStore.getSnapshot);
}
