import { describe, expect, it } from 'vitest';
import type { ExpandedStep } from '../../workout/expand';
import { INITIAL_SNAPSHOT, type RideSnapshot, type WorkoutSnapshot } from '../store';
import {
  cadenceTargetReadout,
  intervalBand,
  intervalProgress,
  nextStepReadout,
  planReadout,
  powerTargetReadout,
  workoutReadings,
} from './workout-readings';

/**
 * The numbers a phone shows while riding a workout.
 *
 * The shapes here are read off design/mockups/phone-portrait-workout.html and
 * phone-landscape-workout.html: both orientations say the same things in the same words
 * and differ only in where they sit, which is the whole reason this module exists.
 */

const ftpPercent = (value: number) => ({ unit: 'ftpPercent' as const, value });

/** The session's FTP, which every target here is a share of. */
const FTP = 265;

const STEPS: ExpandedStep[] = [
  {
    kind: 'step',
    durationS: 600,
    power: { kind: 'constant', value: ftpPercent(60) },
    name: 'Warmup',
  },
  {
    kind: 'step',
    durationS: 600,
    power: { kind: 'constant', value: ftpPercent(90) },
    name: 'Sweet spot',
  },
  { kind: 'step', durationS: 300, power: { kind: 'free' }, name: 'Max effort' },
];

function workout(patch: Partial<WorkoutSnapshot> = {}): WorkoutSnapshot {
  return {
    name: '3 x 10 Sweet Spot',
    steps: STEPS,
    stepIndex: 1,
    stepCount: STEPS.length,
    stepName: 'Sweet spot',
    targetW: 239,
    cadence: { minRpm: 85, maxRpm: 95 },
    stepRemainingS: 402,
    totalRemainingS: 2082,
    nextLabel: '5:00 recovery · 55 %',
    ergEngaged: true,
    ergMode: 'erg',
    scalePct: 100,
    ftpW: FTP,
    ...patch,
  };
}

function readings(snapshot: Partial<RideSnapshot> = {}, patch: Partial<WorkoutSnapshot> = {}) {
  return workoutReadings({
    snapshot: { ...INITIAL_SNAPSHOT, ...snapshot },
    workout: workout(patch),
    hrMaxBpm: 185,
    targetHeartRateBpm: null,
    targetMarginPct: 5,
  });
}

const RIDING: Partial<RideSnapshot> = {
  trainerState: 'connected',
  hrmState: 'connected',
  displayPowerW: 246,
  cadenceRpm: 91,
  heartRateBpm: 158,
  speedKmh: 31.4,
  distanceM: 16_100,
  elapsedS: 1698,
};

describe('the targets a workout adds to a reading', () => {
  it('reads the power target and its share of FTP in one line', () => {
    expect(powerTargetReadout(239, FTP)).toBe('/ 239 · 90 %');
  });

  it('says so rather than going blank on a step with no target to hold', () => {
    expect(powerTargetReadout(null, FTP)).toBe('no target');
    expect(powerTargetReadout(0, FTP)).toBe('no target');
  });

  // The same fallback the desktop hero takes: a share of nothing is not a number.
  it('drops the share where there is no usable FTP behind it', () => {
    expect(powerTargetReadout(239, 0)).toBe('/ 239');
  });

  it('reads a cadence window as a range, and a single figure as itself', () => {
    expect(cadenceTargetReadout({ minRpm: 85, maxRpm: 95 })).toBe('85–95');
    expect(cadenceTargetReadout({ minRpm: 90, maxRpm: 90 })).toBe('90');
  });

  it('puts a reversed window the right way round', () => {
    expect(cadenceTargetReadout({ minRpm: 95, maxRpm: 85 })).toBe('85–95');
  });

  it('has nothing to say where the step asks for no cadence', () => {
    expect(cadenceTargetReadout(null)).toBeNull();
  });
});

