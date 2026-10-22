import { haversineM } from './gpx';
import type { Route } from './types';

/**
 * How close a route's finish has to be to its start to count as the same place.
 *
 * Fifty metres. A planned loop closes exactly, so anything above zero is for recorded
 * ones: GPS noise is a handful of metres, and a rider who stops their head unit while
 * rolling the last few seconds back to where they parked is the common case. Fifty
 * clears both comfortably.
 *
 * The ceiling is what makes it a judgement rather than "as big as possible". Getting
 * this wrong upwards is the expensive direction: a point-to-point route mistaken for a
 * loop never finishes, so the rider is left waiting at a finish line the app has
 * decided is not one. Fifty metres on a road network is the same junction — two genuinely
 * different places to start and stop are further apart than that, and the two real
 * point-to-point routes in the build end 4 km and 25 km from where they began.
 */
export const LOOP_CLOSE_M = 50;

/**
 * Whether a route's start and finish are the same place, which is the whole of what
 * makes it a loop. Derived from the geometry rather than declared in the manifest, so an
 * imported GPX gets it for free — SPEC.md > A loop can be ridden round again.
 *
 * The one check, and the only one: the lap counter, the tag on the routes list and the
 * decision not to stop at the start line all read this, so a route cannot be shown as a
 * loop and then end at its own finish.
 */
export function isLoop(route: Route): boolean {
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  if (first === undefined || last === undefined) return false;
  // A route no longer than the tolerance has no room to go anywhere and come back; its
  // ends are close because it is short, which is a different fact.
  if (route.totalDistanceM <= LOOP_CLOSE_M) return false;
  return haversineM(first.lat, first.lon, last.lat, last.lon) <= LOOP_CLOSE_M;
}

/**
 * Where on the route you are after riding distanceM round it — distance modulo the
 * route's length. This is the number that stops being the same as distance ridden on a
 * second lap, and every reader of "where am I" wants this one: the gradient under the
 * wheels, the position on the map, the ridden fill on the profile.
 *
 * Callers hold the loop check themselves rather than passing a route, because the engine
 * asks this every tick and the answer to "does this route lap" cannot change mid-ride.
 */
export function lapPositionM(distanceM: number, lengthM: number): number {
  if (!(lengthM > 0)) return 0;
  const position = distanceM % lengthM;
  return position < 0 ? position + lengthM : position;
}

/** Which lap is being ridden, 1-based. The first metre of a ride is lap 1. */
export function lapNumber(distanceM: number, lengthM: number): number {
  if (!(lengthM > 0)) return 1;
  return Math.floor(Math.max(0, distanceM) / lengthM) + 1;
}

/** The distance ridden at which the current lap began, so a per-lap view can offset to it. */
export function lapStartM(distanceM: number, lengthM: number): number {
  return (lapNumber(distanceM, lengthM) - 1) * (lengthM > 0 ? lengthM : 0);
}

/**
 * The tag and the lap counter, which are deliberately one thing: before a lap is
 * complete a loop reads `Loop`, and after it reads `Lap 2`. One slot on the ride header
 * and one on the routes list, so there is never a moment where a badge and a counter
 * compete for the same line, and the change from one wording to the other is the state
 * change worth showing.
 *
 * The words live beside the arithmetic because they *are* the arithmetic: both screens
 * read this rather than each deciding when a loop stops being a loop.
 */
export function lapLabel(distanceM: number, lengthM: number): string {
  const lap = lapNumber(distanceM, lengthM);
  return lap <= 1 ? LOOP_TAG : `Lap ${String(lap)}`;
}

/** What a loop reads before a lap is complete, and on the routes list, where there is no
 * ride to count laps of. One word in one place: see lapLabel. */
export const LOOP_TAG = 'Loop';

/**
 * How many whole laps a finished ride got round, for the summary.
 *
 * A different number from lapLabel's, deliberately: riding is about the lap you are on,
 * reading a ride back is about the laps you completed. Half a lap is no laps, and reads
 * as the plain tag — the ride went round a loop, and there is nothing to count yet.
 */
export function lapsLabel(distanceM: number, lengthM: number): string {
  const laps = lengthM > 0 ? Math.floor(Math.max(0, distanceM) / lengthM) : 0;
  if (laps < 1) return LOOP_TAG;
  return `${String(laps)} ${laps === 1 ? 'lap' : 'laps'}`;
}
