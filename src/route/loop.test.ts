import { describe, expect, it } from 'vitest';
import {
  LOOP_CLOSE_M,
  isLoop,
  lapLabel,
  lapNumber,
  lapPositionM,
  lapStartM,
  lapsLabel,
} from './loop';
import type { Route, RoutePoint } from './types';
import { climbRoute, diamondLoopRoute, flatRoute } from '../../test/fixtures';

/**
 * A route whose finish sits a given distance north of its start. Latitude only, because
 * a degree of latitude is the same length everywhere and the arithmetic is checkable:
 * 1 m is 1 / 111_195 of a degree at the mean radius the parser uses.
 */
const METRE_IN_DEGREES = 1 / 111_195;

function routeEndingNorthOfStart(gapM: number, lengthM = 1000): Route {
  const points: RoutePoint[] = [
    { lat: 51.5, lon: -0.1, eleM: 100, distM: 0 },
    { lat: 51.6, lon: -0.1, eleM: 150, distM: lengthM / 2 },
    { lat: 51.5 + gapM * METRE_IN_DEGREES, lon: -0.1, eleM: 100, distM: lengthM },
  ];
  return { points, totalDistanceM: lengthM, totalAscentM: 50 };
}

describe('isLoop', () => {
  it('is true for a track whose last point is its first', () => {
    expect(isLoop(diamondLoopRoute())).toBe(true);
  });

  it('is false for a route that ends somewhere else', () => {
    expect(isLoop(climbRoute())).toBe(false);
    expect(isLoop(flatRoute())).toBe(false);
  });

  it('allows the few metres a recorded loop misses by, and no more', () => {
    expect(isLoop(routeEndingNorthOfStart(LOOP_CLOSE_M - 5))).toBe(true);
    expect(isLoop(routeEndingNorthOfStart(LOOP_CLOSE_M + 5))).toBe(false);
  });

  it('is false for a route no longer than the tolerance: short is not closed', () => {
    expect(isLoop(routeEndingNorthOfStart(0, LOOP_CLOSE_M))).toBe(false);
    expect(isLoop(routeEndingNorthOfStart(0, LOOP_CLOSE_M + 1))).toBe(true);
  });

  it('is false for a route with no points to compare', () => {
    expect(isLoop({ points: [], totalDistanceM: 1000, totalAscentM: 0 })).toBe(false);
  });
});

describe('lapPositionM', () => {
  it('is the distance itself inside the first lap', () => {
    expect(lapPositionM(0, 1000)).toBe(0);
    expect(lapPositionM(999, 1000)).toBe(999);
  });

  it('wraps at the route length rather than stopping there', () => {
    expect(lapPositionM(1000, 1000)).toBe(0);
    expect(lapPositionM(1250, 1000)).toBe(250);
    expect(lapPositionM(3750, 1000)).toBe(750);
  });

  it('answers zero for a route with no length rather than dividing by it', () => {
    expect(lapPositionM(500, 0)).toBe(0);
  });
});

describe('lapNumber', () => {
  it('counts from one: the first metre of a ride is lap 1', () => {
    expect(lapNumber(0, 1000)).toBe(1);
    expect(lapNumber(999.9, 1000)).toBe(1);
  });

  it('turns over exactly at the start line', () => {
    expect(lapNumber(1000, 1000)).toBe(2);
    expect(lapNumber(2500, 1000)).toBe(3);
  });

  it('is lap one with no length to divide by', () => {
    expect(lapNumber(5000, 0)).toBe(1);
  });
});

describe('lapStartM', () => {
  it('is the distance the current lap began at', () => {
    expect(lapStartM(400, 1000)).toBe(0);
    expect(lapStartM(1400, 1000)).toBe(1000);
    expect(lapStartM(2000, 1000)).toBe(2000);
  });
});

describe('lapLabel', () => {
  it('reads Loop until a lap is complete, and counts after', () => {
    expect(lapLabel(0, 1000)).toBe('Loop');
    expect(lapLabel(999, 1000)).toBe('Loop');
    expect(lapLabel(1000, 1000)).toBe('Lap 2');
    expect(lapLabel(2001, 1000)).toBe('Lap 3');
  });
});

describe('lapsLabel', () => {
  it('counts the laps completed, not the one being ridden', () => {
    expect(lapsLabel(1000, 1000)).toBe('1 lap');
    expect(lapsLabel(1999, 1000)).toBe('1 lap');
    expect(lapsLabel(5400, 1000)).toBe('5 laps');
  });

  it('reads as the plain tag where no lap was completed', () => {
    expect(lapsLabel(0, 1000)).toBe('Loop');
    expect(lapsLabel(999, 1000)).toBe('Loop');
  });
});
