import type { Clock, EngineTrainer, TickSource } from './types';

/** The ride samples at 1 Hz, so anything faster than this only costs cycles. */
export const TICK_INTERVAL_MS = 1000;

/**
 * A tick per Indoor Bike Data notification, with a timer behind it.
 *
 * ADR-0000's open question is whether notifications keep arriving in a hidden tab. If
 * they do, this ticks at the trainer's rate and the timer never fires; if they stall,
 * the timer carries the ride at 1 Hz until they come back. The fallback only fires when
 * the stream has actually gone quiet, so a healthy connection produces one tick per
 * notification rather than two.
 */
export class TrainerTickSource implements TickSource {
  private readonly listeners = new Set<() => void>();
  private unsubscribeTrainer: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly trainer: EngineTrainer,
    private readonly clock: Clock,
    private readonly intervalMs: number = TICK_INTERVAL_MS,
  ) {}

  subscribe(onTick: () => void): () => void {
    this.listeners.add(onTick);
    this.attach();
    return () => {
      this.listeners.delete(onTick);
      if (this.listeners.size === 0) this.detach();
    };
  }

  private attach(): void {
    if (this.unsubscribeTrainer !== null) return;
    this.unsubscribeTrainer = this.trainer.onData(() => this.fire());
    this.timer = setInterval(() => {
      // Only when the notification stream has gone quiet: a live one already ticked.
      if (this.clock.now() - this.lastTickAt >= this.intervalMs) this.fire();
    }, this.intervalMs);
  }

  private detach(): void {
    this.unsubscribeTrainer?.();
    this.unsubscribeTrainer = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private fire(): void {
    this.lastTickAt = this.clock.now();
    for (const listener of [...this.listeners]) listener();
  }
}

/** A plain interval. The fallback shape, and what an Electron shell would use alone. */
export class TimerTickSource implements TickSource {
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly intervalMs: number = TICK_INTERVAL_MS) {}

  subscribe(onTick: () => void): () => void {
    this.listeners.add(onTick);
    if (this.timer === null) {
      this.timer = setInterval(() => {
        for (const listener of [...this.listeners]) listener();
      }, this.intervalMs);
    }
    return () => {
      this.listeners.delete(onTick);
      if (this.listeners.size === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }
}

/** Driven by hand. This is what lets a test ride forty minutes in milliseconds. */
export class ManualTickSource implements TickSource {
  private readonly listeners = new Set<() => void>();

  subscribe(onTick: () => void): () => void {
    this.listeners.add(onTick);
    return () => this.listeners.delete(onTick);
  }

  tick(): void {
    for (const listener of [...this.listeners]) listener();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
