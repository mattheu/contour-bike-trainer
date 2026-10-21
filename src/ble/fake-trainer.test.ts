import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTrainer, type FakeScript } from './fake-trainer';
import type { BikeData, ConnectionState } from './types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Reported values only; receivedAt is a wall-clock reading, not part of the series. */
const series = (samples: BikeData[]): Array<[number, number, number]> =>
  samples.map((s) => [s.powerW!, s.cadenceRpm!, s.speedKmh!]);

async function ride(script: FakeScript, seconds: number): Promise<BikeData[]> {
  const trainer = new FakeTrainer(script);
  const samples: BikeData[] = [];
  trainer.onData((d) => samples.push(d));
  await trainer.connect();
  await vi.advanceTimersByTimeAsync(seconds * 1000);
  await trainer.disconnect();
  return samples;
}

describe('FakeTrainer', () => {
  it('emits data at 1 Hz', async () => {
    const samples: BikeData[] = [];
    const trainer = new FakeTrainer('constant');
    trainer.onData((d) => samples.push(d));
    await trainer.connect();

    await vi.advanceTimersByTimeAsync(999);
    expect(samples).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(samples).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(9000);
    expect(samples).toHaveLength(10);

    await trainer.disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(samples).toHaveLength(10);
  });

  it('reports connection state transitions on connect and disconnect', async () => {
    const states: ConnectionState[] = [];
    const trainer = new FakeTrainer('constant');
    trainer.onStateChange((s) => states.push(s));
    await trainer.connect();
    await trainer.disconnect();
    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
  });

  it.each<FakeScript>(['constant', 'ramp', 'intervals', 'dropout'])(
    'produces an identical series across two instances of the %s script',
    async (script) => {
      const a = await ride(script, 60);
      const b = await ride(script, 60);
      expect(series(a)).toEqual(series(b));
    },
  );

  it('applies noise, so the series is not a flat constant', async () => {
    const samples = await ride('constant', 20);
    const powers = new Set(samples.map((s) => s.powerW));
    expect(powers.size).toBeGreaterThan(1);
    for (const s of samples) {
      expect(s.powerW).toBeGreaterThanOrEqual(194); // 200 W +/- 3%
      expect(s.powerW).toBeLessThanOrEqual(206);
      expect(s.cadenceRpm).toBeGreaterThanOrEqual(83);
      expect(s.cadenceRpm).toBeLessThanOrEqual(87);
    }
  });

  it('follows the ramp script from 100 W to 350 W over five minutes', async () => {
    const samples = await ride('ramp', 300);
    expect(samples[0]!.powerW).toBeLessThan(115);
    expect(samples[149]!.powerW).toBeGreaterThan(215); // halfway, ~225 W
    expect(samples[149]!.powerW).toBeLessThan(235);
    expect(samples[298]!.powerW).toBeGreaterThan(330);
  });

  it('alternates the intervals script every two minutes', async () => {
    const samples = await ride('intervals', 300);
    expect(samples[10]!.powerW).toBeGreaterThan(115);
    expect(samples[10]!.powerW).toBeLessThan(125);
    expect(samples[130]!.powerW).toBeGreaterThan(270);
    expect(samples[130]!.powerW).toBeLessThan(290);
    expect(samples[250]!.powerW).toBeLessThan(125); // cycle repeats
  });

  describe('ERG', () => {
    it('converges reported power toward the commanded target over about 3 s', async () => {
      const samples: BikeData[] = [];
      const trainer = new FakeTrainer('constant');
      trainer.onData((d) => samples.push(d));
      await trainer.connect();
      await vi.advanceTimersByTimeAsync(3000);

      await trainer.setTargetPower(300);
      await vi.advanceTimersByTimeAsync(1000);
      const first = samples.at(-1)!.powerW!;
      expect(first).toBeGreaterThan(210);
      expect(first).toBeLessThan(290); // moving, not snapping

      await vi.advanceTimersByTimeAsync(2000);
      expect(samples.at(-1)!.powerW).toBeGreaterThan(285);

      await vi.advanceTimersByTimeAsync(5000);
      expect(samples.at(-1)!.powerW).toBeGreaterThan(290);
      expect(samples.at(-1)!.powerW).toBeLessThan(310);

      await trainer.disconnect();
    });

    it('records the last commanded target power and grade', async () => {
      const trainer = new FakeTrainer('constant');
      expect(trainer.lastTargetPowerW).toBeNull();
      expect(trainer.lastGradePercent).toBe(0);

      await trainer.setTargetPower(245);
      expect(trainer.lastTargetPowerW).toBe(245);

      await trainer.setGrade(-6.5);
      expect(trainer.lastGradePercent).toBe(-6.5);
      // Setting simulation parameters takes a real machine out of ERG, so the target goes.
      expect(trainer.lastTargetPowerW).toBeNull();
    });

    it('records grade without changing reported power', async () => {
      const flat = await ride('constant', 10);

      const trainer = new FakeTrainer('constant');
      const samples: BikeData[] = [];
      trainer.onData((d) => samples.push(d));
      await trainer.connect();
      await trainer.setGrade(8);
      await vi.advanceTimersByTimeAsync(10_000);
      await trainer.disconnect();

      expect(series(samples)).toEqual(series(flat));
      expect(trainer.lastGradePercent).toBe(8);
    });
  });

  describe('dropout script', () => {
    it('goes silent from 30 s to 45 s and signals reconnecting then connected', async () => {
      const states: ConnectionState[] = [];
      const samples: Array<{ at: number; data: BikeData }> = [];
      const trainer = new FakeTrainer('dropout');
      trainer.onStateChange((s) => states.push(s));

      let second = 0;
      trainer.onData((d) => samples.push({ at: second, data: d }));
      await trainer.connect();
      for (second = 1; second <= 60; second += 1) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      await trainer.disconnect();

      expect(states).toEqual([
        'connecting',
        'connected',
        'reconnecting',
        'connected',
        'disconnected',
      ]);
      // 60 ticks less the 15 silent ones (30..44 inclusive).
      expect(samples).toHaveLength(45);
      const silent = samples.filter((s) => s.at >= 30 && s.at < 45);
      expect(silent).toHaveLength(0);
      expect(samples.some((s) => s.at === 29)).toBe(true);
      expect(samples.some((s) => s.at === 45)).toBe(true);
    });
  });

  describe('unsubscribe', () => {
    it('stops data callbacks', async () => {
      const samples: BikeData[] = [];
      const trainer = new FakeTrainer('constant');
      const off = trainer.onData((d) => samples.push(d));
      await trainer.connect();
      await vi.advanceTimersByTimeAsync(3000);
      expect(samples).toHaveLength(3);

      off();
      await vi.advanceTimersByTimeAsync(5000);
      expect(samples).toHaveLength(3);
      await trainer.disconnect();
    });

    it('stops state callbacks', async () => {
      const states: ConnectionState[] = [];
      const trainer = new FakeTrainer('constant');
      const off = trainer.onStateChange((s) => states.push(s));
      await trainer.connect();
      expect(states).toEqual(['connecting', 'connected']);

      off();
      await trainer.disconnect();
      expect(states).toEqual(['connecting', 'connected']);
    });

    it('leaves other subscribers untouched', async () => {
      const a: BikeData[] = [];
      const b: BikeData[] = [];
      const trainer = new FakeTrainer('constant');
      const offA = trainer.onData((d) => a.push(d));
      trainer.onData((d) => b.push(d));
      await trainer.connect();
      await vi.advanceTimersByTimeAsync(2000);
      offA();
      await vi.advanceTimersByTimeAsync(2000);
      await trainer.disconnect();

      expect(a).toHaveLength(2);
      expect(b).toHaveLength(4);
    });
  });

  it('drops the ERG target when a grade is set, so the script resumes', async () => {
    const trainer = new FakeTrainer('intervals');
    const samples: number[] = [];
    trainer.onData((d) => {
      if (d.powerW !== undefined) samples.push(d.powerW);
    });
    await trainer.connect();

    await trainer.setTargetPower(320);
    await vi.advanceTimersByTimeAsync(10_000);
    // Tolerance covers the fake's +/-3% noise on top of the converged target.
    expect(samples.at(-1)).toBeGreaterThan(300);
    expect(samples.at(-1)).toBeLessThan(340);

    // Simulation parameters supersede target power on real hardware; the fake must match.
    await trainer.setGrade(4);
    expect(trainer.lastTargetPowerW).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    // Back on the intervals script's low block, nowhere near the abandoned ERG target.
    expect(samples.at(-1)).toBeLessThan(200);

    await trainer.disconnect();
  });
});

