import { ABSENT, distance, num, percent } from '../format';
import type { RideSnapshot, WorkoutSnapshot } from '../store';
import { rideReadings, type Reading } from './ride-readings';
import { kilometres } from './ride-view';
import type { CadenceTarget } from '../../workout/types';
import {
  currentStep,
  intervalClock,
  intervalTone,
  targetSharePercent,
  workoutClock,
} from './workout-view';

/**
 * Every number a phone shows while riding a workout, formatted once.
 *
 * ride-readings already formats what a rider is doing — the watts, the cadence, the
 * speed. A workout adds what they were asked for, and that is all this is: the targets,
 * the interval band and the two readouts the plan chart needs. Composed on top rather
 * than written beside, so the portrait and landscape arrangements draw the same power
 * figure the ride screen does and differ only in where it sits.
 *
 * The desktop arrangement reads the same object for its four secondaries, which is the
 * point of it being here rather than inside either phone layout.
 */

export interface IntervalBand {
  label: string;
  /** The current step counting down: `6:42`. */
  value: string;
  /** What it is counting down from: `10:00`. */
  total: string;
  /** How much of the step is behind the rider, 0 through 1, for the progress track. */
  progress: number;
  /** Accent through the last ten seconds — see intervalTone. */
  tone: 'ink' | 'accent';
  testId: string;
}

export interface WorkoutReadings {
  power: Reading;
  cadence: Reading;
  heartRate: Reading;
  /** The session clock, counting up against the plan that is left: `28:18 / 1:03:00`. */
  workout: Reading;
  distance: Reading;
  speed: Reading;
  interval: IntervalBand;
  /** The line over the plan chart: `FTP 265 · ERG on`. */
  plan: string;
  /** What is coming: `next 5:00 recovery · 55 %`, dashed on the last step. */
  next: string;
}

export interface WorkoutReadingsInput {
  snapshot: RideSnapshot;
  workout: WorkoutSnapshot;
  hrMaxBpm: number;
  /** The rider's own heart-rate target from the settings panel, not the plan's. */
  targetHeartRateBpm: number | null;
  targetMarginPct: number;
}

/** A target worth drawing: a free step has none, and 0 W is not one either. */
function targetWatts(targetW: number | null): number | null {
  return targetW !== null && Number.isFinite(targetW) && targetW > 0 ? targetW : null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The power primary's readout line: `/ 239 · 90 %`.
 *
 * The desktop puts the target beside the figure and its share on a line above; a phone
 * has room for one line, so both go in it. Same two numbers, same sum behind them — see
 * targetSharePercent — and the slash is what keeps `/ 239` from reading as a measurement.
 *
 * A free step says so instead, in the words the desktop hero uses: a readout that went
 * blank would leave the rider looking at a target that is simply missing.
 */
export function powerTargetReadout(targetW: number | null, ftpW: number): string {
  const watts = targetWatts(targetW);
  if (watts === null) return 'no target';
  const share = targetSharePercent(watts, ftpW);
  return share === null ? `/ ${num(watts)}` : `/ ${num(watts)} · ${percent(share, 0)} %`;
}

/**
 * The cadence primary's readout line: `85–95`, or `90` where the step names one figure.
 *
 * No `rpm` and no `target`, unlike the desktop's note: the unit is already beside the
 * figure this sits under, and in a readout line nothing else could be a request.
 */
export function cadenceTargetReadout(cadence: CadenceTarget | null): string | null {
  if (cadence === null) return null;
  const from = Math.min(cadence.minRpm, cadence.maxRpm);
  const to = Math.max(cadence.minRpm, cadence.maxRpm);
  return from === to ? String(from) : `${String(from)}–${String(to)}`;
}

/**
 * How far through the current step the rider is, 0 through 1.
 *
 * The phone's answer to the Steps panel it has no room for: the countdown says how long
 * is left and the track says how much of the block that is, which is the one thing a
 * figure alone cannot show at a glance.
 *
 * Zero once the plan has run out. There is no step to be part-way through, and the
 * dashed countdown beside it is what says so — a full track would claim a step the rider
 * is not on has just finished.
 */
export function intervalProgress(workout: WorkoutSnapshot): number {
  const step = currentStep(workout);
  if (step === null || !Number.isFinite(step.durationS) || step.durationS <= 0) return 0;
  return clamp01((step.durationS - workout.stepRemainingS) / step.durationS);
}

export function intervalBand(workout: WorkoutSnapshot): IntervalBand {
  const clock = intervalClock(workout);
  return {
    label: 'Interval',
    value: clock.value,
    total: clock.total,
    progress: intervalProgress(workout),
    tone: intervalTone(workout),
    testId: 'workout-interval',
  };
}

/**
 * The line over the plan chart: `FTP 265 · ERG on`.
 *
 * Both facts the desktop keeps in its bottom band, in the width a phone has. `on` reads
 * the trainer rather than the control — it is `ergEngaged`, so a free block that released
 * the trainer says off while the mode is still ERG, which is what the rider is feeling.
 */
export function planReadout(ftpW: number, ergEngaged: boolean): string {
  return `FTP ${num(ftpW)} · ERG ${ergEngaged ? 'on' : 'off'}`;
}

/** `next 5:00 recovery · 55 %`, and a dash on the last step, which has nothing after it. */
export function nextStepReadout(workout: WorkoutSnapshot): string {
  return `next ${workout.nextLabel ?? ABSENT}`;
}

export function workoutReadings(input: WorkoutReadingsInput): WorkoutReadings {
  const { snapshot, workout, hrMaxBpm, targetHeartRateBpm, targetMarginPct } = input;

  // The session's FTP, not the profile's: a workout declaring its own `ftp:` is ridden at
  // it, so the share in the readout is of the FTP the target itself came from.
  const ftpW = workout.ftpW;

  const ride = rideReadings({
    snapshot,
    ftpW,
    hrMaxBpm,
    targetPowerW: workout.targetW,
    targetHeartRateBpm,
    targetMarginPct,
  });

  const cadenceTarget = cadenceTargetReadout(workout.cadence);
  const clock = workoutClock(snapshot.elapsedS, workout.totalRemainingS);

  return {
    power: {
      ...ride.power,
      testId: 'workout-power',
      figure: powerTargetReadout(workout.targetW, ftpW),
      // The share is in the figure already: `/ 239 · 90 %` carries its own per cent sign.
      figureUnit: undefined,
    },
    cadence: {
      ...ride.cadence,
      testId: 'workout-cadence',
      ...(cadenceTarget === null ? {} : { figure: cadenceTarget }),
    },
    heartRate: { ...ride.heartRate, testId: 'workout-heart-rate' },
    workout: {
      label: 'Workout',
      value: clock.value,
      total: clock.total,
      tone: 'ink',
      testId: 'workout-clock',
    },
    // Rebuilt rather than taken from the ride's, which counts a position on a route
    // against the route's length. With no route under the session that reading would sit
    // at 0.0 for the whole hour; what a workout has ridden is the ride's own distance,
    // and it counts up against nothing.
    distance: {
      label: 'Distance',
      value: distance(kilometres(snapshot.distanceM)),
      unit: 'km',
      tone: 'ink',
      testId: 'workout-distance',
    },
    speed: { ...ride.speed, testId: 'workout-speed' },
    interval: intervalBand(workout),
    plan: planReadout(ftpW, workout.ergEngaged),
    next: nextStepReadout(workout),
  };
}
