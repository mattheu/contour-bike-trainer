import type { ErgMode } from '../../storage/types';
import type { ExpandedStep } from '../../workout/expand';
import type { CadenceTarget } from '../../workout/types';
import { stepZone, zoneWash } from '../charts';
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
  /**
   * The row's ink wash, 0-1, or null on a free step — which has no zone, and must read
   * as an absence rather than as zone 1. The same scale the plan chart's blocks use, so
   * a row and the block above it are the same shade of the same intensity.
   */
  wash: number | null;
  /**
   * The rule above this row, 0-1 of ink, composited over whatever it sits on.
   *
   * Computed from both neighbours rather than fixed, because a rule has two sides. A top
   * border composites over its own row and knows nothing of the row above it, so a fixed
   * one lands dimmer than a brighter neighbour and the boundary reads crisp from below and
   * blurred from above. Taking the brighter of the two and adding the hairline's own value
   * puts it above both, at any scale — change the wash ceiling and this follows on its own.
   */
  rule: number;
}

/** What the hairline token is worth as ink over the ground, and the rule's margin. */
export const RULE_MARGIN = 0.15;

/**
 * The row's wash is the plan chart's block wash: one scale, so a list shows intensity at
 * the shade the chart already drew it at. Mixed from the ink token rather than written as
 * a colour, and left off the current row, where solid ink has already taken the space.
 */
export function washColour(wash: number | null): string | undefined {
  if (wash === null) return undefined;
  return `color-mix(in srgb, var(--color-ink) ${String(wash * 100)}%, transparent)`;
}

/**
 * The rule above a row, as translucent ink rather than the flat hairline token, at the
 * strength `stepRows` computed from the rows either side of it.
 *
 * A rule has two sides and a top border only knows one. Fixed at the hairline's own value
 * it reads crisp against an unwashed row and blurred against a brighter one; taken from
 * the brighter of its two neighbours it is above both, so the boundary is a line from
 * either direction. On two unwashed rows it comes out at the hairline exactly.
 */