describe('FakeTrainer forced dropout', () => {
  it('goes silent on demand and comes back, whatever the script says', async () => {
    const trainer = new FakeTrainer('constant');
    const states: ConnectionState[] = [];
    const samples: number[] = [];
    trainer.onStateChange((s) => states.push(s));
    trainer.onData((d) => {
      if (d.powerW !== undefined) samples.push(d.powerW);
    });
    await trainer.connect();
    await vi.advanceTimersByTimeAsync(3000);
    const before = samples.length;
    expect(before).toBeGreaterThan(0);

    // The script's own window is 30 s away; this must not wait for it.
    trainer.forceDropout();
    await vi.advanceTimersByTimeAsync(5000);
    expect(samples.length).toBe(before);
    expect(states.at(-1)).toBe('reconnecting');

    trainer.forceReconnect();
    await vi.advanceTimersByTimeAsync(2000);
    expect(samples.length).toBeGreaterThan(before);
    expect(states.at(-1)).toBe('connected');

    await trainer.disconnect();
  });

  it('overrides a dropout script that would otherwise still be emitting', async () => {
    const trainer = new FakeTrainer('dropout');
    const samples: number[] = [];
    trainer.onData((d) => {
      if (d.powerW !== undefined) samples.push(d.powerW);
    });
    await trainer.connect();
    await vi.advanceTimersByTimeAsync(2000);

    trainer.forceDropout();
    const before = samples.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(samples.length).toBe(before);

    await trainer.disconnect();
  });
});
