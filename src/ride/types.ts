import type { BikeData, ConnectionState } from '../ble/types';

/**
 * Injected rather than read from Date.now(), so a test can run forty minutes of riding
 * in milliseconds and so the engine never depends on wall-clock time. ADR-0000.
 */
export interface Clock {
  /** Milliseconds, monotonic. Only differences are meaningful. */
  now(): number;
}

export type RideState = 'idle' | 'running' | 'paused' | 'finished';

/** design/DESIGN.md > Alerts. Info clears itself, warning stays, fault blocks the ride. */
export type AlertLevel = 'info' | 'warning' | 'fault';

export interface AlertState {
  level: AlertLevel;
  message: string;
}

/**
 * What drives a tick is an open question until ADR-0000 is accepted — notifications, a
 * timer, or neither under Electron. Keeping it an interface means the engine is written
 * once whichever wins, and tests drive it by hand.
 */
export interface TickSource {
  subscribe(onTick: () => void): () => void;
}

/**
 * The slice of Trainer the engine uses. Narrower than the full interface on purpose:
 * services.ts passes a wrapper whose writes go through the instrumented, throttled
 * path, and the engine must not be able to reach connect().
 */
export interface EngineTrainer {
  onData(cb: (d: BikeData) => void): () => void;
  onStateChange(cb: (s: ConnectionState) => void): () => void;
  setGrade(percent: number): Promise<void>;
  /**
   * ERG. Which command is sent is itself the mode switch — a target power puts the
   * trainer in ERG and simulation parameters take it out — so a workout step and a free
   * step differ only in which of these two the engine calls.
   */
  setTargetPower(watts: number): Promise<void>;
}
