import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeHeartRateMonitor } from './fake-hrm';
import type { ConnectionState } from './types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function wear(seconds: number): Promise<number[]> {
  const hrm = new FakeHeartRateMonitor();
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
