import type { AlertLevel } from '../components/Alert';

/**
 * What importing a GPX did, and the one line the rider reads about it. The same
 * arrangement as workouts-import.ts, and the same reason: the counts have a right answer
 * and the sentence is the only report anyone ever gets.
 *
 * Counted in routes rather than files because one file can hold several — the export
 * writes every route as its own track in one document, and the import reads it back the
 * same way. No count of what was already there: a GPX carries no ids, so an import mints
 * new ones and importing the same file twice gives two copies, visibly, on the list.
 */
export type RouteImportResult =
  | {
      status: 'done';
      /** Written as new routes, with new ids. */
      imported: number;
      /** Tracks in the file that this build could not read. */
      skipped: number;
      /** One line per skipped track, in the order they appeared. */
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

  const { imported, skipped } = result;
  const parts = [imported === 0 ? 'Imported no routes.' : `Imported ${routes(imported)}.`];
  if (skipped > 0) {
    const tracks = skipped === 1 ? '1 track' : `${String(skipped)} tracks`;
    parts.push(`Skipped ${tracks} that could not be read.`);
  }

  // Anything skipped is something the rider expected to arrive and did not, so it stays
  // on screen until dismissed rather than clearing itself after five seconds.
  return { level: skipped > 0 ? 'warning' : 'info', message: parts.join(' ') };
}
