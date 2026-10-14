import { describe, expect, it } from 'vitest';

import { parseWorkout } from '../workout/parse';
import { bundleWorkoutSources, splitWorkoutDocuments } from './workout-bundle';

/** A workout carrying the three things a serialiser would quietly destroy: a comment
 * above the file, a trailing comment, and flow style on a key that has a block form. */
const COMMENTED = `# the one this rider actually does on a Tuesday
name: Sweet Spot 3x12
description: three blocks at 90 %
ftp: 250
warmup: { duration: 10m, power: 55% }  # short on purpose
steps:
  - repeat: 3
    steps:
      - duration: 12m
        power: 90%
      - duration: 4m
        power: 50%
cooldown:
  duration: 5m
  power: 45%
`;

const PLAIN = `name: Easy Hour
steps:
  - duration: 1h
    power: 60%
`;

describe('bundleWorkoutSources', () => {
  it('writes each source byte for byte, joined by a separator', () => {
    expect(bundleWorkoutSources([PLAIN, PLAIN])).toBe(`${PLAIN}---\n${PLAIN}`);
  });

  it('starts the separator on its own line when a source does not end in one', () => {
    // Without this `---` is a value on the last line rather than a document separator.
    const bundle = bundleWorkoutSources(['name: A\nsteps: []', 'name: B\nsteps: []']);
    expect(bundle).toBe('name: A\nsteps: []\n---\nname: B\nsteps: []\n');
  });

  it('writes no separator for a single workout, and nothing at all for none', () => {
    expect(bundleWorkoutSources([PLAIN])).toBe(PLAIN);
    expect(bundleWorkoutSources([])).toBe('');
  });
});

describe('splitWorkoutDocuments', () => {
  it('round-trips a bundle back to the exact sources that went into it', () => {
    // ADR-0014: the stored workout is its source text. A round trip that returned
    // equivalent YAML rather than identical YAML would be the bug the ADR exists to stop.
    const sources = [COMMENTED, PLAIN];
    const documents = splitWorkoutDocuments(bundleWorkoutSources(sources));

    expect(documents.map((document) => document.source)).toEqual(sources);
  });

  it('keeps the comment at the top of the file with the first document', () => {
    // yaml reports a document as starting after the comments above it, so the slice is
    // taken from offset 0 instead. Without that the first workout loses its header.
    const [first] = splitWorkoutDocuments(bundleWorkoutSources([COMMENTED, PLAIN]));

    expect(first?.source.startsWith('# the one this rider')).toBe(true);
  });

  it('preserves comments and layout well enough to reparse to the same workout', () => {
    const [document] = splitWorkoutDocuments(bundleWorkoutSources([COMMENTED]));

    expect(document?.source).toContain('# short on purpose');
    expect(document?.source).toContain('warmup: { duration: 10m, power: 55% }');
    expect(parseWorkout(document?.source ?? '').name).toBe('Sweet Spot 3x12');
  });

  it('reads a single workout that was never part of a bundle', () => {
    expect(splitWorkoutDocuments(COMMENTED)).toEqual([{ index: 1, source: COMMENTED }]);
  });

  it('reads a file whose first document opens with a separator', () => {
    const documents = splitWorkoutDocuments(`---\n${PLAIN}---\n${COMMENTED}`);

    expect(documents.map((document) => document.source)).toEqual([PLAIN, COMMENTED]);
  });

  it('keeps slicing past a document that will not parse, and numbers them as written', () => {
    // The claim the import rests on: one broken document costs the others nothing, and
    // the ones either side come out whole rather than merged into the wreckage.
    const broken = 'name: [unclosed\nsteps:\n';
    const documents = splitWorkoutDocuments(bundleWorkoutSources([PLAIN, broken, COMMENTED]));

    expect(documents.map((document) => document.index)).toEqual([1, 2, 3]);
    expect(documents[0]?.source).toBe(PLAIN);
    expect(documents[1]?.source).toBe(broken);
    expect(documents[2]?.source).toBe(COMMENTED);
  });

  it('drops a stray separator rather than reporting it as unreadable', () => {
    // A file saved with a trailing `---` is a formatting artefact, not a workout the
    // rider expected to arrive, so it must not land in the skipped count.
    const documents = splitWorkoutDocuments(`${PLAIN}---\n`);

    expect(documents.map((document) => document.source)).toEqual([PLAIN]);
  });

  it('finds nothing in an empty file', () => {
    expect(splitWorkoutDocuments('')).toEqual([]);
    expect(splitWorkoutDocuments('\n\n')).toEqual([]);
  });

  it('keeps a comment between two documents with the one above it', () => {
    const text = `${PLAIN}# a note about the one above\n---\n${PLAIN}`;
    const documents = splitWorkoutDocuments(text);

    expect(documents[0]?.source).toBe(`${PLAIN}# a note about the one above\n`);
    expect(documents[1]?.source).toBe(PLAIN);
  });

  it('leaves a document written on the separator line intact', () => {
    // `--- name: A` is a document, not a separator with a workout after it.
    const documents = splitWorkoutDocuments('--- name: Inline\n');

    expect(documents[0]?.source).toBe('--- name: Inline\n');
  });

  it('accounts for every byte of the file exactly once', () => {
    // The property underneath the round trip: the slices partition the text, so nothing
    // can be silently dropped between two documents or counted into both.
    const text = bundleWorkoutSources([COMMENTED, PLAIN, COMMENTED]);
    const documents = splitWorkoutDocuments(text);

    expect(documents.map((document) => document.source).join('---\n')).toBe(text);
  });
});
