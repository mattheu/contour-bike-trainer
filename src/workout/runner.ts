import type { ExpandedStep, ExpandedWorkout } from './expand';
import type { PowerValue, StepPower } from './types';

/**
 * Elapsed seconds to what the rider should be doing.
 *
 * A skip truncates the current step to what was actually ridden, so the run carries its
 * own step list: the workout is what was written, the run is what happened. Nothing here
 * mutates the parsed workout, and every function is a pure read of a run plus a clock.
 */

/** One press of the difficulty control, and the ends it is clamped between. */
export const SCALE_STEP_PCT = 5;
export const MIN_SCALE_PCT = 50;
export const MAX_SCALE_PCT = 150;
export const DEFAULT_SCALE_PCT = 100;

export interface WorkoutRun {
  /** The expanded steps, with any skipped step shortened to what was ridden. */
  readonly steps: readonly ExpandedStep[];
  /** Completed time plus the plan that remains, so the clock answers "how long will this be". */
  readonly totalDurationS: number;
}

export interface RunnerState {
  /** True once the clock passes the total. */
  finished: boolean;
  /** The step being ridden; steps.length when finished, so "index < stepIndex is done" holds. */
  stepIndex: number;
  step: ExpandedStep | null;
  /** What follows, for the panel's `next` line. Null on the last step. */
  next: ExpandedStep | null;
  /** Null on a free step, which has no target to hold. */
  targetW: number | null;
  /** False on a free step: ERG releases and simulation parameters go to the trainer instead. */
  erg: boolean;
  /** Counts down in place, so the panel's figure matches the interval clock. */
  remainingS: number;
}

function requireFtp(ftp: number): void {
  if (!Number.isFinite(ftp) || ftp <= 0) {
    throw new RangeError(`ftp must be greater than zero, got ${ftp}`);
  }
}

export function clampScalePct(scalePct: number): number {
  if (!Number.isFinite(scalePct)) return DEFAULT_SCALE_PCT;
  return Math.min(MAX_SCALE_PCT, Math.max(MIN_SCALE_PCT, Math.round(scalePct)));
}

/** Minus and plus, one 5 % press at a time. */
export function nudgeScalePct(scalePct: number, presses: number): number {
  return clampScalePct(clampScalePct(scalePct) + presses * SCALE_STEP_PCT);
}

function resolve(value: PowerValue, ftp: number): number {
  return value.unit === 'watts' ? value.value : (value.value / 100) * ftp;
}

/**
 * The target at a moment inside a step, in whole watts. The scale multiplies every target,
 * ramps included; a free step has no target to scale.
 */
export function targetWattsAt(
  power: StepPower,
  elapsedInStepS: number,
  durationS: number,
  ftp: number,
  scalePct: number = DEFAULT_SCALE_PCT,
): number | null {
  if (power.kind === 'free') return null;
  requireFtp(ftp);
  const scale = clampScalePct(scalePct) / 100;

  if (power.kind === 'constant') return Math.round(resolve(power.value, ftp) * scale);

  const progress = durationS > 0 ? Math.min(1, Math.max(0, elapsedInStepS / durationS)) : 0;
  const from = resolve(power.from, ftp);
  const to = resolve(power.to, ftp);
  return Math.round((from + (to - from) * progress) * scale);
}

export function startRun(expanded: ExpandedWorkout): WorkoutRun {
  return {
    steps: expanded.steps.map((step) => ({ ...step })),
    totalDurationS: expanded.totalDurationS,
  };
}

/** The index of the step containing elapsedS, or steps.length once the run is over. */
function indexAt(run: WorkoutRun, elapsedS: number): number {
  let start = 0;
  for (let index = 0; index < run.steps.length; index += 1) {
    const end = start + (run.steps[index] as ExpandedStep).durationS;
    if (elapsedS < end) return index;
    start = end;
  }
  return run.steps.length;
}

function startOf(run: WorkoutRun, index: number): number {
  let start = 0;
  for (let i = 0; i < index && i < run.steps.length; i += 1) {
    start += (run.steps[i] as ExpandedStep).durationS;
  }
  return start;
}

/**
 * Ends the current step where it stands. The step keeps what was ridden and the total
 * shrinks to match, so skipping a ten-minute block at 6:42 makes the session 3:18 shorter
 * rather than leaving a total that stopped being true the moment the button was used.
 *
 * Skipping the last step leaves the total equal to the elapsed time, which finishes the run.
 */
export function skipStep(run: WorkoutRun, elapsedS: number): WorkoutRun {
  const clock = Math.max(0, elapsedS);
  const index = indexAt(run, clock);
  if (index >= run.steps.length) return run;

  const ridden = Math.max(0, clock - startOf(run, index));
  const steps = run.steps.map((step, i) =>
    i === index ? { ...step, durationS: ridden } : { ...step },
  );
  return { steps, totalDurationS: steps.reduce((total, step) => total + step.durationS, 0) };
}

export function stateAt(
  run: WorkoutRun,
  elapsedS: number,
  ftp: number,
  scalePct: number = DEFAULT_SCALE_PCT,
): RunnerState {
  const clock = Math.max(0, elapsedS);
  const index = indexAt(run, clock);
  const step = run.steps[index];
  if (step === undefined) {
    return {
      finished: true,
      stepIndex: run.steps.length,
      step: null,
      next: null,
      targetW: null,
      erg: false,
      remainingS: 0,
    };
  }

  const elapsedInStepS = clock - startOf(run, index);
  return {
    finished: false,
    stepIndex: index,
    step,
    next: run.steps[index + 1] ?? null,
    targetW: targetWattsAt(step.power, elapsedInStepS, step.durationS, ftp, scalePct),
    erg: step.power.kind !== 'free',
    remainingS: step.durationS - elapsedInStepS,
  };
}

/**
 * The plan as one target per second, which is what the load calculation reads. Sampled at
 * the middle of each second so a ramp averages to its own mean rather than to its start.
 * A free step contributes nulls: no target, so nothing to score.
 */
export function plannedPowerSeries(
  steps: readonly ExpandedStep[],
  ftp: number,
  scalePct: number = DEFAULT_SCALE_PCT,
): (number | null)[] {
  const series: (number | null)[] = [];
  for (const step of steps) {
    const seconds = Math.round(step.durationS);
    for (let second = 0; second < seconds; second += 1) {
      series.push(targetWattsAt(step.power, second + 0.5, step.durationS, ftp, scalePct));
    }
  }
  return series;
}
