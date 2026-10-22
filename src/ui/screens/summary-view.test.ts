import { describe, expect, it } from 'vitest';
import type { Ride, RideSample } from '../../storage/types';
import { ergModeNote, powerSamplesFrom } from './summary-view';

function sample(patch: Partial<RideSample>): RideSample {
  return {
    t: 0,
    distanceM: 0,
    speedKmh: 30,
    powerW: 200,
    cadenceRpm: 90,
    heartRateBpm: 150,
    lat: null,
    lon: null,
    eleM: null,
    ...patch,
  };
}

describe('powerSamplesFrom', () => {
  it('keeps distance and watts in the order they were ridden', () => {
    expect(
      powerSamplesFrom([
        sample({ distanceM: 0, powerW: 180 }),
        sample({ distanceM: 8, powerW: 210 }),
      ]),
    ).toEqual([
      { distM: 0, watts: 180 },
      { distM: 8, watts: 210 },
    ]);
  });

  it('drops the seconds with no power rather than shading them as zero', () => {
    expect(
      powerSamplesFrom([sample({ powerW: null }), sample({ distanceM: 8, powerW: 210 })]),
    ).toEqual([{ distM: 8, watts: 210 }]);
  });

  it('offsets to the lap a strip is drawn for, dropping the laps before it', () => {
    // A 1 km circuit on its second lap: the axis is the route, the samples are the ride.
    expect(
      powerSamplesFrom(
        [
          sample({ distanceM: 400, powerW: 180 }),
          sample({ distanceM: 1000, powerW: 200 }),
          sample({ distanceM: 1250, powerW: 240 }),
        ],
        1000,
      ),
    ).toEqual([
      { distM: 0, watts: 200 },
      { distM: 250, watts: 240 },
    ]);
  });

  it('survives an empty ride', () => {
    expect(powerSamplesFrom([])).toEqual([]);
  });
});

function ride(patch: Partial<Ride> = {}, settings: Partial<Ride['settings']> = {}): Ride {
  return {
    id: 'ride-1',
    updatedAt: '2026-10-01T07:00:00.000Z',
    routeId: null,
    routeName: null,
    workoutId: 'threshold-2x20',
    workoutName: '2x20 threshold',
    startedAt: '2026-10-01T07:00:00.000Z',
    elapsedS: 3600,
    pausedS: 0,
    distanceM: 30_000,
    ascentM: 0,
    avgPowerW: 210,
    avgHeartRateBpm: 150,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ergMode: 'erg',
      ftp: 250,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
      ...settings,
    },
    ...patch,
  };
}

describe('ergModeNote', () => {
  it('reads back the mode a workout was held in', () => {
    expect(ergModeNote(ride())).toBe('ERG');
    expect(ergModeNote(ride({}, { ergMode: 'manual' }))).toBe('ERG off');
  });

  it('says nothing for a ride with no workout, which had no target to hold', () => {
    expect(ergModeNote(ride({ workoutId: null, workoutName: null }))).toBeNull();
  });
});
