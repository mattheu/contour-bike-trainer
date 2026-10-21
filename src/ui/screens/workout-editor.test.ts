import { describe, expect, it } from 'vitest';
import { expandWorkout } from '../../workout/expand';
import { bundledWorkouts } from '../../ride/workouts';
import { parseWorkout } from '../../workout/parse';
import {
  NEW_WORKOUT_SOURCE,
  READ_ONLY_NOTE,
  caretRow,
  duplicateName,
  duplicateSource,
  saveAlert,
  sourceLine,
  validateSource,
} from './workout-editor';

describe('NEW_WORKOUT_SOURCE', () => {
  it('parses as it stands, so Save works before a key is pressed', () => {
    const result = validateSource(NEW_WORKOUT_SOURCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.name).toBe('New workout');
  });

  it('is a rideable session rather than a stub', () => {
    const result = validateSource(NEW_WORKOUT_SOURCE);
    if (!result.ok) throw new Error(result.failure.detail);
    const expanded = expandWorkout(result.workout);
    expect(expanded.steps).toHaveLength(3);
    expect(expanded.totalDurationS).toBe(35 * 60);
  });

  it('is short enough to read in one screen', () => {
    expect(NEW_WORKOUT_SOURCE.split('\n').length).toBeLessThan(15);
  });
});

describe('validateSource', () => {
  it('carries the line, the column and the line itself for a semantic failure', () => {
    const source = `name: Broken
steps:
  - { duration: 10m, power: 60% }
  - { power: 95% }
`;
    const result = validateSource(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.detail).toBe('step 2 has no duration');
    expect(result.failure.line).toBe(4);
    expect(result.failure.text).toBe('  - { power: 95% }');
  });

  it('carries a position for malformed YAML too', () => {
    const result = validateSource('name: Broken\nsteps:\n  - { duration: 10m\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.line).toBeGreaterThanOrEqual(1);
    expect(result.failure.detail).not.toContain('(line');
  });

  it('says so rather than throwing on an empty box', () => {
    const result = validateSource('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.detail).toBe('The workout is empty');
    expect(result.failure.line).toBe(1);
  });

  it('names the offending line, not the top of the file', () => {
    const source = [
      'name: Long',
      'steps:',
      ...Array.from({ length: 20 }, () => '  - { duration: 1m, power: 60% }'),
      '  - { duration: 1m, power: nonsense }',
    ].join('\n');
    const result = validateSource(source);
    if (result.ok) throw new Error('expected a failure');
    expect(result.failure.line).toBe(23);
    expect(result.failure.text).toContain('nonsense');
  });
});

describe('sourceLine', () => {
  it('is 1-based', () => {
    expect(sourceLine('a\nb\nc', 1)).toBe('a');
    expect(sourceLine('a\nb\nc', 3)).toBe('c');
  });

  it('is null past the end, and at zero', () => {
    expect(sourceLine('a\nb', 3)).toBeNull();
    expect(sourceLine('a\nb', 0)).toBeNull();
  });
});

describe('caretRow', () => {
  it('points at the column', () => {
    expect(caretRow('  - { power: 95% }', 7)).toBe('      ^');
  });

  it('keeps a tab a tab, so the caret lands under the character', () => {
    expect(caretRow('\t\tpower', 3)).toBe('\t\t^');
  });

  it('clamps past the end of the line, where something is missing', () => {
    expect(caretRow('abc', 99)).toBe('   ^');
    expect(caretRow('abc', 0)).toBe('^');
  });
});

describe('saveAlert', () => {
  it('reports a failure as a fault, because the work is only in the textarea', () => {
    const alert = saveAlert({ status: 'failed', reason: 'the database is closed' }, 'Openers');
    expect(alert.level).toBe('fault');
    expect(alert.message).toContain('the database is closed');
  });

  it('reports a save as passing news', () => {
    expect(saveAlert({ status: 'saved' }, 'Openers')).toEqual({
      level: 'info',
      message: 'Openers saved.',
    });
  });
});

describe('READ_ONLY_NOTE', () => {
  it('states what the workout is rather than refusing the rider', () => {
    expect(READ_ONLY_NOTE).toContain('came with the app');
    expect(READ_ONLY_NOTE).not.toMatch(/cannot|can't|not allowed|read-only/i);
  });

  it('names the way through, because there is one', () => {
    expect(READ_ONLY_NOTE).toContain('Duplicate');
  });
});

describe('duplicateName', () => {
  it('is the original with "copy" on the end', () => {
    expect(duplicateName('Sweet spot 3x9', [])).toBe('Sweet spot 3x9 copy');
  });

  it('numbers the second copy rather than repeating a name in the list', () => {
    const taken = ['Sweet spot 3x9', 'Sweet spot 3x9 copy'];
    expect(duplicateName('Sweet spot 3x9', taken)).toBe('Sweet spot 3x9 copy 2');
    expect(duplicateName('Sweet spot 3x9', [...taken, 'Sweet spot 3x9 copy 2'])).toBe(
      'Sweet spot 3x9 copy 3',
    );
  });

  it('fills a gap rather than counting past it', () => {
    expect(duplicateName('A', ['A copy', 'A copy 3'])).toBe('A copy 2');
  });
});

describe('duplicateSource', () => {
  const SOURCE = `# Three nine-minute blocks at 90 %.
name: Sweet spot 3x9
description: Sustained, not hard.

steps:
  - { duration: 9m, power: 90%, name: Block }  # the sweet spot itself
`;

  it('renames the workout and changes nothing else', () => {
    const copy = duplicateSource(SOURCE, 'Sweet spot 3x9 copy');

    expect(parseWorkout(copy).name).toBe('Sweet spot 3x9 copy');
    expect(parseWorkout(copy).description).toBe('Sustained, not hard.');
  });

  it('keeps the comments, which are half of what a starter teaches', () => {
    const copy = duplicateSource(SOURCE, 'Anything');

    expect(copy).toContain('# Three nine-minute blocks at 90 %.');
    expect(copy).toContain('# the sweet spot itself');
    // Line for line the original but one: nothing has been reflowed or re-serialised.
    expect(copy.split('\n')).toHaveLength(SOURCE.split('\n').length);
  });

  it("leaves a step's own name alone", () => {
    expect(duplicateSource(SOURCE, 'Renamed')).toContain('name: Block }');
  });

  it('quotes a name a plain scalar would not survive', () => {
    const copy = duplicateSource(SOURCE, 'Threshold: the hard bit copy');
    expect(parseWorkout(copy).name).toBe('Threshold: the hard bit copy');
  });

  it('copies every starter in the build into something that still parses', () => {
    // The claim that matters: every starter is a usable starting point, not just the
    // one written out above.
    for (const entry of bundledWorkouts().workouts) {
      const name = duplicateName(entry.workout.name, [entry.workout.name]);
      const copy = duplicateSource(entry.source, name);
      expect(parseWorkout(copy).name).toBe(name);
      expect(copy.replace(name, entry.workout.name)).toBe(entry.source);
    }
  });

  it('gives a source with no name key one', () => {
    const copy = duplicateSource('steps:\n  - { duration: 5m, power: 60% }\n', 'Named now');
    expect(parseWorkout(copy).name).toBe('Named now');
  });
});
