import { describe, expect, it } from 'vitest';

import { MemoryRepository } from '../storage/memory';
import type { Workout as StoredWorkout } from '../storage/types';
import { expandWorkout } from '../workout/expand';
import { builtInWorkoutIds, bundledWorkouts, seedWorkouts, type ManifestWorkout } from './workouts';

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
    expect(workouts.length).toBe(5);
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

describe('builtInWorkoutIds', () => {
  it('is exactly what workouts/manifest.json declares', () => {
    const ids = builtInWorkoutIds();
    expect(ids.has('sweet-spot-50')).toBe(true);
    expect(ids.size).toBe(5);
  });

  it('claims a starter whose YAML will not parse', () => {
    // It is in the build either way, and a parse error is not a reason to offer controls
    // that are otherwise never there. The fix is a corrected file in the next build.
    expect(builtInWorkoutIds([{ id: 'broken', file: 'broken.yaml' }]).has('broken')).toBe(true);
  });

  it('does not claim a workout the rider created', () => {
    expect(builtInWorkoutIds().has('a-minted-uuid')).toBe(false);
  });

  it('stops claiming a starter once its manifest entry is gone', () => {
    // Deliberate, and the only way a stale starter gets out of an install.
    const ids = builtInWorkoutIds([{ id: 'kept', file: 'kept.yaml' }]);
    expect([...ids]).toEqual(['kept']);
  });
});

describe('seedWorkouts', () => {
  const bundled = {
    workouts: bundledWorkouts([{ id: 'good', file: 'good.yaml' }], new Map([['good.yaml', GOOD]]))
      .workouts,
    skipped: [],
  };

  it('writes every starter on first run, keeping the YAML the rider will read', async () => {
    const repo = repository();
    const result = await seedWorkouts(repo, bundled);

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
    await seedWorkouts(repo, bundled);
    const result = await seedWorkouts(repo, bundled);

    expect(result.written).toEqual([]);
    expect(result.unchanged).toEqual(['good']);
    expect(await repo.list()).toHaveLength(1);
  });

  it('rewrites a starter whose file in the build has changed', async () => {
    // What a rider would check: a corrected starter reaches an install that has already
    // been used, rather than only a fresh database. The same rule seedRoutes follows.
    const repo = repository();
    await seedWorkouts(repo, bundled);

    const corrected = bundledWorkouts(
      [{ id: 'good', file: 'good.yaml' }],
      new Map([['good.yaml', GOOD.replace('Good one', 'Good one, corrected')]]),
    );
    const result = await seedWorkouts(repo, corrected);

    expect(result.written).toEqual(['good']);
    const stored = await repo.get('good');
    expect(stored?.source).toContain('Good one, corrected');
    expect(stored?.name).toBe('Good one, corrected');
  });

  it('rewrites a starter whose comments alone have changed', async () => {
    // The comments are half of what a starter teaches, so a reworded one is a change.
    const repo = repository();
    await seedWorkouts(repo, bundled);

    const recommented = bundledWorkouts(
      [{ id: 'good', file: 'good.yaml' }],
      new Map([['good.yaml', `# Ten minutes, steady.\n${GOOD}`]]),
    );
    await seedWorkouts(repo, recommented);

    expect((await repo.get('good'))?.source).toContain('# Ten minutes, steady.');
  });

  it('restores a starter edited under a build that still allowed it', async () => {
    // Intended, and the only way back: a starter is the build's record, not the rider's.
    // Their own copy of it is a separate workout with a minted id — see the test below.
    const repo = repository();
    await seedWorkouts(repo, bundled);
    const edited = 'name: Mine now\nsteps:\n  - { duration: 5m, power: 80% }\n';
    await repo.put({ id: 'good', name: 'Mine now', source: edited, updatedAt: '' });

    const result = await seedWorkouts(repo, bundled);

    expect(result.written).toEqual(['good']);
    expect((await repo.get('good'))?.source).toBe(GOOD);
    expect((await repo.get('good'))?.name).toBe('Good one');
  });

  it('never touches a workout the rider wrote or imported', async () => {
    // No manifest entry claims a minted id, so seeding has nothing to say about it.
    const repo = repository();
    const mine = 'name: Mine\nsteps:\n  - { duration: 5m, power: 80% }\n';
    await repo.put({ id: 'a-minted-uuid', name: 'Mine', source: mine, updatedAt: '' });

    await seedWorkouts(repo, bundled);

    expect((await repo.get('a-minted-uuid'))?.source).toBe(mine);
    expect(await repo.list()).toHaveLength(2);
  });

  it('carries the reasons a starter was skipped through to the caller', async () => {
    const repo = repository();
    const result = await seedWorkouts(repo, {
      workouts: [],
      skipped: ['"broken" was skipped.'],
    });

    expect(result.skipped).toEqual(['"broken" was skipped.']);
    expect(await repo.list()).toEqual([]);
  });

  it('puts a starter back if something managed to delete it', async () => {
    // Not a regression: a starter has no Delete control and services refuses the id, so
    // absent can only mean never seen, and absent is written like anything that differs.
    const repo = repository();
    await seedWorkouts(repo, bundled);
    await repo.delete('good');

    const result = await seedWorkouts(repo, bundled);

    expect(result.written).toEqual(['good']);
    expect(await repo.get('good')).toBeDefined();
  });
});
