import { describe, expect, it } from 'vitest';
import { parseGpx } from '../../route/gpx';
import type { Route, RoutePoint } from '../../route/types';
import mixedGpx from '../../../routes/test-mixed.gpx?raw';
import rollingGpx from '../../../routes/test-rolling.gpx?raw';
import {
  MAP_PADDING_PX,
  NEAR_WINDOW_M,
  SCALE_BAR_TARGET_PX,
  niceMetres,
  routeMapGeometry,
  scaleBarLabel,
} from './map';

const WIDTH = 320;
const HEIGHT = 302;

const rolling = parseGpx(rollingGpx);
const mixed = parseGpx(mixedGpx);

function singlePointRoute(): Route {
  const point: RoutePoint = { lat: 51.5, lon: -0.1, eleM: 10, distM: 0 };
  return { points: [point], totalDistanceM: 0, totalAscentM: 0 };
}

describe('niceMetres', () => {
  it('snaps to the nearest 1, 2 or 5 times a power of ten', () => {
    expect(niceMetres(1205)).toBe(1000);
    expect(niceMetres(83)).toBe(100);
    expect(niceMetres(38)).toBe(50);
    expect(niceMetres(0.4)).toBeCloseTo(0.5, 9);
  });

  it('never returns a non-positive length', () => {
    expect(niceMetres(0)).toBe(1);
    expect(niceMetres(-5)).toBe(1);
    expect(niceMetres(Number.NaN)).toBe(1);
  });
});

describe('scaleBarLabel', () => {
  it('switches from metres to kilometres at a kilometre', () => {
    expect(scaleBarLabel(500)).toBe('500 m');
    expect(scaleBarLabel(1000)).toBe('1 km');
    expect(scaleBarLabel(2000)).toBe('2 km');
  });
});

describe('routeMapGeometry, whole route', () => {
  const geometry = routeMapGeometry({
    route: rolling,
    width: WIDTH,
    height: HEIGHT,
    zoom: 'route',
  });

  it('fits the trace inside the frame padding without zooming', () => {
    expect(geometry.scale).toBe(1);
    expect(geometry.clipped).toBe(false);
    expect(geometry.projection.width).toBeLessThanOrEqual(WIDTH - 2 * MAP_PADDING_PX + 1e-9);
    expect(geometry.projection.height).toBeLessThanOrEqual(HEIGHT - 2 * MAP_PADDING_PX + 1e-9);
    // Contained, not stretched: one axis touches the padded box.
    expect(
      Math.max(
        geometry.projection.width / (WIDTH - 2 * MAP_PADDING_PX),
        geometry.projection.height / (HEIGHT - 2 * MAP_PADDING_PX),
      ),
    ).toBeCloseTo(1, 9);
  });

  it('centres the trace with a plain translate', () => {
    expect(geometry.transform(0)).toMatch(/^translate\(-?[\d.]+,-?[\d.]+\)$/);
    expect(geometry.transform(0)).toBe(geometry.transform(rolling.totalDistanceM));
  });

  it('draws a smoothed trace and grows the ridden prefix along it', () => {
    expect(geometry.tracePath.startsWith('M')).toBe(true);
    expect(geometry.tracePath).toContain(' C');
    expect(geometry.riddenPath(0)).toBe('');

    const quarter = geometry.riddenPath(rolling.totalDistanceM / 4);
    const half = geometry.riddenPath(rolling.totalDistanceM / 2);
    expect(half.length).toBeGreaterThan(quarter.length);
    expect(geometry.tracePath).not.toContain('NaN');
  });

  it('moves the rider dot across the frame in screen space', () => {
    const start = geometry.riderScreen(0);
    const later = geometry.riderScreen(rolling.totalDistanceM / 3);
    expect(start).not.toEqual(later);
    expect(start.x).toBeGreaterThanOrEqual(MAP_PADDING_PX - 1e-6);
    expect(start.x).toBeLessThanOrEqual(WIDTH - MAP_PADDING_PX + 1e-6);
    expect(start.y).toBeGreaterThanOrEqual(MAP_PADDING_PX - 1e-6);
    expect(start.y).toBeLessThanOrEqual(HEIGHT - MAP_PADDING_PX + 1e-6);
  });

  it('keeps stroke widths at their nominal value when unzoomed', () => {
    expect(geometry.strokeWidth(1.25)).toBe(1.25);
  });

  it('labels a scale bar of about 50 px with a round distance', () => {
    expect(geometry.scaleBar.metres).toBe(niceMetres(geometry.projection.metresPerUnit * 50));
    const impliedPxPerMetre = geometry.scaleBar.lengthPx / geometry.scaleBar.metres;
    expect(impliedPxPerMetre).toBeCloseTo(1 / geometry.projection.metresPerUnit, 9);
    expect(geometry.scaleBar.lengthPx).toBeGreaterThan(SCALE_BAR_TARGET_PX / 2);
    expect(geometry.scaleBar.lengthPx).toBeLessThan(SCALE_BAR_TARGET_PX * 2);
  });
});

