import { describe, expect, it } from 'vitest';
import { WorkoutParseError, parseDuration, parsePowerValue, parseWorkout } from './parse';

const EXAMPLE = `name: 2x20 threshold
description: Two long blocks at threshold, five easy between. # optional
ftp: 250 # optional; falls back to the rider profile

warmup: { duration: 10m, ramp: [50%, 75%] }

steps:
  - repeat: 2
    steps:
      - { duration: 20m, power: 95%, cadence: 90 }
      - { duration: 5m, power: 55% }
  - { duration: 3m, power: 65% }

cooldown: { duration: 10m, ramp: [60%, 40%] }
`;

/** The error, so a test can assert on where it points as well as what it says. */
function errorFrom(source: string): WorkoutParseError {
  try {
    parseWorkout(source);
  } catch (error) {
    if (error instanceof WorkoutParseError) return error;
    throw error;
  }
  throw new Error('expected parseWorkout to throw');
}

function stepsSource(body: string): string {
  return `name: t\nsteps:\n${body}\n`;
}

describe('parseDuration', () => {
  it.each([
    ['90s', 90],
    ['10m', 600],
    ['1h30m', 5400],
    ['1h', 3600],
    ['10m30s', 630],
    ['1h30m15s', 5415],
  ])('reads %s as %i seconds', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
  });

  it.each(['', '10', '600', '1:30', 'm', '10 minutes', '1.5h', '-10m', '10M'])(
    'rejects %s',
    (text) => {
      expect(parseDuration(text)).toBeNull();
    },
  );

  it('rejects a duration that adds up to nothing', () => {
    expect(parseDuration('0s')).toBeNull();
  });
});

describe('parsePowerValue', () => {
  it('reads a percentage of FTP', () => {
    expect(parsePowerValue('95%')).toEqual({ unit: 'ftpPercent', value: 95 });
  });

  it('reads absolute watts in either case', () => {
    expect(parsePowerValue('250W')).toEqual({ unit: 'watts', value: 250 });
    expect(parsePowerValue('250w')).toEqual({ unit: 'watts', value: 250 });
  });

  it('reads a fractional percentage', () => {
    expect(parsePowerValue('87.5%')).toEqual({ unit: 'ftpPercent', value: 87.5 });
  });

  it.each(['free', '95', '95 %%', 'W', '0%', '400%', '3000W'])('rejects %s', (text) => {
    expect(parsePowerValue(text)).toBeNull();
  });
});

