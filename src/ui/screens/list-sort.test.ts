import { describe, expect, it } from 'vitest';
import type { Ride, Route as StoredRoute } from '../../storage/types';
import {
  ariaSort,
  listHeaders,
  pressSort,
  sortColumns,
  sortOptions,
  sortRows,
  type SortState,
} from './list-sort';
import { RIDE_SORT, RIDE_SORT_INITIAL, type RideSortKey } from './rides-list';
import { ROUTE_SORT_INITIAL, routeSortSpec, type RouteSortKey } from './routes-list';
import { WORKOUT_SORT, WORKOUT_SORT_INITIAL, type WorkoutRow } from './workouts-list';

function route(id: string, name: string, km: number, gain: number): StoredRoute {
  return {
    id,
    updatedAt: '2026-09-01T00:00:00.000Z',
    name,
    file: `${id}.gpx`,
    totalDistanceM: km * 1000,
    totalAscentM: gain,
  };
}

function ride(patch: Partial<Ride>): Ride {
  return {
    id: 'r1',
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
    tss: 82.5,
    lapSplits: [],
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

function readable(id: string, name: string, minutes: number, tss: number): WorkoutRow {
  return {
    id,
    name,
    status: 'ok',
    description: null,
    steps: [],
    totalDurationS: minutes * 60,
    ftpW: 265,
    tss,
  };
}

function broken(id: string, name: string): WorkoutRow {
  return { id, name, status: 'broken', detail: 'The workout is empty', line: 1, column: 1 };
}

const ROUTES = [
  route('sa', 'Sa Calobra', 19.4, 786),
  route('alpe', "Alpe d'Huez", 13.8, 1071),
  route('ditchling', 'Ditchling Beacon Loop', 38.2, 512),
];

/** Alpe ridden three times, Ditchling never, Sa Calobra twice. */
const COUNTS = new Map([
  ['alpe', 3],
  ['sa', 2],
]);

const routeSort = routeSortSpec(COUNTS);

function routeIds(state: SortState<RouteSortKey>): string[] {
  return sortRows(routeSort, ROUTES, state).map((item) => item.id);
}

describe('the routes list comparators', () => {
  it('opens on name ascending, which is the order it always had', () => {
    expect(ROUTE_SORT_INITIAL).toEqual({ key: 'name', direction: 'asc' });
    expect(routeIds(ROUTE_SORT_INITIAL)).toEqual(['alpe', 'ditchling', 'sa']);
  });

  it('reverses on name', () => {
    expect(routeIds({ key: 'name', direction: 'desc' })).toEqual(['sa', 'ditchling', 'alpe']);
  });

  it('sorts both ways on distance', () => {
    expect(routeIds({ key: 'distance', direction: 'asc' })).toEqual(['alpe', 'sa', 'ditchling']);
    expect(routeIds({ key: 'distance', direction: 'desc' })).toEqual(['ditchling', 'sa', 'alpe']);
  });

  it('sorts both ways on gain', () => {
    expect(routeIds({ key: 'gain', direction: 'asc' })).toEqual(['ditchling', 'sa', 'alpe']);
    expect(routeIds({ key: 'gain', direction: 'desc' })).toEqual(['alpe', 'sa', 'ditchling']);
  });

  it('counts a route nobody has ridden as nought rather than as absent', () => {
    expect(routeIds({ key: 'ridden', direction: 'asc' })).toEqual(['ditchling', 'sa', 'alpe']);
    expect(routeIds({ key: 'ridden', direction: 'desc' })).toEqual(['alpe', 'sa', 'ditchling']);
  });

  it('does not touch the array it was given', () => {
    sortRows(routeSort, ROUTES, { key: 'gain', direction: 'desc' });
    expect(ROUTES.map((item) => item.id)).toEqual(['sa', 'alpe', 'ditchling']);
  });

  it("offers the mockup's four segments in the mockup's order", () => {
    expect(sortOptions(routeSort, ROUTE_SORT_INITIAL).map((option) => option.label)).toEqual([
      'Name ↑',
      'Distance',
      'Gain',
      'Ridden',
    ]);
  });
});

const RIDES = [
  ride({ id: 'mid', startedAt: '2026-09-15T10:00:00.000Z', distanceM: 20_000, elapsedS: 3000 }),
  ride({ id: 'new', startedAt: '2026-09-29T10:00:00.000Z', distanceM: 10_000, elapsedS: 1000 }),
  // No power at all: the absent case this list has.
  ride({ id: 'old', startedAt: '2026-08-15T10:00:00.000Z', distanceM: 30_000, avgPowerW: null }),
];

function rideIds(state: SortState<RideSortKey>): string[] {
  return sortRows(RIDE_SORT, RIDES, state).map((item) => item.id);
}

describe('the rides list comparators', () => {
  it('opens on date descending, which is the order it always had', () => {
    expect(RIDE_SORT_INITIAL).toEqual({ key: 'date', direction: 'desc' });
    expect(rideIds(RIDE_SORT_INITIAL)).toEqual(['new', 'mid', 'old']);
  });

  it('reverses on date', () => {
    expect(rideIds({ key: 'date', direction: 'asc' })).toEqual(['old', 'mid', 'new']);
  });

  it('sorts both ways on distance', () => {
    expect(rideIds({ key: 'distance', direction: 'asc' })).toEqual(['new', 'mid', 'old']);
    expect(rideIds({ key: 'distance', direction: 'desc' })).toEqual(['old', 'mid', 'new']);
  });

  it('sorts both ways on time', () => {
    expect(rideIds({ key: 'time', direction: 'asc' })).toEqual(['new', 'mid', 'old']);
    expect(rideIds({ key: 'time', direction: 'desc' })).toEqual(['old', 'mid', 'new']);
  });

  it('leaves a ride that recorded no power last whichever way power points', () => {
    expect(rideIds({ key: 'power', direction: 'asc' })[2]).toBe('old');
    expect(rideIds({ key: 'power', direction: 'desc' })[2]).toBe('old');
  });

  it('sorts by the name the row actually shows', () => {
    const named = [
      ride({ id: 'free', routeId: null, routeName: null }),
      ride({ id: 'box', routeName: 'Box Hill Repeats' }),
    ];
    expect(sortRows(RIDE_SORT, named, { key: 'route', direction: 'asc' })[0]?.id).toBe('box');
  });
});

const WORKOUTS = [
  readable('threshold', 'Threshold 2x20', 63, 95),
  broken('bad', 'Bad YAML'),
  readable('openers', 'Openers', 30, 40),
];

function workoutIds(state: SortState<'name' | 'length' | 'load'>): string[] {
  return sortRows(WORKOUT_SORT, WORKOUTS, state).map((item) => item.id);
}

describe('the workouts list comparators', () => {
  it('opens on name ascending, which is the order it always had', () => {
    expect(WORKOUT_SORT_INITIAL).toEqual({ key: 'name', direction: 'asc' });
    expect(workoutIds(WORKOUT_SORT_INITIAL)).toEqual(['bad', 'openers', 'threshold']);
  });

  it('reverses on name, and a broken row sorts by name like any other', () => {
    expect(workoutIds({ key: 'name', direction: 'desc' })).toEqual(['threshold', 'openers', 'bad']);
  });

  it('leaves a plan that will not parse last on length, both ways', () => {
    expect(workoutIds({ key: 'length', direction: 'asc' })).toEqual([
      'openers',
      'threshold',
      'bad',
    ]);
    expect(workoutIds({ key: 'length', direction: 'desc' })).toEqual([
      'threshold',
      'openers',
      'bad',
    ]);
  });

  it('leaves it last on load too', () => {
    expect(workoutIds({ key: 'load', direction: 'asc' })).toEqual(['openers', 'threshold', 'bad']);
    expect(workoutIds({ key: 'load', direction: 'desc' })).toEqual(['threshold', 'openers', 'bad']);
  });

  it('breaks a tie on name rather than on how the rows arrived', () => {
    const tied = [readable('b', 'Beta', 30, 40), readable('a', 'Alpha', 30, 40)];
    expect(sortRows(WORKOUT_SORT, tied, { key: 'length', direction: 'desc' })).toEqual([
      tied[1],
      tied[0],
    ]);
  });
});

describe('pressing a column', () => {
  it('flips the column the list is already on rather than re-sorting it', () => {
    const first = pressSort(routeSort, ROUTE_SORT_INITIAL, 'name');
    expect(first).toEqual({ key: 'name', direction: 'desc' });
    expect(pressSort(routeSort, first, 'name')).toEqual({ key: 'name', direction: 'asc' });
  });

  it('starts a new column on ascending', () => {
    expect(pressSort(routeSort, ROUTE_SORT_INITIAL, 'gain')).toEqual({
      key: 'gain',
      direction: 'asc',
    });
  });

  it('starts the rides list on descending for the one column that reads back', () => {
    const byName: SortState<RideSortKey> = { key: 'route', direction: 'asc' };
    expect(pressSort(RIDE_SORT, byName, 'date')).toEqual({ key: 'date', direction: 'desc' });
    expect(pressSort(RIDE_SORT, byName, 'distance')).toEqual({
      key: 'distance',
      direction: 'asc',
    });
  });
});

describe('what the control says it is doing', () => {
  it('carries the arrow on the active column alone', () => {
    const state: SortState<RouteSortKey> = { key: 'gain', direction: 'desc' };
    expect(sortOptions(routeSort, state).map((option) => option.label)).toEqual([
      'Name',
      'Distance',
      'Gain ↓',
      'Ridden',
    ]);
  });

  it('names the header column but the segment short where the two differ', () => {
    const headers = listHeaders(routeSort, ROUTE_SORT_INITIAL, () => undefined);
    expect(headers.map((cell) => cell.label)).toEqual([
      'Profile',
      'Route ↑',
      'Distance',
      'Gain',
      'Ridden',
    ]);
    expect(sortOptions(routeSort, ROUTE_SORT_INITIAL)[0]?.label).toBe('Name ↑');
  });

  it('leaves a column that does not sort unpressable', () => {
    const headers = listHeaders(routeSort, ROUTE_SORT_INITIAL, () => undefined);
    expect(headers[0]?.onPress).toBeUndefined();
    expect(headers[1]?.onPress).toBeDefined();
    // Plan and the empty fifth on the workouts list.
    const workoutHeaders = listHeaders(WORKOUT_SORT, WORKOUT_SORT_INITIAL, () => undefined);
    expect(workoutHeaders.map((cell) => cell.onPress === undefined)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it('reports aria-sort on the active column and none elsewhere', () => {
    const headers = listHeaders(routeSort, { key: 'distance', direction: 'desc' }, () => undefined);
    expect(headers[2]?.ariaSort).toBe('descending');
    expect(headers[1]?.ariaSort).toBe('none');
    expect(headers[1]?.active).toBe(false);
    expect(headers[2]?.active).toBe(true);
    expect(ariaSort({ key: 'name', direction: 'asc' }, 'name')).toBe('ascending');
  });

  it('presses the key the slot carries', () => {
    const pressed: string[] = [];
    const headers = listHeaders(routeSort, ROUTE_SORT_INITIAL, (key) => {
      pressed.push(key);
    });
    headers[3]?.onPress?.();
    expect(pressed).toEqual(['gain']);
  });

  it('offers every sortable column and nothing else', () => {
    expect(sortColumns(routeSort)).toHaveLength(4);
    expect(sortColumns(RIDE_SORT)).toHaveLength(5);
    expect(sortColumns(WORKOUT_SORT)).toHaveLength(3);
  });
});
