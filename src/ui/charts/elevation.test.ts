import { describe, expect, it } from 'vitest';
import { detectClimbs } from '../../route/climbs';
import { parseGpx } from '../../route/gpx';
import { elevationAt } from '../../route/position';
import { WINDOW_NARROW_M, WINDOW_WIDE_M, buildProfile, projectWindow } from '../../route/profile';
import type { Route, RoutePoint } from '../../route/types';
import mixedGpx from '../../../routes/test-mixed.gpx?raw';
import rollingGpx from '../../../routes/test-rolling.gpx?raw';
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

const rolling = parseGpx(rollingGpx);
const mixed = parseGpx(mixedGpx);

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
    // Mixed: 516.6 m of relief over 29.9 km. Wanted, and granted, without clamping.
    const scale = scaleFor(mixed);
    const expected = (WIDTH / mixed.totalDistanceM) * VERTICAL_EXAGGERATION;

    expect(scale.clamp).toBe('none');
    expect(scale.pxPerMetre).toBeCloseTo(expected, 9);
    expect(scale.reliefPx).toBeCloseTo(relief(mixed) * expected, 6);
    expect(scale.reliefPx).toBeGreaterThan(HEIGHT * MIN_RELIEF_FRACTION);
    expect(scale.reliefPx).toBeLessThan(HEIGHT * MAX_RELIEF_FRACTION);
  });

  it('lifts a near-flat route off the floor so it still shows shape', () => {
    // Rolling: 16.2 m over 20 km would be 8 px unclamped, which reads as a ruled line.
    const scale = scaleFor(rolling);
    const unclamped = relief(rolling) * (WIDTH / rolling.totalDistanceM) * VERTICAL_EXAGGERATION;

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

  it('keeps the two bundled routes honestly different from each other', () => {
    // The whole point of a fixed ratio: the rolling route must not read as a
    // mountain range next to the one with a real 349 m climb.
    expect(scaleFor(mixed).reliefPx / scaleFor(rolling).reliefPx).toBeGreaterThan(5);
  });

  it('re-exaggerates against the window when zoomed in', () => {
    const profile = buildProfile(mixed);
    const window = projectWindow(mixed, profile, 8000, WINDOW_WIDE_M);
    const eles = window.points.map((point) => point.eleM);
    const zoomed = elevationScale({
      eleMinM: Math.min(...eles),
      eleMaxM: Math.max(...eles),
      spanM: WINDOW_WIDE_M,
      width: WIDTH,
      height: HEIGHT,
    });

    expect(zoomed.pxPerMetre).toBeGreaterThan(scaleFor(mixed).pxPerMetre);
  });
});

describe('tickStepM', () => {
  it('steps 5 km on a route, 1 km at the 5 km zoom and 100 m at 500 m', () => {
    expect(tickStepM(rolling.totalDistanceM)).toBe(5000);
    expect(tickStepM(WINDOW_WIDE_M)).toBe(1000);
    expect(tickStepM(WINDOW_NARROW_M)).toBe(100);
  });
});

