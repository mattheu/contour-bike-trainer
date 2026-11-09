import { scriptPowerW, type FakeScript } from './fake-trainer';
import { createRng, noise } from './rng';
import type { ConnectionState, HeartRateMonitor } from './types';

const TICK_MS = 1000;
const SEED = 0x0a11_bea7;
const NOISE_BPM = 2;

/**
 * The sine the first version of this fake drew: a wave on a three-minute period that knows
 * nothing about effort. Kept for the scripts written against it, which are steady or
 * square enough that a strap following them would read much the same.
 */
const SINE_MIN_BPM = 120;
const SINE_MAX_BPM = 165;
const SINE_PERIOD_S = 180;
const SINE_MID_BPM = (SINE_MIN_BPM + SINE_MAX_BPM) / 2;
const SINE_SWING_BPM = (SINE_MAX_BPM - SINE_MIN_BPM) / 2;

/**
 * Resting, and the ceiling the model may not pass.
 *
 * 190 is the profile's default hrMax, hard-coded because this fake cannot read the
 * profile: it is constructed at module scope in src/ui/services.ts, before settings have
 * come back from storage, and a strap whose series changed when the rider edited a field
 * would stop being the reproducible instrument the other fakes are. Taking the default
 * keeps the beats reported and the zone ladder src/zones/hr.ts draws on one scale, so
 * zone 5 on screen is zone 5 in the model.
 */
const RESTING_BPM = 50;
const HR_MAX_BPM = 190;

/**
 * Steady-state demand: where a held effort eventually settles, before lag and drift.
 *
 * Linear, anchored on the climb — five minutes at about 112 % of the default FTP is a zone
 * 5 effort, and the same line puts a 150 W endurance spin at 137 and a soft pedal at 85.
 *
 * Clamped at hrMax here rather than after the lag, because what bounds a sprint's heart
 * rate is the heart: 900 W asks for everything the rider has, not for four times it. Let
 * the demand run to 570 and a three-second spike would move the trace as far as the climb
 * does, which is the one thing a heart rate trace must never do.
 */
const DEMAND_ANCHOR_W = 225;
const DEMAND_ANCHOR_BPM = 180;
const BPM_PER_WATT = (DEMAND_ANCHOR_BPM - RESTING_BPM) / DEMAND_ANCHOR_W;

/** First-order, and asymmetric: recovery is slower than the effort that caused it. */
const RISE_TAU_S = 30;
const FALL_TAU_S = 60;

/**
 * Cardiac drift: a held effort creeps up a few beats as the rider warms through, which is
 * why the second half of a steady block is never as flat as the first. It unwinds faster
 * than it accumulates, because what accumulated it was the work, and the work has stopped.
 */
const DRIFT_SPAN_BPM = 6;
const DRIFT_RISE_TAU_S = 600;
const DRIFT_FALL_TAU_S = 120;
/** The effort drift is proportional to, saturating at the default FTP. */
const DRIFT_FULL_EFFORT_W = 200;

export interface HeartRateState {
  /** The lagged response to demand, carried without drift so each settles on its own. */
  bpm: number;
  driftBpm: number;
}

export function restingHeartRateState(): HeartRateState {
  return { bpm: RESTING_BPM, driftBpm: 0 };
}

function approach(from: number, to: number, tauS: number, dtS: number): number {
  return from + (to - from) * (1 - Math.exp(-dtS / tauS));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function heartRateDemandBpm(powerW: number, hrMaxBpm: number = HR_MAX_BPM): number {
  return Math.min(hrMaxBpm, RESTING_BPM + Math.max(0, powerW) * BPM_PER_WATT);
}

/** One second of the model. Pure: the state in, the state out, nothing else read. */
export function stepHeartRate(
  state: HeartRateState,
  powerW: number,
  dtS: number,
  hrMaxBpm: number = HR_MAX_BPM,
): HeartRateState {
  const demand = heartRateDemandBpm(powerW, hrMaxBpm);
  const driftDemand = DRIFT_SPAN_BPM * clamp(powerW / DRIFT_FULL_EFFORT_W, 0, 1);
  return {
    bpm: approach(state.bpm, demand, demand > state.bpm ? RISE_TAU_S : FALL_TAU_S, dtS),
    driftBpm: approach(
      state.driftBpm,
      driftDemand,
      driftDemand > state.driftBpm ? DRIFT_RISE_TAU_S : DRIFT_FALL_TAU_S,
      dtS,
    ),
  };
}

/** The beats a state reports, drift included and the ceiling applied. */
export function heartRateBpm(state: HeartRateState, hrMaxBpm: number = HR_MAX_BPM): number {
  return Math.min(hrMaxBpm, state.bpm + state.driftBpm);
}

/**
 * Which scripts the model rides. Only the varied session, whose whole purpose is a heart
 * rate that answers the power above it; the rest keep the sine they were written against.
 */
function followsPower(script: FakeScript): boolean {
  return script === 'varied';
}

/** Software stand-in for a chest strap. Same seeded approach as FakeTrainer. */
export class FakeHeartRateMonitor implements HeartRateMonitor {
  private readonly dataCallbacks = new Set<(bpm: number) => void>();
  private readonly stateCallbacks = new Set<(s: ConnectionState) => void>();
  private state: ConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | null = null;
  private rng = createRng(SEED);
  private elapsedS = 0;
  private readonly speed: number;
  private heart = restingHeartRateState();

  /**
   * The strap reads the script too, rather than subscribing to the trainer: both fakes stay
   * pure functions of the script and their own elapsed second, which is what keeps the
   * series reproducible and the two devices independent the way real ones are.
   */
  constructor(
    private readonly script: FakeScript = 'constant',
    options: { speed?: number } = {},
  ) {
    this.speed = options.speed ?? 1;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.timer !== null) return;
    this.rng = createRng(SEED);
    this.elapsedS = 0;
    this.heart = restingHeartRateState();
    this.setState('connecting');
    this.setState('connected');
    // Faster ticks, each still one simulated second, so ?speed= keeps the sample density.
    this.timer = setInterval(() => this.tick(), TICK_MS / this.speed);
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
    const dtS = TICK_MS / 1000;
    this.elapsedS += dtS;
    for (const cb of this.dataCallbacks) cb(this.reading(dtS));
  }

  private reading(dtS: number): number {
    if (!followsPower(this.script)) {
      // Slow sinusoidal drift across the band plus a little jitter, so it reads as
      // effort rather than a random walk that parks on a limit.
      const drift =
        SINE_MID_BPM + SINE_SWING_BPM * Math.sin((2 * Math.PI * this.elapsedS) / SINE_PERIOD_S);
      return Math.round(clamp(drift + noise(this.rng, NOISE_BPM), SINE_MIN_BPM, SINE_MAX_BPM));
    }

    this.heart = stepHeartRate(this.heart, scriptPowerW(this.script, this.elapsedS), dtS);
    // Jitter on the reading and not on the state: a strap's beat-to-beat scatter must not
    // integrate into the response it is sitting on top of.
    return Math.round(clamp(heartRateBpm(this.heart) + noise(this.rng, NOISE_BPM), 0, HR_MAX_BPM));
  }
}