/**
 * The map's window is a ground span; the profile's 5 km is distance along the route. They
 * carry the same number now, which does not make them the same measurement — on a hairpin
 * climb 5 km of ground holds far more than 5 km of road. They stay separate constants so
 * one can move without dragging the other.
 */
describe('routeMapGeometry, 5 km view', () => {
  const geometry = routeMapGeometry({ route: rolling, width: WIDTH, height: HEIGHT, zoom: 'near' });

  it('zooms so the frame spans the 5 km window and clips', () => {
    expect(geometry.clipped).toBe(true);
    expect(geometry.scale).toBeGreaterThan(1);
    const metresAcrossShortSide =
      (Math.min(WIDTH, HEIGHT) / geometry.scale) * geometry.projection.metresPerUnit;
    expect(metresAcrossShortSide).toBeCloseTo(NEAR_WINDOW_M, 6);
  });

  it('centres the rider and pans the trace under it', () => {
    for (const distM of [0, 5000, rolling.totalDistanceM]) {
      const screen = geometry.riderScreen(distM);
      expect(screen.x).toBeCloseTo(WIDTH / 2, 9);
      expect(screen.y).toBeCloseTo(HEIGHT / 2, 9);
    }
    expect(geometry.transform(0)).not.toBe(geometry.transform(5000));
    expect(geometry.transform(0)).toMatch(/^translate\(160,151\) scale\([\d.]+\) translate\(/);
  });

  it('scales stroke widths down so they stay visually constant', () => {
    expect(geometry.strokeWidth(2)).toBeCloseTo(2 / geometry.scale, 9);
    expect(geometry.strokeWidth(2)).toBeLessThan(2);
  });

  it('keeps the scale bar computed from the projection at the new zoom', () => {
    const impliedPxPerMetre = geometry.scaleBar.lengthPx / geometry.scaleBar.metres;
    expect(impliedPxPerMetre).toBeCloseTo(geometry.scale / geometry.projection.metresPerUnit, 9);

    // The zoomed view covers less ground per pixel, so its bar never reads a longer
    // distance than the whole-route view's and the same distance draws wider.
    const whole = routeMapGeometry({ route: rolling, width: WIDTH, height: HEIGHT, zoom: 'route' });
    expect(geometry.scaleBar.metres).toBeLessThanOrEqual(whole.scaleBar.metres);
    expect(impliedPxPerMetre).toBeGreaterThan(whole.scaleBar.lengthPx / whole.scaleBar.metres);
  });
});

describe('routeMapGeometry edge cases', () => {
  it('handles both bundled routes without producing NaN', () => {
    for (const route of [rolling, mixed]) {
      for (const zoom of ['route', 'near'] as const) {
        const geometry = routeMapGeometry({ route, width: WIDTH, height: HEIGHT, zoom });
        expect(geometry.tracePath).not.toContain('NaN');
        expect(geometry.riddenPath(route.totalDistanceM / 2)).not.toContain('NaN');
        expect(geometry.transform(route.totalDistanceM / 2)).not.toContain('NaN');
        expect(Number.isFinite(geometry.scaleBar.lengthPx)).toBe(true);
      }
    }
  });

  it('survives a route with a single point', () => {
    const geometry = routeMapGeometry({
      route: singlePointRoute(),
      width: WIDTH,
      height: HEIGHT,
      zoom: 'route',
    });
    expect(geometry.tracePath).toBe('M0,0');
    expect(geometry.riderScreen(0)).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 });
    expect(Number.isFinite(geometry.scaleBar.lengthPx)).toBe(true);
  });
});
