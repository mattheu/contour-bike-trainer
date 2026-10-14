import { describe, expect, it } from 'vitest';
import { expandWorkout } from '../../workout/expand';
import {
  NEW_WORKOUT_SOURCE,
  caretRow,
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
