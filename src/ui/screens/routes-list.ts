import type { Ride, Route as StoredRoute } from '../../storage/types';

/**
 * The routes list's one derived column. Storage keeps no ride count on a route — it
 * would be a denormalised field to keep in step on every write — so the list counts the
 * history it already has to hand.
 */
export function rideCounts(rides: readonly Ride[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ride of rides) {
    if (ride.routeId === null) continue;
    counts.set(ride.routeId, (counts.get(ride.routeId) ?? 0) + 1);
  }
  return counts;
}

/** "7 rides", "1 ride", "Not ridden" — the last is news, not an empty cell. */
export function riddenLabel(count: number): string {
  if (count <= 0) return 'Not ridden';
  return `${count} ${count === 1 ? 'ride' : 'rides'}`;
}

/** Alphabetical: the bundled set is small and has no meaningful intrinsic order. */
export function sortRoutes(routes: readonly StoredRoute[]): StoredRoute[] {
  return [...routes].sort((a, b) => a.name.localeCompare(b.name));
}
