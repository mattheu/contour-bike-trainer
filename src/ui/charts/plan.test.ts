import { describe, expect, it } from 'vitest';
import { expandWorkout } from '../../workout/expand';
import { parseWorkout } from '../../workout/parse';
import type { ExpandedStep } from '../../workout/expand';
import type { PowerZone } from '../../zones/power';
import {
  PLAN_SPARKLINE_HEIGHT,
  PLAN_SPARKLINE_WIDTH,
  ZONE_WASH_OPACITY,
  planSegments,
  planSparklineGeometry,
  stepZone,
  zoneWash,
} from './plan';

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

describe('the zone wash', () => {
  it('darkens with every zone above the first, so intensity reads as shade', () => {
    for (let zone = 3; zone <= 6; zone += 1) {
      expect(ZONE_WASH_OPACITY[zone as PowerZone]).toBeGreaterThan(
        ZONE_WASH_OPACITY[(zone - 1) as PowerZone],
      );
    }
  });

  it('leaves zone 1 unshaded, because recovery is the absence of work', () => {
    expect(ZONE_WASH_OPACITY[1]).toBe(0);
  });

  it('spaces the zones evenly, so a step up in zone is a step up in shade', () => {
    const step = ZONE_WASH_OPACITY[2] - ZONE_WASH_OPACITY[1];
    for (let zone = 2; zone <= 6; zone += 1) {
      const rise =
        ZONE_WASH_OPACITY[zone as PowerZone] - ZONE_WASH_OPACITY[(zone - 1) as PowerZone];
      expect(rise).toBeCloseTo(step, 10);
    }
  });

  it('stays behind the type it sits under', () => {
    // Free to use the range the chart needs: the Steps panel's rule is translucent and
    // composites above the fill, so it cannot be swallowed by a brighter one.
    expect(ZONE_WASH_OPACITY[6]).toBeCloseTo(0.2, 10);
  });

  it('has nothing for an absent zone, rather than the lightest one', () => {
    expect(zoneWash(null)).toBeNull();
    expect(zoneWash(1)).toBe(ZONE_WASH_OPACITY[1]);
  });
});

describe('stepZone', () => {
  it('classes a step by the target it asks for', () => {
    expect(stepZone(step(600, 60), FTP)).toBe(2);
    expect(stepZone(step(600, 95), FTP)).toBe(4);
  });

  it('classes a ramp by its mean, which is the effort it averages out to', () => {
    const warmup: ExpandedStep = {
      kind: 'step',
      durationS: 600,
      power: {
        kind: 'ramp',
        from: { unit: 'ftpPercent', value: 50 },
        to: { unit: 'ftpPercent', value: 70 },
      },
    };
    expect(stepZone(warmup, FTP)).toBe(2);
  });

  it('follows workout difficulty, so the row agrees with the chart block above it', () => {
    expect(stepZone(step(600, 95), FTP, 70)).toBe(2);
  });

  it('has no zone for a free step: an absence, not zone 1', () => {
    expect(stepZone(step(600, 'free'), FTP)).toBeNull();
  });
});

describe('planSegments', () => {
  it('leaves a free step out, so a gap in the list is a gap in the plan', () => {
    const segments = planSegments([step(600, 60), step(300, 'free'), step(600, 90)], FTP);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.endS).toBe(600);
    expect(segments[1]?.startS).toBe(900);
  });

  it('is contiguous where the plan is', () => {
    const segments = planSegments([step(600, 60), step(600, 90)], FTP);
    expect(segments[1]?.startS).toBe(segments[0]?.endS);
  });

  it('carries the step it came from, skipping the index a free step took', () => {
    const segments = planSegments([step(600, 60), step(300, 'free'), step(600, 90)], FTP);

    // Not 0 and 1: the second segment is the third step, and anything downstream that
    // wants to name the step behind a block has to be told which one it actually is.
    expect(segments.map((segment) => segment.stepIndex)).toEqual([0, 2]);
  });
});
