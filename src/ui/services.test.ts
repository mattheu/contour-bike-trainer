import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHECKPOINT_INTERVAL_S } from '../ride/autosave';

const SESSION = { mode: 'guest', startedAt: '2026-03-01T07:30:00.000Z' };

/**
 * Boots the wiring module the way the browser does, against in-memory storage and a fake
 * trainer. Everything below the UI is constructed at module scope, so a fresh module graph
 * per test is what gives each one its own storage, store and ride.
 *
 * Real timers while it loads, fake ones for the riding: the ride's tick interval is created
 * when the engine subscribes, so a test has to be holding the clock before that happens.
 */
async function boot(seed: Record<string, unknown> = { session: SESSION }) {
  vi.resetModules();
  vi.stubGlobal('window', {
    location: { search: '?storage=memory&fake=constant' },
    addEventListener: () => {},
    removeEventListener: () => {},
    __contourSeed: seed,
  });
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
  vi.stubGlobal('navigator', {});

  const services = await import('./services');
  const { rideStore } = await import('./store');
  await services.ready;
  return { services, rideStore };
}

/** Rides a bundled route for a number of seconds, which the fake trainer ticks out. */
async function ride(services: Awaited<ReturnType<typeof boot>>['services'], seconds: number) {
  const [route] = await services.storage.routes.list();
  vi.useFakeTimers();
  await services.connectTrainer();
  await services.startRide(route!.id);
  services.beginRide();
  await vi.advanceTimersByTimeAsync(seconds * 1000);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('autosave during a ride', () => {
  it('checkpoints the ride and marks it live without touching the summary', async () => {
    const { services, rideStore } = await boot();

    await ride(services, CHECKPOINT_INTERVAL_S * 2 + 5);

    const [stored] = await services.storage.rides.list();
    expect(stored?.elapsedS).toBe(CHECKPOINT_INTERVAL_S * 2);
    expect((await services.storage.session.get())?.liveRideId).toBe(stored?.id);
    // The summary screen is driven by this and must not open mid-ride.
    expect(rideStore.getSnapshot().savedRideId).toBeNull();
  });

  it('publishes the saved id exactly once, however often the ride is ended', async () => {
    const { services, rideStore } = await boot();
    await ride(services, CHECKPOINT_INTERVAL_S * 2);

    const published: (string | null)[] = [];
    rideStore.subscribe(() => published.push(rideStore.getSnapshot().savedRideId));
    const write = vi.spyOn(services.storage.rideSamples, 'put');

    const first = await services.endRide();
    const second = await services.endRide();

    expect(first).toEqual({ status: 'saved', rideId: expect.any(String) });
    expect(second).toEqual(first);
    expect(published.filter((id) => id !== null)).toHaveLength(1);
    // One save behind both calls, not one per call: the second gets the memoised promise.
    expect(write).toHaveBeenCalledTimes(1);
    expect(await services.storage.rides.list()).toHaveLength(1);
  });

  it('clears the live-ride marker once the ride is saved', async () => {
    const { services } = await boot();
    await ride(services, CHECKPOINT_INTERVAL_S);

    await services.endRide();

    expect((await services.storage.session.get())?.liveRideId).toBeUndefined();
    expect(services.currentSession()?.liveRideId).toBeUndefined();
  });

  it('says nothing to the rider when a checkpoint fails', async () => {
    const { services, rideStore } = await boot();
    const put = vi
      .spyOn(services.storage.rides, 'put')
      .mockRejectedValue(new Error('quota exceeded'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await ride(services, CHECKPOINT_INTERVAL_S * 2);

    expect(put).toHaveBeenCalled();
    // A fault strip mid-climb over something the rider cannot act on.
    expect(rideStore.getSnapshot().alert).toBeNull();

    // And the ride is still being recorded, so the end of it saves normally.
    put.mockRestore();
    expect(await services.endRide()).toEqual({ status: 'saved', rideId: expect.any(String) });
    expect(rideStore.getSnapshot().alert).toBeNull();
  });

  it('leaves nothing behind when a ride is discarded', async () => {
    const { services } = await boot();
    const [route] = await services.storage.routes.list();
    await services.startRide(route!.id);

    // Chosen and ended without ever being started: nothing was ridden, so nothing is kept.
    expect(await services.endRide()).toEqual({ status: 'discarded' });
    expect(await services.storage.rides.list()).toEqual([]);
    expect((await services.storage.session.get())?.liveRideId).toBeUndefined();
  });
});

describe('booting after a crash mid-ride', () => {
  it('clears the marker and leaves the part-written ride in the history', async () => {
    const { services } = await boot({
      session: { ...SESSION, liveRideId: 'the-ride-that-did-not-finish' },
    });

    expect(services.currentSession()).toEqual(SESSION);
    expect((await services.storage.session.get())?.liveRideId).toBeUndefined();
  });

  it('leaves an ordinary session alone', async () => {
    const { services } = await boot();

    expect(services.currentSession()).toEqual(SESSION);
  });
});
