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
  /** Ids written, because they were absent or the file in the build had changed. */
  written: string[];
  /** Ids already present and identical to the bundled file, left alone. */
  unchanged: string[];
  /** Starters that could not be parsed, one line each. */
  skipped: string[];
}

/** Every field a record takes from its bundled file. The source carries the comments and
 * the layout, so a reworded comment counts as a change — it is half of what a starter
 * teaches. updatedAt is excluded because the repository stamps it, and id because it is
 * what joined the two. */
function sameWorkout(stored: StoredWorkout, next: Omit<StoredWorkout, 'updatedAt'>): boolean {
  return (
    stored.name === next.name &&
    stored.description === next.description &&
    stored.source === next.source
  );
}

/**
 * Seeds the starters into the repository on every boot, using each one's declared id:
 * write what is absent, rewrite what differs from the file in the build.
 *
 * The same rule seedRoutes uses, and for the same reason: a built-in record is the
 * build's rather than the rider's. It cannot be edited and it cannot be deleted — see
 * builtInWorkoutIds and src/ui/services.ts — so nothing the rider owns can be sitting in
 * one of these records. That makes the bundled file their single source, and a starter
 * corrected in it should reach an install that has already been used rather than only a
 * fresh database.
 *
 * One consequence, accepted: an install where someone edited a starter under an earlier
 * build has that edit overwritten and the starter restored on the next boot. There is no
 * other way back from such an edit, and the rider's own copy — made with Duplicate — has
 * a minted id that no manifest entry claims, so it is untouched. So is anything imported.
 *
 * Idempotent: an identical starter is not rewritten, so booting twice does not churn
 * updatedAt, which a later sync layer would read as a genuine edit.
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
    const next = toStoredWorkout(entry);
    const existing = await repository.get(entry.id);
    if (existing !== undefined && sameWorkout(existing, next)) {
      result.unchanged.push(entry.id);
      continue;
    }
    // updatedAt is stamped by the repository on write.
    await repository.put({ ...next, updatedAt: existing?.updatedAt ?? '' });
    result.written.push(entry.id);
  }

  return result;
}
