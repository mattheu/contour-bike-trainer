import { describe, expect, it } from 'vitest';
import { ROLLING_WINDOW_S, intensityFactor, normalisedPower, trainingStressScore } from './load';
import { expandWorkout } from './expand';
import { parseWorkout } from './parse';
import { plannedPowerSeries } from './runner';

const FTP = 250;
const HOUR_S = 3600;

function flat(watts: number | null, seconds: number): (number | null)[] {
  return Array.from({ length: seconds }, () => watts);
}

describe('normalisedPower', () => {
  it('equals the power of a perfectly steady effort', () => {
    expect(normalisedPower(flat(200, HOUR_S))).toBeCloseTo(200, 6);
  });

  it('is empty-safe', () => {
    expect(normalisedPower([])).toBe(0);
  });

  it('counts a second with no target as nothing, not as a gap', () => {
    const halfFree = [...flat(300, 1800), ...flat(null, 1800)];
    expect(normalisedPower(halfFree)).toBeLessThan(300);
    expect(normalisedPower(halfFree)).toBeGreaterThan(0);
  });

  it('rises above mean power when the effort swings', () => {
    const intervals = Array.from({ length: 60 }, (_, block) =>
      flat(block % 2 === 0 ? 400 : 0, ROLLING_WINDOW_S),
    ).flat();
    expect(normalisedPower(intervals)).toBeGreaterThan(200);
  });

  it('does not discard the first window, so a short series still scores', () => {
    expect(normalisedPower(flat(200, 10))).toBeCloseTo(200, 6);
  });
});

describe('intensityFactor', () => {
  it('is normalised power over FTP', () => {
    expect(intensityFactor(200, FTP)).toBeCloseTo(0.8, 6);
  });

  it('refuses an FTP that cannot anchor it', () => {
    expect(() => intensityFactor(200, 0)).toThrow(RangeError);
    expect(() => intensityFactor(200, Number.NaN)).toThrow(RangeError);
  });
});

describe('trainingStressScore', () => {
  it('scores one hour at FTP as 100', () => {
    expect(trainingStressScore(flat(FTP, HOUR_S), HOUR_S, FTP)).toBeCloseTo(100, 6);
  });

  it('scales linearly with duration', () => {
    expect(trainingStressScore(flat(FTP, HOUR_S / 2), HOUR_S / 2, FTP)).toBeCloseTo(50, 6);
  });

  it('scales quadratically with intensity', () => {
    expect(trainingStressScore(flat(FTP * 0.8, HOUR_S), HOUR_S, FTP)).toBeCloseTo(64, 6);
  });

  it('scores an hour of free riding as nothing, because it asked for nothing', () => {
    expect(trainingStressScore(flat(null, HOUR_S), HOUR_S, FTP)).toBe(0);
  });

  it('is zero for a session with no time in it', () => {
    expect(trainingStressScore([], 0, FTP)).toBe(0);
  });

  it('refuses an FTP that cannot anchor it', () => {
    expect(() => trainingStressScore(flat(200, 60), 60, -1)).toThrow(RangeError);
  });

  it('scores recorded power from a ride the same way it scores a plan', () => {
    const recorded = flat(FTP, HOUR_S).map((value, second) => (value ?? 0) + (second % 2 ? 2 : -2));
    expect(trainingStressScore(recorded, HOUR_S, FTP)).toBeCloseTo(100, 1);
  });

  it('scores a planned workout from its expanded targets', () => {
    const expanded = expandWorkout(
      parseWorkout(
        `name: t\nftp: 250\nsteps:\n  - repeat: 2\n    steps:\n      - { duration: 20m, power: 100% }\n      - { duration: 10m, power: 50% }\n`,
      ),
    );
    const tss = trainingStressScore(
      plannedPowerSeries(expanded.steps, FTP),
      expanded.totalDurationS,
      FTP,
    );
    // Forty minutes at FTP plus twenty easy: more than the 67 the hard part alone earns,
    // because the easy twenty still cost an hour of time at a normalised 91 % of FTP.
    expect(tss).toBeGreaterThan(67);
    expect(tss).toBeCloseTo(82.9, 1);
  });

  it('costs roughly two thirds as much at a scale of 80 %', () => {
    const expanded = expandWorkout(
      parseWorkout(`name: t\nsteps:\n  - { duration: 1h, power: 100% }\n`),
    );
    const full = trainingStressScore(plannedPowerSeries(expanded.steps, FTP), HOUR_S, FTP);
    const eased = trainingStressScore(plannedPowerSeries(expanded.steps, FTP, 80), HOUR_S, FTP);
    expect(eased / full).toBeCloseTo(0.64, 2);
  });
});
