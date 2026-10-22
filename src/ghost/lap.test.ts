import { describe, expect, it } from 'vitest';

import { lapSplits } from '../ride/metrics';
import type { Ride, RideSample, RideSettings } from '../storage/types';
import { candidateLaps, distanceAtLapTime, lapSeries, lapTimeAtDistance } from './lap';

const SETTINGS: RideSettings = {
  trainerDifficulty: 60,
  workoutScalePct: 100,
  ergMode: 'erg',
  ftp: 250,
  hrMax: 186,
  riderMassKg: 75,
  bikeMassKg: 9,
};

function ride(patch: Partial<Ride> & { id: string }): Ride {
  return {
    updatedAt: '2026-09-29T10:00:00.000Z',
    routeId: 'route-1',
    routeName: 'Rolling',
    workoutId: null,
    workoutName: null,
    startedAt: '2026-09-29T09:00:00.000Z',
    elapsedS: 600,
    pausedS: 0,
    distanceM: 3000,
    ascentM: 20,
    avgPowerW: 200,
    avgHeartRateBpm: 140,
    tss: 30,
    lapSplits: [],
    settings: SETTINGS,
    ...patch,
  };
}

function sample(patch: Partial<RideSample> & { t: number }): RideSample {
  return {
    distanceM: 0,
    speedKmh: 30,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 140,
    lat: null,
    lon: null,
    eleM: null,
    ...patch,
  };
}

const LAP_M = 1000;
/** 12 m/s puts every lap crossing between two samples rather than on one. */
const SPEED_MS = 12;

/** A steady ride at one sample a second, which is what the engine emits. */
function ridden(seconds: number, metresPerSecond = SPEED_MS): RideSample[] {
  const samples: RideSample[] = [];
  for (let t = 0; t <= seconds; t += 1) {
    samples.push(sample({ t, distanceM: t * metresPerSecond }));
  }
  return samples;
}

describe('candidateLaps', () => {
  it('gives one candidate per completed lap, in order', () => {
    const laps = candidateLaps([ride({ id: 'a', lapSplits: [100, 110, 105] })], 'route-1');

    expect(laps.map((lap) => lap.lapIndex)).toEqual([0, 1, 2]);
    expect(laps.map((lap) => lap.durationS)).toEqual([100, 110, 105]);
    expect(laps.every((lap) => lap.rideId === 'a')).toBe(true);
  });

  it('dates each lap by when it was crossed off, not when the ride began', () => {
    const startedMs = Date.parse('2026-09-29T09:00:00.000Z');
    const laps = candidateLaps([ride({ id: 'a', lapSplits: [100, 110] })], 'route-1');

    expect(laps[0]?.completedAtMs).toBe(startedMs + 100_000);
    expect(laps[1]?.completedAtMs).toBe(startedMs + 210_000);
  });

  it('never offers a ride that completed no laps', () => {
    const rides = [ride({ id: 'short', lapSplits: [] }), ride({ id: 'round', lapSplits: [95] })];

    expect(candidateLaps(rides, 'route-1').map((lap) => lap.rideId)).toEqual(['round']);
  });

  it('ignores rides of other routes, and rides of none', () => {
    const rides = [
      ride({ id: 'elsewhere', routeId: 'route-2', lapSplits: [60] }),
      ride({ id: 'free', routeId: null, lapSplits: [60] }),
      ride({ id: 'here', lapSplits: [60] }),
    ];

    expect(candidateLaps(rides, 'route-1').map((lap) => lap.rideId)).toEqual(['here']);
  });

  it('offers a lap of the ride in progress like any other', () => {
    // The live ride is a Ride whose lapSplits grow as it rides; nothing marks it out.
    const live = ride({ id: 'live', lapSplits: [92], startedAt: '2026-09-30T08:00:00.000Z' });
    const laps = candidateLaps([ride({ id: 'old', lapSplits: [100] }), live], 'route-1');

    expect(laps.map((lap) => lap.rideId)).toEqual(['old', 'live']);
  });
});

