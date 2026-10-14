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

/**
 * Removing a route is the rides list's two-press confirm with its own words, and the
 * words matter because the act is not the same one.
 *
 * Deleting a ride destroys the only copy of something that cannot be reconstructed, so it
 * says "can't be undone". What goes with a route is this install's record of it: nothing
 * that references it is touched, and the GPX is still in the build or still on the disk it
 * was imported from. Saying "can't be undone" here would be borrowing weight from the
 * rides list that this action has not got.
 *
 * Narrower than it was, now that a route carries its own GPX: an imported route the rider
 * no longer has the file for is gone for good, and the wording does not say so. Download
 * sits next to Remove on every row, which is the honest answer to that for now.
 *
 * "From this install" is a promise seedRoutes can now keep: the seeded marker in Settings
 * means a removed route is not written back on the next boot. It is the honest scope —
 * narrower than deleting a ride, wider than hiding a row — and it would have been a lie
 * before that marker existed.
 */
export const ROUTE_DELETE_WORDING = {
  /** Names the icon button, and the verb the confirm repeats. */
  action: 'Remove',
  prompt: 'Remove from this install?',
  confirm: 'Remove',
  cancel: 'Keep',
} as const;
