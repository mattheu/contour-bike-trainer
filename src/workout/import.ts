/**
 * Which documents in a workout file the rider does not already have.
 *
 * Pure: no ids, no clock, no repository. services.ts splits the file, mints the ids and
 * writes the records; this decides what is new.
 */

/**
 * What makes two workouts the same workout: the same source text.
 *
 * The bytes are the identity here, which is the opposite of the rule routes use, and the
 * difference is the file format rather than a change of mind. Export concatenates the
 * stored sources with `---` and import slices the original text back out by the parser's
 * byte offsets, which src/export/workout-bundle.ts has a test asserting — so a workout
 * that goes out through Download all and comes back in is byte for byte the record it
 * left as. A GPX round trip is not, which is why routes fingerprint their geometry.
 *
 * Trailing whitespace is trimmed and nothing else. The bundle adds a newline to a source
 * that did not end in one, so the round trip can gain exactly that.
 *
 * DO NOT "improve" this by comparing the expanded plan instead. Two workouts whose steps
 * match but whose comments or layout differ are not the same workout: ADR-0014 exists
 * because the source text is the record, and skipping on plan-equality would silently
 * discard the annotated version the rider spent an evening writing.
 */
export function workoutFingerprint(source: string): string {
  return source.replace(/\s+$/, '');
}

export interface WorkoutImportPlan<T> {
  /** In file order, with nothing the rider already has. */
  documents: T[];
  /** Dropped because an identical source is already stored, or appeared earlier in this
   * same file. */
  duplicates: number;
}

/**
 * Drops the documents whose source is already in the library, and counts them.
 *
 * Skip, never overwrite: a workout the rider has edited is theirs, and a file carries no
 * ids to match on, so the only safe thing to do with an identical copy is nothing.
 *
 * `existing` is every stored source, the built-in starters included — importing a file
 * that still holds a starter is the ordinary case. A starter the rider has since edited
 * no longer matches, so it imports: by this rule it is a different workout now, which is
 * the answer that keeps both versions rather than quietly losing one.
 *
 * Documents in one file are matched against each other too, so a file holding the same
 * workout twice lands once.
 */
export function planWorkoutImport<T extends { source: string }>(
  documents: readonly T[],
  existing: readonly string[] = [],
): WorkoutImportPlan<T> {
  const seen = new Set(existing.map(workoutFingerprint));
  const kept: T[] = [];
  let duplicates = 0;

  for (const document of documents) {
    const fingerprint = workoutFingerprint(document.source);
    if (seen.has(fingerprint)) {
      duplicates += 1;
      continue;
    }
    seen.add(fingerprint);
    kept.push(document);
  }

  return { documents: kept, duplicates };
}
