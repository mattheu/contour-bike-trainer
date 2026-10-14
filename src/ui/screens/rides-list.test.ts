import { describe, expect, it } from 'vitest';
import type { Ride } from '../../storage/types';
import {
  ALL_ROUTES,
  filterRides,
  periodStart,
  periodSummary,
  rideDate,
  rideTitle,
  riddenRoutes,
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
    finished: true,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ftp: 265,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
    ...patch,
  };
}

const NOW = new Date(2026, 8, 30); // 30 September 2026

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

describe('filterRides', () => {
  const rides = [
    ride({ id: 'a', startedAt: '2026-09-29T10:00:00.000Z' }),
    ride({ id: 'b', startedAt: '2026-08-15T10:00:00.000Z' }),
    ride({ id: 'c', startedAt: '2026-09-15T10:00:00.000Z', routeId: 'box', routeName: 'Box Hill' }),
  ];

  it('keeps the current month only', () => {
    const kept = filterRides(rides, { routeId: ALL_ROUTES, period: 'month' }, NOW);
    expect(kept.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('narrows to one route', () => {
    const kept = filterRides(rides, { routeId: 'box', period: 'all' }, NOW);
    expect(kept.map((r) => r.id)).toEqual(['c']);
  });

  it('returns newest first', () => {
    const kept = filterRides(rides, { routeId: ALL_ROUTES, period: 'all' }, NOW);
    expect(kept.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the array it was given', () => {
    const input = [...rides];
    filterRides(input, { routeId: ALL_ROUTES, period: 'all' }, NOW);
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
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
