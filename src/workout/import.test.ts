import { describe, expect, it } from 'vitest';

import { bundleWorkoutSources, splitWorkoutDocuments } from '../export/workout-bundle';
import { planWorkoutImport, workoutFingerprint } from './import';

const sweetSpot = `name: Sweet spot
steps:
  - 10m @ 60%
  - 20m @ 90%
`;

const threshold = `name: Threshold
steps:
  - 10m @ 60%
  - 20m @ 95%
`;

/** What the file holds, in the shape splitWorkoutDocuments returns. */
function documents(...sources: string[]) {
  return sources.map((source, position) => ({ index: position + 1, source }));
}

describe('workoutFingerprint', () => {
  it('ignores the trailing newline the bundle adds and nothing else', () => {
    expect(workoutFingerprint(sweetSpot)).toBe(workoutFingerprint(`${sweetSpot}\n\n`));
    expect(workoutFingerprint(sweetSpot)).not.toBe(workoutFingerprint(`\n${sweetSpot}`));
  });

  it('keeps two workouts apart when only their comments differ', () => {
    // Deliberate: the source is the record (ADR-0014), so an annotated copy is a workout
    // the rider wrote and not a duplicate to be thrown away.
    const annotated = `# Tuesday, after the warm-up\n${sweetSpot}`;

    expect(workoutFingerprint(annotated)).not.toBe(workoutFingerprint(sweetSpot));
  });
});

describe('planWorkoutImport', () => {
  it('keeps everything when the library is empty', () => {
    const plan = planWorkoutImport(documents(sweetSpot, threshold));

    expect(plan.documents.map((document) => document.source)).toEqual([sweetSpot, threshold]);
    expect(plan.duplicates).toBe(0);
  });

  it('skips a document already in the library and counts it', () => {
    const plan = planWorkoutImport(documents(sweetSpot, threshold), [sweetSpot]);

    expect(plan.documents.map((document) => document.index)).toEqual([2]);
    expect(plan.duplicates).toBe(1);
  });

  it('reads a Download all of the whole library back as nothing new', () => {
    // The round trip that matters: the bundle is the stored text with separators, and
    // the split hands back the same bytes, so a re-import adds nothing.
    const bundle = bundleWorkoutSources([sweetSpot, threshold]);

    const plan = planWorkoutImport(splitWorkoutDocuments(bundle), [sweetSpot, threshold]);

    expect(plan.documents).toEqual([]);
    expect(plan.duplicates).toBe(2);
  });

  it('imports a repeated document in one file once', () => {
    const plan = planWorkoutImport(documents(sweetSpot, sweetSpot));

    expect(plan.documents.map((document) => document.index)).toEqual([1]);
    expect(plan.duplicates).toBe(1);
  });

  it('imports a starter the rider has since edited, because it is a different workout', () => {
    const edited = sweetSpot.replace('20m @ 90%', '25m @ 90%');

    const plan = planWorkoutImport(documents(sweetSpot), [edited]);

    expect(plan.documents).toHaveLength(1);
    expect(plan.duplicates).toBe(0);
  });
});
