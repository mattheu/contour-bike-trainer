import { createRng, noise } from './rng';
import type { ConnectionState, HeartRateMonitor } from './types';

const TICK_MS = 1000;
const SEED = 0x0a11_bea7;
const MIN_BPM = 120;
const MAX_BPM = 165;
const DRIFT_PERIOD_S = 180;
const NOISE_BPM = 2;

const MID_BPM = (MIN_BPM + MAX_BPM) / 2;
const SWING_BPM = (MAX_BPM - MIN_BPM) / 2;

/** Software stand-in for a chest strap. Same seeded approach as FakeTrainer. */
export class FakeHeartRateMonitor implements HeartRateMonitor {
  private readonly dataCallbacks = new Set<(bpm: number) => void>();
  private readonly stateCallbacks = new Set<(s: ConnectionState) => void>();
  private state: ConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | null = null;
  private rng = createRng(SEED);
  private elapsedS = 0;

  get connectionState(): ConnectionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.timer !== null) return;
    this.rng = createRng(SEED);
    this.elapsedS = 0;
    this.setState('connecting');
    this.setState('connected');
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  async disconnect(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setState('disconnected');
  }

  onData(cb: (bpm: number) => void): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  private setState(next: ConnectionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const cb of this.stateCallbacks) cb(next);
  }

  private tick(): void {
    this.elapsedS += TICK_MS / 1000;
    // Slow sinusoidal drift across the band plus a little jitter, so it reads as
    // effort rather than a random walk that parks on a limit.
    const drift = MID_BPM + SWING_BPM * Math.sin((2 * Math.PI * this.elapsedS) / DRIFT_PERIOD_S);
    const bpm = Math.round(
      Math.min(MAX_BPM, Math.max(MIN_BPM, drift + noise(this.rng, NOISE_BPM))),
    );
    for (const cb of this.dataCallbacks) cb(bpm);
  }
}
