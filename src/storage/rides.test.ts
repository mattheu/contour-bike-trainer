import { describe, expect, it } from 'vitest';

import { MemoryStorage } from './memory';
import { restoreRides, type RestorableRide } from './rides';
import type { Ride, RideSample } from './types';

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-1',
    updatedAt: '2026-09-30T07:10:00.000Z',
    routeId: 'route-7',
    routeName: 'Rolling',
    workoutId: null,
    workoutName: null,
    startedAt: '2026-09-30T06:05:00.000Z',
    elapsedS: 120,
    pausedS: 15,
    distanceM: 1600,
    ascentM: 42,
    avgPowerW: 216,
    avgHeartRateBpm: 142,
    finished: true,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ftp: 265,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
    ...overrides,
  };
}

const SAMPLE: RideSample = {
  t: 1,
  distanceM: 8,
  speedKmh: 29,
  powerW: 200,
  cadenceRpm: 88,
  heartRateBpm: 139,
  lat: 51.5,
  lon: -1.5,
  eleM: 100,
};

function record(overrides: Partial<Ride> = {}): RestorableRide {
  return { ride: ride(overrides), samples: [SAMPLE] };
}

describe('restoreRides', () => {
  it('writes the rides and their samples', async () => {
    const storage = new MemoryStorage();
    const outcome = await restoreRides(storage, [record({ id: 'a' }), record({ id: 'b' })]);

    expect(outcome).toEqual({ restored: 2, skippedExisting: 0 });
    expect((await storage.rides.list()).map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect((await storage.rideSamples.get('a'))?.samples).toEqual([SAMPLE]);
  });

  it('keys the samples by the ride id, which is where every reader looks for them', async () => {
    const storage = new MemoryStorage();
    await restoreRides(storage, [record({ id: 'a' })]);

    const stored = await storage.rideSamples.get('a');
    expect(stored?.id).toBe('a');
  });

  it('is idempotent: importing the same archive twice duplicates nothing', async () => {
    const storage = new MemoryStorage();
    const records = [record({ id: 'a' }), record({ id: 'b' })];

    await restoreRides(storage, records);
    const second = await restoreRides(storage, records);

    expect(second).toEqual({ restored: 0, skippedExisting: 2 });
    expect(await storage.rides.list()).toHaveLength(2);
  });

  it('leaves a ride already in the history exactly as it was', async () => {
    const storage = new MemoryStorage();
    // The copy on this machine is further along than the backup.
    await storage.rides.put(ride({ id: 'a', distanceM: 20_000, elapsedS: 3600 }));

    const outcome = await restoreRides(storage, [record({ id: 'a', distanceM: 1600 })]);

    expect(outcome).toEqual({ restored: 0, skippedExisting: 1 });
    expect((await storage.rides.get('a'))?.distanceM).toBe(20_000);
    expect(await storage.rideSamples.get('a')).toBeUndefined();
  });

  it('restores the new rides in an archive that also holds ones it already has', async () => {
    const storage = new MemoryStorage();
    await storage.rides.put(ride({ id: 'a' }));

    const outcome = await restoreRides(storage, [record({ id: 'a' }), record({ id: 'b' })]);

    expect(outcome).toEqual({ restored: 1, skippedExisting: 1 });
    expect((await storage.rides.list()).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('takes the first of two records sharing an id rather than writing both', async () => {
    const storage = new MemoryStorage();
    const outcome = await restoreRides(storage, [
      record({ id: 'a', distanceM: 1600 }),
      record({ id: 'a', distanceM: 999 }),
    ]);

    expect(outcome).toEqual({ restored: 1, skippedExisting: 1 });
    expect((await storage.rides.get('a'))?.distanceM).toBe(1600);
  });

  it('restores a ride with no samples', async () => {
    const storage = new MemoryStorage();
    await restoreRides(storage, [{ ride: ride({ id: 'a' }), samples: [] }]);

    expect((await storage.rideSamples.get('a'))?.samples).toEqual([]);
  });

  it('does nothing, successfully, for an archive with no rides in it', async () => {
    const storage = new MemoryStorage();
    expect(await restoreRides(storage, [])).toEqual({ restored: 0, skippedExisting: 0 });
    expect(await storage.rides.list()).toEqual([]);
  });
});