describe('parseWorkout', () => {
  it('reads the whole grammar from the spec example', () => {
    const workout = parseWorkout(EXAMPLE);

    expect(workout.name).toBe('2x20 threshold');
    expect(workout.description).toBe('Two long blocks at threshold, five easy between.');
    expect(workout.ftp).toBe(250);
    expect(workout.warmup).toEqual({
      kind: 'step',
      durationS: 600,
      power: {
        kind: 'ramp',
        from: { unit: 'ftpPercent', value: 50 },
        to: { unit: 'ftpPercent', value: 75 },
      },
    });
    expect(workout.cooldown?.durationS).toBe(600);
    expect(workout.steps).toHaveLength(2);

    const repeat = workout.steps[0];
    expect(repeat).toMatchObject({ kind: 'repeat', count: 2 });
    expect(repeat?.kind === 'repeat' && repeat.steps[0]).toEqual({
      kind: 'step',
      durationS: 1200,
      power: { kind: 'constant', value: { unit: 'ftpPercent', value: 95 } },
      cadence: { minRpm: 90, maxRpm: 90 },
    });
  });

  it('keeps warmup and cooldown optional', () => {
    const workout = parseWorkout(stepsSource('  - { duration: 5m, power: 60% }'));
    expect(workout.warmup).toBeUndefined();
    expect(workout.cooldown).toBeUndefined();
    expect(workout.description).toBeUndefined();
    expect(workout.ftp).toBeUndefined();
  });

  it('takes anything in a warmup that a step in steps takes', () => {
    const workout = parseWorkout(
      `name: t\nwarmup: { duration: 10m, power: 200W, cadence: [85, 95], name: Spin up }\nsteps:\n  - { duration: 5m, power: 60% }\n`,
    );
    expect(workout.warmup).toEqual({
      kind: 'step',
      durationS: 600,
      power: { kind: 'constant', value: { unit: 'watts', value: 200 } },
      cadence: { minRpm: 85, maxRpm: 95 },
      name: 'Spin up',
    });
  });

  it('reads a free step as a target-less step', () => {
    const workout = parseWorkout(
      stepsSource('  - { duration: 30s, power: free, name: Max effort }'),
    );
    expect(workout.steps[0]).toEqual({
      kind: 'step',
      durationS: 30,
      power: { kind: 'free' },
      name: 'Max effort',
    });
  });

  it('accepts free in any case', () => {
    const workout = parseWorkout(stepsSource('  - { duration: 30s, power: FREE }'));
    expect(workout.steps[0]).toMatchObject({ power: { kind: 'free' } });
  });

  it('reads a ramp whose ends mix forms, in either direction', () => {
    const workout = parseWorkout(
      stepsSource(
        '  - { duration: 5m, ramp: [50%, 250W] }\n  - { duration: 5m, ramp: [250W, 40%] }',
      ),
    );
    expect(workout.steps[0]).toMatchObject({
      power: {
        kind: 'ramp',
        from: { unit: 'ftpPercent', value: 50 },
        to: { unit: 'watts', value: 250 },
      },
    });
    expect(workout.steps[1]).toMatchObject({
      power: {
        kind: 'ramp',
        from: { unit: 'watts', value: 250 },
        to: { unit: 'ftpPercent', value: 40 },
      },
    });
  });

  it('reads a cadence range', () => {
    const workout = parseWorkout(
      stepsSource('  - { duration: 5m, power: 60%, cadence: [85, 95] }'),
    );
    expect(workout.steps[0]).toMatchObject({ cadence: { minRpm: 85, maxRpm: 95 } });
  });

  it('nests repeats', () => {
    const workout = parseWorkout(
      stepsSource(
        '  - repeat: 2\n    steps:\n      - repeat: 3\n        steps:\n          - { duration: 30s, power: 120% }\n      - { duration: 3m, power: 50% }',
      ),
    );
    const outer = workout.steps[0];
    expect(outer?.kind).toBe('repeat');
    if (outer?.kind !== 'repeat') return;
    expect(outer.count).toBe(2);
    expect(outer.steps[0]).toMatchObject({ kind: 'repeat', count: 3 });
  });

  it('keeps the name of a step inside a repeat', () => {
    const workout = parseWorkout(
      stepsSource(
        '  - repeat: 2\n    steps:\n      - { duration: 1m, power: 95%, name: Sweet spot }',
      ),
    );
    const repeat = workout.steps[0];
    expect(repeat?.kind === 'repeat' && repeat.steps[0]).toMatchObject({ name: 'Sweet spot' });
  });
});

