import { describe, expect, it } from 'vitest';
import { detectClimbs } from '../../route/climbs';
import { elevationAt } from '../../route/position';
import { WINDOW_NARROW_M, WINDOW_WIDE_M, buildProfile, projectWindow } from '../../route/profile';
import type { Route, RoutePoint } from '../../route/types';
import {
  MAX_RELIEF_FRACTION,
  MIN_RELIEF_FRACTION,
  VERTICAL_EXAGGERATION,
  elevationGeometry,
  elevationScale,
  tickStepM,
} from './elevation';

const WIDTH = 944;
const HEIGHT = 220;

/** A straight synthetic route: only distance and elevation matter to the profile. */
function syntheticRoute(totalM: number, eleAt: (distM: number) => number, stepM = 50): Route {
  const points: RoutePoint[] = [];
  let totalAscentM = 0;
  for (let distM = 0; distM <= totalM; distM += stepM) {
    const eleM = eleAt(distM);
    const previous = points[points.length - 1];
    if (previous && eleM > previous.eleM) totalAscentM += eleM - previous.eleM;
    points.push({ lat: 54 + distM / 1e6, lon: -2, eleM, distM });
  }
  return { points, totalDistanceM: totalM, totalAscentM };
}

/** The straight line between each pair of corners, so a profile reads as the shape it is. */
function profileFrom(corners: readonly (readonly [number, number])[]) {
  return (distM: number): number => {
    for (let i = 1; i < corners.length; i += 1) {
      const [startM, startEleM] = corners[i - 1]!;
      const [endM, endEleM] = corners[i]!;
      if (distM <= endM) {
        return startEleM + ((endEleM - startEleM) * (distM - startM)) / (endM - startM);
      }
    }
    return corners[corners.length - 1]![1];
  };
}

/**
 * Two declared profiles rather than two measured ones (ADR-0011). Every figure the
 * assertions below quote — 450 m of gain, one climb, 30.0 km — is written here first,
 * so a failure means the chart read the profile wrongly rather than that a file moved.
 */
const CLIMB_FOOT_M = 10_000;
const CLIMB_SUMMIT_M = 15_000;
const CLIMB_GAIN_M = 450;
const SUMMIT_ELE_M = 550;
/** Mid-climb, where the marker meets a gradient worth asserting about. */
const ON_THE_CLIMB_M = 12_000;
/** A 750 m ramp at 3 %: shaded on the chart, and 22.5 m is far short of a named climb. */
const RAMP_CENTRE_M = 22_375;
const VARIED_TOTAL_M = 30_000;
const VARIED_RELIEF_M = CLIMB_GAIN_M;

const varied = syntheticRoute(
  VARIED_TOTAL_M,
  profileFrom([
    [0, 100],
    [CLIMB_FOOT_M, 100],
    [CLIMB_SUMMIT_M, SUMMIT_ELE_M], // 5 km at 9 %
    [20_000, 100], // and straight back down at 9 %
    [22_000, 100],
    [22_750, 122.5], // the 3 % ramp
    [23_500, 100],
    [VARIED_TOTAL_M, 100],
  ]),
);

/** 20 km of 2 km undulations, 8 m either side of 100 m: 16 m of relief and no climb. */
const UNDULATION_AMPLITUDE_M = 8;
const undulating = syntheticRoute(
  20_000,
  (distM) => 100 + UNDULATION_AMPLITUDE_M * Math.sin((2 * Math.PI * distM) / 2000),
);

function relief(route: Route): number {
  const eles = route.points.map((point) => point.eleM);
  return Math.max(...eles) - Math.min(...eles);
}

function scaleFor(route: Route, width = WIDTH, height = HEIGHT) {
  const eles = route.points.map((point) => point.eleM);
  return elevationScale({
    eleMinM: Math.min(...eles),
    eleMaxM: Math.max(...eles),
    spanM: route.totalDistanceM,
    width,
    height,
  });
}