describe('the interval band', () => {
  it('counts the step down against its own length', () => {
    const band = intervalBand(workout());
    expect(band).toMatchObject({ label: 'Interval', value: '6:42', total: '10:00' });
  });

  it('fills the track with the part of the step that is behind the rider', () => {
    expect(intervalProgress(workout({ stepRemainingS: 600 }))).toBe(0);
    expect(intervalProgress(workout({ stepRemainingS: 300 }))).toBeCloseTo(0.5, 5);
    expect(intervalProgress(workout({ stepRemainingS: 0 }))).toBe(1);
  });

  // The snapshot's remaining seconds are rounded up, so a tick can land outside the step.
  it('never runs past either end of the track', () => {
    expect(intervalProgress(workout({ stepRemainingS: 601 }))).toBe(0);
    expect(intervalProgress(workout({ stepRemainingS: -5 }))).toBe(1);
  });

  it('turns accent through the last ten seconds, and only then', () => {
    expect(intervalBand(workout({ stepRemainingS: 11 })).tone).toBe('ink');
    expect(intervalBand(workout({ stepRemainingS: 10 })).tone).toBe('accent');
  });

  it('keeps counting on the last step, which simply has nothing after it', () => {
    const last = workout({ stepIndex: 2, stepRemainingS: 120, nextLabel: null });
    expect(intervalBand(last)).toMatchObject({ value: '2:00', total: '5:00' });
    expect(intervalProgress(last)).toBeCloseTo(0.6, 5);
    expect(nextStepReadout(last)).toBe('next —');
  });

  it('dashes the countdown and empties the track once the plan has run out', () => {
    const over = workout({ stepIndex: STEPS.length, stepRemainingS: 0, nextLabel: null });
    expect(intervalBand(over)).toMatchObject({ value: '—', total: '—', progress: 0, tone: 'ink' });
  });

  it('names what is coming', () => {
    expect(nextStepReadout(workout())).toBe('next 5:00 recovery · 55 %');
  });
});

describe('the line over the plan chart', () => {
  it('carries the FTP the session is ridden at', () => {
    expect(planReadout(FTP)).toBe('FTP 265');
  });

  // The ERG button beside the chart carries the mode now, and two places saying it is one
  // too many — see planReadout.
  it('says nothing about ERG', () => {
    expect(planReadout(FTP)).not.toMatch(/erg/i);
  });
});

describe('workoutReadings', () => {
  it('draws the three primaries the mockups do, targets in the readout line', () => {
    const view = readings(RIDING);

    expect(view.power).toMatchObject({ value: '246', unit: 'W', figure: '/ 239 · 90 %' });
    expect(view.cadence).toMatchObject({ value: '91', unit: 'rpm', figure: '85–95' });
    expect(view.heartRate).toMatchObject({ value: '158', unit: 'bpm', figure: 'Z4' });
  });

  // The ride screen's power readout is "108 % FTP" in two pieces; the workout's is one.
  it('leaves no unit trailing the power readout it replaced', () => {
    expect(readings(RIDING).power.figureUnit).toBeUndefined();
  });

  it('leaves the cadence readout empty where the step asks for no cadence', () => {
    expect(readings(RIDING, { cadence: null }).cadence.figure).toBeUndefined();
  });

  it('counts distance up against nothing, because there is no route under the session', () => {
    const view = readings(RIDING);
    expect(view.distance).toMatchObject({ value: '16.1', unit: 'km' });
    expect(view.distance.total).toBeUndefined();
  });

  it('gives the session clock the plan that is actually left', () => {
    expect(readings(RIDING).workout).toMatchObject({
      label: 'Workout',
      value: '28:18',
      total: '1:03:00',
    });
  });

  it('mutes what a dropped trainer was reading, as the ride screen does', () => {
    const view = readings({ ...RIDING, trainerState: 'reconnecting' });
    expect(view.power.tone).toBe('muted');
    expect(view.speed.tone).toBe('muted');
    expect(view.heartRate.tone).toBe('ink');
  });

  // A Tailwind class is not a contract, and the two phone arrangements and the desktop
  // all have to answer to the same handles.
  it('keeps the screen its own test handles', () => {
    const view = readings(RIDING);
    expect([
      view.power.testId,
      view.cadence.testId,
      view.heartRate.testId,
      view.workout.testId,
      view.distance.testId,
      view.speed.testId,
      view.interval.testId,
    ]).toEqual([
      'workout-power',
      'workout-cadence',
      'workout-heart-rate',
      'workout-clock',
      'workout-distance',
      'workout-speed',
      'workout-interval',
    ]);
  });
});
