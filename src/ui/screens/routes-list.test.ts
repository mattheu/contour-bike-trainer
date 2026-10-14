import { describe, expect, it } from 'vitest';
import type { Ride, Route as StoredRoute } from '../../storage/types';
import { rideCounts, riddenLabel, sortRoutes } from './routes-list';

function ride(routeId: string | null, id: string): Ride {
  return {
    id,
    updatedAt: '2026-09-29T10:00:00.000Z',
    routeId,
    routeName: routeId,
    workoutId: null,
    workoutName: null,
    startedAt: '2026-09-29T10:00:00.000Z',
    elapsedS: 100,
    pausedS: 0,
    distanceM: 1000,
    ascentM: 10,
    avgPowerW: 200,
    avgHeartRateBpm: null,
    finished: true,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ftp: 200,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
  };
}

function route(id: string, name: string): StoredRoute {
  return {
    id,
    updatedAt: '2026-09-01T00:00:00.000Z',
    name,
    file: `${id}.gpx`,
    totalDistanceM: 1000,
    totalAscentM: 10,
  };
}

describe('rideCounts', () => {
  it('counts rides per route and ignores free rides', () => {
    const counts = rideCounts([ride('a', '1'), ride('a', '2'), ride(null, '3'), ride('b', '4')]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe('riddenLabel', () => {
  it('pluralises, and says when a route has never been ridden', () => {
    expect(riddenLabel(7)).toBe('7 rides');
    expect(riddenLabel(1)).toBe('1 ride');
    expect(riddenLabel(0)).toBe('Not ridden');
  });
});

describe('sortRoutes', () => {
  it('sorts by name without touching the input', () => {
    const input = [route('b', 'Sa Calobra'), route('a', 'Box Hill Repeats')];
    expect(sortRoutes(input).map((r) => r.id)).toEqual(['a', 'b']);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