describe('vertical exaggeration', () => {
  it('draws elevation at a fixed multiple of the horizontal scale in the normal regime', () => {
    // 450 m of relief over 30 km: the exaggeration it asks for is the one it gets.
    const scale = scaleFor(varied);
    expect(relief(varied)).toBe(VARIED_RELIEF_M);
    const expected = (WIDTH / varied.totalDistanceM) * VERTICAL_EXAGGERATION;

    expect(scale.clamp).toBe('none');
    expect(scale.pxPerMetre).toBeCloseTo(expected, 9);
    expect(scale.reliefPx).toBeCloseTo(relief(varied) * expected, 6);
    expect(scale.reliefPx).toBeGreaterThan(HEIGHT * MIN_RELIEF_FRACTION);
    expect(scale.reliefPx).toBeLessThan(HEIGHT * MAX_RELIEF_FRACTION);
  });

  it('lifts a near-flat route off the floor so it still shows shape', () => {
    // 16 m over 20 km would be 7.6 px unclamped, which reads as a ruled line.
    const scale = scaleFor(undulating);
    expect(relief(undulating)).toBeCloseTo(2 * UNDULATION_AMPLITUDE_M, 9);
    const unclamped =
      relief(undulating) * (WIDTH / undulating.totalDistanceM) * VERTICAL_EXAGGERATION;

    expect(unclamped).toBeLessThan(HEIGHT * MIN_RELIEF_FRACTION);
    expect(scale.clamp).toBe('floor');
    expect(scale.reliefPx).toBeCloseTo(HEIGHT * MIN_RELIEF_FRACTION, 9);
  });

  it('holds an alpine route under the ceiling, leaving room for summit labels', () => {
    const alpine = syntheticRoute(15000, (distM) => 200 + (distM / 15000) * 1000);
    const scale = scaleFor(alpine);

    expect(scale.clamp).toBe('ceiling');
    expect(scale.reliefPx).toBeCloseTo(HEIGHT * MAX_RELIEF_FRACTION, 9);
    expect(scale.yFor(1200)).toBeGreaterThan(0);
  });

  it('draws perfectly level ground flat instead of dividing by zero', () => {
    const level = syntheticRoute(5000, () => 100);
    const scale = scaleFor(level);

    expect(scale.clamp).toBe('level');
    expect(scale.pxPerMetre).toBe(0);
    expect(scale.reliefPx).toBe(0);
    expect(scale.yFor(100)).toBeCloseTo(HEIGHT - HEIGHT * 0.08, 9);
  });

  it('keeps the two profiles honestly different from each other', () => {
    // The whole point of a fixed ratio: the undulating route must not read as a
    // mountain range next to the one with a 450 m climb in it.
    expect(scaleFor(varied).reliefPx / scaleFor(undulating).reliefPx).toBeGreaterThan(5);
  });

  it('re-exaggerates against the window when zoomed in', () => {
    const profile = buildProfile(varied);
    const window = projectWindow(varied, profile, 8000, WINDOW_WIDE_M);
    const eles = window.points.map((point) => point.eleM);
    const zoomed = elevationScale({
      eleMinM: Math.min(...eles),
      eleMaxM: Math.max(...eles),
      spanM: WINDOW_WIDE_M,
      width: WIDTH,
      height: HEIGHT,
    });

    expect(zoomed.pxPerMetre).toBeGreaterThan(scaleFor(varied).pxPerMetre);
  });
});

describe('tickStepM', () => {
  it('steps 5 km on a route, 1 km at the 5 km zoom and 100 m at 500 m', () => {
    expect(tickStepM(undulating.totalDistanceM)).toBe(5000);
    expect(tickStepM(WINDOW_WIDE_M)).toBe(1000);
    expect(tickStepM(WINDOW_NARROW_M)).toBe(100);
  });
});

