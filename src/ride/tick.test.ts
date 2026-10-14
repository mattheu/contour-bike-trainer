import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BikeData, ConnectionState } from '../ble/types';
import { createManualClock } from './clock';
import { ManualTickSource, TimerTickSource, TrainerTickSource } from './tick';
import type { EngineTrainer } from './types';

class NotifyingTrainer implements EngineTrainer {
  private readonly dataCallbacks = new Set<(d: BikeData) => void>();

  onData(cb: (d: BikeData) => void): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStateChange(_cb: (s: ConnectionState) => void): () => void {
    return () => {};
  }

  async setGrade(): Promise<void> {}

  async setTargetPower(): Promise<void> {}

  notify(): void {
    for (const cb of this.dataCallbacks) cb({ powerW: 200, receivedAt: 0 });
  }

  get subscriberCount(): number {
    return this.dataCallbacks.size;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TrainerTickSource', () => {
  it('ticks once per Indoor Bike Data notification', () => {
    vi.useFakeTimers();
    const trainer = new NotifyingTrainer();
    const source = new TrainerTickSource(trainer, createManualClock());
    const tick = vi.fn();
    source.subscribe(tick);

    trainer.notify();
    trainer.notify();

    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('does not double up when notifications are arriving', () => {
    vi.useFakeTimers();
    const clock = createManualClock();
    const trainer = new NotifyingTrainer();
    const source = new TrainerTickSource(trainer, clock, 1000);
    const tick = vi.fn();
    source.subscribe(tick);

    // A notification every second: the fallback timer must stay out of the way.
    for (let i = 0; i < 5; i += 1) {
      clock.advance(1);
      trainer.notify();
      vi.advanceTimersByTime(1000);
    }

    expect(tick).toHaveBeenCalledTimes(5);
  });

  it('carries the ride on the timer when notifications stop', () => {
    // ADR-0000's open question: if a hidden tab stops delivering notifications, the
    // ride has to keep moving rather than stall silently.
    vi.useFakeTimers();
    const clock = createManualClock();
    const trainer = new NotifyingTrainer();
    const source = new TrainerTickSource(trainer, clock, 1000);
    const tick = vi.fn();
    source.subscribe(tick);

    trainer.notify();
    expect(tick).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i += 1) {
      clock.advance(1);
      vi.advanceTimersByTime(1000);
    }

    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('releases the trainer subscription and the timer on the last unsubscribe', () => {
    vi.useFakeTimers();
    const trainer = new NotifyingTrainer();
    const source = new TrainerTickSource(trainer, createManualClock());
    const off = source.subscribe(vi.fn());
    expect(trainer.subscriberCount).toBe(1);

    off();

    expect(trainer.subscriberCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('TimerTickSource', () => {
  it('ticks on its interval and stops when nobody is listening', () => {
    vi.useFakeTimers();
    const source = new TimerTickSource(1000);
    const tick = vi.fn();
    const off = source.subscribe(tick);

    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);

    off();
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ManualTickSource', () => {
  it('drives every listener and tracks them, so a test can ride in a loop', () => {
    const source = new ManualTickSource();
    const tick = vi.fn();
    const off = source.subscribe(tick);

    source.tick();
    source.tick();
    expect(tick).toHaveBeenCalledTimes(2);
    expect(source.listenerCount).toBe(1);

    off();
    source.tick();
    expect(tick).toHaveBeenCalledTimes(2);
    expect(source.listenerCount).toBe(0);
  });
});
