import { describe, expect, it } from 'vitest';

import type { RideSample, RideSettings } from '../storage/types';
import { parseWorkout } from '../workout/parse';
import { workoutFtp } from '../workout/runner';
import { RideRecorder } from './recorder';

const SETTINGS: RideSettings = {
  trainerDifficulty: 60,
  workoutScalePct: 100,
  ergMode: 'erg',
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
    const { ride, samples } = recorder().build({ pausedS: 0 });

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

    const { ride } = r.build({ pausedS: 0 });
    expect(ride.elapsedS).toBe(2);
    expect(ride.distanceM).toBe(16.9);
  });

  it('records paused time separately from moving time', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    r.add(sample({ t: 120 }));

    const { ride } = r.build({ pausedS: 45.5 });
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
    const { ride } = r.build({ pausedS: 0 });

    expect(ride.settings).toEqual(SETTINGS);
    expect(ride.settings).not.toBe(SETTINGS);
  });

  it('keys the samples record to the ride and carries the route denormalised', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    const { ride, samples } = r.build({ pausedS: 0 });

    expect(samples.id).toBe(ride.id);
    expect(ride.routeId).toBe('test-mixed');
    expect(ride.routeName).toBe('Test Route 2 — Mixed');
    expect(ride.startedAt).toBe('2026-09-30T07:05:00.000Z');
  });

  it('copies the samples out rather than handing over its own array', () => {
    const r = recorder();
    r.add(sample({ t: 0 }));
    const { samples } = r.build({ pausedS: 0 });

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
    expect(fixed.build({ pausedS: 0 }).ride.id).toBe('known-id');
  });

  describe('the workout a ride was', () => {
    it('records no workout when none was given', () => {
      const { ride } = recorder().build({ pausedS: 0 });

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

      const { ride } = r.build({ pausedS: 0 });
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
      const { ride } = r.build({ pausedS: 0, workoutScalePct: 85 });
      expect(ride.settings.workoutScalePct).toBe(85);
    });

    it('takes the ERG mode as the ride ended, because it is switchable mid-session', () => {
      const r = new RideRecorder({
        routeId: null,
        routeName: null,
        workoutId: 'threshold-2x20',
        workoutName: '2x20 threshold',
        startedAt: '2026-09-30T07:05:00.000Z',
        settings: { ...SETTINGS, ergMode: 'erg' },
      });

      // Turned off in the second interval: the session the rider held is not the session
      // the trainer held, and the record has to say which one happened.
      const { ride } = r.build({ pausedS: 0, ergMode: 'manual' });
      expect(ride.settings.ergMode).toBe('manual');
    });

    it('records full scale for a ride whose caller had no workout to scale', () => {
      const { trainerDifficulty, ftp, hrMax, riderMassKg, bikeMassKg } = SETTINGS;
      const r = new RideRecorder({
        routeId: 'test-mixed',
        routeName: 'Test Route 2 — Mixed',
        startedAt: '2026-09-30T07:05:00.000Z',
        settings: { trainerDifficulty, ftp, hrMax, riderMassKg, bikeMassKg },
      });

      expect(r.build({ pausedS: 0 }).ride.settings.workoutScalePct).toBe(100);
      // ...and ERG, which is what a session with no target for anything to hold was.
      expect(r.build({ pausedS: 0 }).ride.settings.ergMode).toBe('erg');
    });
  });
});

/**
 * ADR-0017: a ride freezes the settings it was ridden with. For a workout session that is
 * the session's FTP — the workout's own where it declares one — because that is the number
 * its targets were given at, and the summary re-zones the finished ride against it.
 */
describe('the FTP a ride freezes', () => {
  function frozenFtpFor(source: string): number {
    const r = new RideRecorder({
      routeId: null,
      routeName: null,
      workoutId: 'w1',
      workoutName: parseWorkout(source).name,
      startedAt: '2026-09-30T07:05:00.000Z',
      // What services.ts freezes at the start of a workout session.
      settings: { ...SETTINGS, ftp: workoutFtp(parseWorkout(source), SETTINGS.ftp) },
    });
    r.add(sample({ t: 0 }));
    return r.build({ pausedS: 0 }).ride.settings.ftp;
  }

  it("is the workout's own where it declares one, not the rider's profile", () => {
    expect(frozenFtpFor('name: Fixed\nftp: 250\nsteps:\n  - { duration: 1m, power: 100% }\n')).toBe(
      250,
    );
  });

  it("is the rider's where the workout declares none", () => {
    expect(frozenFtpFor('name: Relative\nsteps:\n  - { duration: 1m, power: 100% }\n')).toBe(
      SETTINGS.ftp,
    );
  });
});

/**
 * The two figures that need the samples, derived on the one path a ride reaches storage
 * by, so a checkpoint and the final save carry the same fields.
 */
describe('the derived figures on a built ride', () => {
  function ridden(lengthM: number | null, seconds: number, metresPerSecond: number) {
    const r = new RideRecorder({
      routeId: lengthM === null ? null : 'test-flat',
      routeName: lengthM === null ? null : 'Flat 1 km',
      routeLengthM: lengthM,
      startedAt: '2026-09-30T07:05:00.000Z',
      settings: { ...SETTINGS, ftp: 200 },
    });
    for (let t = 0; t <= seconds; t += 1) {
      r.add(sample({ t, distanceM: t * metresPerSecond, powerW: 200 }));
    }
    return r.build({ pausedS: 0 }).ride;
  }

  it('splits a lapped ride at the route length it was ridden against', () => {
    expect(ridden(1000, 250, 12).lapSplits).toHaveLength(3);
  });

  it('leaves the splits empty for a ride with no route under it', () => {
    expect(ridden(null, 250, 12).lapSplits).toEqual([]);
  });

  it('scores the ride against the FTP it froze', () => {
    // An hour at an FTP of 200 held exactly, which is the anchor TSS is defined by.
    expect(ridden(null, 3600, 10).tss).toBe(100);
  });
});
