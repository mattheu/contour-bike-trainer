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

/**
 * The line under the box on a workout the rider cannot change. Stated as a fact about the
 * workout rather than as a refusal — nothing has been attempted and nothing is being
 * denied — and it names the way through, because there is one.
 */
export const READ_ONLY_NOTE =
  'This workout came with the app. Duplicate it from the list to make a version you can change.';

/** What a copy is called: the original's name with this on the end, numbered only if that
 * is already taken. Plain words rather than "(1)", because it is read in a list. */
const COPY_SUFFIX = 'copy';

/**
 * A name no workout in the library has yet. Duplicating the same starter twice is an
 * ordinary thing to do — two ten-minute cuts of the same session — and two rows reading
 * the same name would be the rider's problem to sort out, not the app's to create.
 */
export function duplicateName(name: string, taken: readonly string[]): string {
  const base = `${name} ${COPY_SUFFIX}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${String(n)}`)) n += 1;
  return `${base} ${String(n)}`;
}

/** The top-level name key, which is the only line a duplicate rewrites. Anchored to
 * column zero so a step's own `name:` is never the one that matches. */
const NAME_LINE = /^name:.*$/m;

/**
 * Quoted only where a plain scalar would not survive the trip back through the parser: a
 * colon, a comment marker, a trailing space, or anything but a letter or a digit to start
 * with. JSON's escaping is a valid YAML double-quoted scalar, so there is no second one.
 */
function yamlName(name: string): string {
  const plain = /^[\p{L}\p{N}][^\n]*$/u.test(name) && !/:\s|\s#|[:\s]$/.test(name);
  return plain ? name : JSON.stringify(name);
}

/**
 * The YAML a duplicate opens on: the original's source exactly as written, with the name
 * line rewritten.
 *
 * Textual rather than parsed and re-serialised, and that is the whole point. The starters
 * are the documentation — their comments and their layout are half of what they teach —
 * and a round trip through a YAML writer would hand the rider a tidied tree with every
 * comment gone. The one line that has to change is changed, and nothing else is touched.
 *
 * A source with no top-level name key gets one, which is the only sane thing to do with a
 * workout whose name the parser would reject anyway.
 */
export function duplicateSource(source: string, name: string): string {
  const line = `name: ${yamlName(name)}`;
  // A function replacement: a name carrying a $ must not be read as a capture reference.
  return NAME_LINE.test(source) ? source.replace(NAME_LINE, () => line) : `${line}\n${source}`;
}

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
