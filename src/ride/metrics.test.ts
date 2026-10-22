import { describe, expect, it, vi } from 'vitest';

import { MemoryStorage } from '../storage/memory';
import type { Ride, RideSample, RideSettings } from '../storage/types';
import { backfillRides, lapSplits, rideTss } from './metrics';

const SETTINGS: RideSettings = {
  trainerDifficulty: 60,
  workoutScalePct: 100,
  ergMode: 'erg',
  ftp: 250,
  hrMax: 186,
  riderMassKg: 75,
  bikeMassKg: 9,
};

function sample(patch: Partial<RideSample> & { t: number }): RideSample {
  return {
    distanceM: 0,
    speedKmh: 30,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 140,
    lat: null,
    lon: null,
    eleM: null,
    ...patch,
  };
}

/** A ride at a steady speed, one sample a second, which is what the engine emits. */
function ridden(seconds: number, metresPerSecond: number, powerW: number | null = 200) {
  const samples: RideSample[] = [];
  for (let t = 0; t <= seconds; t += 1) {
    samples.push(sample({ t, distanceM: t * metresPerSecond, powerW }));
  }
  return samples;
}

const LAP_M = 1000;
/** 12 m/s puts every crossing between two samples rather than on one. */
const SPEED_MS = 12;
const LAP_S = LAP_M / SPEED_MS;

describe('lapSplits', () => {
  it('gives one split per completed lap of a loop, in order', () => {
    // 3.6 laps: three finished, and the fourth still being ridden.
    const splits = lapSplits(ridden(300, SPEED_MS), LAP_M);

    expect(splits).toHaveLength(3);
    for (const split of splits) expect(split).toBeCloseTo(LAP_S, 6);
  });

  it('adds nothing for a lap still being ridden', () => {
    const threeLaps = lapSplits(ridden(250, SPEED_MS), LAP_M);
    const threeLapsAndMost = lapSplits(ridden(330, SPEED_MS), LAP_M);

    expect(threeLaps).toHaveLength(3);
    expect(threeLapsAndMost).toEqual(threeLaps);
  });

  it('gives exactly one split for a point-to-point ridden to its finish', () => {
    // The engine clamps a non-looping ride at the route's length, so the last sample
    // sits exactly on the line rather than past it.
    const samples = [
      sample({ t: 0, distanceM: 0 }),
      sample({ t: 50, distanceM: 600 }),
      sample({ t: 100, distanceM: LAP_M }),
    ];

    expect(lapSplits(samples, LAP_M)).toEqual([100]);
  });

  it('gives nothing for a ride that never completed a length', () => {
    expect(lapSplits(ridden(80, SPEED_MS), LAP_M)).toEqual([]);
  });

  it('gives nothing for a ride with no route under it', () => {
    expect(lapSplits(ridden(300, SPEED_MS), null)).toEqual([]);
    expect(lapSplits([], LAP_M)).toEqual([]);
  });

  it('interpolates the crossing rather than snapping it to the nearer sample', () => {
    const samples = [
      sample({ t: 0, distanceM: 0 }),
      sample({ t: 1, distanceM: 60 }),
      sample({ t: 2, distanceM: 120 }),
    ];

    // 40 of the 60 metres between the two samples, so two thirds of the second.
    const [first] = lapSplits(samples, 100);
    expect(first).toBeCloseTo(1 + 2 / 3, 6);
    expect(first).not.toBe(2);
  });

  it('measures each split from the previous crossing, not from the start', () => {
    // Half speed for the first lap, so two laps that are not the same length of time.
    const samples = [
      ...ridden(100, 10).slice(0, 100),
      ...Array.from({ length: 51 }, (_, i) => sample({ t: 100 + i, distanceM: 1000 + i * 20 })),
    ];

    const splits = lapSplits(samples, LAP_M);
    expect(splits).toHaveLength(2);
    expect(splits[0]).toBeCloseTo(100, 6);
    expect(splits[1]).toBeCloseTo(50, 6);
  });
});

