import type { Clock } from './types';

/**
 * performance.now() rather than Date.now(): it is monotonic, so a clock adjustment
 * mid-ride cannot make elapsed time jump backwards or a tick's dt go negative.
 */
export const systemClock: Clock = {
  now: () => performance.now(),
};

export interface ManualClock extends Clock {
  /** Move time forward by a number of seconds. */
  advance(seconds: number): void;
  set(ms: number): void;
}

/** A clock a test drives by hand. Lives here rather than in a test file so the engine,
 * the tick sources and the services wiring can all share one implementation. */
export function createManualClock(startMs = 0): ManualClock {
  let t = startMs;
  return {
    now: () => t,
    advance: (seconds) => {
      t += seconds * 1000;
    },
    set: (ms) => {
      t = ms;
    },
  };
}