describe('elevationGeometry, route view', () => {
  const profile = buildProfile(varied);
  const climbs = detectClimbs(varied);
  const geometry = elevationGeometry({
    route: varied,
    profile,
    climbs,
    width: WIDTH,
    height: HEIGHT,
  });

  it('maps the route across the full chart width', () => {
    expect(geometry.xFor(0)).toBe(0);
    expect(geometry.xFor(varied.totalDistanceM)).toBeCloseTo(WIDTH, 9);
    expect(geometry.xFor(-500)).toBe(0);
    expect(geometry.xFor(varied.totalDistanceM + 500)).toBeCloseTo(WIDTH, 9);
  });

  it('smooths the profile line and closes the area onto the baseline', () => {
    expect(geometry.linePath.startsWith('M0,')).toBe(true);
    expect(geometry.linePath).toContain(' C');
    expect(geometry.areaPath.startsWith(geometry.linePath)).toBe(true);
    expect(geometry.areaPath.endsWith(`L0,${HEIGHT} Z`)).toBe(true);
    expect(geometry.baselineY).toBe(HEIGHT);
  });

  it('ticks every 5 km, alternating long and short, with an end label only', () => {
    const expected = Math.floor(varied.totalDistanceM / 5000) + 1;
    expect(geometry.ticks).toHaveLength(expected);
    expect(geometry.ticks.map((tick) => tick.long).slice(0, 4)).toEqual([true, false, true, false]);
    expect(geometry.ticks[1]?.x).toBeCloseTo((5000 / varied.totalDistanceM) * WIDTH, 6);
    expect(geometry.startLabel).toBeNull();
    expect(geometry.endLabel).toBe(`${VARIED_TOTAL_M / 1000}.0 km`);
    expect(geometry.showEndCircles).toBe(true);
  });

  it('labels summits with the climb gain, not the summit height', () => {
    expect(climbs).toHaveLength(1);
    expect(geometry.summits).toHaveLength(1);
    const summit = geometry.summits[0];
    expect(summit?.label).toBe(`+${CLIMB_GAIN_M} m`);
    expect(summit?.label).not.toContain(String(SUMMIT_ELE_M));
    expect(summit?.x).toBeGreaterThan(0);
    expect(summit?.x).toBeLessThan(WIDTH);
    expect(summit?.y).toBeCloseTo(geometry.yFor(climbs[0]?.summitEleM ?? 0), 9);
  });

  it('fills one band per uphill run, down to the baseline', () => {
    expect(geometry.bands).toHaveLength(profile.runs.length);
    expect(geometry.bands.length).toBeGreaterThan(0);
    for (const band of geometry.bands) {
      expect(band.d.endsWith('Z')).toBe(true);
      expect(band.d).toContain(`,${HEIGHT} L`);
      // Straight segments: a smoothed fill overshoots the profile line at the ends.
      expect(band.d).not.toContain(' C');
    }
  });

  it('grows the ridden prefix from nothing to the whole line', () => {
    expect(geometry.riddenLinePath(0)).toBe('');
    expect(geometry.riddenAreaPath(0)).toBe('');

    const quarter = geometry.riddenLinePath(varied.totalDistanceM / 4);
    const half = geometry.riddenLinePath(varied.totalDistanceM / 2);
    expect(quarter.length).toBeGreaterThan(0);
    expect(half.length).toBeGreaterThan(quarter.length);
    expect(half.startsWith('M0,')).toBe(true);

    const whole = geometry.riddenAreaPath(varied.totalDistanceM);
    expect(whole.endsWith(`L0,${HEIGHT} Z`)).toBe(true);
  });

  it('places the rider on the profile with the gradient it is about to meet', () => {
    expect(geometry.marker(0).x).toBe(0);
    expect(geometry.marker(varied.totalDistanceM).x).toBeCloseTo(WIDTH, 9);

    const onTheClimb = geometry.marker(ON_THE_CLIMB_M);
    expect(onTheClimb.gradePercent).toBeGreaterThan(2);
    expect(onTheClimb.y).toBeCloseTo(geometry.yFor(elevationAt(varied, ON_THE_CLIMB_M)), 9);
    expect(onTheClimb.x).toBeCloseTo((ON_THE_CLIMB_M / varied.totalDistanceM) * WIDTH, 6);
  });
});