describe('elevationGeometry, route view', () => {
  const profile = buildProfile(mixed);
  const climbs = detectClimbs(mixed);
  const geometry = elevationGeometry({
    route: mixed,
    profile,
    climbs,
    width: WIDTH,
    height: HEIGHT,
  });

  it('maps the route across the full chart width', () => {
    expect(geometry.xFor(0)).toBe(0);
    expect(geometry.xFor(mixed.totalDistanceM)).toBeCloseTo(WIDTH, 9);
    expect(geometry.xFor(-500)).toBe(0);
    expect(geometry.xFor(mixed.totalDistanceM + 500)).toBeCloseTo(WIDTH, 9);
  });

  it('smooths the profile line and closes the area onto the baseline', () => {
    expect(geometry.linePath.startsWith('M0,')).toBe(true);
    expect(geometry.linePath).toContain(' C');
    expect(geometry.areaPath.startsWith(geometry.linePath)).toBe(true);
    expect(geometry.areaPath.endsWith(`L0,${HEIGHT} Z`)).toBe(true);
    expect(geometry.baselineY).toBe(HEIGHT);
  });

  it('ticks every 5 km, alternating long and short, with an end label only', () => {
    const expected = Math.floor(mixed.totalDistanceM / 5000) + 1;
    expect(geometry.ticks).toHaveLength(expected);
    expect(geometry.ticks.map((tick) => tick.long).slice(0, 4)).toEqual([true, false, true, false]);
    expect(geometry.ticks[1]?.x).toBeCloseTo((5000 / mixed.totalDistanceM) * WIDTH, 6);
    expect(geometry.startLabel).toBeNull();
    expect(geometry.endLabel).toBe('29.9 km');
    expect(geometry.showEndCircles).toBe(true);
  });

  it('labels summits with the climb gain, not the summit height', () => {
    expect(climbs).toHaveLength(1);
    expect(geometry.summits).toHaveLength(1);
    const summit = geometry.summits[0];
    expect(summit?.label).toBe('+349 m');
    expect(summit?.label).not.toContain('749');
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

    const quarter = geometry.riddenLinePath(mixed.totalDistanceM / 4);
    const half = geometry.riddenLinePath(mixed.totalDistanceM / 2);
    expect(quarter.length).toBeGreaterThan(0);
    expect(half.length).toBeGreaterThan(quarter.length);
    expect(half.startsWith('M0,')).toBe(true);

    const whole = geometry.riddenAreaPath(mixed.totalDistanceM);
    expect(whole.endsWith(`L0,${HEIGHT} Z`)).toBe(true);
  });

  it('places the rider on the profile with the gradient it is about to meet', () => {
    expect(geometry.marker(0).x).toBe(0);
    expect(geometry.marker(mixed.totalDistanceM).x).toBeCloseTo(WIDTH, 9);

    const onTheClimb = geometry.marker(8000);
    expect(onTheClimb.gradePercent).toBeGreaterThan(2);
    expect(onTheClimb.y).toBeCloseTo(geometry.yFor(elevationAt(mixed, 8000)), 9);
    expect(onTheClimb.x).toBeCloseTo((8000 / mixed.totalDistanceM) * WIDTH, 6);
  });
});

describe('elevationGeometry, zoom windows', () => {
  const profile = buildProfile(mixed);
  const climbs = detectClimbs(mixed);

  function windowed(centreM: number, widthM: number) {
    const window = projectWindow(mixed, profile, centreM, widthM);
    return {
      window,
      geometry: elevationGeometry({
        route: mixed,
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
    const { window, geometry: zoomed } = windowed(8000, WINDOW_WIDE_M);
    const widths = window.bins.map((bin) => bin.endM - bin.startM);
    expect(new Set(widths)).toEqual(new Set([250]));

    // A run wholly inside the window occupies five times the width at the 5 km zoom.
    const run = window.runs.find(
      (candidate) => candidate.startM >= window.startM && candidate.endM <= window.endM,
    );
    expect(run).toBeDefined();
    const route = elevationGeometry({
      route: mixed,
      profile,
      climbs,
      width: WIDTH,
      height: HEIGHT,
    });
    const routeWidth = route.xFor(run!.endM) - route.xFor(run!.startM);
    const zoomWidth = zoomed.xFor(run!.endM) - zoomed.xFor(run!.startM);
    expect(zoomWidth / routeWidth).toBeCloseTo(mixed.totalDistanceM / WINDOW_WIDE_M, 6);
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
  it('produces a line for both bundled routes without fills or ticks needed', () => {
    for (const route of [rolling, mixed]) {
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
    expect(at120(rolling).clamp).toBe('floor');
    expect(at120(mixed).reliefPx).toBeGreaterThan(at120(rolling).reliefPx * 3);
  });
});
