import { describe, expect, it } from 'vitest';
import {
  ABSENT,
  SMOOTHING_SECONDS,
  distance,
  duration,
  elevation,
  percent,
  smoothPower,
  stepLabel,
  stepTarget,
} from './format';

describe('duration', () => {
  it('drops the hour field under an hour', () => {
    expect(duration(1425)).toBe('23:45');
    expect(duration(0)).toBe('0:00');
    expect(duration(9)).toBe('0:09');
  });

  it('shows hours with padded minutes and seconds', () => {
    expect(duration(5025)).toBe('1:23:45');
    expect(duration(3600)).toBe('1:00:00');
    expect(duration(36000)).toBe('10:00:00');
  });

  it('floors part seconds rather than rounding up', () => {
    expect(duration(59.9)).toBe('0:59');
  });

  it('dashes an absent or impossible duration', () => {
    expect(duration(null)).toBe(ABSENT);
    expect(duration(undefined)).toBe(ABSENT);
    expect(duration(Number.NaN)).toBe(ABSENT);
    expect(duration(-1)).toBe(ABSENT);
    expect(duration(Number.POSITIVE_INFINITY)).toBe(ABSENT);
  });
});

describe('distance', () => {
  it('reads kilometres to one decimal', () => {
    expect(distance(38.24)).toBe('38.2');
    expect(distance(0)).toBe('0.0');
  });

  it('takes a digit count', () => {
    expect(distance(38.24, 2)).toBe('38.24');
  });

  it('dashes an absent distance but not a zero one', () => {
    expect(distance(null)).toBe(ABSENT);
    expect(distance(0)).not.toBe(ABSENT);
  });
});

describe('elevation', () => {
  it('rounds to whole metres', () => {
    expect(elevation(511.6)).toBe('512');
    expect(elevation(0)).toBe('0');
  });

  it('dashes an absent elevation', () => {
    expect(elevation(undefined)).toBe(ABSENT);
    expect(elevation(Number.NaN)).toBe(ABSENT);
  });
});

describe('percent', () => {
  it('reads one decimal by default and keeps a negative gradient', () => {
    expect(percent(6.44)).toBe('6.4');
    expect(percent(-3.2)).toBe('-3.2');
  });

  it('takes a digit count for whole-number shares', () => {
    expect(percent(108.2, 0)).toBe('108');
  });

  it('dashes an absent percentage', () => {
    expect(percent(null)).toBe(ABSENT);
  });
});

describe('smoothPower', () => {
  it('starts at the first actual reading rather than easing up from nothing', () => {
    expect(smoothPower(null, 240, 0.1)).toBe(240);
  });

  it('closes about 95 % of the gap over the smoothing window', () => {
    let displayed = 0;
    for (let t = 0; t < SMOOTHING_SECONDS; t += 0.1) {
      displayed = smoothPower(displayed, 300, 0.1) ?? 0;
    }
    expect(displayed).toBeGreaterThan(300 * 0.94);
    expect(displayed).toBeLessThan(300);
  });

  it('is barely moved by one frame', () => {
    const next = smoothPower(200, 300, 1 / 60) ?? 0;
    expect(next).toBeGreaterThan(200);
    expect(next).toBeLessThan(220);
  });

  it('eases downward as well as upward', () => {
    const next = smoothPower(300, 100, 0.5) ?? 0;
    expect(next).toBeLessThan(300);
    expect(next).toBeGreaterThan(100);
  });

  it('holds the displayed value when no time has passed', () => {
    expect(smoothPower(210, 300, 0)).toBe(210);
    expect(smoothPower(210, 300, -1)).toBe(210);
  });

  it('goes absent rather than decaying to zero when the reading is lost', () => {
    expect(smoothPower(240, null, 0.1)).toBeNull();
    expect(smoothPower(240, Number.NaN, 0.1)).toBeNull();
  });

  it('settles on the actual value rather than overshooting it', () => {
    let displayed = 100;
    for (let i = 0; i < 1000; i += 1) displayed = smoothPower(displayed, 250, 0.1) ?? 0;
    expect(displayed).toBeCloseTo(250, 6);
  });
});

describe('stepTarget', () => {
  it('shows a target in the form the author wrote it', () => {
    expect(stepTarget({ kind: 'constant', value: { unit: 'ftpPercent', value: 95 } })).toBe('95 %');
    expect(stepTarget({ kind: 'constant', value: { unit: 'watts', value: 250 } })).toBe('250 W');
    expect(stepTarget({ kind: 'free' })).toBe('free');
  });

  it('shows a ramp as its two ends, naming the unit once where they share one', () => {
    expect(
      stepTarget({
        kind: 'ramp',
        from: { unit: 'ftpPercent', value: 50 },
        to: { unit: 'ftpPercent', value: 75 },
      }),
    ).toBe('50 → 75 %');
    expect(
      stepTarget({
        kind: 'ramp',
        from: { unit: 'ftpPercent', value: 60 },
        to: { unit: 'watts', value: 200 },
      }),
    ).toBe('60 % → 200 W');
  });

  it('drops a trailing zero but keeps a real fraction', () => {
    expect(stepTarget({ kind: 'constant', value: { unit: 'ftpPercent', value: 95.0 } })).toBe(
      '95 %',
    );
    expect(stepTarget({ kind: 'constant', value: { unit: 'ftpPercent', value: 87.5 } })).toBe(
      '87.5 %',
    );
  });
});

describe('stepLabel', () => {
  it('reads as duration, name and target', () => {
    expect(
      stepLabel({
        kind: 'step',
        durationS: 300,
        name: 'Recovery',
        power: { kind: 'constant', value: { unit: 'ftpPercent', value: 55 } },
      }),
    ).toBe('5:00 Recovery · 55 %');
  });

  it('shows the target alone where the author named nothing', () => {
    expect(
      stepLabel({
        kind: 'step',
        durationS: 90,
        power: { kind: 'free' },
      }),
    ).toBe('1:30 · free');
  });
});