describe('elevationGeometry, zoom windows', () => {
  const profile = buildProfile(varied);
  const climbs = detectClimbs(varied);

  function windowed(centreM: number, widthM: number) {
    const window = projectWindow(varied, profile, centreM, widthM);
    return {
      window,
      geometry: elevationGeometry({
        route: varied,
        profile,
        climbs,
        window,
        width: WIDTH,
        height: HEIGHT,
      }),
    };
  }

  it('re-projects x onto the window and ticks every kilometre at 5 km', () => {
    const { window, geometry } = windowed(12000, WINDOW_WIDE_M);

    expect(geometry.xFor(window.startM)).toBe(0);
    expect(geometry.xFor(window.endM)).toBeCloseTo(WIDTH, 9);
    expect(geometry.ticks).toHaveLength(6);
    expect(geometry.ticks[1]?.x).toBeCloseTo(WIDTH / 5, 6);
  });

  it('labels the window start and drops the route view end circles', () => {
    const { window, geometry } = windowed(12000, WINDOW_WIDE_M);

    expect(geometry.startLabel).toBe((window.startM / 1000).toFixed(1));
    expect(geometry.endLabel).toBe(`${(window.endM / 1000).toFixed(1)} km`);
    expect(geometry.showEndCircles).toBe(false);
  });

  it('ticks every 100 m at the 500 m zoom', () => {
    const { geometry } = windowed(12000, WINDOW_NARROW_M);
    expect(geometry.ticks).toHaveLength(6);
  });

  it('renders the same 250 m bins wider rather than re-binning', () => {
    // Centred on the 3 % ramp, which is the one shaded run short enough to sit whole
    // inside a 5 km window.
    const { window, geometry: zoomed } = windowed(RAMP_CENTRE_M, WINDOW_WIDE_M);
    const widths = window.bins.map((bin) => bin.endM - bin.startM);
    expect(new Set(widths)).toEqual(new Set([250]));

    // A run wholly inside the window occupies five times the width at the 5 km zoom.
    const run = window.runs.find(
      (candidate) => candidate.startM >= window.startM && candidate.endM <= window.endM,
    );
    expect(run).toBeDefined();
    const route = elevationGeometry({
      route: varied,
      profile,
      climbs,
      width: WIDTH,
      height: HEIGHT,
    });
    const routeWidth = route.xFor(run!.endM) - route.xFor(run!.startM);
    const zoomWidth = zoomed.xFor(run!.endM) - zoomed.xFor(run!.startM);
    expect(zoomWidth / routeWidth).toBeCloseTo(varied.totalDistanceM / WINDOW_WIDE_M, 6);
  });

  it('shows a summit only while it is inside the window', () => {
    const summitM = climbs[0]?.summitM ?? 0;
    expect(windowed(summitM, WINDOW_WIDE_M).geometry.summits).toHaveLength(1);
    expect(windowed(summitM + 12000, WINDOW_WIDE_M).geometry.summits).toHaveLength(0);
  });

  it('starts the ridden prefix empty when the rider is behind the window', () => {
    const { window, geometry } = windowed(12000, WINDOW_WIDE_M);
    expect(geometry.riddenLinePath(window.startM - 100)).toBe('');
    expect(geometry.riddenLinePath(window.startM + 2000).length).toBeGreaterThan(0);
  });
});

describe('elevationGeometry at sparkline size', () => {
  it('produces a line for both profiles without fills or ticks needed', () => {
    for (const route of [undulating, varied]) {
      const geometry = elevationGeometry({ route, width: 120, height: 28 });
      expect(geometry.linePath.startsWith('M0,')).toBe(true);
      expect(geometry.bands).toHaveLength(0);
      expect(geometry.summits).toHaveLength(0);
      expect(geometry.linePath).not.toContain('NaN');
    }
  });

  it('keeps the flatter route visibly flatter at 120 px wide', () => {
    const eles = (route: Route) => route.points.map((point) => point.eleM);
    const at120 = (route: Route) =>
      elevationScale({
        eleMinM: Math.min(...eles(route)),
        eleMaxM: Math.max(...eles(route)),
        spanM: route.totalDistanceM,
        width: 120,
        height: 28,
      });
    expect(at120(undulating).clamp).toBe('floor');
    expect(at120(varied).reliefPx).toBeGreaterThan(at120(undulating).reliefPx * 3);
  });
});

describe('distFor', () => {
  const profile = buildProfile(varied);

  function geometryFor(window: ReturnType<typeof projectWindow> | null) {
    return elevationGeometry({ route: varied, profile, window, width: WIDTH, height: HEIGHT });
  }

  it('is the inverse of xFor across the route view', () => {
    const geometry = geometryFor(null);

    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const distM = varied.totalDistanceM * fraction;
      expect(geometry.distFor(geometry.xFor(distM))).toBeCloseTo(distM, 6);
    }
  });

  it('clamps a pointer outside the chart to its ends rather than off the route', () => {
    const geometry = geometryFor(null);

    expect(geometry.distFor(-40)).toBe(0);
    expect(geometry.distFor(WIDTH + 40)).toBeCloseTo(varied.totalDistanceM, 6);
  });

  it('answers in the window it is drawn over, not in route distance', () => {
    const window = projectWindow(varied, profile, 12000, WINDOW_WIDE_M);
    const geometry = geometryFor(window);

    expect(geometry.distFor(0)).toBeCloseTo(window.startM, 6);
    expect(geometry.distFor(WIDTH)).toBeCloseTo(window.endM, 6);
    // The middle of the chart is the middle of the window, which is nowhere near the
    // middle of the route: a hover reads the window's scale or it points at the wrong hill.
    expect(geometry.distFor(WIDTH / 2)).toBeCloseTo((window.startM + window.endM) / 2, 6);
  });

  it('stays inside the window on a route with no length', () => {
    const flat = syntheticRoute(0, () => 10);
    const geometry = elevationGeometry({ route: flat, width: WIDTH, height: HEIGHT });

    expect(geometry.distFor(WIDTH)).toBe(0);
  });
});