export function ruleColour(rule: number): string {
  return `color-mix(in srgb, var(--color-ink) ${String(Math.min(1, rule) * 100)}%, transparent)`;
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
export function stepRows(workout: WorkoutSnapshot, ftpW: number): StepRow[] {
  // At the difficulty being ridden, not as written: the wash has to agree with the chart's
  // blocks, and the chart draws the plan the rider is actually being given.
  const washes = workout.steps.map((step) => zoneWash(stepZone(step, ftpW, workout.scalePct)));

  return workout.steps.map((step, index) => {
    const state = stateOf(index, workout.stepIndex);
    const above = index === 0 ? 0 : (washes[index - 1] ?? 0);
    return {
      number: index + 1,
      name: step.name ?? '',
      target: stepTarget(step.power),
      duration: duration(state === 'current' ? workout.stepRemainingS : step.durationS),
      state,
      wash: washes[index] ?? null,
      rule: Math.max(above, washes[index] ?? 0) + RULE_MARGIN,
    };
  });
}

/**
 * The row to hold in the middle of the panel, by its number, or null once the plan has run
 * out. It is what the panel scrolls to — and because it only changes when the plan
 * advances, which is minutes apart, it is also what stops that scroll firing on every tick.
 */
export function currentRowNumber(rows: readonly StepRow[]): number | null {
  return rows.find((row) => row.state === 'current')?.number ?? null;
}

/**
 * The row a hovered plan block points at, by its number, or null where the pointer is on
 * no block at all.
 *
 * The index is the expanded step's, and `stepRows` walks the same steps in the same order,
 * so the row is found by position rather than searched for. A free step never reaches here:
 * it has no block to hover, which is why hovering its gap highlights nothing — the absence
 * is in the chart's hit areas, not in a rule written here. The lookup still guards an index
 * past the end, because a plan that shortens under a skip must not light a row that is gone.
 */
export function hoveredRowNumber(
  rows: readonly StepRow[],
  stepIndex: number | null,
): number | null {
  if (stepIndex === null) return null;
  return rows[stepIndex]?.number ?? null;
}

/**
 * The expanded step a hovered row names, or null where the pointer is on no row.
 *
 * The inverse of `hoveredRowNumber`, and the other half of one piece of state: both ends
 * of the coupling speak in step indices, so a row and a block cannot hold different ideas
 * of what is hovered. Searched rather than subtracted one, so the two directions stay
 * inverses of each other if the panel ever numbers rows differently from their position.
 *
 * A free row resolves to an index like any other. It marks nothing on the chart because
 * no block carries that index — see `blockForStep` — not because this declines to answer.
 */
export function stepIndexForRow(rows: readonly StepRow[], rowNumber: number | null): number | null {
  if (rowNumber === null) return null;
  const index = rows.findIndex((row) => row.number === rowNumber);
  return index === -1 ? null : index;
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
  const share = targetSharePercent(targetW, ftpW);
  if (share === null) return { target: targetW.toFixed(0), note: `target ${targetW.toFixed(0)} W` };
  return { target: targetW.toFixed(0), note: `target ${share.toFixed(0)} % FTP` };
}

/**
 * The target as a share of the FTP it was resolved against: 239 W of 265 reads 90 %. Null
 * where there is no usable FTP to be a share of, which is the hero's "target 239 W" case.
 *
 * Shared with the phone arrangements' readout line, which says the same two numbers in a
 * narrower shape — `/ 239 · 90 %`. One sum, so the two cannot round apart.
 */
export function targetSharePercent(targetW: number, ftpW: number): number | null {
  if (!usable(ftpW) || ftpW <= 0) return null;
  return (targetW / ftpW) * 100;
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
 * Where a step is close enough to its end to say so: the interval countdown turns accent
 * and the current row's anticipation cue starts.
 *
 * The snapshot's remaining seconds are rounded up — a clock showing 0:00 while the step is
 * still running lies for its last second — so a readout of 0:10 means ten seconds or fewer
 * are left, and the figure itself is the threshold rather than one less than it.
 */
export const FINAL_SECONDS = 10;

/**
 * The interval countdown's colour: accent through the last ten seconds of a step, ink for
 * the rest of it.
 *
 * design/DESIGN.md reserves the accent on this screen for the chart, and
 * design/mockups/animation-guide.html is where the exception comes from — its reference
 * sequence runs an accent cue through the end of every step, counting the last seconds
 * down beside the marker. This is that cue moved onto the readout that already counts the
 * step down, rather than a second countdown appearing beside the first, and widened from
 * the guide's three seconds to the ten the rider asked for after riding it.
 *
 * It is also the one part of a step change that is colour rather than motion, which is
 * why it is the part that survives prefers-reduced-motion untouched — and so the part
 * that has to carry the whole warning on its own when the row's cue is withheld.
 *
 * Ink once the plan has run out: there is no step left to be in the last seconds of, and
 * an accent dash would be a warning about nothing.
 */
export function intervalTone(workout: WorkoutSnapshot): 'ink' | 'accent' {
  return finalSecondsLeft(workout) === null ? 'ink' : 'accent';
}

/**
 * Seconds left of the step the rider is on while it is inside its final window, or null
 * at every other moment — through the body of a step, once the plan has run out, and on a
 * figure that is not a count of seconds at all.
 *
 * One rule, read twice. The countdown's colour and the Steps panel's anticipation cue are
 * the same signal in two places, so "is this step about to end" is answered once: a second
 * threshold written beside this one would be a cue that could turn on without the clock
 * agreeing, which is worse than no cue.
 */
function finalSecondsLeft(workout: WorkoutSnapshot): number | null {
  if (currentStep(workout) === null) return null;
  const remaining = workout.stepRemainingS;
  if (!Number.isFinite(remaining) || remaining < 0) return null;
  return remaining <= FINAL_SECONDS ? remaining : null;
}

/**
 * Where the anticipation cue stops building and sits at full depth. The guide's own cue —
 * the `cd3`/`cd2`/`cd1` keyframes in design/mockups/animation-guide.html — is a "next in
 * 3/2/1" that only appears for the last three seconds, so three is where the designed
 * answer says the rider is meant to be certain.
 */
export const ANTICIPATION_FULL_SECONDS = 3;

/**
 * How much accent the cue swells to, as a share of the current row's ink fill: the floor
 * it opens at ten seconds out and the ceiling it reaches at three.
 *
 * The ceiling is well short of 1 on purpose. A step change takes the whole row to solid
 * accent, so leaving the top of the range unused is what keeps the cue readable as "about
 * to switch" rather than as the switch — the change can still go somewhere the warning
 * never reaches.
 */
export const ANTICIPATION_MIN = 0.1;
export const ANTICIPATION_MAX = 0.45;

/**
 * How deep the current row's anticipation cue should swell, 0 through 1, where 0 is no cue
 * at all.
 *
 * It builds rather than running flat. Ten seconds is the window the rider asked for and
 * the one the countdown already turns accent at, but ten seconds of an unchanging pulse at
 * every step — twenty of them in a session — is nagging rather than useful. So the depth
 * carries the information the guide's 3/2/1 carried: barely a warmth at ten seconds, where
 * it only has to be noticed if you look, and unmistakable from three, where it has to be
 * read without looking. Both ends of the window say something different, which is what
 * makes it worth running for the whole of it.
 *
 * The depth only, never the rhythm: the swell beats at a fixed one a second whatever this
 * returns, so a cue that is building is never also a cue that is speeding up.
 */
export function anticipationDepth(workout: WorkoutSnapshot): number {
  const left = finalSecondsLeft(workout);
  if (left === null) return 0;
  const built = clamp01(
    (FINAL_SECONDS - left) / (FINAL_SECONDS - Math.min(ANTICIPATION_FULL_SECONDS, FINAL_SECONDS)),
  );
  // Weighted both ends rather than min plus a share of the span: the span form lands a
  // float short of the ceiling at the bottom of the window, and the ceiling is a number
  // the cue is supposed to actually reach.
  return (1 - built) * ANTICIPATION_MIN + built * ANTICIPATION_MAX;
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
 * ERG is engaged whenever there is a target the trainer is holding. A free block releases
 * it, so does turning it off, and the indicator is the only place on the screen that says
 * the trainer stopped pushing back.
 */
export function ergLabel(ergEngaged: boolean): 'engaged' | 'released' {
  return ergEngaged ? 'engaged' : 'released';
}

/**
 * The header's mode control: one choice with two members, not a button that renames
 * itself. design/DESIGN.md > Controls gives a two-state choice to a segmented group with
 * exactly one ink member, and it is the honest shape here — a button reading "Manual"
 * cannot say whether that is the state or the thing it will do, which is a guess nobody
 * should have to make three minutes into an interval.
 */
export const ERG_MODE_OPTIONS: readonly { value: ErgMode; label: string }[] = [
  { value: 'erg', label: 'ERG' },
  { value: 'manual', label: 'Manual' },
];

/**
 * Why trainer difficulty does nothing in this mode, or null while it still does.
 *
 * It is not the resistance and must not become it: ADR-0008 keeps the slider out of the
 * physics, so repurposing it would make a UI control change how fast the rider moves. With
 * ERG off and no route there is no gradient left for it to scale, and a control that
 * silently does nothing is worse than one that says why it cannot.
 */
export function difficultyInertReason(mode: ErgMode): string | null {
  if (mode === 'erg') return null;
  return 'No effect with ERG off: there is no route gradient to scale. Resistance comes from your gears and the flat road being simulated.';
}

/** The figure in the middle of the difficulty control. */
export function scaleLabel(scalePct: number): string {
  return `${String(Math.round(scalePct))} %`;
}
