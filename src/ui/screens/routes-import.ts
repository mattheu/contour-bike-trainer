import type { AlertLevel } from '../components/Alert';

/**
 * What importing a GPX did, and the one line the rider reads about it. The same
 * arrangement as workouts-import.ts, and the same reason: the counts have a right answer
 * and the sentence is the only report anyone ever gets.
 *
 * Counted in routes rather than files because one file can hold several — the export
 * writes every route as its own track in one document, and the import reads it back the
 * same way. Three counts, as rides-import.ts has: a GPX carries no ids, but it carries
 * geometry, and a track the rider already has is skipped rather than stored a second
 * time. See planRouteImport for what counts as the same route.
 */
export type RouteImportResult =
  | {
      status: 'done';
      /** Written as new routes, with new ids. */
      imported: number;
      /** Already in the list, so left untouched. */
      skippedExisting: number;
      /** Tracks in the file that this build could not read. */
      skippedInvalid: number;
      /** One line per unreadable track, in the order they appeared. */
      reasons: string[];
    }
  | { status: 'failed'; reason: string };

function routes(count: number): string {
  return `${count} ${count === 1 ? 'route' : 'routes'}`;
}

export function routeImportAlert(result: RouteImportResult): {
  level: AlertLevel;
  message: string;
} {
  // DESIGN.md > Alerts: a fault is the thing that cannot proceed as it is, and a file
  // that will not open is exactly that.
  if (result.status === 'failed') {
    return { level: 'fault', message: `That file could not be read: ${result.reason}` };
  }

  const { imported, skippedExisting, skippedInvalid } = result;
  const parts = [imported === 0 ? 'Imported no routes.' : `Imported ${routes(imported)}.`];
  if (skippedExisting > 0) {
    parts.push(`Skipped ${routes(skippedExisting)} already in the list.`);
  }
  if (skippedInvalid > 0) {
    const tracks = skippedInvalid === 1 ? '1 track' : `${String(skippedInvalid)} tracks`;
    parts.push(`Skipped ${tracks} that could not be read.`);
  }

  // Anything skipped is something the rider expected to arrive and did not, so it stays
  // on screen until dismissed rather than clearing itself after five seconds. A file that
  // was entirely duplicates reads as a sentence about what is already there rather than
  // as nothing having happened, which is the whole point of counting them.
  const skipped = skippedExisting + skippedInvalid;
  return { level: skipped > 0 ? 'warning' : 'info', message: parts.join(' ') };
}
