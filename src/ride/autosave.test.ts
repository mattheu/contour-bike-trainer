import { describe, expect, it, vi } from 'vitest';

import type { BikeData, ConnectionState } from '../ble/types';
import { MemoryStorage } from '../storage/memory';
import { guestSession } from '../storage/session';
import { CHECKPOINT_INTERVAL_S, RideCheckpointer, setLiveRide, writeRide } from './autosave';
import { createManualClock } from './clock';
import { RideEngine } from './engine';
import { RideRecorder } from './recorder';
import { ManualTickSource } from './tick';
import type { EngineTrainer } from './types';

const RIDER = { riderMassKg: 75, bikeMassKg: 9, cda: 0.32, crr: 0.004 };
const STARTED_AT = '2026-03-01T07:30:00.000Z';

/** The least of a trainer the engine needs, plus a way to push power at it. */
class TestTrainer implements EngineTrainer {
  private readonly callbacks = new Set<(d: BikeData) => void>();

  onData(cb: (d: BikeData) => void): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  onStateChange(_cb: (s: ConnectionState) => void): () => void {
    return () => {};
  }

  async setGrade(): Promise<void> {}
  async setTargetPower(): Promise<void> {}

  emit(powerW: number): void {
    for (const cb of this.callbacks) cb({ receivedAt: 0, powerW });
  }
}

/**
 * A checkpoint is fired and forgotten by design, so nothing in the sample stream waits on
 * it. A macrotask is the shortest wait that is certain to have drained one.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A ride, wired the way services.ts wires one: the engine's samples reach the recorder and
 * the checkpointer through the same callback, so the cadence here is the shipped cadence.
 */
async function harness(storage: MemoryStorage = new MemoryStorage()) {
  await storage.session.put(guestSession(new Date(STARTED_AT)));

  const clock = createManualClock(1_000);
  const ticks = new ManualTickSource();
  const trainer = new TestTrainer();

  const recorder = new RideRecorder({
    routeId: null,
    routeName: null,
    startedAt: STARTED_AT,
    settings: { trainerDifficulty: 50, ftp: 240, hrMax: 186, riderMassKg: 75, bikeMassKg: 9 },
  });

  const engine = new RideEngine({
    trainer,
    clock,
    tickSource: ticks,
    route: null,
    settings: { trainerDifficulty: 50, gradeLookaheadM: 30, rider: RIDER },
  });

  const failures: unknown[] = [];
  const checkpointer = new RideCheckpointer({
    storage,
    recorder,
    progress: () => engine.getSnapshot(),
    onFailure: (error) => failures.push(error),
  });

  engine.onSample((sample) => {
    recorder.add(sample);
    checkpointer.onSample(sample.t);
  });

  trainer.emit(200);
  engine.start();

  /** Rides a number of seconds, one tick each, letting any checkpoint they start finish. */
  const ride = async (seconds: number): Promise<void> => {
    for (let i = 0; i < seconds; i += 1) {
      clock.advance(1);
      ticks.tick();
      await settle();
    }
  };

  return { storage, engine, recorder, checkpointer, failures, clock, ticks, ride };
}

describe('a checkpoint', () => {
  it('puts a readable ride in the history before the rider has finished', async () => {
    const { storage, recorder, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S);

    const stored = await storage.rides.get(recorder.id);
    expect(stored?.elapsedS).toBe(CHECKPOINT_INTERVAL_S);
    expect(stored?.avgPowerW).toBe(200);
    expect(stored?.distanceM).toBeGreaterThan(0);
    // The same series the ride would have been saved with, not a fragment of one.
    const samples = await storage.rideSamples.get(recorder.id);
    expect(samples?.samples).toHaveLength(recorder.sampleCount);
    expect(samples?.samples.at(-1)?.t).toBe(CHECKPOINT_INTERVAL_S);
  });

  it('writes the record the final save would have written, under the same id', async () => {
    const { storage, engine, recorder, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S);
    const checkpointed = await storage.rides.get(recorder.id);

    const finalId = await writeRide(storage, recorder, engine.getSnapshot());
    const finished = await storage.rides.get(recorder.id);

    expect(finalId).toBe(recorder.id);
    // Everything but updatedAt, which the repository restamps on every write by contract.
    expect({ ...finished, updatedAt: '' }).toEqual({ ...checkpointed, updatedAt: '' });
  });

  it('overwrites the previous checkpoint rather than adding a ride per interval', async () => {
    const { storage, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S * 3);

    expect(await storage.rides.list()).toHaveLength(1);
  });
});

