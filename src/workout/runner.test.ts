import { describe, expect, it } from 'vitest';
import { expandWorkout } from './expand';
import { parseWorkout } from './parse';
import {
  MAX_SCALE_PCT,
  MIN_SCALE_PCT,
  clampScalePct,
  nudgeScalePct,
  plannedPowerSeries,
  skipStep,
  startRun,
  stateAt,
  targetWattsAt,
} from './runner';
import type { ExpandedStep } from './expand';

const FTP = 250;

function step(durationS: number, power: ExpandedStep['power'], name?: string): ExpandedStep {
  return { kind: 'step', durationS, power, ...(name === undefined ? {} : { name }) };
}

const percent = (value: number) =>
  ({ kind: 'constant', value: { unit: 'ftpPercent', value } }) as const;
const watts = (value: number) => ({ kind: 'constant', value: { unit: 'watts', value } }) as const;
const ramp = (from: number, to: number) =>
  ({
    kind: 'ramp',
    from: { unit: 'ftpPercent', value: from },
    to: { unit: 'ftpPercent', value: to },
  }) as const;

/** 10m at 95 %, 5m at 55 %, 30s free. */
function run() {
  return startRun({
    steps: [
      step(600, percent(95), 'Threshold'),
      step(300, percent(55), 'Easy'),
      step(30, { kind: 'free' }, 'Max effort'),
    ],
    totalDurationS: 930,
  });
}

describe('targetWattsAt', () => {
  it('resolves a percentage against FTP', () => {
    expect(targetWattsAt(percent(95), 0, 600, FTP)).toBe(238);
  });

  it('takes absolute watts as written', () => {
    expect(targetWattsAt(watts(312), 0, 600, FTP)).toBe(312);
  });

  it('interpolates a ramp across the step', () => {
    expect(targetWattsAt(ramp(50, 75), 0, 600, FTP)).toBe(125);
    expect(targetWattsAt(ramp(50, 75), 300, 600, FTP)).toBe(156);
    expect(targetWattsAt(ramp(50, 75), 600, 600, FTP)).toBe(188);
  });

  it('interpolates a ramp whose ends mix forms', () => {
    const mixed = {
      kind: 'ramp',
      from: { unit: 'ftpPercent', value: 40 },
      to: { unit: 'watts', value: 300 },
    } as const;
    expect(targetWattsAt(mixed, 0, 100, FTP)).toBe(100);
    expect(targetWattsAt(mixed, 50, 100, FTP)).toBe(200);
  });

  it('has nothing to scale on a free step', () => {
    expect(targetWattsAt({ kind: 'free' }, 0, 30, FTP, 150)).toBeNull();
  });

  it('scales every form of target', () => {
    expect(targetWattsAt(percent(100), 0, 60, FTP, 80)).toBe(200);
    expect(targetWattsAt(watts(200), 0, 60, FTP, 150)).toBe(300);
    expect(targetWattsAt(ramp(100, 100), 30, 60, FTP, 50)).toBe(125);
  });

  it('rejects an FTP that cannot anchor a percentage', () => {
    expect(() => targetWattsAt(percent(95), 0, 60, 0)).toThrow(RangeError);
  });
});

describe('workout scale', () => {
  it('moves 5 % a press', () => {
    expect(nudgeScalePct(100, 1)).toBe(105);
    expect(nudgeScalePct(100, -1)).toBe(95);
  });

  it('clamps at 50 and 150', () => {
    expect(nudgeScalePct(MIN_SCALE_PCT, -1)).toBe(MIN_SCALE_PCT);
    expect(nudgeScalePct(MAX_SCALE_PCT, 1)).toBe(MAX_SCALE_PCT);
    expect(clampScalePct(10)).toBe(50);
    expect(clampScalePct(1000)).toBe(150);
    expect(clampScalePct(Number.NaN)).toBe(100);
  });
});

