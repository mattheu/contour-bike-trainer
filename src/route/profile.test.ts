import { describe, expect, it } from 'vitest';
import {
  BIN_LENGTH_M,
  WINDOW_NARROW_M,
  WINDOW_WIDE_M,
  ascentAt,
  bandFor,
  buildProfile,
  cumulativeAscent,
  gradientBins,
  mergeRuns,
  projectWindow,
  resample,
} from './profile';
import type { GradientBin } from './profile';
import { climbRoute, flatRoute } from '../../test/fixtures';
import type { Route, RoutePoint } from './types';

/** Build a route from (distance, elevation) pairs; lat/lon are irrelevant to the profile. */
function routeFrom(pairs: [number, number][]): Route {
  const points: RoutePoint[] = pairs.map(([distM, eleM]) => ({ lat: 0, lon: 0, eleM, distM }));
  let totalAscentM = 0;
  for (let i = 1; i < points.length; i += 1) {
    const rise = (points[i]?.eleM ?? 0) - (points[i - 1]?.eleM ?? 0);
    if (rise > 0) totalAscentM += rise;
  }
  return { points, totalDistanceM: pairs.at(-1)?.[0] ?? 0, totalAscentM };
}

function bin(startM: number, endM: number, band: GradientBin['band']): GradientBin {
  return { startM, endM, gradePercent: 0, band };
}

describe('bandFor', () => {
  it('classifies on the spec boundaries, lower bound inclusive', () => {
    expect(bandFor(1.99)).toBeNull();
    expect(bandFor(2)).toBe('2-4');
    expect(bandFor(3.99)).toBe('2-4');
    expect(bandFor(4)).toBe('4-7');
    expect(bandFor(7)).toBe('7-10');
    expect(bandFor(10)).toBe('10+');
    expect(bandFor(25)).toBe('10+');
  });

  it('leaves descents unbanded: the chart shades uphill only', () => {
    expect(bandFor(-8)).toBeNull();
    expect(bandFor(0)).toBeNull();
  });
});

describe('gradientBins', () => {
  it('cuts fixed 250 m bins regardless of point spacing', () => {
    const bins = gradientBins(climbRoute());
    expect(bins).toHaveLength(4);
    expect(bins[0]?.startM).toBe(0);
    expect(bins[0]?.endM).toBe(BIN_LENGTH_M);
    expect(bins.every((b) => b.band === '10+')).toBe(true);
  });

  it('truncates the last bin to the route end and still grades it correctly', () => {
    const route = routeFrom([
      [0, 0],
      [600, 30],
    ]);
    const bins = gradientBins(route);
    expect(bins).toHaveLength(3);
    expect(bins[2]).toMatchObject({ startM: 500, endM: 600 });
    expect(bins[2]?.gradePercent).toBeCloseTo(5, 6);
  });

  it('leaves a flat route entirely unbanded', () => {
    expect(gradientBins(flatRoute()).every((b) => b.band === null)).toBe(true);
  });
});

describe('mergeRuns', () => {
  it('merges contiguous bins of the same band into one run', () => {
    const runs = mergeRuns([
      bin(0, 250, '2-4'),
      bin(250, 500, '2-4'),
      bin(500, 750, '4-7'),
      bin(750, 1000, '4-7'),
      bin(1000, 1250, '4-7'),
    ]);
    expect(runs).toEqual([
      { startM: 0, endM: 500, band: '2-4', binCount: 2 },
      { startM: 500, endM: 1250, band: '4-7', binCount: 3 },
    ]);
  });

  it('does not merge through an unbanded bin', () => {
    const runs = mergeRuns([bin(0, 250, '2-4'), bin(250, 500, null), bin(500, 750, '2-4')]);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.startM)).toEqual([0, 500]);
  });

  it('returns nothing for an entirely flat route', () => {
    expect(mergeRuns([bin(0, 250, null)])).toEqual([]);
  });
});

describe('cumulativeAscent', () => {
  const route = routeFrom([
    [0, 100],
    [500, 200],
    [1000, 150],
    [1500, 250],
  ]);

  it('accumulates only the climbing and reports the total', () => {
    const series = cumulativeAscent(route);
    expect(series.points.map((p) => p.ascentM)).toEqual([0, 100, 100, 200]);
    expect(series.totalM).toBe(200);
    expect(series.totalM).toBe(route.totalAscentM);
  });

  it('interpolates inside a climbing segment', () => {
    expect(ascentAt(cumulativeAscent(route), 250)).toBeCloseTo(50, 6);
  });

  it('stays flat inside a descending segment', () => {
    const series = cumulativeAscent(route);
    expect(ascentAt(series, 600)).toBe(100);
    expect(ascentAt(series, 999)).toBe(100);
  });

  it('clamps outside the route', () => {
    const series = cumulativeAscent(route);
    expect(ascentAt(series, -10)).toBe(0);
    expect(ascentAt(series, 99_999)).toBe(200);
  });
});

