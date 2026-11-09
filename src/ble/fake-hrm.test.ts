import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeHeartRateMonitor,
  heartRateBpm,
  heartRateDemandBpm,
  restingHeartRateState,
  stepHeartRate,
} from './fake-hrm';
import type { FakeScript } from './fake-trainer';
import type { ConnectionState } from './types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function wear(seconds: number, script: FakeScript = 'constant'): Promise<number[]> {
  const hrm = new FakeHeartRateMonitor(script);
  const bpm: number[] = [];
  hrm.onData((v) => bpm.push(v));
  await hrm.connect();
  await vi.advanceTimersByTimeAsync(seconds * 1000);
  await hrm.disconnect();
  return bpm;
}

describe('FakeHeartRateMonitor', () => {
  it('emits at 1 Hz and stops on disconnect', async () => {
    const bpm = await wear(30);
    expect(bpm).toHaveLength(30);
  });

  it('is deterministic across instances', async () => {
    expect(await wear(120)).toEqual(await wear(120));
  });

  it('drifts across the 120-165 band rather than sitting still', async () => {
    const bpm = await wear(240);
    for (const v of bpm) {
      expect(v).toBeGreaterThanOrEqual(120);
      expect(v).toBeLessThanOrEqual(165);
    }
    expect(Math.max(...bpm)).toBeGreaterThan(155);
    expect(Math.min(...bpm)).toBeLessThan(130);
  });

  it('reports connection state and unsubscribes cleanly', async () => {
    const states: ConnectionState[] = [];
    const hrm = new FakeHeartRateMonitor();
    const off = hrm.onStateChange((s) => states.push(s));
    await hrm.connect();
    expect(states).toEqual(['connecting', 'connected']);
    off();
    await hrm.disconnect();
    expect(states).toEqual(['connecting', 'connected']);
  });
});

/**
 * The varied session's heart rate, read off the same script the trainer is riding. Seconds
 * are the cycle's: sample `at` is index at - 1. The blocks are in src/ble/fake-trainer.ts.
 */
describe('FakeHeartRateMonitor on the varied script', () => {
  const bpmAt = (bpm: number[], at: number): number => bpm[at - 1]!;

  it('starts at rest and climbs no faster than a soft pedal asks', async () => {
    const bpm = await wear(60, 'varied');
    expect(bpmAt(bpm, 1)).toBeLessThan(56);
    expect(bpmAt(bpm, 1)).toBeGreaterThan(45);
    expect(bpmAt(bpm, 60)).toBeLessThan(90);
  });

  it('lags the step onto the climb and reaches zone 5 by the end of it', async () => {
    const bpm = await wear(800, 'varied');

    // One second into five minutes over threshold, still where the recovery left it.
    expect(bpmAt(bpm, 481)).toBeLessThan(135);
    // Zone 5 at the default hrMax of 190 starts at 171; the block ends near 184.
    const climb = bpm.slice(479, 780);
    expect(Math.max(...climb)).toBeGreaterThanOrEqual(180);
    expect(Math.max(...climb)).toBeLessThanOrEqual(190);
    expect(bpmAt(bpm, 780)).toBeGreaterThan(171);
  });

  it('barely moves on a sprint, which is what makes the climb mean something', async () => {
    const bpm = await wear(430, 'varied');
    // 700 W for three seconds: the legs do the work, the heart has no time to answer.
    expect(Math.abs(bpmAt(bpm, 423) - bpmAt(bpm, 419))).toBeLessThan(8);
  });

  it('returns all the way to resting over the long stop', async () => {
    const bpm = await wear(1150, 'varied');
    expect(bpmAt(bpm, 905)).toBeGreaterThan(140);
    expect(bpmAt(bpm, 1140)).toBeLessThan(57);
  });

  it('is deterministic across instances', async () => {
    expect(await wear(500, 'varied')).toEqual(await wear(500, 'varied'));
  });
});

describe('the heart rate model', () => {
  const hold = (powerW: number, seconds: number): number[] => {
    let state = restingHeartRateState();
    const bpm: number[] = [];
    for (let second = 1; second <= seconds; second += 1) {
      state = stepHeartRate(state, powerW, 1);
      bpm.push(heartRateBpm(state));
    }
    return bpm;
  };

  it('drifts upward at a held effort rather than settling flat', () => {
    const bpm = hold(200, 1800);
    const settled = bpm[299]!;
    const late = bpm[1799]!;
    expect(late).toBeGreaterThan(settled + 2);
    // A creep, not a second climb: cardiac drift is worth a few beats over half an hour.
    expect(late).toBeLessThan(settled + 8);
  });

  it('rises on a 30 s time constant and falls more slowly', () => {
    const demand = heartRateDemandBpm(200);
    const rise = hold(200, 30);
    // One time constant is ~63 % of the way from resting to the demand.
    const expected = 50 + 0.63 * (demand - 50);
    expect(rise[29]!).toBeGreaterThan(expected - 6);
    expect(rise[29]!).toBeLessThan(expected + 6);

    let hot = restingHeartRateState();
    for (let second = 0; second < 600; second += 1) hot = stepHeartRate(hot, 200, 1);
    let cooling = hot;
    for (let second = 0; second < 30; second += 1) cooling = stepHeartRate(cooling, 0, 1);
    const fallen = heartRateBpm(hot) - heartRateBpm(cooling);
    const risen = rise[29]! - 50;
    expect(fallen).toBeLessThan(risen);
  });
});
