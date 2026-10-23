import type { Workout as StoredWorkout } from '../../storage/types';
import { expandWorkout, type ExpandedStep } from '../../workout/expand';
import { trainingStressScore } from '../../workout/load';
import { WorkoutParseError, parseWorkout } from '../../workout/parse';
import { plannedPowerSeries, workoutFtp } from '../../workout/runner';
import type { FoldedFigure } from '../components/ListRow';
import type { SegmentedOption } from '../components/Segmented';

/**
 * The workouts list's derived figures and its two filters.
 *
 * Every column but the name is read out of the YAML: the stored record keeps the source
 * the rider wrote, so the sparkline, the length and the load are all a parse away and
 * none of them is a denormalised field that can fall out of step with the file.
 *
 * That also means a stored source can stop parsing — a rider edits a file into a state
 * the format does not accept, or a future build tightens a rule. A row that cannot be
 * read says so and stays in the list, because the thing that fixes it is opening it.
 */

export interface WorkoutRowBase {
  id: string;
  /** The record's name, which survives a source that no longer parses. */
  name: string;
}

export interface ReadableWorkoutRow extends WorkoutRowBase {
  status: 'ok';
  description: string | null;
  steps: ExpandedStep[];
  totalDurationS: number;
  /** The FTP the load was computed at: the workout's own where it declares one. */
  ftpW: number;
  /** Coggan's score for the plan at 100 % scale, which is what a planned figure means. */
  tss: number;
}

export interface BrokenWorkoutRow extends WorkoutRowBase {
  status: 'broken';
  /** Without the position, which the row has no room for and the editor shows properly. */
  detail: string;
  line: number;
  column: number;
}

export type WorkoutRow = ReadableWorkoutRow | BrokenWorkoutRow;

/** parse.ts appends its own position to every message; the row shows the prose alone. */
const POSITION_SUFFIX = /\s*\(line \d+, column \d+\)\s*$/;

export function parseDetail(message: string): string {
  return message.replace(POSITION_SUFFIX, '');
}

/**
 * One row. Takes the rider's FTP rather than reading settings, so the figures are a pure
 * function of the record and one number — and a workout with its own `ftp` key ignores
 * the second argument, as it does everywhere else.
 */
export function workoutRow(stored: StoredWorkout, riderFtpW: number): WorkoutRow {
  try {
    const parsed = parseWorkout(stored.source);
    const expanded = expandWorkout(parsed);
    const ftpW = workoutFtp(parsed, riderFtpW);
    return {
      id: stored.id,
      name: parsed.name,
      status: 'ok',
      description: parsed.description ?? null,
      steps: expanded.steps,
      totalDurationS: expanded.totalDurationS,
      ftpW,
      tss: trainingStressScore(
        plannedPowerSeries(expanded.steps, ftpW),
        expanded.totalDurationS,
        ftpW,
      ),
    };
  } catch (error) {
    const parseError = error instanceof WorkoutParseError ? error : null;
    return {
      id: stored.id,
      name: stored.name,
      status: 'broken',
      detail: parseDetail(error instanceof Error ? error.message : String(error)),
      line: parseError?.line ?? 1,
      column: parseError?.column ?? 1,
    };
  }
}

