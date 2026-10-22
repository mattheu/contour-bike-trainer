import { KIND_LABEL, type RouteKind } from '../../route/loop';
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
 * The words of a row's micro label row, in order: what kind of route it is, then where it
 * is. Either can be missing — the kind until the row's geometry has loaded, the region on
 * an imported GPX that named no place — and a route with neither gets no label row at all
 * rather than an empty line holding space open.
 *
 * Words only. The kind's glyph belongs to the kind and is drawn from it, not from this.
 */
export function labelRow(kind: RouteKind | null, region: string | undefined): string[] {
  const words: string[] = [];
  if (kind !== null) words.push(KIND_LABEL[kind]);
  if (region !== undefined && region.trim() !== '') words.push(region);
  return words;
}

/**
 * The one line of description a row shows, or null where the route has none.
 *
 * Null rather than an empty string, because the row has to be able to leave the line out:
 * an imported GPX often carries no <desc>, and a blank 14 px line under the name reads as
 * a description that failed to load. The import already stores absent rather than empty
 * (src/route/import.ts), and this holds the same line for records written any other way.
 *
 * The list clips it to the column. The full text belongs to the route's start sheet, which
 * is where there is room for it — see Routes in design/DESIGN.md.
 */
export function descriptionLine(route: StoredRoute): string | null {
  const text = route.description?.trim() ?? '';
  return text === '' ? null : text;
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
