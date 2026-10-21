import { describe, expect, it, vi } from 'vitest';

import { ExperimentStore, RideStore } from './store';

describe('RideStore', () => {
  it('returns the same snapshot reference until something changes', () => {
    const store = new RideStore();
    // A fresh object per call is what makes useSyncExternalStore loop forever.
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('keeps subscribe and getSnapshot identities stable across reads', () => {
    const store = new RideStore();
    // React resubscribes on every commit if these change identity.
    expect(store.subscribe).toBe(store.subscribe);
    expect(store.getSnapshot).toBe(store.getSnapshot);
  });

  it('publishes a new frozen snapshot and notifies when a value changes', () => {
    const store = new RideStore();
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ powerW: 250 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().powerW).toBe(250);
    expect(Object.isFrozen(store.getSnapshot())).toBe(true);
    expect(before.powerW).toBeNull();
  });

  it('does not republish or notify when a patch changes nothing', () => {
    const store = new RideStore();
    store.update({ powerW: 250 });
    const published = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ powerW: 250 });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(published);
  });

  it('clears a reading to null rather than holding a stale value', () => {
    const store = new RideStore();
    store.update({ powerW: 250 });
    store.update({ powerW: null });
    // Absent and zero are different readings; a stale 250 would be a silent lie.
    expect(store.getSnapshot().powerW).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const store = new RideStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update({ cadenceRpm: 90 });
    unsubscribe();
    store.update({ cadenceRpm: 95 });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('applies several fields in one patch as a single publish', () => {
    const store = new RideStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ powerW: 200, cadenceRpm: 88, heartRateBpm: 142 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ powerW: 200, cadenceRpm: 88, heartRateBpm: 142 });
  });

  it('resets to initial values and notifies', () => {
    const store = new RideStore();
    store.update({ powerW: 250, alert: { level: 'fault', message: 'boom' } });
    const listener = vi.fn();
    store.subscribe(listener);

    store.reset();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().powerW).toBeNull();
    expect(store.getSnapshot().alert).toBeNull();
  });

  it('starts idle with no route and the default difficulty', () => {
    const snapshot = new RideStore().getSnapshot();
    expect(snapshot.state).toBe('idle');
    expect(snapshot.routeId).toBeNull();
    expect(snapshot.routeTotalDistanceM).toBeNull();
    expect(snapshot.trainerDifficulty).toBe(50);
    expect(snapshot.displayPowerW).toBeNull();
  });

  it('carries the whole phase 2 ride shape through one patch', () => {
    const store = new RideStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({
      state: 'running',
      elapsedS: 62,
      pausedS: 18.5,
      distanceM: 812.5,
      ascentM: 18.25,
      gradePercent: 4.2,
      avgPowerW: 214,
      speedKmh: 27.4,
      displayPowerW: 208.6,
      routeId: 'test-mixed',
      routeName: 'Test Route 2 — Mixed',
      routeTotalDistanceM: 29937,
      routeTotalAscentM: 699,
      targetPowerW: 240,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({
      state: 'running',
      elapsedS: 62,
      // Moving time and paused time are separate: together they are the time on the bike.
      pausedS: 18.5,
      routeId: 'test-mixed',
      routeTotalAscentM: 699,
      targetPowerW: 240,
    });
  });

  it('republishes when the alert object changes identity', () => {
    const store = new RideStore();
    store.update({ alert: { level: 'warning', message: 'Trainer disconnected' } });
    const first = store.getSnapshot();

    // A new object with the same fields is a new alert as far as the store is
    // concerned; the engine reuses its alert constants, so identity is the signal.
    store.update({ alert: first.alert });
    expect(store.getSnapshot()).toBe(first);

    store.update({ alert: null });
    expect(store.getSnapshot().alert).toBeNull();
  });
});

describe('ExperimentStore', () => {
  it('starts inert, with no run and nothing recorded', () => {
    const snapshot = new ExperimentStore().getSnapshot();
    expect(snapshot.running).toBe(false);
    expect(snapshot.summary).toBeNull();
    expect(snapshot.eventCount).toBe(0);
    expect(snapshot.droppedEvents).toBe(0);
  });

  it('holds the same useSyncExternalStore contract as the ride store', () => {
    const store = new ExperimentStore();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(store.subscribe).toBe(store.subscribe);
    expect(store.getSnapshot).toBe(store.getSnapshot);
  });

  it('publishes once per real change and not at all otherwise', () => {
    const store = new ExperimentStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ running: true, eventCount: 12, visibilityState: 'hidden' });
    expect(listener).toHaveBeenCalledTimes(1);

    store.update({ running: true, eventCount: 12 });
    expect(listener).toHaveBeenCalledTimes(1);

    expect(store.getSnapshot()).toMatchObject({
      running: true,
      eventCount: 12,
      visibilityState: 'hidden',
    });
  });

  it("resets to its own initial values, not the ride store's", () => {
    const store = new ExperimentStore();
    store.update({ running: true, droppedEvents: 7 });
    store.reset();
    expect(store.getSnapshot()).toMatchObject({ running: false, droppedEvents: 0 });
  });
});