describe('stateAt', () => {
  it('reports the current step, its target and what follows', () => {
    const state = stateAt(run(), 0, FTP);
    expect(state).toMatchObject({
      finished: false,
      stepIndex: 0,
      targetW: 238,
      erg: true,
      remainingS: 600,
    });
    expect(state.step?.name).toBe('Threshold');
    expect(state.next?.name).toBe('Easy');
  });

  it('counts the current step down in place', () => {
    expect(stateAt(run(), 599, FTP).remainingS).toBe(1);
    expect(stateAt(run(), 600, FTP)).toMatchObject({ stepIndex: 1, remainingS: 300 });
  });

  it('releases ERG on a free step and has no target to show', () => {
    expect(stateAt(run(), 900, FTP)).toMatchObject({ stepIndex: 2, targetW: null, erg: false });
    expect(stateAt(run(), 900, FTP).next).toBeNull();
  });

  it('finishes past the total, with the index past the end so the list reads as done', () => {
    const state = stateAt(run(), 930, FTP);
    expect(state).toMatchObject({
      finished: true,
      stepIndex: 3,
      step: null,
      targetW: null,
      erg: false,
    });
  });

  it('treats a clock before the start as the start', () => {
    expect(stateAt(run(), -5, FTP).stepIndex).toBe(0);
  });

  it('applies the scale to the live target', () => {
    expect(stateAt(run(), 0, FTP, 80).targetW).toBe(190);
  });
});

describe('skipStep', () => {
  it('truncates the current step to what was ridden and shrinks the total to match', () => {
    const skipped = skipStep(run(), 402);
    expect(skipped.steps[0]?.durationS).toBe(402);
    expect(skipped.totalDurationS).toBe(930 - 198);
    expect(stateAt(skipped, 402, FTP)).toMatchObject({ stepIndex: 1, remainingS: 300 });
  });

  it('leaves the steps after it alone', () => {
    const skipped = skipStep(run(), 60);
    expect(skipped.steps.map((item) => item.durationS)).toEqual([60, 300, 30]);
  });

  it('does not touch the run it was given', () => {
    const before = run();
    skipStep(before, 60);
    expect(before.steps[0]?.durationS).toBe(600);
    expect(before.totalDurationS).toBe(930);
  });

  it('keeps a step skipped at its very start, at zero length', () => {
    const skipped = skipStep(run(), 0);
    expect(skipped.steps[0]?.durationS).toBe(0);
    expect(skipped.steps).toHaveLength(3);
    expect(stateAt(skipped, 0, FTP).stepIndex).toBe(1);
  });

  it('finishes the workout when the last step is skipped', () => {
    const skipped = skipStep(skipStep(skipStep(run(), 10), 20), 30);
    expect(skipped.totalDurationS).toBe(30);
    expect(stateAt(skipped, 30, FTP).finished).toBe(true);
  });

  it('is a no-op once the workout is over', () => {
    const finished = run();
    expect(skipStep(finished, 1000)).toBe(finished);
  });
});

describe('plannedPowerSeries', () => {
  it('is one target per second of the plan', () => {
    const series = plannedPowerSeries(run().steps, FTP);
    expect(series).toHaveLength(930);
    expect(series[0]).toBe(238);
    expect(series[600]).toBe(138);
  });

  it('leaves a free step with no targets at all', () => {
    const series = plannedPowerSeries(run().steps, FTP);
    expect(series.slice(900).every((value) => value === null)).toBe(true);
  });

  it('averages a ramp to its own mean by sampling mid-second', () => {
    const series = plannedPowerSeries([step(100, ramp(40, 80))], FTP);
    const mean = series.reduce((total: number, value) => total + (value ?? 0), 0) / series.length;
    // Within half a watt: each target is a whole number, and every one of these lands on .5.
    expect(Math.abs(mean - 150)).toBeLessThanOrEqual(0.5);
  });

  it('reads the same expansion the runner rides', () => {
    const expanded = expandWorkout(
      parseWorkout(
        `name: t\nsteps:\n  - repeat: 2\n    steps:\n      - { duration: 1m, power: 100% }\n`,
      ),
    );
    expect(plannedPowerSeries(expanded.steps, FTP)).toHaveLength(expanded.totalDurationS);
  });
});