describe('projectWindow', () => {
  const route = routeFrom(
    Array.from({ length: 121 }, (_, i): [number, number] => [i * 100, i * 2]),
  ); // 12 km at a steady 2 %
  const profile = buildProfile(route);

  it('centres the window and clips the points to it', () => {
    const window = projectWindow(route, profile, 6000, WINDOW_WIDE_M);
    expect(window.startM).toBe(3500);
    expect(window.endM).toBe(8500);
    expect(window.points[0]?.distM).toBe(3500);
    expect(window.points.at(-1)?.distM).toBe(8500);
    expect(window.points.every((p) => p.distM >= 3500 && p.distM <= 8500)).toBe(true);
  });

  it('slides the window back inside the route at the start and finish', () => {
    expect(projectWindow(route, profile, 100, WINDOW_WIDE_M).startM).toBe(0);
    const atEnd = projectWindow(route, profile, 11_900, WINDOW_WIDE_M);
    expect(atEnd.endM).toBe(route.totalDistanceM);
    expect(atEnd.startM).toBe(route.totalDistanceM - WINDOW_WIDE_M);
  });

  it('keeps bins 250 m long in the narrow window rather than re-binning', () => {
    const window = projectWindow(route, profile, 6000, WINDOW_NARROW_M);
    expect(window.widthM).toBe(WINDOW_NARROW_M);
    expect(window.bins.every((b) => b.endM - b.startM === BIN_LENGTH_M)).toBe(true);
    // A 500 m window overlaps two whole bins when it lands on a bin boundary.
    expect(window.bins).toHaveLength(2);
  });

  it('includes every bin and run that overlaps the window, not only those inside it', () => {
    const window = projectWindow(route, profile, 6100, WINDOW_NARROW_M);
    expect(window.bins[0]?.startM).toBeLessThanOrEqual(window.startM);
    expect(window.bins.at(-1)?.endM).toBeGreaterThanOrEqual(window.endM);
    expect(window.runs).toHaveLength(1);
  });

  it('shrinks to the route when the window is wider than the whole route', () => {
    const short = routeFrom([
      [0, 0],
      [1000, 20],
    ]);
    const window = projectWindow(short, buildProfile(short), 500, WINDOW_WIDE_M);
    expect(window).toMatchObject({ startM: 0, endM: 1000, widthM: 1000 });
  });

  it('rejects a nonsense width', () => {
    expect(() => projectWindow(route, profile, 0, 0)).toThrow(/positive distance/);
  });
});

describe('resample', () => {
  const route = routeFrom(Array.from({ length: 1001 }, (_, i): [number, number] => [i * 10, i]));

  it('reduces to the target vertex count, keeping both ends', () => {
    const points = resample(route.points, 200);
    expect(points).toHaveLength(200);
    expect(points[0]?.distM).toBe(0);
    expect(points.at(-1)?.distM).toBe(10_000);
  });

  it('spaces the vertices evenly and interpolates their elevation', () => {
    const points = resample(route.points, 11);
    expect(points.map((p) => p.distM)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000,
    ]);
    expect(points[5]?.eleM).toBeCloseTo(500, 6);
  });

  it('leaves a series alone when it is already short enough', () => {
    const points = resample(route.points, 5000);
    expect(points).toHaveLength(route.points.length);
    expect(points[3]).not.toBe(route.points[3]); // a copy, not the route's own array
  });

  it('works on a projected window as well as a whole route', () => {
    const window = projectWindow(route, buildProfile(route), 5000, WINDOW_NARROW_M);
    const points = resample(window.points, 20);
    expect(points).toHaveLength(20);
    expect(points[0]?.distM).toBe(window.startM);
    expect(points.at(-1)?.distM).toBe(window.endM);
  });

  it('rejects a target that could not describe a line', () => {
    expect(() => resample(route.points, 1)).toThrow(/at least 2/);
    expect(() => resample(route.points, 10.5)).toThrow(/integer/);
  });
});

describe('buildProfile', () => {
  it('returns bins, their merged runs and the ascent series together', () => {
    const route = climbRoute();
    const profile = buildProfile(route);
    expect(profile.bins).toHaveLength(4);
    expect(profile.runs).toHaveLength(1);
    expect(profile.runs[0]).toMatchObject({ startM: 0, band: '10+', binCount: 4 });
    expect(profile.runs[0]?.endM).toBeCloseTo(route.totalDistanceM, 6);
    expect(profile.ascent.totalM).toBeCloseTo(100, 6);
  });
});