describe('lapSeries', () => {
  const samples = ridden(300);
  const splits = lapSplits(samples, LAP_M);

  it('rebases both time and distance to the lap start line', () => {
    const second = lapSeries(samples, splits, 1, LAP_M);

    expect(second?.points[0]).toEqual({ t: 0, distanceM: 0 });
    expect(second?.durationS).toBe(splits[1]);
    expect(second?.lengthM).toBe(LAP_M);
    // The first sample past the line is 1008 m into the ride, so 8 m into the lap, and
    // its ride clock of 84 s becomes whatever that is after the first split.
    expect(second?.points[1]?.distanceM).toBeCloseTo(8, 6);
    expect(second?.points[1]?.t).toBeCloseTo(84 - splits[0]!, 6);
  });

  it('finishes exactly on the line at both ends', () => {
    const third = lapSeries(samples, splits, 2, LAP_M);
    const last = third?.points[third.points.length - 1];

    expect(last).toEqual({ t: third?.durationS, distanceM: LAP_M });
    expect(third?.points.every((point) => point.distanceM <= LAP_M)).toBe(true);
    expect(third?.points.every((point) => point.t <= (third.durationS ?? 0))).toBe(true);
  });

  it('cuts the last completed lap of a loop at its own line, not at the end of the ride', () => {
    // 300 s at 10 m/s is three laps and most of a fourth; the third must stop at 3000 m.
    expect(splits).toHaveLength(3);
    const third = lapSeries(samples, splits, 2, LAP_M);

    expect(third?.points.map((point) => point.distanceM + 2 * LAP_M).at(-1)).toBe(3 * LAP_M);
    expect(third?.points.some((point) => point.distanceM > LAP_M)).toBe(false);
  });

  it('has nothing to slice for a lap the ride never completed', () => {
    expect(lapSeries(samples, splits, 3, LAP_M)).toBeNull();
    expect(lapSeries(samples, [], 0, LAP_M)).toBeNull();
    expect(lapSeries(samples, splits, 0, 0)).toBeNull();
  });

  it('still bounds a lap whose samples are sparse', () => {
    const sparse = [sample({ t: 0, distanceM: 0 }), sample({ t: 100, distanceM: LAP_M })];
    const only = lapSeries(sparse, [100], 0, LAP_M);

    expect(only?.points).toEqual([
      { t: 0, distanceM: 0 },
      { t: 100, distanceM: LAP_M },
    ]);
  });
});

describe('distanceAtLapTime', () => {
  const series = lapSeries(ridden(300), lapSplits(ridden(300), LAP_M), 0, LAP_M)!;

  it('interpolates between samples rather than snapping to one', () => {
    // Ten and a half seconds in, between the samples at 120 m and 132 m.
    expect(distanceAtLapTime(series, 10.5)).toBeCloseTo(126, 6);
    expect(distanceAtLapTime(series, 10.1)).toBeCloseTo(121.2, 6);
  });

  it('clamps to the line at both ends', () => {
    expect(distanceAtLapTime(series, -5)).toBe(0);
    expect(distanceAtLapTime(series, series.durationS + 60)).toBe(LAP_M);
  });
});

describe('lapTimeAtDistance', () => {
  const series = lapSeries(ridden(300), lapSplits(ridden(300), LAP_M), 0, LAP_M)!;

  it('interpolates between samples rather than snapping to one', () => {
    expect(lapTimeAtDistance(series, 126)).toBeCloseTo(10.5, 6);
    expect(lapTimeAtDistance(series, 121.2)).toBeCloseTo(10.1, 6);
  });

  it('answers when the ghost first reached a metre it then sat on', () => {
    const stopped = [
      sample({ t: 0, distanceM: 0 }),
      sample({ t: 10, distanceM: 100 }),
      sample({ t: 70, distanceM: 100 }),
      sample({ t: 160, distanceM: LAP_M }),
    ];
    const series = lapSeries(stopped, [160], 0, LAP_M)!;

    expect(lapTimeAtDistance(series, 100)).toBe(10);
  });

  it('clamps to the lap at both ends', () => {
    expect(lapTimeAtDistance(series, -1)).toBe(0);
    expect(lapTimeAtDistance(series, LAP_M + 500)).toBe(series.durationS);
  });
});
