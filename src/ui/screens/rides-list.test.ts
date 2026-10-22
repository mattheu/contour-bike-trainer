import { describe, expect, it } from 'vitest';
import type { Ride } from '../../storage/types';
import {
  ALL_ROUTES,
  ALL_WORKOUTS,
  INITIAL_RIDE_FILTER,
  filterRides,
  matchesType,
  periodStart,
  periodSummary,
  rideDate,
  rideTitle,
  riddenRoutes,
  riddenWorkouts,
  selectType,
  type RideFilter,
} from './rides-list';

function ride(patch: Partial<Ride>): Ride {
  return {
    id: patch.id ?? 'r1',
    updatedAt: '2026-09-29T10:00:00.000Z',
    routeId: 'ditchling',
    routeName: 'Ditchling Beacon Loop',
    workoutId: null,
    workoutName: null,
    startedAt: '2026-09-29T10:00:00.000Z',
    elapsedS: 4448,
    pausedS: 0,
    distanceM: 38_200,
    ascentM: 512,
    avgPowerW: 243,
    avgHeartRateBpm: 148,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ergMode: 'erg',
      ftp: 265,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
    ...patch,
  };
}

const NOW = new Date(2026, 8, 30); // 30 September 2026

/** The screen's starting filter with one or two fields moved, so a test says only what it means. */
function filter(patch: Partial<RideFilter> = {}): RideFilter {
  return { ...INITIAL_RIDE_FILTER, ...patch };
}

/** A workout ridden with no route. */
function workoutRide(patch: Partial<Ride>): Ride {
  return ride({
    routeId: null,
    routeName: null,
    workoutId: 'openers',
    workoutName: 'Openers',
    ...patch,
  });
}

/**
 * Neither a route nor a plan. No entry point produces one — startRide takes a route and
 * startWorkout sets a workout — but an older archive or a later phase could.
 */
function freeRide(patch: Partial<Ride>): Ride {
  return ride({ routeId: null, routeName: null, ...patch });
}

describe('rideDate', () => {
  it('reads as the mockup does, with no comma after the weekday', () => {
    expect(rideDate('2026-09-29T10:00:00.000Z')).toBe('Tue 29 Sep');
  });

  it('does not throw on a corrupt timestamp', () => {
    expect(rideDate('not a date')).toBe('—');
  });
});

describe('periodStart', () => {
  it('starts the month at the first', () => {
    expect(periodStart('month', NOW)).toEqual(new Date(2026, 8, 1));
  });

  it('counts three months inclusive of the current one', () => {
    expect(periodStart('3months', NOW)).toEqual(new Date(2026, 6, 1));
  });

  it('has no bound at all', () => {
    expect(periodStart('all', NOW)).toBeNull();
  });
});

describe('matchesType', () => {
  it('lets everything through on All', () => {
    expect(matchesType(freeRide({}), 'all')).toBe(true);
    expect(matchesType(ride({}), 'all')).toBe(true);
    expect(matchesType(workoutRide({}), 'all')).toBe(true);
  });

  it('claims a ride with a route for Routes only', () => {
    expect(matchesType(ride({}), 'routes')).toBe(true);
    expect(matchesType(ride({}), 'workouts')).toBe(false);
  });

  it('claims a plan ridden without a route for Workouts only', () => {
    expect(matchesType(workoutRide({}), 'workouts')).toBe(true);
    expect(matchesType(workoutRide({}), 'routes')).toBe(false);
  });

  it('counts a plan ridden over a route as a route ride, as rideTitle names it', () => {
    const both = ride({ workoutId: 'openers', workoutName: 'Openers' });
    expect(matchesType(both, 'routes')).toBe(true);
    expect(matchesType(both, 'workouts')).toBe(false);
  });

  it('shows a ride with neither under All and claims it for neither named type', () => {
    expect(matchesType(freeRide({}), 'all')).toBe(true);
    expect(matchesType(freeRide({}), 'routes')).toBe(false);
    expect(matchesType(freeRide({}), 'workouts')).toBe(false);
  });
});

