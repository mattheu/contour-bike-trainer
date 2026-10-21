import { describe, expect, it } from 'vitest';
import { COOLDOWN_NAME, WARMUP_NAME, expandWorkout } from './expand';
import { parseWorkout } from './parse';

function expand(source: string) {
  return expandWorkout(parseWorkout(source));
}

describe('expandWorkout', () => {
  it('flattens a repeat into the steps actually ridden', () => {
    const { steps, totalDurationS } = expand(
      `name: t\nsteps:\n  - repeat: 2\n    steps:\n      - { duration: 20m, power: 95% }\n      - { duration: 5m, power: 55% }\n`,
    );
    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.durationS)).toEqual([1200, 300, 1200, 300]);
    expect(totalDurationS).toBe(3000);
  });

  it('puts the warmup first and the cooldown last, whatever order the file is in', () => {
    const { steps } = expand(
      `name: t\ncooldown: { duration: 10m, power: 40% }\nsteps:\n  - { duration: 5m, power: 60% }\nwarmup: { duration: 10m, power: 50% }\n`,
    );
    expect(steps.map((step) => step.name)).toEqual([WARMUP_NAME, undefined, COOLDOWN_NAME]);
  });

  it('leaves an authored name on the warmup alone', () => {
    const { steps } = expand(
      `name: t\nwarmup: { duration: 10m, power: 50%, name: Spin up }\nsteps:\n  - { duration: 5m, power: 60% }\n`,
    );
    expect(steps[0]?.name).toBe('Spin up');
  });

  it('carries a name into every expansion', () => {
    const { steps } = expand(
      `name: t\nsteps:\n  - repeat: 3\n    steps:\n      - { duration: 10m, power: 90%, name: Sweet spot }\n`,
    );
    expect(steps.map((step) => step.name)).toEqual(['Sweet spot', 'Sweet spot', 'Sweet spot']);
  });

  it('expands nested repeats inside out', () => {
    const { steps, totalDurationS } = expand(
      `name: t\nsteps:\n  - repeat: 2\n    steps:\n      - repeat: 3\n        steps:\n          - { duration: 30s, power: 120%, name: Fast }\n          - { duration: 90s, power: 55%, name: Easy }\n      - { duration: 3m, power: 50%, name: Rest }\n`,
    );
    expect(steps).toHaveLength(14);
    expect(steps.map((step) => step.name)).toEqual([
      'Fast',
      'Easy',
      'Fast',
      'Easy',
      'Fast',
      'Easy',
      'Rest',
      'Fast',
      'Easy',
      'Fast',
      'Easy',
      'Fast',
      'Easy',
      'Rest',
    ]);
    expect(totalDurationS).toBe(2 * (3 * 120 + 180));
  });

  it('keeps the cadence and the target on every expansion', () => {
    const { steps } = expand(
      `name: t\nsteps:\n  - repeat: 2\n    steps:\n      - { duration: 1m, power: 250W, cadence: [85, 95] }\n`,
    );
    expect(steps[1]).toMatchObject({
      power: { kind: 'constant', value: { unit: 'watts', value: 250 } },
      cadence: { minRpm: 85, maxRpm: 95 },
    });
  });

  it('copies steps rather than sharing them, so a run cannot write back into the workout', () => {
    const workout = parseWorkout(
      `name: t\nsteps:\n  - repeat: 2\n    steps:\n      - { duration: 1m, power: 50% }\n`,
    );
    const { steps } = expandWorkout(workout);
    expect(steps[0]).not.toBe(steps[1]);
    const source = workout.steps[0];
    if (source?.kind === 'repeat') expect(steps[0]).not.toBe(source.steps[0]);
  });
});
