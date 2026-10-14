import { describe, expect, it } from 'vitest';

import { MemoryRepository } from '../storage/memory';
import type { Workout as StoredWorkout } from '../storage/types';
import { expandWorkout } from '../workout/expand';
import { bundledWorkouts, seedWorkouts, type ManifestWorkout } from './workouts';

function repository(): MemoryRepository<StoredWorkout> {
  return new MemoryRepository<StoredWorkout>();
}

const GOOD = `name: Good one
description: Something to ride.
steps:
  - { duration: 10m, power: 65% }
`;

describe('bundledWorkouts', () => {
  it('parses every starter shipped with the build', () => {
    const { workouts, skipped } = bundledWorkouts();

    expect(skipped).toEqual([]);
    expect(workouts.length).toBe(6);
    for (const entry of workouts) {
      expect(entry.file).toMatch(/\.yaml$/);
      expect(entry.workout.name.length).toBeGreaterThan(0);
      // Parsing is not a formality here: it is the only place a length comes from.
      expect(expandWorkout(entry.workout).totalDurationS).toBeGreaterThan(0);
    }
  });

  it('reads the name and description out of the file rather than the manifest', () => {
    const entry = bundledWorkouts().workouts.find((w) => w.id === 'sweet-spot-50');
    expect(entry?.workout.name).toMatch(/sweet ?spot/i);
    expect(entry?.workout.description?.length).toBeGreaterThan(0);
  });

  it('skips a starter that will not parse and says which, keeping the rest', () => {
    const entries: ManifestWorkout[] = [
      { id: 'good', file: 'good.yaml' },
      { id: 'broken', file: 'broken.yaml' },
      { id: 'absent', file: 'absent.yaml' },
    ];
    const sources = new Map([
      ['good.yaml', GOOD],
      ['broken.yaml', 'name: Broken\nsteps:\n  - { power: 65% }\n'],
    ]);

    const { workouts, skipped } = bundledWorkouts(entries, sources);

    expect(workouts.map((w) => w.id)).toEqual(['good']);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toMatch(/"broken" was skipped because .*duration/i);
    expect(skipped[1]).toMatch(/"absent" was skipped because absent.yaml is not bundled/);
  });
});

describe('seedWorkouts', () => {
  const bundled = {
    workouts: bundledWorkouts([{ id: 'good', file: 'good.yaml' }], new Map([['good.yaml', GOOD]]))
      .workouts,
    skipped: [],
  };

  it('writes every starter on first run, keeping the YAML the rider will edit', async () => {
    const repo = repository();
    const result = await seedWorkouts(repo, false, bundled);

    expect(result.written).toEqual(['good']);
    const stored = await repo.get('good');
    expect(stored?.name).toBe('Good one');
    expect(stored?.description).toBe('Something to ride.');
    // The source, not a parsed tree: comments and layout survive the round trip.
    expect(stored?.source).toBe(GOOD);
    expect(stored?.updatedAt).not.toBe('');
  });

  it('is idempotent across boots', async () => {
    const repo = repository();
    await seedWorkouts(repo, false, bundled);
    const result = await seedWorkouts(repo, true, bundled);

    expect(result.written).toEqual([]);
    // Nothing is looked at once the marker is set, so nothing is reported as unchanged.
    expect(result.unchanged).toEqual([]);
    expect(await repo.list()).toHaveLength(1);
  });

  it('never overwrites a starter the rider has edited', async () => {
    const repo = repository();
    await seedWorkouts(repo, false, bundled);
    const edited = 'name: Mine now\nsteps:\n  - { duration: 5m, power: 80% }\n';
    await repo.put({ id: 'good', name: 'Mine now', source: edited, updatedAt: '' });

    // Even on the boot that still believes it has never seeded, which is the stronger
    // claim: present means left alone whatever the marker says.
    await seedWorkouts(repo, false, bundled);

    expect((await repo.get('good'))?.source).toBe(edited);
  });

  it('carries the reasons a starter was skipped through to the caller', async () => {
    const repo = repository();
    const result = await seedWorkouts(repo, false, {
      workouts: [],
      skipped: ['"broken" was skipped.'],
    });

    expect(result.skipped).toEqual(['"broken" was skipped.']);
    expect(await repo.list()).toEqual([]);
  });

  it('still reports a broken starter on an install that has already seeded', async () => {
    // A file we shipped that will not parse is worth saying every boot: the marker stops
    // the writing, not the reading.
    const repo = repository();

    const result = await seedWorkouts(repo, true, {
      workouts: [],
      skipped: ['"broken" was skipped.'],
    });

    expect(result.skipped).toEqual(['"broken" was skipped.']);
  });

  it('does not bring back a starter the rider deleted', async () => {
    // Boot, delete, reload. The hole this closes was real: without the marker an absent
    // starter is written again, and the rider's deletion is undone by the next reload.
    const repo = repository();
    await seedWorkouts(repo, false, bundled);
    await repo.delete('good');

    const result = await seedWorkouts(repo, true, bundled);

    expect(result.written).toEqual([]);
    expect(await repo.get('good')).toBeUndefined();
    expect(await repo.list()).toEqual([]);
  });
});
