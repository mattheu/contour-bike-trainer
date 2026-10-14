import manifest from '../../workouts/manifest.json';
import { parseWorkout } from '../workout/parse';
import type { Workout as ParsedWorkout } from '../workout/types';
import type { Repository, Workout as StoredWorkout } from '../storage/types';

/**
 * The starter workouts, bundled by Vite and seeded on first run — the same arrangement
 * src/ride/routes.ts uses for the GPX files, and for the same reason: a fresh install
 * should not be an empty list and a blank textarea for a format nobody has seen.
 *
 * The manifest carries only an id and a file. A workout's name and description live in
 * its own YAML, so parsing is how they are read, which is also what proves the starter
 * is rideable before it reaches the database.
 */
const sourceByPath = import.meta.glob('../../workouts/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sourceByFile = new Map<string, string>(
  Object.entries(sourceByPath).map(([path, source]) => [
    path.slice(path.lastIndexOf('/') + 1),
    source,
  ]),
);

export interface ManifestWorkout {
  /** Declared, never minted. Rides reference it, so it must never change. */
  id: string;
  file: string;
}

export interface BundledWorkout extends ManifestWorkout {
  source: string;
  /** Parsed on the way in: the name and the description are only in here. */
  workout: ParsedWorkout;
}

export interface BundledWorkouts {
  workouts: BundledWorkout[];
  /** One line per starter that could not be read, in manifest order. */
  skipped: string[];
}

/**
 * The manifest joined to the files and parsed.
 *
 * A starter that fails to parse is skipped and named rather than thrown, the way
 * src/export/archive.ts handles a bad record in an import: one broken example must not
 * cost the rider the other three, and a boot that dies on a YAML typo is worse still.
 */
export function bundledWorkouts(
  entries: ManifestWorkout[] = manifest.workouts,
  /** Injected only by the test that proves a broken starter is survivable, which would
   * otherwise need a deliberately broken file shipped in the build. */
  sources: ReadonlyMap<string, string> = sourceByFile,
): BundledWorkouts {
  const workouts: BundledWorkout[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const source = sources.get(entry.file);
    if (source === undefined) {
      skipped.push(`"${entry.id}" was skipped because ${entry.file} is not bundled.`);
      continue;
    }
    try {
      workouts.push({ ...entry, source, workout: parseWorkout(source) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skipped.push(`"${entry.id}" was skipped because ${reason}`);
    }
  }

  return { workouts, skipped };
}

/**
 * The ids this build supplies, which is the whole definition of a built-in workout:
 * derived from workouts/manifest.json on every read rather than stored as a flag on the
 * record, so there is no second copy of the truth to fall out of step with it.
 *
 * Read from the manifest rather than from bundledWorkouts, so a starter whose YAML will
 * not parse is still built in. It is in the build either way, and a parse error is not a
 * reason to offer a Delete control that is otherwise never there.
 *
 * One property of that, deliberate: drop an entry from the manifest and its stored record
 * stops being built in, which is how a stale starter the build no longer supplies gets a
 * way out of an install. Nothing else gives the rider a way to remove one.
 */
export function builtInWorkoutIds(
  entries: ManifestWorkout[] = manifest.workouts,
): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.id));
}

function toStoredWorkout(entry: BundledWorkout): Omit<StoredWorkout, 'updatedAt'> {
  return {
    id: entry.id,
    name: entry.workout.name,
    ...(entry.workout.description === undefined ? {} : { description: entry.workout.description }),
    source: entry.source,
  };
}

export interface SeedResult {
  /** Ids written, because the repository had never seen them. */
  written: string[];
  /** Ids already present, left exactly as the rider has them. */
  unchanged: string[];
  /** Starters that could not be parsed, one line each. */
  skipped: string[];
}

/**
 * Seeds the starters into the repository on every boot, using each one's declared id:
 * write what is absent, and never touch what is already there.
 *
 * Deliberately not the rule seedRoutes uses, and the difference is that a starter is
 * editable. Rewriting a record because its file in the build differs would silently undo
 * the rider's edit on the next launch, which is the one thing keeping the YAML they wrote
 * rather than a parsed tree exists to protect. The cost, accepted: a correction to a
 * starter's file never reaches an install that has already booted.
 *
 * Absent is safe to write because a built-in workout cannot be deleted — see
 * builtInWorkoutIds and src/ui/services.ts — so absent can only mean never seen.
 *
 * `skipped` is filled either way. A starter that will not parse is a bug in a file we
 * shipped, and an install that has already been seeded should still say so.
 */
export async function seedWorkouts(
  repository: Repository<StoredWorkout>,
  bundled: BundledWorkouts = bundledWorkouts(),
): Promise<SeedResult> {
  const result: SeedResult = { written: [], unchanged: [], skipped: bundled.skipped };

  for (const entry of bundled.workouts) {
    const existing = await repository.get(entry.id);
    if (existing !== undefined) {
      result.unchanged.push(entry.id);
      continue;
    }
    // updatedAt is stamped by the repository on write.
    await repository.put({ ...toStoredWorkout(entry), updatedAt: '' });
    result.written.push(entry.id);
  }

  return result;
}
