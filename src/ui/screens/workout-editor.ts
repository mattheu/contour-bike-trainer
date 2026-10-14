import type { AlertLevel } from '../components/Alert';
import { WorkoutParseError, parseWorkout } from '../../workout/parse';
import type { Workout } from '../../workout/types';
import { parseDetail } from './workouts-list';

/**
 * What the editor knows: the template a new workout opens on, and what a save attempt
 * decided about the text in the box.
 *
 * The position is as much of the answer as the message. A rider writing YAML in a
 * textarea is looking at thirty lines of it, and "step 3 has no duration" without a line
 * number is a hunt; parse.ts carries both, so this keeps both and hands the editor the
 * offending line's own text to show them against.
 */

/**
 * A new workout opens on this rather than an empty box. Short enough to read in one go
 * and valid as it stands, so Save works before a single key is pressed — and it shows the
 * three things the format needs (a name, a duration, a power) without being a tutorial.
 */
export const NEW_WORKOUT_SOURCE = `name: New workout
description: What this session is for.

warmup: { duration: 10m, ramp: [50%, 70%] }

steps:
  - { duration: 20m, power: 75%, name: Steady }

cooldown: { duration: 5m, ramp: [60%, 40%] }
`;

export interface ParseFailure {
  /** The message without the position parse.ts appends, which is shown separately. */
  detail: string;
  /** Both 1-based, as the rider counts them. */
  line: number;
  column: number;
  /** The offending line's own text, or null if the position is past the end. */
  text: string | null;
}

export type Validation = { ok: true; workout: Workout } | { ok: false; failure: ParseFailure };

/** The line the error names, as written. Null rather than an empty string for "no such line". */
export function sourceLine(source: string, line: number): string | null {
  const lines = source.split('\n');
  return line >= 1 && line <= lines.length ? (lines[line - 1] as string) : null;
}

/**
 * Validated on save, not on every keystroke: an error that appears halfway through typing
 * a duration is noise, and the rider has asked a question by pressing Save.
 */
export function validateSource(source: string): Validation {
  try {
    return { ok: true, workout: parseWorkout(source) };
  } catch (error) {
    const parseError = error instanceof WorkoutParseError ? error : null;
    const line = parseError?.line ?? 1;
    return {
      ok: false,
      failure: {
        detail: parseDetail(error instanceof Error ? error.message : String(error)),
        line,
        column: parseError?.column ?? 1,
        text: sourceLine(source, line),
      },
    };
  }
}

/**
 * The caret under the offending column, built against the source line so a tab counts as
 * a tab. Clamped to the end of the line: a column past it would otherwise point at
 * nothing, and "the end of this line" is the honest place for "something is missing here".
 */
export function caretRow(text: string, column: number): string {
  const at = Math.min(Math.max(column, 1), text.length + 1);
  return text
    .slice(0, at - 1)
    .replace(/[^\t]/g, ' ')
    .concat('^');
}

export type SaveResult = { status: 'saved' } | { status: 'failed'; reason: string };

/**
 * A save that worked is passing news: the rider is looking at the text that was saved. A
 * save that failed left their work in a textarea and nowhere else, so it has to be read.
 */
export function saveAlert(
  result: SaveResult,
  name: string,
): { level: AlertLevel; message: string } {
  return result.status === 'failed'
    ? { level: 'fault', message: `That workout could not be saved: ${result.reason}` }
    : { level: 'info', message: `${name} saved.` };
}
