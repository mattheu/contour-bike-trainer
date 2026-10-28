import type { Ride } from '../../storage/types';
import type { FoldedFigure } from '../components/ListRow';
import type { SegmentedOption } from '../components/Segmented';
import { ABSENT, distance, duration, num } from '../format';
import type { SortSpec, SortState } from './list-sort';

/**
 * Filtering, grouping and the period header for the rides list. Storage deliberately
 * offers no queries beyond list and get, so the narrowing happens here — in a pure
 * module a test can hold to account rather than inside the screen.
 */
export type Period = 'month' | '3months' | 'year' | 'all';

export const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: '3months', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

export const ALL_ROUTES = 'all';
export const ALL_WORKOUTS = 'all';

/** What kind of session a ride was: the two the app can start. */
export type RideType = 'all' | 'routes' | 'workouts';

export const RIDE_TYPES: readonly SegmentedOption<RideType>[] = [
  { value: 'all', label: 'All' },
  { value: 'routes', label: 'Routes' },
  { value: 'workouts', label: 'Workouts' },
];

// Spelled out rather than taken from Intl: en-GB abbreviates September to "Sept", the
// mockup uses "Sep", and an ICU upgrade must not silently re-word the history list.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Tue 29 Sep", in the rider's own timezone. */
export function rideDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return ABSENT;
  return `${DAYS[at.getDay()]} ${at.getDate()} ${MONTHS_SHORT[at.getMonth()]}`;
}

/**
 * A ride's three figures as one line, for widths too narrow to column them — distance,
 * elapsed time, then average power, in the order the columns run left to right. The same
 * fold the routes list uses, because the rows are the same shape.
 */
export function rideFigures(ride: Ride): readonly FoldedFigure[] {
  return [
    { value: distance(ride.distanceM / 1000), unit: 'km' },
    { value: duration(ride.elapsedS) },
    { value: num(ride.avgPowerW), unit: 'W' },
  ];
}

/** The inclusive lower bound of a period, or null for "everything ever". */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === 'all') return null;
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return new Date(now.getFullYear(), 0, 1);
}

/**
 * A ride that is both a route and a workout counts as a route, following rideTitle: the
 * route is what names the row, and the plan ridden over it is the line underneath. That
 * is phase 4; today startRide takes a route and startWorkout rides without one.
 *
 * A ride with neither — which no entry point can currently produce, but an older archive
 * or a later phase could — is shown under All and claimed by neither named type. Sorting
 * it into the one it is least unlike would put a row under a heading that does not
 * describe it, and there is no third option to offer because there is nothing to offer.
 */
export function matchesType(ride: Ride, filter: RideType): boolean {
  if (filter === 'all') return true;
  if (filter === 'routes') return ride.routeId !== null;
  return ride.routeId === null && ride.workoutId !== null;
}

export interface RideFilter {
  type: RideType;
  /** A route id, or ALL_ROUTES. Offered only when the type is routes. */
  routeId: string;
  /** A workout id, or ALL_WORKOUTS. Offered only when the type is workouts. */
  workoutId: string;
  period: Period;
}

/** What the screen opens on: everything ridden this month. */
export const INITIAL_RIDE_FILTER: RideFilter = {
  type: 'all',
  routeId: ALL_ROUTES,
  workoutId: ALL_WORKOUTS,
  period: 'month',
};

/**
 * Switching type, with the filter that hangs off the old one dropped. Same problem as
 * retainArmed in ride-delete.ts: a value the rider can no longer see is a value they
 * cannot undo, and a route id left armed behind the Workouts tab silently narrows the
 * list the moment they switch back.
 */
export function selectType(filter: RideFilter, type: RideType): RideFilter {
  return {
    ...filter,
    type,
    routeId: type === 'routes' ? filter.routeId : ALL_ROUTES,
    workoutId: type === 'workouts' ? filter.workoutId : ALL_WORKOUTS,
  };
}

/**
 * What the four filters leave, in no particular order: the screen sorts what comes back,
 * and since the columns became sortable there is exactly one place that decides an order
 * — see RIDE_SORT below.
 */
export function filterRides(
  rides: readonly Ride[],
  filter: RideFilter,
  now: Date = new Date(),
): Ride[] {
  const from = periodStart(filter.period, now);
  return rides
    .filter((ride) => matchesType(ride, filter.type))
    .filter((ride) => filter.routeId === ALL_ROUTES || ride.routeId === filter.routeId)
    .filter((ride) => filter.workoutId === ALL_WORKOUTS || ride.workoutId === filter.workoutId)
    .filter((ride) => from === null || new Date(ride.startedAt) >= from);
}

