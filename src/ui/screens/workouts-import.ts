import type { AlertLevel } from '../components/Alert';

/**
 * What importing a YAML bundle did, and the one line the rider reads about it. The same
 * arrangement as rides-import.ts and for the same reason: the counts have a right answer
 * and the sentence is the only report anyone ever gets.
 *
 * One count fewer than the rides version, because there is nothing to skip as already
 * present. The exported file carries no ids — it is a bundle of workouts, not an app
 * archive — so an import mints new ones and importing the same file twice gives you two
 * copies. Predictable and visible on the list, which is the trade for never silently
 * overwriting a workout the rider has spent an evening editing.
 */
export type WorkoutImportResult =
  | {
      status: 'done';
      /** Written as new workouts, with new ids. */
      imported: number;
      /** In the file but not a workout this build can read. */
      skipped: number;
      /** One line per skipped document, in the order they appeared. */
      reasons: string[];
    }
  | { status: 'failed'; reason: string };

function workouts(count: number): string {
  return `${count} ${count === 1 ? 'workout' : 'workouts'}`;
}

export function workoutImportAlert(result: WorkoutImportResult): {
  level: AlertLevel;
  message: string;
} {
  // DESIGN.md > Alerts: a fault is the thing that cannot proceed as it is, and a file
  // that will not open is exactly that.
  if (result.status === 'failed') {
    return { level: 'fault', message: `That file could not be read: ${result.reason}` };
  }

  const { imported, skipped } = result;
  const parts = [imported === 0 ? 'Imported no workouts.' : `Imported ${workouts(imported)}.`];
  if (skipped > 0) {
    const documents = skipped === 1 ? '1 document' : `${String(skipped)} documents`;
    parts.push(`Skipped ${documents} that could not be read.`);
  }

  // Anything skipped is something the rider expected to arrive and did not, so it stays
  // on screen until dismissed rather than clearing itself after five seconds.
  return { level: skipped > 0 ? 'warning' : 'info', message: parts.join(' ') };
}
