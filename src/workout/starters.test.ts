import { describe, expect, it } from 'vitest';
import manifest from '../../workouts/manifest.json';
import { expandWorkout } from './expand';
import { parseWorkout } from './parse';
import { plannedPowerSeries } from './runner';
import { trainingStressScore } from './load';

/**
 * The starters are five training sessions, and that is now all they are. They each use the
 * forms a session of that shape would naturally use, which is what keeps them readable as
 * training rather than as a grammar demonstration — the whole format is exercised by
 * manual-tests/format-test.yaml, and documented beside the editor by the format reference.
 *
 * What this test holds them to is that the manifest and the bundled files agree, and that
 * every one of them parses, expands and scores like a session a rider would ride. A starter
 * that will not parse is an empty list on a fresh install.
 */

const sourceByPath = import.meta.glob('../../workouts/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sourceByFile = new Map(
  Object.entries(sourceByPath).map(([path, source]) => [
    path.slice(path.lastIndexOf('/') + 1),
    source,
  ]),
);

const starters = manifest.workouts.map((entry) => {
  const source = sourceByFile.get(entry.file);
  if (source === undefined) {
    throw new Error(`workouts/manifest.json lists "${entry.file}", but no such file is bundled`);
  }
  return { ...entry, source };
});

describe('workouts/manifest.json', () => {
  it('ships five training sessions, and nothing that is only there for a test', () => {
    expect(manifest.workouts.map((entry) => entry.id)).toEqual([
      '30-30s',
      'sweet-spot-50',
      'over-unders-45',
      'vo2-max-50',
      'aerobic-builds-60',
    ]);
  });

  it('declares every bundled file exactly once', () => {
    const declared = manifest.workouts.map((entry) => entry.file).sort();
    expect(declared).toEqual([...sourceByFile.keys()].sort());
    expect(new Set(manifest.workouts.map((entry) => entry.id)).size).toBe(manifest.workouts.length);
  });
});

describe('the starter workouts', () => {
  it.each(starters)('$id parses, expands and scores', ({ source }) => {
    const workout = parseWorkout(source);
    expect(workout.name).not.toBe('');

    const expanded = expandWorkout(workout);
    expect(expanded.steps.length).toBeGreaterThan(1);
    expect(expanded.totalDurationS).toBe(
      expanded.steps.reduce((total, step) => total + step.durationS, 0),
    );

    const ftp = workout.ftp ?? 250;
    const tss = trainingStressScore(
      plannedPowerSeries(expanded.steps, ftp),
      expanded.totalDurationS,
      ftp,
    );
    // Per hour rather than total: half an hour of intervals and an hour of endurance are
    // both sessions worth riding, and a flat floor would only be asking them to be the
    // same length.
    const perHour = tss / (expanded.totalDurationS / 3600);
    expect(perHour).toBeGreaterThan(20);
    expect(perHour).toBeLessThan(150);
  });
});