/** The routes that actually appear in the history, for the filter select. */
export function riddenRoutes(rides: readonly Ride[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const ride of rides) {
    if (ride.routeId !== null && !byId.has(ride.routeId)) {
      byId.set(ride.routeId, ride.routeName ?? ride.routeId);
    }
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The workouts that actually appear in the history, built the same way and for the same
 * reason: a Ride freezes workoutId and workoutName at save, so it outlives the workout it
 * was ridden from. Listing the workouts repository instead would quietly drop the filter
 * option for every ride whose plan has since been deleted.
 *
 * Narrowed to the rides the Workouts type actually shows, so every option selects at
 * least one row — which riddenRoutes gets for nothing, since a ride with a route id is
 * always a route ride. A plan ridden over a route is found under Routes, with the plan
 * on the row's second line.
 */
export function riddenWorkouts(rides: readonly Ride[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const ride of rides) {
    if (ride.workoutId !== null && matchesType(ride, 'workouts') && !byId.has(ride.workoutId)) {
      byId.set(ride.workoutId, ride.workoutName ?? ride.workoutId);
    }
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function periodLabel(period: Period, now: Date = new Date()): string {
  if (period === 'month') return MONTHS_LONG[now.getMonth()]!;
  if (period === '3months') return '3 months';
  if (period === 'year') return String(now.getFullYear());
  return 'All time';
}

/** "September · 6 rides · 158.8 km". Singular where it matters; an empty list says so. */
export function periodSummary(
  rides: readonly Ride[],
  period: Period,
  now: Date = new Date(),
): string {
  const label = periodLabel(period, now);
  if (rides.length === 0) return `${label} · no rides`;
  const km = rides.reduce((total, ride) => total + ride.distanceM, 0) / 1000;
  const count = `${rides.length} ${rides.length === 1 ? 'ride' : 'rides'}`;
  return `${label} · ${count} · ${distance(km)} km`;
}

/**
 * The route a ride can be raced over, or null where it cannot be raced at all.
 *
 * Two ways to fail and one answer. A workout ride has no routeId, so there is no road to
 * lay a ghost over; a route that has since been removed leaves its rides naming an id
 * nothing can load, which is the same case the list already handles by keeping the ride's
 * own frozen routeName on the row. Both hide the control rather than disabling it — a
 * greyed Race on a workout would suggest the rider had done something wrong.
 */
export function raceableRouteId(ride: Ride, routeIds: ReadonlySet<string>): string | null {
  if (ride.routeId === null) return null;
  return routeIds.has(ride.routeId) ? ride.routeId : null;
}

/**
 * What a ride is called, and the line under it where the name alone does not say enough.
 *
 * A route names the ride. A workout ridden without one is named by the plan rather than
 * passed off as a free ride, with "Workout" under it to say what kind of session it was —
 * it is the one thing that separates it from a route row at a glance. Only a ride with
 * neither is free, and keeps the mockup's "No route" line. A ride that is both is phase 4:
 * the route names it, and the plan ridden over it goes underneath.
 */
export function rideTitle(ride: Ride): { title: string; meta: string | null } {
  if (ride.routeName !== null) return { title: ride.routeName, meta: ride.workoutName };
  if (ride.workoutName !== null) return { title: ride.workoutName, meta: 'Workout' };
  return { title: 'Free ride', meta: 'No route' };
}

export type RideSortKey = 'date' | 'route' | 'distance' | 'time' | 'power';

/** Newest first, which is how a history is read and what this list always opened on. */
export const RIDE_SORT_INITIAL: SortState<RideSortKey> = { key: 'date', direction: 'desc' };

/**
 * The five columns a ride sorts by, in the order they are drawn. All five, where the
 * routes and workouts lists have a column that does not sort: this list's lead column is
 * a date rather than a thumbnail, and a date is the thing most worth ordering by.
 *
 * Date is the one column whose first press is descending. Every other starts ascending,
 * because a measurement reads up and a history reads back.
 *
 * Power is null on a ride that recorded none, which is the absent case: it sorts last
 * whichever way the arrow points rather than claiming nought watts.
 */
export const RIDE_SORT: SortSpec<RideSortKey, Ride> = {
  slots: [
    { key: 'date', label: 'Date', initial: 'desc', value: (ride) => ride.startedAt },
    { key: 'route', label: 'Route', short: 'Name', value: (ride) => rideTitle(ride).title },
    { key: 'distance', label: 'Distance', value: (ride) => ride.distanceM },
    { key: 'time', label: 'Time', value: (ride) => ride.elapsedS },
    { key: 'power', label: 'Avg power', short: 'Power', value: (ride) => ride.avgPowerW },
  ],
  // The one field every ride has and no two share: ISO, so it reads oldest first.
  tiebreak: (ride) => ride.startedAt,
};