describe('selectType', () => {
  it('drops a route id when the rider leaves the routes type', () => {
    const armed = filter({ type: 'routes', routeId: 'box' });
    expect(selectType(armed, 'workouts')).toEqual(
      filter({ type: 'workouts', routeId: ALL_ROUTES, workoutId: ALL_WORKOUTS }),
    );
  });

  it('drops a workout id the same way, so switching back does not silently narrow', () => {
    const armed = filter({ type: 'workouts', workoutId: 'openers' });
    const back = selectType(selectType(armed, 'routes'), 'workouts');
    expect(back.workoutId).toBe(ALL_WORKOUTS);
    expect(back.routeId).toBe(ALL_ROUTES);
  });

  it('keeps the id when the type has not actually changed', () => {
    const armed = filter({ type: 'routes', routeId: 'box' });
    expect(selectType(armed, 'routes').routeId).toBe('box');
  });

  it('leaves the period alone, which hangs off nothing', () => {
    expect(selectType(filter({ period: 'year' }), 'all').period).toBe('year');
  });
});

describe('riddenWorkouts', () => {
  it('lists each workout once, by the name the ride froze', () => {
    expect(
      riddenWorkouts([
        workoutRide({ id: 'a' }),
        workoutRide({ id: 'b' }),
        workoutRide({ id: 'c', workoutId: 'threshold', workoutName: 'Threshold' }),
        freeRide({ id: 'd' }),
      ]),
    ).toEqual([
      { id: 'openers', name: 'Openers' },
      { id: 'threshold', name: 'Threshold' },
    ]);
  });

  it('keeps the option for a ride whose workout has since been deleted', () => {
    // The workouts repository no longer has 'openers'; the ride still does.
    expect(riddenWorkouts([workoutRide({ id: 'a' })])).toEqual([
      { id: 'openers', name: 'Openers' },
    ]);
  });

  it('offers nothing for a plan only ever ridden over a route, which Routes shows', () => {
    expect(riddenWorkouts([ride({ workoutId: 'openers', workoutName: 'Openers' })])).toEqual([]);
  });
});

