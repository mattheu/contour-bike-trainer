import { describe, expect, it } from 'vitest';
import type { Workout as StoredWorkout } from '../../storage/types';
import { bundledWorkouts } from '../../ride/workouts';
import {
  DELETE_WORDING,
  LENGTHS,
  LOADS,
  filterWorkouts,
  lengthLabel,
  lengthMinutes,
  loadLabel,
  loadPoints,
  matchesLength,
  matchesLoad,
  parseDetail,
  workoutMeta,
  workoutRow,
  workoutRows,
  type LengthFilter,
  type LoadFilter,
  type ReadableWorkoutRow,
} from './workouts-list';

const FTP = 250;

function stored(id: string, name: string, source: string): StoredWorkout {
  return { id, updatedAt: '2026-10-01T00:00:00.000Z', name, source };
}

const STEADY = `name: Steady hour
description: One block.

steps:
  - { duration: 1h, power: 100% }
`;

function readable(source: string, ftp = FTP): ReadableWorkoutRow {
  const row = workoutRow(stored('a', 'stored name', source), ftp);
  if (row.status !== 'ok') throw new Error(`expected a readable row, got ${row.detail}`);
  return row;
}

describe('workoutRow', () => {
  it('reads the name and the description out of the source, not out of the record', () => {
    const row = readable(STEADY);
    expect(row.name).toBe('Steady hour');
    expect(row.description).toBe('One block.');
  });

  it('expands the plan, so a repeat counts as the steps actually ridden', () => {
    const row = readable(`name: Intervals
steps:
  - repeat: 3
    steps:
      - { duration: 5m, power: 100% }
      - { duration: 5m, power: 50% }
`);
    expect(row.steps).toHaveLength(6);
    expect(row.totalDurationS).toBe(30 * 60);
  });

  it('scores an hour at FTP as 100', () => {
    expect(readable(STEADY).tss).toBeCloseTo(100, 0);
  });

  it('scores a long easy session below a short hard one', () => {
    const easy = readable(`name: Easy\nsteps:\n  - { duration: 1h, power: 55% }\n`);
    const hard = readable(`name: Hard\nsteps:\n  - { duration: 30m, power: 110% }\n`);
    expect(easy.tss).toBeLessThan(hard.tss);
  });

  it("uses the workout's own ftp where it declares one", () => {
    const own = readable(`name: Own\nftp: 125\nsteps:\n  - { duration: 1h, power: 100% }\n`);
    expect(own.ftpW).toBe(125);
    // 100 % of its own FTP for an hour is 100 TSS whatever the rider's profile says.
    expect(own.tss).toBeCloseTo(100, 0);
  });

  it("falls back to the rider's ftp where it does not", () => {
    expect(readable(STEADY, 300).ftpW).toBe(300);
  });

  it('gives a free block no load, because it asks for no target', () => {
    const free = readable(`name: Free\nsteps:\n  - { duration: 1h, power: free }\n`);
    expect(free.tss).toBe(0);
    expect(free.totalDurationS).toBe(3600);
  });

  it('keeps a source that will not parse as a row, with its error and its stored name', () => {
    const row = workoutRow(
      stored('b', 'Last good name', 'name: Broken\nsteps:\n  - { power: 95% }\n'),
      FTP,
    );
    expect(row.status).toBe('broken');
    if (row.status !== 'broken') return;
    expect(row.name).toBe('Last good name');
    expect(row.detail).toBe('step 1 has no duration');
    expect(row.line).toBe(3);
    expect(row.column).toBeGreaterThan(0);
  });

  it('survives a source that is not YAML at all', () => {
    const row = workoutRow(stored('c', 'Rubbish', 'name: [unclosed\n'), FTP);
    expect(row.status).toBe('broken');
  });

  it('survives an empty source', () => {
    const row = workoutRow(stored('d', 'Empty', ''), FTP);
    expect(row.status).toBe('broken');
    if (row.status !== 'broken') return;
    expect(row.detail).toBe('The workout is empty');
  });
});