describe('rideTss', () => {
  it('scores an hour at FTP as 100', () => {
    expect(rideTss(ridden(3600, 10, 250), 3600, 250)).toBe(100);
  });

  it('scores a known series against a known FTP', () => {
    // 200 W held steadily is a normalised power of 200: an intensity of 0.8 against an
    // FTP of 250, half an hour of it, so 0.5 x 0.64 x 100.
    expect(rideTss(ridden(1800, 10, 200), 1800, 250)).toBe(32);
  });

  it('is null where the ride recorded no power at all', () => {
    expect(rideTss(ridden(600, 10, null), 600, 250)).toBeNull();
    expect(rideTss([], 0, 250)).toBeNull();
  });

  it('is null rather than infinite where the frozen FTP is unusable', () => {
    expect(rideTss(ridden(600, 10, 200), 600, 0)).toBeNull();
  });
});

/** A ride as an older build wrote it: no tss, no lapSplits. */
function olderRide(samples: readonly RideSample[]): Ride {
  const ride = {
    id: 'older-ride',
    updatedAt: '2026-03-01T08:30:00.000Z',
    routeId: 'test-flat',
    routeName: 'Flat 1 km',
    workoutId: null,
    workoutName: null,
    startedAt: '2026-03-01T07:30:00.000Z',
    elapsedS: samples.length - 1,
    pausedS: 0,
    distanceM: samples[samples.length - 1]?.distanceM ?? 0,
    ascentM: 0,
    avgPowerW: 200,
    avgHeartRateBpm: 140,
    settings: SETTINGS,
  };
  // The fields are required now; a record in the database written before them is not.
  return ride as Ride;
}

async function withOlderRide(samples: readonly RideSample[]): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  await storage.rides.put(olderRide(samples));
  await storage.rideSamples.put({
    id: 'older-ride',
    updatedAt: '2026-03-01T08:30:00.000Z',
    samples: [...samples],
  });
  return storage;
}

describe('the boot backfill', () => {
  it('scores an older ride exactly, from its own samples and frozen FTP', async () => {
    const storage = await withOlderRide(ridden(1800, 10, 200));

    const result = await backfillRides(storage.rides, storage.rideSamples);

    expect(result.written).toEqual(['older-ride']);
    expect((await storage.rides.get('older-ride'))?.tss).toBe(32);
  });

  it('leaves the splits empty rather than recovering them', async () => {
    const storage = await withOlderRide(ridden(300, SPEED_MS));

    await backfillRides(storage.rides, storage.rideSamples);

    expect((await storage.rides.get('older-ride'))?.lapSplits).toEqual([]);
  });

  it('writes nothing on a second boot', async () => {
    const storage = await withOlderRide(ridden(1800, 10, 200));
    await backfillRides(storage.rides, storage.rideSamples);

    const put = vi.spyOn(storage.rides, 'put');
    const again = await backfillRides(storage.rides, storage.rideSamples);

    expect(put).not.toHaveBeenCalled();
    expect(again.unchanged).toEqual(['older-ride']);
  });

  it('does not revisit a ride scored null because it recorded no power', async () => {
    const storage = await withOlderRide(ridden(600, 10, null));
    const first = await backfillRides(storage.rides, storage.rideSamples);
    const second = await backfillRides(storage.rides, storage.rideSamples);

    expect(first.written).toEqual(['older-ride']);
    expect((await storage.rides.get('older-ride'))?.tss).toBeNull();
    expect(second.written).toEqual([]);
  });

  it('scores nothing for a ride whose samples have gone', async () => {
    const storage = new MemoryStorage();
    await storage.rides.put(olderRide(ridden(600, 10, 200)));

    await backfillRides(storage.rides, storage.rideSamples);

    expect((await storage.rides.get('older-ride'))?.tss).toBeNull();
  });
});
