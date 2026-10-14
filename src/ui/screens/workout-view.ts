import type { ExpandedStep } from '../../workout/expand';
import type { CadenceTarget } from '../../workout/types';
import { ABSENT, duration, stepTarget } from '../format';
import type { WorkoutSnapshot } from '../store';

/**
 * Snapshot-to-screen derivation for the workout screen, the counterpart of ride-view. Every
 * question with a right answer lives here — which step is current, how a step reads as a
 * row, how the two clocks divide, what the power hero says when the step has no target —
 * so the component renders and decides nothing.
 */

/** design/DESIGN.md > Screen rules: done and ahead both read muted, and only the step
 *  the rider is on carries the accent. */
export type StepState = 'done' | 'current' | 'ahead';

export interface StepRow {
  /** 1-based, as the panel numbers them. */
  number: number;
  /** Empty where the author named nothing: the target stands alone rather than a guess. */
  name: string;
  target: string;
  /** The plan's length, except on the current step, which counts down in place. */
  duration: string;
  state: StepState;
}

export interface Clock {
  value: string;
  total: string;
}

export interface PowerHeroView {
  /** The figure beside the hero, or null on a free step, which has no target to hold. */
  target: string | null;
  /** The line over it: `target 90 % FTP`, or that there is nothing to aim at. */
  note: string;
}

/** Where the cadence tick and band sit, as fractions of the band's width. */
export interface CadenceBandView {
  from: number;
  to: number;
  /** Null when the trainer is not reporting a cadence: absent must stay absent. */
  marker: number | null;
}

/**
 * The band's ends. Fixed rather than derived from the target, so the tick moves when the
 * legs do: a window that recentred on every step would hold the tick still through a
 * cadence change, which is the one thing the band exists to show.
 */
export const CADENCE_MIN_RPM = 60;
export const CADENCE_MAX_RPM = 120;

function usable(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The step the rider is on, or null when the session has run out. stepIndex is the
 * runner's own, so the panel and the trainer cannot disagree about what step 4 of 8 is.
 */
export function currentStep(workout: WorkoutSnapshot): ExpandedStep | null {
  return workout.steps[workout.stepIndex] ?? null;
}

function stateOf(index: number, stepIndex: number): StepState {
  if (index < stepIndex) return 'done';
  return index === stepIndex ? 'current' : 'ahead';
}

/**
 * Every step the session will ride, not only what remains: seeing step 4 of 8 with two
 * blocks still below is what tells you where you are in the work.
 */
export function stepRows(workout: WorkoutSnapshot): StepRow[] {
  return workout.steps.map((step, index) => {
    const state = stateOf(index, workout.stepIndex);
    return {
      number: index + 1,
      name: step.name ?? '',
      target: stepTarget(step.power),
      duration: duration(state === 'current' ? workout.stepRemainingS : step.durationS),
      state,
    };
  });
}

/**
 * The row to hold in view, by its number, or null once the plan has run out. It is what
 * the panel scrolls to — and because it only changes when the plan advances, which is
 * minutes apart, it is also what stops that scroll firing on every tick.
 */
export function currentRowNumber(rows: readonly StepRow[]): number | null {
  return rows.find((row) => row.state === 'current')?.number ?? null;
}

/** The panel's heading: `8 · 63 min`, both of them of the plan that will actually be ridden. */
export function stepsHeading(steps: readonly ExpandedStep[]): string {
  const totalS = steps.reduce((total, step) => total + step.durationS, 0);
  return `${String(steps.length)} · ${String(Math.round(totalS / 60))} min`;
}

/**
 * Skipping is pointless once the plan has run out, and a control that does nothing should
 * say so rather than swallow the press.
 */
export function canSkip(workout: WorkoutSnapshot): boolean {
  return currentStep(workout) !== null;
}

/**
 * `246 / 239 W`, over `target 90 % FTP`. The share is computed from the target in force,
 * so at 80 % difficulty a 90 % step reads 72 % FTP — which is the work being asked for.
 *
 * A free step has no target: the hero says so rather than leaving the last step's number
 * sitting there looking like something to hold.
 */
export function powerHero(targetW: number | null, ftpW: number): PowerHeroView {
  if (!usable(targetW) || targetW <= 0) return { target: null, note: 'no target' };
  if (!usable(ftpW) || ftpW <= 0)
    return { target: targetW.toFixed(0), note: `target ${targetW.toFixed(0)} W` };
  return {
    target: targetW.toFixed(0),
    note: `target ${((targetW / ftpW) * 100).toFixed(0)} % FTP`,
  };
}

/** `target 90 rpm`, `target 85–95 rpm`, or nothing at all where the step names no cadence. */
export function cadenceNote(cadence: CadenceTarget | null): string | null {
  if (cadence === null) return null;
  const range =
    cadence.minRpm === cadence.maxRpm
      ? String(cadence.minRpm)
      : `${String(cadence.minRpm)}–${String(cadence.maxRpm)}`;
  return `target ${range} rpm`;
}

/**
 * The cadence band, which is a request rather than a measure of effort — so it is a window
 * to sit in, not a zone ladder. Null where the step names no cadence, and the hero then
 * reads exactly as the ride screen's does.
 */
export function cadenceBand(
  cadence: CadenceTarget | null,
  cadenceRpm: number | null,
): CadenceBandView | null {
  if (cadence === null) return null;
  const span = CADENCE_MAX_RPM - CADENCE_MIN_RPM;
  const fraction = (rpm: number) => clamp01((rpm - CADENCE_MIN_RPM) / span);
  const from = fraction(Math.min(cadence.minRpm, cadence.maxRpm));
  const to = fraction(Math.max(cadence.minRpm, cadence.maxRpm));
  return { from, to, marker: usable(cadenceRpm) ? fraction(cadenceRpm) : null };
}

/**
 * The interval clock counts down against the step's own length, so its figure is the one
 * the Steps panel shows in place. A finished session has no interval to run.
 */
export function intervalClock(workout: WorkoutSnapshot): Clock {
  const step = currentStep(workout);
  if (step === null) return { value: ABSENT, total: ABSENT };
  return { value: duration(workout.stepRemainingS), total: duration(step.durationS) };
}

/**
 * The workout clock counts up, against completed time plus the plan that remains. A skip
 * shortens the total, so it answers "how long will this be" rather than "how long was it
 * meant to be".
 */
export function workoutClock(elapsedS: number, totalRemainingS: number): Clock {
  return { value: duration(elapsedS), total: duration(elapsedS + totalRemainingS) };
}

/**
 * ERG is engaged whenever there is a target to hold. A free block releases it, and the
 * indicator is the only place on the screen that says the trainer stopped pushing back.
 */
export function ergLabel(ergEngaged: boolean): 'engaged' | 'released' {
  return ergEngaged ? 'engaged' : 'released';
}

/** The figure in the middle of the difficulty control. */
export function scaleLabel(scalePct: number): string {
  return `${String(Math.round(scalePct))} %`;
}
