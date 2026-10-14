import { describe, expect, it } from 'vitest';

import type { RideSample, RideSettings } from '../storage/types';
import { RideRecorder } from './recorder';

const SETTINGS: RideSettings = {
  trainerDifficulty: 60,
  workoutScalePct: 100,
  ftp: 240,
  hrMax: 186,
  riderMassKg: 75,
  bikeMassKg: 9,
};

function sample(patch: Partial<RideSample> & { t: number }): RideSample {
  return {
    distanceM: 0,
    speedKmh: 30,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 140,
    lat: 51.5,
    lon: -1.5,
    eleM: 100,
    ...patch,
  };
}

function recorder(): RideRecorder {
  return new RideRecorder({
    routeId: 'test-mixed',
    routeName: 'Test Route 2 — Mixed',
    startedAt: '2026-09-30T07:05:00.000Z',
    settings: SETTINGS,
  });
}

describe('RideRecorder', () => {
  it('builds an empty ride without inventing figures', () => {
    const { ride, samples } = recorder().build({ pausedS: 0, finished: false });

    expect(ride.elapsedS).toBe(0);
    expect(ride.distanceM).toBe(0);
    expect(ride.ascentM).toBe(0);
    expect(ride.avgPowerW).toBeNull();
    expect(ride.avgHeartRateBpm).toBeNull();
    expect(samples.samples).toEqual([]);
  });

  it('takes elapsed and distance from the last sample', () => {
    const r = recorder();
    r.add(sample({ t: 0, distanceM: 0 }));
    r.add(sample({ t: 1, distanceM: 8.3 }));
    r.add(sample({ t: 2, distanceM: 16.9 }));

    const { ride } = r.build({ pausedS: 0, finished: false });
    expect(ride.elapsedS).toBe(2);
    expect(ride.distanceM).toBe(16.9);
  });

  it('records paused time separately from moving time', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    r.add(sample({ t: 120 }));

    const { ride } = r.build({ pausedS: 45.5, finished: false });
    // elapsedS + pausedS is the wall-clock time on the bike.
    expect(ride.elapsedS).toBe(120);
    expect(ride.pausedS).toBe(45.5);
  });

  it('sums ascent from positive elevation changes only', () => {
    const r = recorder();
    for (const eleM of [100, 110, 105, 130, 120]) r.add(sample({ t: 0, eleM }));

    // +10, +25. The two descents contribute nothing.
    expect(r.totalAscentM).toBeCloseTo(35, 6);
  });

  it('averages power and heart rate over the readings that exist', () => {
    const r = recorder();
    r.add(sample({ t: 0, powerW: 200, heartRateBpm: 140 }));
    r.add(sample({ t: 1, powerW: 300, heartRateBpm: null }));
    r.add(sample({ t: 2, powerW: null, heartRateBpm: 160 }));

    // An absent reading is skipped, not counted as a zero that drags the mean down.
    expect(r.avgPowerW).toBe(250);
    expect(r.avgHeartRateBpm).toBe(150);
  });

  it('counts a genuine zero-power sample', () => {
    const r = recorder();
    r.add(sample({ t: 0, powerW: 200 }));
    r.add(sample({ t: 1, powerW: 0 }));

    // Freewheeling down a descent is part of the average; a silent meter is not.
    expect(r.avgPowerW).toBe(100);
  });

  it('freezes the settings that produced the ride', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    const { ride } = r.build({ pausedS: 0, finished: true });

    expect(ride.settings).toEqual(SETTINGS);
    expect(ride.settings).not.toBe(SETTINGS);
  });

  it('keys the samples record to the ride and carries the route denormalised', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    const { ride, samples } = r.build({ pausedS: 0, finished: true });

    expect(samples.id).toBe(ride.id);
    expect(ride.routeId).toBe('test-mixed');
    expect(ride.routeName).toBe('Test Route 2 — Mixed');
    expect(ride.startedAt).toBe('2026-09-30T07:05:00.000Z');
    expect(ride.finished).toBe(true);
  });

  it('copies the samples out rather than handing over its own array', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    const { samples } = r.build({ pausedS: 0, finished: false });

    r.add(sample({ t: 1 }));
    expect(samples.samples).toHaveLength(1);
  });

  it('mints an id unless one is supplied', () => {
    const a = recorder();
    const b = recorder();
    expect(a.id).not.toBe(b.id);

    const fixed = new RideRecorder({
      id: 'known-id',
      routeId: null,
      routeName: null,
      startedAt: '2026-09-30T07:05:00.000Z',
      settings: SETTINGS,
    });
    expect(fixed.build({ pausedS: 0, finished: false }).ride.id).toBe('known-id');
  });

  describe('the workout a ride was', () => {
    it('records no workout when none was given', () => {
      const { ride } = recorder().build({ pausedS: 0, finished: false });

      expect(ride.workoutId).toBeNull();
      expect(ride.workoutName).toBeNull();
    });

    it('freezes the workout it was ridden as', () => {
      const r = new RideRecorder({
        routeId: null,
        routeName: null,
        workoutId: 'threshold-2x20',
        workoutName: '2x20 threshold',
        startedAt: '2026-09-30T07:05:00.000Z',
        settings: { ...SETTINGS, workoutScalePct: 80 },
      });

      const { ride } = r.build({ pausedS: 0, finished: false });
      expect(ride.workoutId).toBe('threshold-2x20');
      expect(ride.workoutName).toBe('2x20 threshold');
      expect(ride.settings.workoutScalePct).toBe(80);
    });

    it('takes the scale as the ride ended, not as it started', () => {
      const r = new RideRecorder({
        routeId: null,
        routeName: null,
        workoutId: 'threshold-2x20',
        workoutName: '2x20 threshold',
        startedAt: '2026-09-30T07:05:00.000Z',
        settings: { ...SETTINGS, workoutScalePct: 100 },
      });

      // The control is reached for mid-interval, so what it was set to before anyone
      // touched it answers nothing about the session that was actually ridden.
      const { ride } = r.build({ pausedS: 0, finished: false, workoutScalePct: 85 });
      expect(ride.settings.workoutScalePct).toBe(85);
    });

    it('records full scale for a ride whose caller had no workout to scale', () => {
      const { trainerDifficulty, ftp, hrMax, riderMassKg, bikeMassKg } = SETTINGS;
      const r = new RideRecorder({
        routeId: 'test-mixed',
        routeName: 'Test Route 2 — Mixed',
        startedAt: '2026-09-30T07:05:00.000Z',
        settings: { trainerDifficulty, ftp, hrMax, riderMassKg, bikeMassKg },
      });

      expect(r.build({ pausedS: 0, finished: false }).ride.settings.workoutScalePct).toBe(100);
    });
  });
});
