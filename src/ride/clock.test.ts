import { describe, expect, it } from 'vitest';

import { createManualClock, createScaledClock, parseTimeScale } from './clock';

describe('createScaledClock', () => {
  it('runs elapsed time at the given multiple of its base', () => {
    const base = createManualClock(1000);
    const clock = createScaledClock(5, base);
    const start = clock.now();

    base.advance(2);

    expect(clock.now() - start).toBe(10_000);
  });

  it('never goes backwards while its base moves forwards', () => {
    const base = createManualClock();
    const clock = createScaledClock(10, base);
    const readings = [clock.now()];
    for (const step of [0, 0.001, 0.1, 1, 0, 2.5]) {
      base.advance(step);
      readings.push(clock.now());
    }
    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1]!);
    }
  });
});

describe('parseTimeScale', () => {
  it('is real time and silent when the parameter is absent', () => {
    expect(parseTimeScale(null, true)).toEqual({ speed: 1, warning: null });
    expect(parseTimeScale(null, false)).toEqual({ speed: 1, warning: null });
  });

  it.each([1, 5, 10])('accepts %i alongside a fake', (speed) => {
    expect(parseTimeScale(String(speed), true)).toEqual({ speed, warning: null });
  });

  it('stays on real time without a fake, and says so', () => {
    expect(parseTimeScale('10', false)).toEqual({
      speed: 1,
      warning: '?speed= only applies with ?fake=. Running at real time.',
    });
  });

  it.each(['0', '11', '2.5', '10x', '', '-1'])('falls back to real time for %j', (raw) => {
    expect(parseTimeScale(raw, true)).toEqual({
      speed: 1,
      warning: `Unknown ?speed=${raw}. Valid speeds: 1 to 10. Running at real time.`,
    });
  });
});
