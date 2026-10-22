import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from './index';
import { createId, type Ride, type RideSample, type RideSamples, type Route } from '../types';

const ANCIENT = '2020-01-01T00:00:00.000Z';
const NOW = '2026-03-01T09:30:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

function route(overrides: Partial<Route> = {}): Route {
  return {
    id: createId(),
    updatedAt: ANCIENT,
    name: 'Rolling',
    file: 'rolling.gpx',
    totalDistanceM: 20_000,
    totalAscentM: 250,
    ...overrides,
  };
}

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: createId(),
    updatedAt: ANCIENT,
    routeId: null,
    routeName: null,
    workoutId: null,
    workoutName: null,
    startedAt: NOW,
    elapsedS: 60,
    pausedS: 15,
    distanceM: 500,
    ascentM: 12,
    avgPowerW: 200,
    avgHeartRateBpm: 140,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ergMode: 'erg',
      ftp: 265,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
    ...overrides,
  };
}

function sample(overrides: Partial<RideSample> = {}): RideSample {
  return {
    t: 1,
    distanceM: 8,
    speedKmh: 29,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 139,
    lat: 51.5,
    lon: -0.1,
    eleM: 35,
    ...overrides,
  };
}

function rideSamples(id: string, samples: RideSample[] = [sample()]): RideSamples {
  return { id, updatedAt: ANCIENT, samples };
}

describe('MemoryRepository', () => {
  it('round-trips a record by id', async () => {
    const storage = new MemoryStorage();
    const r = route({ region: 'Test routes' });
    await storage.routes.put(r);

    expect(await storage.routes.get(r.id)).toMatchObject({ id: r.id, name: 'Rolling' });
  });

  it('returns undefined for an id it has never seen', async () => {
    const storage = new MemoryStorage();
    expect(await storage.routes.get(createId())).toBeUndefined();
  });

  it('lists everything put into it', async () => {
    const storage = new MemoryStorage();
    await storage.routes.put(route({ name: 'Rolling' }));
    await storage.routes.put(route({ name: 'Mixed' }));

    expect((await storage.routes.list()).map((r) => r.name)).toEqual(['Rolling', 'Mixed']);
  });

  it('replaces a record with the same id rather than adding a second', async () => {
    const storage = new MemoryStorage();
    const r = route({ name: 'Rolling' });
    await storage.routes.put(r);
    await storage.routes.put({ ...r, name: 'Rolling (revised)' });

    const all = await storage.routes.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('Rolling (revised)');
  });

  it('deletes by id and ignores a delete of something absent', async () => {
    const storage = new MemoryStorage();
    const r = route();
    await storage.routes.put(r);
    await storage.routes.delete(r.id);
    await storage.routes.delete(r.id);

    expect(await storage.routes.list()).toEqual([]);
  });

  it('keeps collections apart', async () => {
    const storage = new MemoryStorage();
    await storage.routes.put(route());
    expect(await storage.rides.list()).toEqual([]);
    expect(await storage.workouts.list()).toEqual([]);
  });

  it('stamps updatedAt on every write, whatever the caller passed', async () => {
    const storage = new MemoryStorage();
    const r = route({ updatedAt: ANCIENT });
    await storage.routes.put(r);

    expect((await storage.routes.get(r.id))?.updatedAt).toBe(NOW);
  });

  it('moves updatedAt forward on a second write', async () => {
    const storage = new MemoryStorage();
    const r = route();
    await storage.routes.put(r);

    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'));
    await storage.routes.put(r);

    expect((await storage.routes.get(r.id))?.updatedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('keeps the client-generated id exactly as given', async () => {
    const storage = new MemoryStorage();
    const id = createId();
    await storage.routes.put(route({ id }));

    expect((await storage.routes.list())[0]?.id).toBe(id);
  });

  it('does not let a caller mutate stored state through the object it wrote', async () => {
    const storage = new MemoryStorage();
    const r = ride();
    const s = rideSamples(r.id);
    await storage.rides.put(r);
    await storage.rideSamples.put(s);

    r.distanceM = 999_999;
    r.settings.ftp = 1;
    s.samples[0]!.powerW = 999;

    const stored = await storage.rides.get(r.id);
    expect(stored?.distanceM).toBe(500);
    expect(stored?.settings.ftp).toBe(265);
    expect((await storage.rideSamples.get(r.id))?.samples[0]?.powerW).toBe(200);
  });

  it('does not let a caller mutate stored state through a record it read', async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);
    await storage.rideSamples.put(rideSamples(r.id));

    const first = await storage.rides.get(r.id);
    first!.distanceM = 999_999;
    first!.settings.hrMax = 1;
    const firstSamples = await storage.rideSamples.get(r.id);
    firstSamples!.samples[0]!.powerW = 999;

    const second = await storage.rides.get(r.id);
    expect(second?.distanceM).toBe(500);
    expect(second?.settings.hrMax).toBe(190);
    expect((await storage.rideSamples.get(r.id))?.samples[0]?.powerW).toBe(200);
  });

  it('does not let a caller mutate stored state through list()', async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);

    (await storage.rides.list())[0]!.ascentM = 999;

    expect((await storage.rides.list())[0]?.ascentM).toBe(12);
  });
});

