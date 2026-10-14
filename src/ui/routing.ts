import { slugify } from '../export/file-name';

/**
 * The hash, parsed and rendered. ADR-0018.
 *
 * Both directions are pure functions of a string, so the whole of routing is testable
 * without a browser and the only part that touches `window` is the listener in App.tsx.
 *
 * The URL is a view of the screen state, never the source of it: nothing here reads
 * storage or the engine, and `resolve` is handed what the engine already knows rather
 * than looking anything up.
 */

/**
 * What `/ride` says it is a ride of. A slug of the name rather than an id, because
 * nothing resolves it: an id in the bar would invite a lookup, and a lookup is the thing
 * that could restart a ride from zero on a reload.
 */
export interface RideLabel {
  kind: 'route' | 'workout';
  slug: string;
}

/**
 * A screen, as the hash names it. `workout` is the editor at `/workouts/:id` and
 * `summary` is a ride at `/rides/:id`; both carry a real record id, which is ugly in the
 * bar and honest, because both of them do resolve.
 */
export type Location =
  | { name: 'splash' }
  | { name: 'routes' }
  | { name: 'workouts' }
  | { name: 'rides' }
  | { name: 'workout'; workoutId: string }
  | { name: 'ride'; label: RideLabel | null }
  | { name: 'summary'; rideId: string };

/**
 * A hash the app understands, or null for one it does not. Null rather than a silent
 * fallback so the caller can correct the bar as well as the screen — see `resolve`.
 */
export function parseHash(hash: string): Location | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const cut = raw.indexOf('?');
  const path = cut === -1 ? raw : raw.slice(0, cut);
  const query = cut === -1 ? '' : raw.slice(cut + 1);

  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return { name: 'splash' };
  if (segments.length > 2) return null;

  const [head, tail] = segments;
  switch (head) {
    case 'routes':
      // No route detail screen: choosing a route starts a ride, and /ride is where that
      // lives. A second segment here is a path the app has never had.
      return tail === undefined ? { name: 'routes' } : null;
    case 'workouts':
      return tail === undefined
        ? { name: 'workouts' }
        : { name: 'workout', workoutId: decodeURIComponent(tail) };
    case 'rides':
      return tail === undefined
        ? { name: 'rides' }
        : { name: 'summary', rideId: decodeURIComponent(tail) };
    case 'ride':
      // Deliberately no deeper path: a step is engine state, not a location.
      return tail === undefined ? { name: 'ride', label: parseLabel(query) } : null;
    default:
      return null;
  }
}

/** The label, or null where there is none to read. A malformed one is simply absent. */
function parseLabel(query: string): RideLabel | null {
  const params = new URLSearchParams(query);
  const workout = params.get('workout');
  if (workout !== null && workout !== '') return { kind: 'workout', slug: workout };
  const route = params.get('route');
  if (route !== null && route !== '') return { kind: 'route', slug: route };
  return null;
}

export function formatHash(location: Location): string {
  switch (location.name) {
    case 'splash':
      return '#/';
    case 'routes':
    case 'workouts':
    case 'rides':
      return `#/${location.name}`;
    case 'workout':
      return `#/workouts/${encodeURIComponent(location.workoutId)}`;
    case 'summary':
      return `#/rides/${encodeURIComponent(location.rideId)}`;
    case 'ride':
      return location.label === null
        ? '#/ride'
        : `#/ride?${location.label.kind}=${location.label.slug}`;
  }
}

/** What the engine knows, which is everything `/ride` is checked against. */
export interface RideContext {
  /** What is being ridden, or null when the engine holds nothing. */
  label: RideLabel | null;
  /** The id a finished ride was saved under, which turns `/ride` into its summary. */
  finishedRideId: string | null;
}

/**
 * The hash the app should be showing, given what the engine actually has.
 *
 * Three corrections, and the screen is rendered from the result rather than from the
 * hash, so the glass and the bar cannot disagree even for a frame:
 *
 * - An unknown or malformed hash goes to the routes list. It is the cold start, and the
 *   one screen that needs nothing to exist before it can be drawn.
 * - The splash goes the same way. Reaching here means the install has a session, which
 *   is what "straight past it" means.
 * - `/ride` describes and never causes. With nothing behind it — a bookmark, a reload
 *   after the ride ended — it redirects rather than rendering a ride that is not there;
 *   with a ride that has finished and saved, it becomes that ride's summary. The label
 *   is written from the engine, never read back into one.
 */
export function resolve(location: Location | null, ride: RideContext): Location {
  if (location === null) return { name: 'routes' };
  if (location.name === 'splash') return { name: 'routes' };
  if (location.name !== 'ride') return location;
  if (ride.finishedRideId !== null) return { name: 'summary', rideId: ride.finishedRideId };
  if (ride.label === null) return { name: 'routes' };
  return { name: 'ride', label: ride.label };
}

/** The names of whatever is being ridden, as the store publishes them. */
export interface RideSubject {
  workoutName: string | null;
  routeName: string | null;
}

/**
 * The label `/ride` carries. A workout first: a workout ride has no route under it, and
 * it is the workout the rider would recognise.
 *
 * Slugged from the name, which is why a bundled route reads `greenhow-hill` — its
 * manifest id happens to be the same slug — and an imported one reads `morning-loop`.
 * Nothing looks either of them up, so neither can break when a name changes.
 */
export function rideLabel({ workoutName, routeName }: RideSubject): RideLabel | null {
  if (workoutName !== null) return { kind: 'workout', slug: slugify(workoutName, 'workout') };
  if (routeName !== null) return { kind: 'route', slug: slugify(routeName, 'route') };
  return null;
}
