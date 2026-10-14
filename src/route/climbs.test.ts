import { describe, expect, it } from 'vitest';
import { detectClimbs } from './climbs';
import { climbRoute, flatRoute } from '../../test/fixtures';
import type { Route, RoutePoint } from './types';

/** Build a route by sampling an elevation function every 10 m. */
function routeFromProfile(lengthM: number, eleAt: (s: number) => number): Route {
  const points: RoutePoint[] = [];
  let totalAscentM = 0;
  for (let distM = 0; distM <= lengthM; distM += 10) {
    const eleM = eleAt(distM);
    const previous = points.at(-1);
    if (previous && eleM > previous.eleM) totalAscentM += eleM - previous.eleM;
    points.push({ lat: 0, lon: 0, eleM, distM });
  }
  return { points, totalDistanceM: lengthM, totalAscentM };
}

describe('detectClimbs', () => {
  it('finds nothing on the flat', () => {
    expect(detectClimbs(flatRoute())).toEqual([]);
  });

  it('finds the single constant climb of the fixture', () => {
    const climbs = detectClimbs(climbRoute());
    expect(climbs).toHaveLength(1);
    expect(climbs[0]?.gainM).toBeCloseTo(100, 1);
    expect(climbs[0]?.summitM).toBeCloseTo(1000, 0);
    expect(climbs[0]?.averageGradePercent).toBeCloseTo(10, 1);
  });

  it('reports gain rather than summit elevation, which is what the chart labels', () => {
    // A 200 m climb starting 1000 m above sea level.
    const route = routeFromProfile(2000, (s) => 1000 + s * 0.1);
    const climb = detectClimbs(route)[0];
    expect(climb?.gainM).toBeCloseTo(200, 1);
    expect(climb?.summitEleM).toBeCloseTo(1200, 1);
  });

  it('trims a flat approach off the foot of the climb', () => {
    // 3 km flat, then 2 km at 8 %.
    const route = routeFromProfile(5000, (s) => (s <= 3000 ? 100 : 100 + (s - 3000) * 0.08));
    const climb = detectClimbs(route)[0];
    expect(detectClimbs(route)).toHaveLength(1);
    // The trim measures over a 250 m window, so it stops within a bin of the kick-up.
    expect(climb?.startM).toBeGreaterThan(2700);
    expect(climb?.startM).toBeLessThanOrEqual(3050);
    expect(climb?.averageGradePercent).toBeGreaterThan(7);
  });

  it('does not split a climb at a false flat or a small dip', () => {
    // 4 km at 7 % with a 6 m dip in the middle: one climb, not two.
    const route = routeFromProfile(4000, (s) => {
      const base = s * 0.07;
      return base - (s > 1800 && s < 2200 ? 6 : 0);
    });
    expect(detectClimbs(route)).toHaveLength(1);
  });

  it('splits at a real descent between two climbs', () => {
    const route = routeFromProfile(6000, (s) => {
      if (s < 2000) return s * 0.08; // up 160 m
      if (s < 3000) return 160 - (s - 2000) * 0.08; // down 80 m
      return 80 + (s - 3000) * 0.06; // up 180 m
    });
    const climbs = detectClimbs(route);
    expect(climbs).toHaveLength(2);
    expect(climbs[0]?.summitM).toBeCloseTo(2000, -2);
    expect(climbs[0]?.gainM).toBeCloseTo(160, 0);
    expect(climbs[1]?.startM).toBeCloseTo(3000, -2);
    expect(climbs[1]?.gainM).toBeCloseTo(180, 0);
  });

  it('ignores rolling undulations rather than calling each rise a climb', () => {
    // 10 km of 500 m undulations, 12 m peak to trough: 240 m of ascent, no climbs.
    const route = routeFromProfile(10_000, (s) => 100 + 6 * Math.sin((2 * Math.PI * s) / 500));
    expect(route.totalAscentM).toBeGreaterThan(200);
    expect(detectClimbs(route)).toEqual([]);
  });

  it('ignores a long shallow drift that clears the gain floor on length alone', () => {
    const route = routeFromProfile(15_000, (s) => 100 + s * 0.015); // 225 m at 1.5 %
    expect(detectClimbs(route)).toEqual([]);
  });

  it('honours overridden thresholds', () => {
    const route = routeFromProfile(15_000, (s) => 100 + s * 0.015);
    expect(detectClimbs(route, { minAverageGradePercent: 1 })).toHaveLength(1);
    expect(detectClimbs(climbRoute(), { minGainM: 500 })).toEqual([]);
  });

  it('rejects a nonsense sample step', () => {
    expect(() => detectClimbs(climbRoute(), { sampleStepM: 0 })).toThrow(/positive distance/);
  });

  it('returns nothing for a route shorter than the minimum climb length', () => {
    expect(detectClimbs(routeFromProfile(300, (s) => s * 0.1))).toEqual([]);
  });
});
