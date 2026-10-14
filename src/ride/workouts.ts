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
 * Seeds the starters into the repository, using each one's declared id. The same two
 * rules as seedRoutes, which carries the full reasoning.
 *
 * Present means left alone, whatever it now says: rewriting an existing record would
 * silently undo the rider's edit the next time the app started. Absent is written only
 * while `seeded` is false, because a starter the rider deleted is absent too, and without
 * the marker the next reload would bring it back.
 *
 * `skipped` is filled either way. A starter that will not parse is a bug in a file we
 * shipped, and an install that has already been seeded should still say so.
 */
export async function seedWorkouts(
  repository: Repository<StoredWorkout>,
  /** Whether this install has already had a seeding pass complete. */
  seeded: boolean,
  bundled: BundledWorkouts = bundledWorkouts(),
): Promise<SeedResult> {
  const result: SeedResult = { written: [], unchanged: [], skipped: bundled.skipped };
  if (seeded) return result;

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