describe('rides and their samples', () => {
  it('keeps the aggregates free of samples, so a history list stays small', async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);
    await storage.rideSamples.put(rideSamples(r.id, [sample(), sample({ t: 2 })]));

    const listed = (await storage.rides.list())[0];
    expect(listed).not.toHaveProperty('samples');
    expect(JSON.stringify(listed)).not.toContain('cadenceRpm');
  });

  it("fetches a ride's samples by the ride id", async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);
    await storage.rideSamples.put(rideSamples(r.id, [sample({ t: 1 }), sample({ t: 2 })]));

    expect((await storage.rideSamples.get(r.id))?.samples.map((s) => s.t)).toEqual([1, 2]);
  });

  it('records moving time and paused time separately', async () => {
    const storage = new MemoryStorage();
    const r = ride({ elapsedS: 3600, pausedS: 240 });
    await storage.rides.put(r);

    const stored = await storage.rides.get(r.id);
    expect(stored?.elapsedS).toBe(3600);
    expect(stored?.pausedS).toBe(240);
  });

  it('freezes the settings that produced the ride', async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);
    // The rider raises their FTP afterwards; the ride must not be re-zoned.
    await storage.settings.put({ ftp: 300 });

    expect((await storage.rides.get(r.id))?.settings.ftp).toBe(265);
  });

  it("deletes a ride's samples with the ride", async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);
    await storage.rideSamples.put(rideSamples(r.id));

    await storage.rides.delete(r.id);

    expect(await storage.rides.get(r.id)).toBeUndefined();
    expect(await storage.rideSamples.get(r.id)).toBeUndefined();
    expect(await storage.rideSamples.list()).toEqual([]);
  });

  it("leaves other rides' samples alone", async () => {
    const storage = new MemoryStorage();
    const kept = ride();
    const doomed = ride();
    await storage.rides.put(kept);
    await storage.rides.put(doomed);
    await storage.rideSamples.put(rideSamples(kept.id));
    await storage.rideSamples.put(rideSamples(doomed.id));

    await storage.rides.delete(doomed.id);

    expect((await storage.rideSamples.list()).map((s) => s.id)).toEqual([kept.id]);
  });

  it('deleting a ride that was never sampled is not an error', async () => {
    const storage = new MemoryStorage();
    const r = ride();
    await storage.rides.put(r);

    await expect(storage.rides.delete(r.id)).resolves.toBeUndefined();
  });
});

describe('MemoryStorage', () => {
  it('carries its own settings, defaulted until something is written', async () => {
    const storage = new MemoryStorage();
    expect((await storage.settings.get()).ftp).toBe(200);

    await storage.settings.put({ ftp: 265 });
    expect((await storage.settings.get()).ftp).toBe(265);
  });

  it('gives each instance its own state, so tests cannot leak into each other', async () => {
    const a = new MemoryStorage();
    const b = new MemoryStorage();
    await a.routes.put(route());

    expect(await b.routes.list()).toEqual([]);
  });
});

describe('createId', () => {
  it('mints a v4 UUID', () => {
    expect(createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not repeat itself', () => {
    expect(createId()).not.toBe(createId());
  });
});
