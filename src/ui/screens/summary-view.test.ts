import { describe, expect, it } from 'vitest';
import type { Ride } from '../../storage/types';
import { ergModeNote } from './summary-view';

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
    tss: 91.3,
    lapSplits: [],
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
