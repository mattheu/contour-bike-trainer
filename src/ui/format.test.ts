import { describe, expect, it } from 'vitest';
import { createRng, noise } from '../ble/rng';
import {
  ABSENT,
  POWER_WINDOW_S,
  SMOOTHING_SECONDS,
  distance,
  duration,
  elevation,
  percent,
  smoothPower,
  stepLabel,
  stepTarget,
  trailingMeanPower,
  withinPowerWindow,
  type PowerReading,
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

/**
 * The series a trainer actually produces: one reading a second, each one the effort plus
 * the reading noise a power meter carries. Deterministic, so the figures below are the
 * same on every run.
 */
function recorded(watts: (second: number) => number, seconds: number, seed = 7): PowerReading[] {
  const rng = createRng(seed);
  return Array.from({ length: seconds }, (_, t) => ({
    t: t + 1,
    // ±28 W, which lands the second-to-second change at roughly the spread the first
    // hardware ride showed: a single-figure median against a p95 several times it.
    w: Math.max(0, Math.round(watts(t) + noise(rng, 28))),
  }));
}

/** Second-to-second change in whatever a readout would have printed over that series. */
function changes(values: readonly (number | null)[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1];
    const b = values[i];
    if (a === null || a === undefined || b === null || b === undefined) continue;
    out.push(Math.abs(b - a));
  }
  return out;
}

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[at] ?? 0;
}

/** What the hero would print, second by second, over a whole series. */
function displayed(readings: readonly PowerReading[]): (number | null)[] {
  return readings.map((reading) => trailingMeanPower(readings, reading.t));
}

describe('trailingMeanPower', () => {
  it('prints the first reading rather than withholding one until the window fills', () => {
    expect(trailingMeanPower([{ t: 1, w: 243 }], 1)).toBe(243);
    expect(
      trailingMeanPower(
        [
          { t: 1, w: 200 },
          { t: 2, w: 260 },
        ],
        2,
      ),
    ).toBe(230);
  });

  it('averages only the readings inside the window', () => {
    const readings: PowerReading[] = [
      { t: 1, w: 100 },
      { t: 2, w: 200 },
      { t: 3, w: 300 },
      { t: 4, w: 400 },
    ];
    // At t=4 the window is (1, 4]: the 100 W reading has had its turn.
    expect(trailingMeanPower(readings, 4)).toBe(300);
  });

  it('settles on a step change within the window', () => {
    const readings: PowerReading[] = [];
    for (let t = 1; t <= 6; t += 1) readings.push({ t, w: t <= 3 ? 150 : 300 });

    expect(trailingMeanPower(readings, 3)).toBe(150);
    // Moving, and visibly, from the first second after the step.
    expect(trailingMeanPower(readings, 4)).toBeCloseTo(200, 6);
    expect(trailingMeanPower(readings, 5)).toBeCloseTo(250, 6);
    // Three seconds after the step the old effort is out of the window entirely.
    expect(trailingMeanPower(readings, 6)).toBe(300);
  });

  it('attenuates a spike rather than erasing it', () => {
    const steady: PowerReading[] = [
      { t: 1, w: 200 },
      { t: 2, w: 200 },
      { t: 3, w: 800 },
    ];
    const shown = trailingMeanPower(steady, 3);
    // A 600 W excursion still moves the readout by 200 W — a sprint reads as a sprint —
    // without the hero printing a number the rider held for one second.
    expect(shown).toBe(400);
    expect(shown).toBeLessThan(800);
    expect(shown).toBeGreaterThan(200);
  });

  it('goes absent rather than printing a confident number across a dropout', () => {
    const readings: PowerReading[] = [
      { t: 1, w: 240 },
      { t: 2, w: 250 },
      { t: 3, w: 245 },
    ];
    // Still inside the window a second later: the readings are real, just ageing.
    expect(trailingMeanPower(readings, 4)).toBeCloseTo(247.5, 6);
    // Three seconds of silence empties it, and the readout goes to a dash.
    expect(trailingMeanPower(readings, 6)).toBeNull();
    expect(trailingMeanPower(readings, 30)).toBeNull();
  });

  it('does not smear across the gap when the trainer comes back', () => {
    const readings: PowerReading[] = [
      { t: 1, w: 400 },
      { t: 2, w: 400 },
      { t: 3, w: 400 },
      // Twelve seconds away, then back at a standstill.
      { t: 15, w: 0 },
    ];
    // The first reading back stands alone: nothing is averaged over the hole.
    expect(trailingMeanPower(readings, 15)).toBe(0);
    expect(trailingMeanPower(readings, 16)).toBe(0);
  });

  it('ignores readings from the future and readings that are not numbers', () => {
    const readings: PowerReading[] = [
      { t: 1, w: 200 },
      { t: 2, w: Number.NaN },
      { t: Number.POSITIVE_INFINITY, w: 900 },
      { t: 9, w: 900 },
    ];
    expect(trailingMeanPower(readings, 2)).toBe(200);
    expect(trailingMeanPower(readings, Number.NaN)).toBeNull();
  });

  it('has nothing to average over an empty series', () => {
    expect(trailingMeanPower([], 10)).toBeNull();
    expect(trailingMeanPower([{ t: 1, w: 200 }], 1, 0)).toBeNull();
  });

  it('calms the recorded ride rather than flattening it', () => {
    // Twenty minutes of the shape that made the hero unreadable: a steady effort with a
    // real interval in the middle of it.
    const readings = recorded((t) => (t % 300 < 120 ? 300 : 210), 1200);

    const raw = changes(readings.map((reading) => reading.w));
    const smoothed = changes(displayed(readings).map((w) => (w === null ? null : Math.round(w))));

    expect(quantile(raw, 0.5)).toBeGreaterThan(quantile(smoothed, 0.5) * 1.5);
    expect(quantile(raw, 0.95)).toBeGreaterThan(quantile(smoothed, 0.95) * 1.5);

    // Calmer, not flatter: the interval still reads as an interval. The mean over the
    // hard block stays near 300 and the mean over the easy block near 210.
    const at = (second: number) => trailingMeanPower(readings, second) ?? 0;
    expect(at(110)).toBeGreaterThan(270);
    expect(at(290)).toBeLessThan(240);
  });
});

describe('withinPowerWindow', () => {
  it('keeps the buffer to the window rather than to a count of readings', () => {
    const readings: PowerReading[] = [];
    // 4 Hz, which real FTMS hardware does: thirty-two readings over eight seconds.
    for (let i = 1; i <= 32; i += 1) readings.push({ t: i / 4, w: 200 });

    const kept = withinPowerWindow(readings, 8);
    expect(kept).toHaveLength(POWER_WINDOW_S * 4);
    expect(kept[0]?.t).toBeCloseTo(5.25, 6);
    // Trimming must not change what the mean says.
    expect(trailingMeanPower(kept, 8)).toBe(trailingMeanPower(readings, 8));
  });

  it('empties itself when the readings stop', () => {
    expect(withinPowerWindow([{ t: 1, w: 240 }], 10)).toEqual([]);
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