/** Alphabetical, as the routes list is: a small set with no meaningful intrinsic order. */
export function workoutRows(workouts: readonly StoredWorkout[], riderFtpW: number): WorkoutRow[] {
  return [...workouts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((workout) => workoutRow(workout, riderFtpW));
}

export type LengthFilter = 'any' | 'short' | 'medium' | 'long';
export type LoadFilter = 'any' | 'light' | 'moderate' | 'hard';

/** design/mockups/workouts.html's four bands, and DESIGN.md's two filters: length and load. */
export const LENGTHS: readonly SegmentedOption<LengthFilter>[] = [
  { value: 'any', label: 'Any' },
  { value: 'short', label: '< 45 min' },
  { value: 'medium', label: '45–75' },
  { value: 'long', label: '75+' },
];

export const LOADS: readonly SegmentedOption<LoadFilter>[] = [
  { value: 'any', label: 'All' },
  { value: 'light', label: 'Under 50' },
  { value: 'moderate', label: '50–100' },
  { value: 'hard', label: 'Over 100' },
];

export function lengthMinutes(totalDurationS: number): number {
  return Math.round(totalDurationS / 60);
}

/** Banded on the figure the row shows, so a row on a boundary falls where it reads. */
export function loadPoints(tss: number): number {
  return Math.round(tss);
}

/**
 * A broken row has no length to filter on and survives every filter. Hiding it would
 * leave a workout the rider cannot find and therefore cannot fix, which is the one
 * outcome keeping the source rather than a parsed tree exists to avoid.
 */
export function matchesLength(row: WorkoutRow, filter: LengthFilter): boolean {
  if (filter === 'any' || row.status === 'broken') return true;
  const minutes = lengthMinutes(row.totalDurationS);
  if (filter === 'short') return minutes < 45;
  if (filter === 'medium') return minutes >= 45 && minutes <= 75;
  return minutes > 75;
}

/** Exempt for the same reason, and it has no load to band either. */
export function matchesLoad(row: WorkoutRow, filter: LoadFilter): boolean {
  if (filter === 'any' || row.status === 'broken') return true;
  const points = loadPoints(row.tss);
  if (filter === 'light') return points < 50;
  if (filter === 'moderate') return points >= 50 && points <= 100;
  return points > 100;
}

export interface WorkoutFilter {
  length: LengthFilter;
  load: LoadFilter;
}

/** Both filters at once, as the screen applies them: a row shows only if it passes each. */
export function filterWorkouts(rows: readonly WorkoutRow[], filter: WorkoutFilter): WorkoutRow[] {
  return rows.filter((row) => matchesLength(row, filter.length) && matchesLoad(row, filter.load));
}

/** The length cell: `63`, with `min` as its unit, as the mockup sets it. */
export function lengthLabel(totalDurationS: number): string {
  return String(lengthMinutes(totalDurationS));
}

/** The load cell. Whole points: a TSS to one decimal is precision the figure has not got,
 * and the filter bands on the same rounding, so a row never reads 50 and filters as 49. */
export function loadLabel(tss: number): string {
  return `${String(loadPoints(tss))} TSS`;
}

/**
 * A workout's figures as one line, for widths too narrow to column them — length, then
 * load. Two, not the three the routes and rides lists fold: the workouts row has only
 * two figures and a spacer where their third column is, and inventing a third here would
 * be inventing a figure.
 *
 * Nothing at all for a workout that will not parse: its figures are both absent, and a
 * line reading "— —" says less than the parse error already under the name does.
 */
export function workoutFigures(row: WorkoutRow): readonly FoldedFigure[] {
  if (row.status === 'broken') return [];
  return [
    { value: lengthLabel(row.totalDurationS), unit: 'min' },
    { value: loadLabel(row.tss), muted: true },
  ];
}

/**
 * The line under the name. A description where the author wrote one, and the parse error
 * where there is one — the row says what is wrong with it rather than going blank.
 */
export function workoutMeta(row: WorkoutRow): string | null {
  if (row.status === 'broken') return `Will not open: ${row.detail} (line ${String(row.line)})`;
  return row.description;
}

/**
 * Whether a row offers Delete at all.
 *
 * A starter the build supplies is not the rider's to delete — seeding would write it back
 * on the next boot — so the control is absent rather than present and refused.
 *
 * Here rather than in the component so the rule is testable without rendering, and so the
 * one place that decides it is the one place both the row and its armed state read.
 */
export function canDeleteWorkout(workoutId: string, builtIn: ReadonlySet<string>): boolean {
  return !builtIn.has(workoutId);
}

/**
 * Whether the editor opens on something the rider can change.
 *
 * The same answer as canDeleteWorkout, from the same set, and deliberately a second name
 * rather than a shared one: these are two claims about a starter — it is not yours to
 * remove, and it is not yours to rewrite — and a later build could keep one without the
 * other. src/ui/services.ts refuses both for real; this is what the screens read.
 */
export function canEditWorkout(workoutId: string, builtIn: ReadonlySet<string>): boolean {
  return !builtIn.has(workoutId);
}

export interface WorkoutControls {
  /** The row's first control, which says what pressing it does rather than what the
   * screen behind it is called. */
  open: 'Edit' | 'View';
  /** Offered on a starter only: see below. */
  duplicate: boolean;
  delete: boolean;
}

/**
 * What a row offers, in one place, so the row and its tests read the same rule.
 *
 * Duplicate is on a starter and nowhere else. A starter is the one row with a wall in
 * front of it — "sweet spot but ten minutes" has no other way through, and without a copy
 * to make, the examples stop being something to riff on. The rider's own workout has no
 * such wall: Edit already changes it, and a second copy of it is a want rather than a
 * need. It also keeps every row at three controls, which is already a lot.
 */
export function workoutControls(workoutId: string, builtIn: ReadonlySet<string>): WorkoutControls {
  const editable = canEditWorkout(workoutId, builtIn);
  return {
    open: editable ? 'Edit' : 'View',
    duplicate: !editable,
    delete: canDeleteWorkout(workoutId, builtIn),
  };
}

/**
 * Deleting a workout is the rides list's two-press confirm with its own words: a file the
 * rider may have spent an evening writing, with no backup behind it, so it says plainly
 * that this is permanent rather than implying it.
 */
export const DELETE_WORDING = {
  prompt: "Sure? Can't be undone",
  confirm: 'Delete',
  cancel: 'Keep',
} as const;
