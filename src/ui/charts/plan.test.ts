import { describe, expect, it } from 'vitest';
import { expandWorkout } from '../../workout/expand';
import { parseWorkout } from '../../workout/parse';
import type { ExpandedStep } from '../../workout/expand';
import { PLAN_SPARKLINE_HEIGHT, PLAN_SPARKLINE_WIDTH, planSparklineGeometry } from './plan';

const FTP = 250;

function step(durationS: number, percent: number | 'free'): ExpandedStep {
  return {
    kind: 'step',
    durationS,
    power:
      percent === 'free'
        ? { kind: 'free' }
        : { kind: 'constant', value: { unit: 'ftpPercent', value: percent } },
  };
}

function geometry(steps: readonly ExpandedStep[]) {
  return planSparklineGeometry({
    steps,
    ftpW: FTP,
    width: PLAN_SPARKLINE_WIDTH,
    height: PLAN_SPARKLINE_HEIGHT,
  });
}

/** `M0,17.5 L60,17.5` -> [{x:0,y:17.5},{x:60,y:17.5}] */
function points(d: string): { x: number; y: number }[] {
  return d
    .split(' ')
    .map((token) => token.slice(1).split(','))
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }));
}

describe('planSparklineGeometry', () => {
  it('draws a steady block as one horizontal segment across the whole width', () => {
    const { paths } = geometry([step(600, 70)]);
    expect(paths).toHaveLength(1);
    const [start, end] = points(paths[0] as string);
    expect(start?.x).toBe(0);
    expect(end?.x).toBe(PLAN_SPARKLINE_WIDTH);
    expect(start?.y).toBe(end?.y);
  });

  it('puts a harder block higher than an easier one', () => {
    const easy = points(geometry([step(600, 55)]).paths[0] as string);
    const hard = points(geometry([step(600, 110)]).paths[0] as string);
    expect(hard[0]?.y).toBeLessThan(easy[0]?.y as number);
  });

  it('holds the scale fixed, so the same block draws the same whatever sits beside it', () => {
    const alone = points(geometry([step(600, 70)]).paths[0] as string);
    const beside = points(geometry([step(600, 70), step(600, 130)]).paths[0] as string);
    expect(beside[0]?.y).toBe(alone[0]?.y);
  });

  it('splits x by time, so a long step takes more width than a short one', () => {
    const { paths } = geometry([step(300, 60), step(900, 90)]);
    const all = points(paths[0] as string);
    expect(all[1]?.x).toBeCloseTo(PLAN_SPARKLINE_WIDTH * 0.25, 6);
    expect(all[3]?.x).toBe(PLAN_SPARKLINE_WIDTH);
  });

  it('steps vertically between two targets, sharing an x', () => {
    const all = points(geometry([step(600, 60), step(600, 90)]).paths[0] as string);
    expect(all[1]?.x).toBe(all[2]?.x);
    expect(all[2]?.y).toBeLessThan(all[1]?.y as number);
  });

  it('slopes a ramp between its two ends', () => {
    const ramp: ExpandedStep = {
      kind: 'step',
      durationS: 600,
      power: {
        kind: 'ramp',
        from: { unit: 'ftpPercent', value: 50 },
        to: { unit: 'ftpPercent', value: 75 },
      },
    };
    const all = points(geometry([ramp]).paths[0] as string);
    expect(all[1]?.y).toBeLessThan(all[0]?.y as number);
  });

  it('breaks the line over a free block rather than drawing it at zero', () => {
    const { paths } = geometry([step(600, 70), step(60, 'free'), step(600, 70)]);
    expect(paths).toHaveLength(2);
    const second = points(paths[1] as string);
    expect(second[0]?.x).toBeGreaterThan(PLAN_SPARKLINE_WIDTH / 2);
  });

  it('clamps a target above the ceiling rather than letting it leave the box', () => {
    const { paths, peakW } = geometry([step(600, 300)]);
    const all = points(paths[0] as string);
    expect(all[0]?.y).toBeGreaterThanOrEqual(0);
    expect(peakW).toBe(750);
  });

  it('keeps every coordinate inside the box, starter workouts included', () => {
    for (const source of [
      'name: A\nsteps:\n  - { duration: 10m, power: 55% }\n',
      'name: B\nwarmup: { duration: 10m, ramp: [50%, 75%] }\nsteps:\n  - { duration: 20m, power: 95% }\ncooldown: { duration: 5m, power: 150W }\n',
    ]) {
      const { paths } = geometry(expandWorkout(parseWorkout(source)).steps);
      for (const d of paths) {
        for (const point of points(d)) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(PLAN_SPARKLINE_WIDTH);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(PLAN_SPARKLINE_HEIGHT);
        }
      }
    }
  });

  it('draws nothing for a plan with no steps', () => {
    expect(geometry([]).paths).toEqual([]);
  });
});
