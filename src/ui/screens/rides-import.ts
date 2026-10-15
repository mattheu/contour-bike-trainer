import type { AlertLevel } from '../components/Alert';

/**
 * What an import did, and the one line the rider reads about it. The mapping is here
 * rather than in the screen because the counts have a right answer and the wording is
 * the only report the rider ever gets.
 */
export type ImportResult =
  | {
      status: 'done';
      restored: number;
      /** Already in the history, so left untouched. */
      skippedExisting: number;
      /** In the file but unreadable. */
      skippedInvalid: number;
      /** One line per unreadable record, from the archive reader. */
      reasons: string[];
    }
  | { status: 'failed'; reason: string };

function rides(count: number): string {
  return `${count} ${count === 1 ? 'ride' : 'rides'}`;
}

export function importAlert(result: ImportResult): { level: AlertLevel; message: string } {
  // DESIGN.md > Alerts: a fault is the thing that cannot proceed as it is, and a file
  // that will not open is exactly that.
  if (result.status === 'failed') {
    return { level: 'fault', message: `That file could not be read: ${result.reason}` };
  }

  const { restored, skippedExisting, skippedInvalid } = result;
  const parts = [restored === 0 ? 'Imported no rides.' : `Imported ${rides(restored)}.`];
  if (skippedExisting > 0) {
    parts.push(`Skipped ${rides(skippedExisting)} already in your history.`);
  }
  if (skippedInvalid > 0) {
    const records = skippedInvalid === 1 ? '1 record' : `${skippedInvalid} records`;
    parts.push(`Skipped ${records} that could not be read.`);
  }

  // Anything skipped is something the rider expected to arrive and did not, so it stays
  // on screen until dismissed rather than clearing itself after five seconds.
  const skipped = skippedExisting + skippedInvalid;
  return { level: skipped > 0 ? 'warning' : 'info', message: parts.join(' ') };
}
