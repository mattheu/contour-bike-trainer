import { createRng, noise } from './rng';
import type { BikeData, ConnectionState, Trainer } from './types';

export type FakeScript = 'constant' | 'ramp' | 'intervals' | 'dropout';

export const FAKE_SCRIPTS: readonly FakeScript[] = ['constant', 'ramp', 'intervals', 'dropout'];

export function isFakeScript(value: string): value is FakeScript {
  return (FAKE_SCRIPTS as readonly string[]).includes(value);
}

const TICK_MS = 1000;
const SEED = 0x5eed_c0de;
const BASE_CADENCE_RPM = 85;
const POWER_NOISE_FRACTION = 0.03;
const CADENCE_NOISE_RPM = 2;

const RAMP_PERIOD_S = 300;
const RAMP_MIN_W = 100;
const RAMP_MAX_W = 350;
const INTERVAL_STEP_S = 120;
const INTERVAL_LOW_W = 120;
const INTERVAL_HIGH_W = 280;
const DROPOUT_START_S = 30;
const DROPOUT_END_S = 45;

// One-second time constant, so ERG is ~95% of the way to target after three ticks.
const ERG_ALPHA = 1 - Math.exp(-1);

// Crude drag-only inverse of P = 0.5·rho·CdA·v³/eta. No rolling resistance, no
// grade — real physics lands in phase 2.
const DRAG_K = (1.225 * 0.32) / (2 * 0.97);

function scriptPowerW(script: FakeScript, elapsedS: number): number {
  switch (script) {
    case 'ramp': {
      const phase = (elapsedS % RAMP_PERIOD_S) / RAMP_PERIOD_S;
      return RAMP_MIN_W + (RAMP_MAX_W - RAMP_MIN_W) * phase;
    }
    case 'intervals':
      return elapsedS % (INTERVAL_STEP_S * 2) < INTERVAL_STEP_S ? INTERVAL_LOW_W : INTERVAL_HIGH_W;
    case 'constant':
    case 'dropout':
      return 200;
  }
}

function speedKmhFromPower(powerW: number): number {
  return powerW <= 0 ? 0 : 3.6 * Math.cbrt(powerW / DRAG_K);
}

/**
 * Software stand-in for a trainer. Selected with ?fake=<script>; nothing above the
 * Trainer interface knows which implementation it has.
 */
export class FakeTrainer implements Trainer {
  private readonly dataCallbacks = new Set<(d: BikeData) => void>();
  private readonly stateCallbacks = new Set<(s: ConnectionState) => void>();
  private state: ConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | null = null;
  private rng = createRng(SEED);
  private elapsedS = 0;
  private reportedPowerW: number | null = null;
  private targetPowerW: number | null = null;
  private gradePercent = 0;
  /** Set by forceDropout(); overrides the script's own silent window. */
  private forcedSilent = false;

  constructor(private readonly script: FakeScript = 'constant') {}

  /** Last value passed to setTargetPower, or null if ERG was never commanded. */
  get lastTargetPowerW(): number | null {
    return this.targetPowerW;
  }

  /** Last value passed to setGrade. Recorded only; it does not affect reported power. */
  get lastGradePercent(): number {
    return this.gradePercent;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.timer !== null) return;
    this.rng = createRng(SEED);
    this.elapsedS = 0;
    this.reportedPowerW = null;
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

  onData(cb: (d: BikeData) => void): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  /**
   * Go silent until forceReconnect(), whatever the script says.
   *
   * The `dropout` script's window is measured from connect, which was fine when choosing
   * a route started the ride immediately. It no longer is: the rider now connects from
   * the settings panel and presses Start when they are ready, so that window can elapse
   * before the ride begins. A test that waits on wall-clock timing to reach the
   * interesting state is slow and fragile; this makes the drop an event it can cause.
   */
  forceDropout(): void {
    this.forcedSilent = true;
  }

  forceReconnect(): void {
    this.forcedSilent = false;
  }

  async setTargetPower(watts: number): Promise<void> {
    this.targetPowerW = watts;
  }

  async setGrade(percent: number): Promise<void> {
    this.gradePercent = percent;
    // Simulation parameters supersede a target power on real FTMS hardware, so leaving
    // an ERG target set here would pin the fake to it after a switch back to simulation.
    this.targetPowerW = null;
  }

  private setState(next: ConnectionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const cb of this.stateCallbacks) cb(next);
  }

  private tick(): void {
    this.elapsedS += TICK_MS / 1000;

    if (this.forcedSilent) {
      this.setState('reconnecting');
      return;
    }

    if (this.script === 'dropout') {
      const silent = this.elapsedS >= DROPOUT_START_S && this.elapsedS < DROPOUT_END_S;
      if (silent) {
        this.setState('reconnecting');
        return;
      }
    }

    // Reaching here means a packet is about to go out, so the link is up whatever took
    // it down. Setting this inside the dropout branch left a forced reconnect on any
    // other script stuck reporting 'reconnecting' for ever.
    this.setState('connected');

    const base = scriptPowerW(this.script, this.elapsedS);
    if (this.targetPowerW === null || this.reportedPowerW === null) {
      this.reportedPowerW = this.targetPowerW ?? base;
    } else {
      // ERG: converge toward the commanded target rather than ignoring it.
      this.reportedPowerW += (this.targetPowerW - this.reportedPowerW) * ERG_ALPHA;
    }

    const powerW = Math.max(
      0,
      Math.round(this.reportedPowerW * (1 + noise(this.rng, POWER_NOISE_FRACTION))),
    );
    const cadenceRpm = Math.max(
      0,
      Math.round(BASE_CADENCE_RPM + noise(this.rng, CADENCE_NOISE_RPM)),
    );

    const sample: BikeData = {
      powerW,
      cadenceRpm,
      speedKmh: Number(speedKmhFromPower(powerW).toFixed(2)),
      receivedAt: performance.now(),
    };
    for (const cb of this.dataCallbacks) cb(sample);
  }
}
