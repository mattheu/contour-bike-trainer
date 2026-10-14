import type { AlertLevel } from '../components/Alert';

/**
 * What importing a YAML bundle did, and the one line the rider reads about it. The same
 * arrangement as rides-import.ts and for the same reason: the counts have a right answer
 * and the sentence is the only report anyone ever gets.
 *
 * Three counts, as rides-import.ts has. The file carries no ids — it is a bundle of
 * workouts, not an app archive — but it carries the source text, and ADR-0014 makes that
 * the record, so a document identical to one already in the library is skipped rather
 * than stored again. Skipped, never overwritten: see planWorkoutImport.
 */
export type WorkoutImportResult =
  | {
      status: 'done';
      /** Written as new workouts, with new ids. */
      imported: number;
      /** Already in the library, so left untouched. */
      skippedExisting: number;
      /** In the file but not a workout this build can read. */
      skippedInvalid: number;
      /** One line per unreadable document, in the order they appeared. */
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

  const { imported, skippedExisting, skippedInvalid } = result;
  const parts = [imported === 0 ? 'Imported no workouts.' : `Imported ${workouts(imported)}.`];
  if (skippedExisting > 0) {
    parts.push(`Skipped ${workouts(skippedExisting)} already in your library.`);
  }
  if (skippedInvalid > 0) {
    const documents = skippedInvalid === 1 ? '1 document' : `${String(skippedInvalid)} documents`;
    parts.push(`Skipped ${documents} that could not be read.`);
  }

  // Anything skipped is something the rider expected to arrive and did not, so it stays
  // on screen until dismissed rather than clearing itself after five seconds. A file that
  // was entirely duplicates reads as a sentence about what is already there rather than
  // as nothing having happened, which is the whole point of counting them.
  const skipped = skippedExisting + skippedInvalid;
  return { level: skipped > 0 ? 'warning' : 'info', message: parts.join(' ') };
}