describe('parseWorkout failures', () => {
  it('points at the line and column of malformed YAML', () => {
    const error = errorFrom('name: t\nsteps: [\n');
    expect(error).toBeInstanceOf(WorkoutParseError);
    // yaml reports an unterminated flow collection at the point it ran out of document.
    expect(error.line).toBeGreaterThanOrEqual(2);
    expect(error.message).toMatch(/must be sufficiently indented/);
  });

  it('reports a duplicate key where the second one is', () => {
    const error = errorFrom('name: t\nname: u\nsteps:\n  - { duration: 1m, power: 50% }\n');
    expect(error.message).toContain('unique');
    expect(error.line).toBe(2);
  });

  it('names the step with no duration and points at it', () => {
    const error = errorFrom(
      'name: t\nsteps:\n  - { duration: 1m, power: 50% }\n  - { duration: 1m, power: 50% }\n  - { power: 95% }\n',
    );
    expect(error.message).toBe('step 3 has no duration (line 5, column 5)');
  });

  it('points inside a repeat with the position of the offending step', () => {
    const error = errorFrom(
      'name: t\nsteps:\n  - repeat: 2\n    steps:\n      - { duration: 1m, power: 50% }\n      - { power: 50% }\n',
    );
    expect(error.message).toBe('step 1.2 has no duration (line 6, column 9)');
  });

  it('rejects a step with no power', () => {
    const error = errorFrom(stepsSource('  - { duration: 5m }'));
    expect(error.message).toMatch(/^step 1 has no power/);
  });

  it('rejects a step with both power and ramp', () => {
    const error = errorFrom(stepsSource('  - { duration: 5m, power: 60%, ramp: [50%, 60%] }'));
    expect(error.message).toMatch(/^step 1 has both power and ramp/);
  });

  it('rejects an unreadable duration at the duration, not the step', () => {
    const error = errorFrom(stepsSource('  - { duration: 600, power: 60% }'));
    expect(error.message).toBe(
      'step 1 has an unreadable duration: write it as 90s, 10m or 1h30m (line 3, column 17)',
    );
  });

  it('rejects a step longer than four hours', () => {
    const error = errorFrom(stepsSource('  - { duration: 5h, power: 60% }'));
    expect(error.message).toMatch(/longer than 4 hours/);
  });

  it('rejects an unreadable power', () => {
    const error = errorFrom(stepsSource('  - { duration: 5m, power: hard }'));
    expect(error.message).toMatch(/^step 1 has an unreadable power/);
  });

  it('rejects free as a ramp end', () => {
    const error = errorFrom(stepsSource('  - { duration: 5m, ramp: [free, 75%] }'));
    expect(error.message).toMatch(/ramp end that is not a power/);
  });

  it('rejects a ramp with other than two ends', () => {
    expect(errorFrom(stepsSource('  - { duration: 5m, ramp: [50%] }')).message).toMatch(
      /unreadable ramp/,
    );
    expect(errorFrom(stepsSource('  - { duration: 5m, ramp: [50%, 60%, 70%] }')).message).toMatch(
      /unreadable ramp/,
    );
  });

  it('rejects a cadence range that runs backwards', () => {
    expect(
      errorFrom(stepsSource('  - { duration: 5m, power: 60%, cadence: [95, 85] }')).message,
    ).toMatch(/runs backwards/);
  });

  it('rejects a cadence outside what legs do', () => {
    expect(
      errorFrom(stepsSource('  - { duration: 5m, power: 60%, cadence: 400 }')).message,
    ).toMatch(/cadence outside 1-200 rpm/);
  });

  it('rejects an unknown key, which is nearly always a typo', () => {
    expect(errorFrom(stepsSource('  - { duration: 5m, powre: 60% }')).message).toBe(
      'step 1 has an unknown key "powre" (line 3, column 21)',
    );
    expect(
      errorFrom('name: t\nauthor: me\nsteps:\n  - { duration: 1m, power: 50% }\n').message,
    ).toBe('the workout has an unknown key "author" (line 2, column 1)');
  });

  it('rejects a name on a repeat block, which names its steps instead', () => {
    const error = errorFrom(
      stepsSource('  - repeat: 2\n    name: Set\n    steps:\n      - { duration: 1m, power: 50% }'),
    );
    expect(error.message).toMatch(/unknown key "name"/);
  });

  it('rejects a repeat count that is not a whole number of times', () => {
    expect(
      errorFrom(stepsSource('  - repeat: 0\n    steps:\n      - { duration: 1m, power: 50% }'))
        .message,
    ).toMatch(/whole number of times/);
    expect(
      errorFrom(stepsSource('  - repeat: two\n    steps:\n      - { duration: 1m, power: 50% }'))
        .message,
    ).toMatch(/whole number of times/);
  });

  it('rejects a repeat with no steps', () => {
    expect(errorFrom(stepsSource('  - repeat: 2\n    steps: []')).message).toMatch(
      /^step 1 has no steps/,
    );
  });

  it('rejects a workout with no name', () => {
    expect(errorFrom('steps:\n  - { duration: 1m, power: 50% }\n').message).toMatch(/empty name/);
  });

  it('rejects a workout with no steps', () => {
    expect(errorFrom('name: t\n').message).toMatch(/^the workout has no steps/);
    expect(errorFrom('name: t\nsteps: []\n').message).toMatch(/^the workout has no steps/);
  });

  it('rejects empty and non-map sources', () => {
    expect(errorFrom('').message).toMatch(/empty/);
    expect(errorFrom('   \n').message).toMatch(/empty/);
    expect(errorFrom('- 1\n- 2\n').message).toMatch(/must be a block of keys/);
  });

  it('rejects an ftp that is not a number of watts', () => {
    expect(
      errorFrom('name: t\nftp: high\nsteps:\n  - { duration: 1m, power: 50% }\n').message,
    ).toMatch(/ftp must be a number of watts/);
  });

  it('rejects a workout that expands past the step cap', () => {
    const inner = '      - repeat: 100\n        steps:\n          - { duration: 1s, power: 50% }';
    const error = errorFrom(stepsSource(`  - repeat: 100\n    steps:\n${inner}`));
    expect(error.message).toMatch(/expands to 10000 steps/);
  });

  it('rejects repeats nested beyond what a hand-written file needs', () => {
    let body = '          - { duration: 1s, power: 50% }';
    for (let depth = 0; depth < 12; depth += 1) {
      body = `  - repeat: 1\n    steps:\n${body.replace(/^/gm, '    ')}`;
    }
    expect(errorFrom(stepsSource(body)).message).toMatch(/nests repeats more than 10 deep/);
  });
});
