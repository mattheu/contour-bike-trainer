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

/** Ride time running faster than real time, so a fake ride fills its charts quicker. */
export function createScaledClock(speed: number, base: Clock = systemClock): Clock {
  return { now: () => base.now() * speed };
}

/**
 * Whole numbers only, and no faster than 10×: the fake's one-second tick becomes 100 ms
 * there, and much below that timer clamping and render cost start dropping samples.
 */
const MAX_TIME_SCALE = 10;

/**
 * ?speed=, which only means anything alongside ?fake=: a real trainer reports in real
 * time, and speeding the ride clock past it would make up distance it never rode.
 */
export function parseTimeScale(
  raw: string | null,
  fakeActive: boolean,
): { speed: number; warning: string | null } {
  if (raw === null) return { speed: 1, warning: null };
  if (!fakeActive) {
    return { speed: 1, warning: '?speed= only applies with ?fake=. Running at real time.' };
  }
  const speed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (speed >= 1 && speed <= MAX_TIME_SCALE) return { speed, warning: null };
  return {
    speed: 1,
    warning: `Unknown ?speed=${raw}. Valid speeds: 1 to ${MAX_TIME_SCALE}. Running at real time.`,
  };
}
