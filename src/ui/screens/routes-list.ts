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
 * Whether a row offers Remove at all.
 *
 * A route the build supplies is not the rider's to remove — seeding would write it back on
 * the next boot — so the control is absent rather than present and refused. Absent, not
 * disabled: a disabled control is a promise that something could happen here, and nothing
 * can. Everything else on the row is unaffected; a built-in route still downloads and
 * still rides.
 *
 * Here rather than in the component so the rule is testable without rendering, and so the
 * one place that decides it is the one place both the row and its armed state read.
 */
export function canRemoveRoute(routeId: string, builtIn: ReadonlySet<string>): boolean {
  return !builtIn.has(routeId);
}

/**
 * Removing a route is the rides list's two-press confirm with its own words, and the
 * words matter because the act is not the same one.
 *
 * Deleting a ride destroys the only copy of something that cannot be reconstructed, so it
 * says "can't be undone". What goes with a route is this install's record of it: nothing
 * that references it is touched, and the rides on it keep their own name and figures.
 *
 * "From this install" survives a change that narrowed what it covers. Only an imported
 * route can be removed now — a built-in one has no control at all — and for an imported
 * route this install is where the only copy lives, so Remove does destroy it. The wording
 * stays because the scope it names is still true and still the useful half of the claim:
 * nothing leaves but this install's record, and Download sits beside Remove on every row
 * so the rider can take the GPX with them first. What it no longer implies is that the
 * route is safe in the build, and nothing on the row says it is.
 */
export const ROUTE_DELETE_WORDING = {
  /** Names the icon button, and the verb the confirm repeats. */
  action: 'Remove',
  prompt: 'Remove from this install?',
  confirm: 'Remove',
  cancel: 'Keep',
} as const;
