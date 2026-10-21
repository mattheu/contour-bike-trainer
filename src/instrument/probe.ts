import type { Recorder } from './recorder';

export const PROBE_INTERVAL_MS = 1000;

/**
 * The experiment's control variable.
 *
 * A plain setInterval that does nothing but record a tick. Chrome clamps timers in
 * hidden tabs to roughly once a minute after five minutes; comparing this probe's
 * inter-arrival times against the BLE notification stream is the entire measurement.
 * It is therefore deliberately isolated from every other part of the app — nothing
 * may hang app logic off it, or the control stops being a control.
 */
export class TimerProbe {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly recorder: Recorder,
    private readonly intervalMs: number = PROBE_INTERVAL_MS,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.recorder.record('timer-tick'), this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

export type VisibilityState = 'visible' | 'hidden';

function currentVisibility(): VisibilityState {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
    ? 'visible'
    : 'hidden';
}

export function visibilityState(): VisibilityState {
  return currentVisibility();
}

/**
 * Records every visibilitychange so the log says exactly when the window went
 * behind the video. Returns an unsubscribe.
 */
export function watchVisibility(
  recorder: Recorder,
  onChange?: (state: VisibilityState) => void,
): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = (): void => {
    const state = currentVisibility();
    recorder.record('visibility-change', { visibilityState: state });
    onChange?.(state);
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
