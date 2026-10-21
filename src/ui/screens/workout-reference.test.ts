import { describe, expect, it } from 'vitest';
import { parseWorkout } from '../../workout/parse';
import { WORKOUT_REFERENCE, type Snippet } from './workout-reference';

/**
 * The reference against the parser it describes.
 *
 * Every fragment the sidebar shows is fed to parseWorkout, so a change to the grammar
 * that leaves the sidebar behind is a red suite rather than a rider being told something
 * that is no longer true. Fragments are only YAML in context, so they are padded here
 * rather than in the data: what the rider reads stays the short thing they need.
 */

/** The smallest workout there is, as the surround for a fragment. */
const NAME_LINE = 'name: Reference';
const STEPS_BLOCK = 'steps:\n  - { duration: 5m, power: 60% }';

/** A step with the given keys in it, as the only step of a workout. */
function workoutWithStep(keys: readonly string[]): string {
  return `${NAME_LINE}\nsteps:\n  - { ${keys.join(', ')} }`;
}

function indent(code: string, by: string): string {
  return code
    .split('\n')
    .map((line) => (line === '' ? line : `${by}${line}`))
    .join('\n');
}

/** A snippet as a whole workout, padded with whatever its kind leaves out. */
function asWorkout(snippet: Snippet): string {
  switch (snippet.kind) {
    case 'workout':
      return snippet.code;
    case 'workoutKey':
      return [
        snippet.key === 'name' ? snippet.code : NAME_LINE,
        snippet.key === 'steps' ? snippet.code : STEPS_BLOCK,
        // Repeating the key the snippet supplies would be a duplicate-key error rather
        // than a test of the snippet, so it is only added when the snippet is neither.
        snippet.key === 'name' || snippet.key === 'steps' ? '' : snippet.code,
      ]
        .filter((part) => part !== '')
        .join('\n');
    case 'stepKey': {
      // A ramp replaces power rather than joining it, and either way the snippet's own
      // key is not written twice.
      const supplied = snippet.key === 'ramp' ? ['ramp', 'power'] : [snippet.key];
      const rest = ['duration: 5m', 'power: 60%'].filter(
        (part) => !supplied.some((key) => part.startsWith(`${key}:`)),
      );
      return workoutWithStep([...rest, snippet.code]);
    }
    case 'stepsItem':
      return `${NAME_LINE}\nsteps:\n${indent(snippet.code, '  ')}`;
  }
}

describe('WORKOUT_REFERENCE', () => {
  for (const section of WORKOUT_REFERENCE) {
    describe(section.heading, () => {
      it('shows something', () => {
        expect(section.entries.length).toBeGreaterThan(0);
      });

      for (const { snippet } of section.entries) {
        it(`parses ${snippet.code.split('\n')[0]}`, () => {
          const source = asWorkout(snippet);
          expect(() => parseWorkout(source)).not.toThrow();
        });
      }
    });
  }

  it('ends on a whole file rather than a fragment', () => {
    const last = WORKOUT_REFERENCE[WORKOUT_REFERENCE.length - 1]?.entries[0]?.snippet;
    expect(last?.kind).toBe('workout');
    const workout = parseWorkout(last?.code ?? '');
    expect(workout.name).toBe('2x20 threshold');
    expect(workout.warmup).toBeDefined();
    expect(workout.cooldown).toBeDefined();
  });
});

/**
 * The claims the prose makes that are not snippets. They are only worth printing because
 * the parser enforces them, so they are checked the same way the snippets are.
 */
describe('what the reference says about the grammar', () => {
  it('is right that an unknown key is an error', () => {
    expect(() => parseWorkout(`${NAME_LINE}\n${STEPS_BLOCK}\nnotes: a comment`)).toThrow();
    expect(() => parseWorkout(workoutWithStep(['duration: 5m', 'powre: 60%']))).toThrow();
  });

  it('is right that a ramp end may not be free', () => {
    expect(() => parseWorkout(workoutWithStep(['duration: 5m', 'ramp: [free, 75%]']))).toThrow();
  });

  it('is right that a ramp may mix percentages and watts', () => {
    expect(() =>
      parseWorkout(workoutWithStep(['duration: 5m', 'ramp: [50%, 180W]'])),
    ).not.toThrow();
  });

  it('is right that a step is capped at four hours', () => {
    expect(() => parseWorkout(workoutWithStep(['duration: 4h', 'power: 60%']))).not.toThrow();
    expect(() => parseWorkout(workoutWithStep(['duration: 4h1s', 'power: 60%']))).toThrow();
  });
});