describe('workoutRows', () => {
  it('sorts by name and keeps broken records in the list', () => {
    const rows = workoutRows(
      [
        stored('1', 'Zulu', STEADY),
        stored('2', 'Alpha', 'name: Alpha\nsteps: []\n'),
        stored('3', 'Mike', `name: Mike\nsteps:\n  - { duration: 10m, power: 60% }\n`),
      ],
      FTP,
    );
    // Sorted on the record's name, which is the one field every row has.
    expect(rows.map((row) => row.id)).toEqual(['2', '3', '1']);
    expect(rows[0]?.status).toBe('broken');
  });

  it('reads the six starter workouts as rows', () => {
    const bundled = bundledWorkouts();
    const rows = workoutRows(
      bundled.workouts.map((entry) => stored(entry.id, entry.workout.name, entry.source)),
      FTP,
    );
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.status === 'ok')).toBe(true);
    for (const row of rows) {
      if (row.status !== 'ok') continue;
      expect(row.totalDurationS).toBeGreaterThan(0);
      expect(row.tss).toBeGreaterThan(0);
      expect(row.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('the length filter', () => {
  const short = readable(`name: S\nsteps:\n  - { duration: 30m, power: 60% }\n`);
  const medium = readable(`name: M\nsteps:\n  - { duration: 1h, power: 60% }\n`);
  const long = readable(`name: L\nsteps:\n  - { duration: 1h30m, power: 60% }\n`);
  const all = [short, medium, long];

  function byLength(filter: LengthFilter) {
    return filterWorkouts(all, { length: filter, load: 'any' });
  }

  it("offers the mockup's four options", () => {
    expect(LENGTHS.map((option) => option.value)).toEqual(['any', 'short', 'medium', 'long']);
  });

  it('keeps everything under Any', () => {
    expect(byLength('any')).toHaveLength(3);
  });

  it('splits at 45 and 75 minutes', () => {
    expect(byLength('short')).toEqual([short]);
    expect(byLength('medium')).toEqual([medium]);
    expect(byLength('long')).toEqual([long]);
  });

  it('includes the boundaries in the middle band', () => {
    const at45 = readable(`name: A\nsteps:\n  - { duration: 45m, power: 60% }\n`);
    const at75 = readable(`name: B\nsteps:\n  - { duration: 1h15m, power: 60% }\n`);
    expect(matchesLength(at45, 'medium')).toBe(true);
    expect(matchesLength(at75, 'medium')).toBe(true);
    expect(matchesLength(at45, 'short')).toBe(false);
    expect(matchesLength(at75, 'long')).toBe(false);
  });

  it('never hides a broken workout, which is the one the rider has to reach', () => {
    const broken = workoutRow(stored('x', 'Broken', 'name: X\n'), FTP);
    for (const option of LENGTHS) {
      expect(matchesLength(broken, option.value)).toBe(true);
    }
  });
});

describe('the load filter', () => {
  // At an FTP of 250, an hour at 100 % is 100 TSS and the figure scales quadratically.
  const light = readable(`name: S\nsteps:\n  - { duration: 30m, power: 60% }\n`);
  const moderate = readable(`name: M\nsteps:\n  - { duration: 1h, power: 90% }\n`);
  const hard = readable(`name: H\nsteps:\n  - { duration: 1h30m, power: 95% }\n`);
  const all = [light, moderate, hard];

  function byLoad(filter: LoadFilter) {
    return filterWorkouts(all, { length: 'any', load: filter });
  }

  it('offers four bands, All first', () => {
    expect(LOADS.map((option) => option.value)).toEqual(['any', 'light', 'moderate', 'hard']);
    expect(LOADS.map((option) => option.label)).toEqual(['All', 'Under 50', '50–100', 'Over 100']);
  });

  it('keeps everything under All', () => {
    expect(byLoad('any')).toHaveLength(3);
  });

  it('splits at 50 and 100 TSS', () => {
    expect(loadPoints(light.tss)).toBeLessThan(50);
    expect(byLoad('light')).toEqual([light]);
    expect(byLoad('moderate')).toEqual([moderate]);
    expect(byLoad('hard')).toEqual([hard]);
  });

  it('bands on the figure the row shows, boundaries included', () => {
    const at50 = { ...light, tss: 49.6 };
    const at100 = { ...moderate, tss: 100.4 };
    expect(loadPoints(49.6)).toBe(50);
    expect(matchesLoad(at50, 'moderate')).toBe(true);
    expect(matchesLoad(at50, 'light')).toBe(false);
    expect(matchesLoad(at100, 'moderate')).toBe(true);
    expect(matchesLoad(at100, 'hard')).toBe(false);
  });

  it('never hides a broken workout either', () => {
    const broken = workoutRow(stored('x', 'Broken', 'name: X\n'), FTP);
    for (const option of LOADS) {
      expect(matchesLoad(broken, option.value)).toBe(true);
    }
  });
});

describe('the two filters together', () => {
  const shortHard = readable(`name: SH\nsteps:\n  - { duration: 40m, power: 110% }\n`);
  const shortEasy = readable(`name: SE\nsteps:\n  - { duration: 40m, power: 55% }\n`);
  const longEasy = readable(`name: LE\nsteps:\n  - { duration: 1h30m, power: 60% }\n`);
  const broken = workoutRow(stored('x', 'Broken', 'name: X\n'), FTP);
  const all = [shortHard, shortEasy, longEasy, broken];

  it('shows a row only if it passes both', () => {
    expect(filterWorkouts(all, { length: 'short', load: 'moderate' })).toEqual([shortHard, broken]);
    expect(filterWorkouts(all, { length: 'short', load: 'light' })).toEqual([shortEasy, broken]);
    expect(filterWorkouts(all, { length: 'long', load: 'light' })).toEqual([broken]);
  });

  it('can narrow to nothing but the broken row, which is never filtered away', () => {
    expect(filterWorkouts(all, { length: 'medium', load: 'hard' })).toEqual([broken]);
  });

  it('shows everything when neither filter is set', () => {
    expect(filterWorkouts(all, { length: 'any', load: 'any' })).toHaveLength(4);
  });
});

describe('cell labels', () => {
  it('shows length in whole minutes', () => {
    expect(lengthMinutes(3780)).toBe(63);
    expect(lengthLabel(3780)).toBe('63');
    expect(lengthLabel(29)).toBe('0');
  });

  it('shows load in whole points', () => {
    expect(loadLabel(83.6)).toBe('84 TSS');
    expect(loadLabel(0)).toBe('0 TSS');
  });

  it('puts the description under the name, and the error where there is one', () => {
    expect(workoutMeta(readable(STEADY))).toBe('One block.');
    expect(workoutMeta(readable(`name: N\nsteps:\n  - { duration: 5m, power: 60% }\n`))).toBeNull();
    const broken = workoutRow(stored('y', 'Y', 'name: Y\nsteps:\n  - { power: 95% }\n'), FTP);
    expect(workoutMeta(broken)).toContain('Will not open');
    expect(workoutMeta(broken)).toContain('line 3');
  });
});

describe('parseDetail', () => {
  it('drops the position the parser appends, which the row shows separately', () => {
    expect(parseDetail('step 3 has no duration (line 9, column 5)')).toBe('step 3 has no duration');
  });

  it('leaves a message that carries no position alone', () => {
    expect(parseDetail('something else went wrong')).toBe('something else went wrong');
  });
});

describe('the delete wording', () => {
  it('says plainly that it cannot be undone', () => {
    expect(DELETE_WORDING.prompt).toContain("Can't be undone");
    expect(DELETE_WORDING.confirm).toBe('Delete');
    expect(DELETE_WORDING.cancel).toBe('Keep');
  });
});