describe('the checkpoint cadence', () => {
  it('writes nothing until the first interval of ride time has been ridden', async () => {
    const { storage, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S - 1);

    expect(await storage.rides.list()).toEqual([]);
  });

  it('writes once per interval of ride time', async () => {
    const storage = new MemoryStorage();
    const put = vi.spyOn(storage.rides, 'put');
    const { ride } = await harness(storage);

    await ride(CHECKPOINT_INTERVAL_S * 3);

    expect(put).toHaveBeenCalledTimes(3);
  });

  it('writes nothing while the ride is paused, however long the pause lasts', async () => {
    const storage = new MemoryStorage();
    const put = vi.spyOn(storage.rides, 'put');
    const { engine, clock, ticks, ride } = await harness(storage);

    await ride(CHECKPOINT_INTERVAL_S);
    expect(put).toHaveBeenCalledTimes(1);

    // Ten minutes of wall clock, which a timer-driven autosave would have spent rewriting
    // the same array twenty times over.
    engine.pause();
    for (let i = 0; i < 600; i += 1) {
      clock.advance(1);
      ticks.tick();
      await settle();
    }

    expect(put).toHaveBeenCalledTimes(1);
  });

  it('picks the cadence back up from where the ride resumes', async () => {
    const storage = new MemoryStorage();
    const put = vi.spyOn(storage.rides, 'put');
    const { engine, clock, ticks, ride } = await harness(storage);

    await ride(CHECKPOINT_INTERVAL_S);
    engine.pause();
    clock.advance(300);
    ticks.tick();
    engine.resume();
    await ride(CHECKPOINT_INTERVAL_S);

    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe('overlapping checkpoints', () => {
  it('skips a checkpoint while one is still in flight rather than queueing it', async () => {
    const storage = new MemoryStorage();
    const realPut = storage.rides.put.bind(storage.rides);
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const put = vi.spyOn(storage.rides, 'put').mockImplementation(() => held);

    const { ride } = await harness(storage);
    await ride(CHECKPOINT_INTERVAL_S * 3);

    // Three intervals ridden, one write started: the other two found it in flight and
    // left it alone, because it already held all but a second or two of what they held.
    expect(put).toHaveBeenCalledTimes(1);

    release();
    await settle();
    put.mockImplementation(realPut);
    await ride(1);

    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe('a failing checkpoint', () => {
  it('reports the failure instead of raising it, and the ride carries on', async () => {
    const storage = new MemoryStorage();
    const put = vi.spyOn(storage.rides, 'put').mockRejectedValueOnce(new Error('quota exceeded'));

    const { recorder, failures, ride } = await harness(storage);
    await ride(CHECKPOINT_INTERVAL_S * 2);

    expect(failures).toHaveLength(1);
    expect((failures[0] as Error).message).toBe('quota exceeded');
    // The sample stream never noticed, and the next checkpoint landed.
    expect(recorder.elapsedS).toBe(CHECKPOINT_INTERVAL_S * 2);
    expect(put).toHaveBeenCalledTimes(2);
    expect(await storage.rides.get(recorder.id)).toBeDefined();
  });

  it('leaves no marker behind, so a failed first checkpoint is not read as a crash', async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage.rides, 'put').mockRejectedValue(new Error('quota exceeded'));

    const { ride } = await harness(storage);
    await ride(CHECKPOINT_INTERVAL_S);

    expect((await storage.session.get())?.liveRideId).toBeUndefined();
  });
});

describe('the live-ride marker', () => {
  it('is absent until a checkpoint has actually landed', async () => {
    const { storage, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S - 1);

    expect((await storage.session.get())?.liveRideId).toBeUndefined();
  });

  it('names the ride being written once the first checkpoint lands', async () => {
    const { storage, recorder, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S);

    expect((await storage.session.get())?.liveRideId).toBe(recorder.id);
  });

  it('is written once rather than on every checkpoint', async () => {
    const storage = new MemoryStorage();
    const { ride } = await harness(storage);
    const put = vi.spyOn(storage.session, 'put');

    await ride(CHECKPOINT_INTERVAL_S * 3);

    expect(put).toHaveBeenCalledTimes(1);
  });

  it('leaves the rest of the session alone when it is cleared', async () => {
    const { storage, ride } = await harness();
    await ride(CHECKPOINT_INTERVAL_S);

    await setLiveRide(storage.session, null);

    expect(await storage.session.get()).toEqual({ mode: 'guest', startedAt: STARTED_AT });
  });

  it('is nothing to write where there is no session to write it on', async () => {
    const storage = new MemoryStorage();
    expect(await setLiveRide(storage.session, 'a-ride')).toBeNull();
    expect(await storage.session.get()).toBeNull();
  });
});

describe('a ride discarded after it was checkpointed', () => {
  it('leaves neither the ride, its samples nor the marker behind', async () => {
    const { storage, recorder, checkpointer, ride } = await harness();
    await ride(CHECKPOINT_INTERVAL_S);
    expect(checkpointer.written).toBe(true);

    // What services.ts does on the discard path. Deleting the ride is expected to take
    // the samples with it, which is the whole reason it is one call and not two.
    await storage.rides.delete(recorder.id);
    await setLiveRide(storage.session, null);

    expect(await storage.rides.list()).toEqual([]);
    expect(await storage.rideSamples.get(recorder.id)).toBeUndefined();
    expect((await storage.session.get())?.liveRideId).toBeUndefined();
  });

  it('knows there is nothing to undo when no checkpoint was ever written', async () => {
    const { checkpointer, ride } = await harness();

    await ride(CHECKPOINT_INTERVAL_S - 1);

    expect(checkpointer.written).toBe(false);
  });
});