describe('filterRides', () => {
  const rides = [
    ride({ id: 'a', startedAt: '2026-09-29T10:00:00.000Z' }),
    ride({ id: 'b', startedAt: '2026-08-15T10:00:00.000Z' }),
    ride({ id: 'c', startedAt: '2026-09-15T10:00:00.000Z', routeId: 'box', routeName: 'Box Hill' }),
  ];

  it('keeps the current month only', () => {
    const kept = filterRides(rides, filter({ period: 'month' }), NOW);
    expect(kept.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('narrows to one route', () => {
    const kept = filterRides(rides, filter({ type: 'routes', routeId: 'box', period: 'all' }), NOW);
    expect(kept.map((r) => r.id)).toEqual(['c']);
  });

  it('returns newest first', () => {
    const kept = filterRides(rides, filter({ period: 'all' }), NOW);
    expect(kept.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the array it was given', () => {
    const input = [...rides];
    filterRides(input, filter({ period: 'all' }), NOW);
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('filterRides by type', () => {
  const rides = [
    ride({ id: 'route', startedAt: '2026-09-29T10:00:00.000Z' }),
    workoutRide({ id: 'workout', startedAt: '2026-09-28T10:00:00.000Z' }),
    freeRide({ id: 'free', startedAt: '2026-09-27T10:00:00.000Z' }),
    workoutRide({
      id: 'old-workout',
      startedAt: '2026-06-15T10:00:00.000Z',
      workoutId: 'threshold',
      workoutName: 'Threshold',
    }),
  ];

  const ids = (f: Partial<RideFilter>) => filterRides(rides, filter(f), NOW).map((r) => r.id);

  it('shows everything on All', () => {
    expect(ids({ period: 'all' })).toEqual(['route', 'workout', 'free', 'old-workout']);
  });

  it('shows only route rides on Routes', () => {
    expect(ids({ type: 'routes', period: 'all' })).toEqual(['route']);
  });

  it('shows only workout rides on Workouts', () => {
    expect(ids({ type: 'workouts', period: 'all' })).toEqual(['workout', 'old-workout']);
  });

  it('leaves the ride with neither out of both named types, and in under All', () => {
    expect(ids({ type: 'routes', period: 'all' })).not.toContain('free');
    expect(ids({ type: 'workouts', period: 'all' })).not.toContain('free');
    expect(ids({ period: 'all' })).toContain('free');
  });

  it('narrows to one workout', () => {
    expect(ids({ type: 'workouts', workoutId: 'threshold', period: 'all' })).toEqual([
      'old-workout',
    ]);
  });

  it('applies the type and the period together', () => {
    expect(ids({ type: 'workouts', period: 'month' })).toEqual(['workout']);
    expect(ids({ type: 'routes', period: 'month' })).toEqual(['route']);
    expect(ids({ period: 'month' })).toEqual(['route', 'workout', 'free']);
  });

  it('keeps the older workout out of the month and in the year', () => {
    expect(ids({ type: 'workouts', period: '3months' })).toEqual(['workout']);
    expect(ids({ type: 'workouts', period: 'year' })).toEqual(['workout', 'old-workout']);
  });

  it('narrows to one workout and one period at once', () => {
    expect(ids({ type: 'workouts', workoutId: 'threshold', period: 'month' })).toEqual([]);
    expect(ids({ type: 'workouts', workoutId: 'threshold', period: 'year' })).toEqual([
      'old-workout',
    ]);
  });

  it('totals whatever is shown, type by type', () => {
    const shown = filterRides(rides, filter({ type: 'workouts', period: 'all' }), NOW);
    expect(periodSummary(shown, 'all', NOW)).toBe('All time · 2 rides · 76.4 km');
  });
});

describe('riddenRoutes', () => {
  it('lists each route once, by name', () => {
    const routes = riddenRoutes([
      ride({ id: 'a' }),
      ride({ id: 'b' }),
      ride({ id: 'c', routeId: 'box', routeName: 'Box Hill' }),
      ride({ id: 'd', routeId: null, routeName: null }),
    ]);
    expect(routes).toEqual([
      { id: 'box', name: 'Box Hill' },
      { id: 'ditchling', name: 'Ditchling Beacon Loop' },
    ]);
  });
});

describe('periodSummary', () => {
  it('reads as the mockup header does', () => {
    const rides = [
      ride({ id: 'a', distanceM: 38_200 }),
      ride({ id: 'b', distanceM: 24_600 }),
      ride({ id: 'c', distanceM: 19_400 }),
      ride({ id: 'd', distanceM: 38_200 }),
      ride({ id: 'e', distanceM: 28_900 }),
      ride({ id: 'f', distanceM: 9_500 }),
    ];
    expect(periodSummary(rides, 'month', NOW)).toBe('September · 6 rides · 158.8 km');
  });

  it('says one ride, not 1 rides', () => {
    expect(periodSummary([ride({})], 'month', NOW)).toBe('September · 1 ride · 38.2 km');
  });

  it('says so when there is nothing', () => {
    expect(periodSummary([], 'month', NOW)).toBe('September · no rides');
  });

  it('labels a year by its number and everything by name', () => {
    expect(periodSummary([], 'year', NOW)).toBe('2026 · no rides');
    expect(periodSummary([], 'all', NOW)).toBe('All time · no rides');
  });
});

describe('rideTitle', () => {
  it('names a free ride and says it had no route', () => {
    expect(rideTitle(ride({ routeId: null, routeName: null }))).toEqual({
      title: 'Free ride',
      meta: 'No route',
    });
  });

  it('leaves a route ride with no second line', () => {
    expect(rideTitle(ride({}))).toEqual({ title: 'Ditchling Beacon Loop', meta: null });
  });

  it('names a workout ride by its plan rather than calling it free', () => {
    expect(
      rideTitle(
        ride({ routeId: null, routeName: null, workoutId: 'openers', workoutName: 'Openers' }),
      ),
    ).toEqual({ title: 'Openers', meta: 'Workout' });
  });

  it('keeps the route as the name when a workout was ridden over one', () => {
    expect(rideTitle(ride({ workoutId: 'openers', workoutName: 'Openers' }))).toEqual({
      title: 'Ditchling Beacon Loop',
      meta: 'Openers',
    });
  });
});
