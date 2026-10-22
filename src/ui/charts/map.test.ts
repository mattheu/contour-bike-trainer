import { describe, expect, it } from 'vitest';
import { diamondLoopRoute, staircaseRoute } from '../../../test/fixtures';
import type { Route, RoutePoint } from '../../route/types';
import {
  HOVER_SNAP_PX,
  MAP_PADDING_PX,
  NEAR_WINDOW_M,
  SCALE_BAR_TARGET_PX,
  nearestOnTrace,
  niceMetres,
  routeMapGeometry,
  scaleBarLabel,
  type TraceVertex,
} from './map';

const WIDTH = 320;
const HEIGHT = 302;

/**
 * ADR-0011, and the awkward half of it: the straight-line fixtures cannot serve a module
 * whose whole subject is plan shape, so these two are the bending ones. The loop closes
 * on itself, which is what makes a pixel ambiguous; the staircase never does, which is
 * what lets a pixel be checked against the one distance that belongs to it.
 */
const loop = diamondLoopRoute();
const staircase = staircaseRoute();

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
    route: loop,
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
    expect(geometry.transform(0)).toBe(geometry.transform(loop.totalDistanceM));
  });

  it('draws a smoothed trace and grows the ridden prefix along it', () => {
    expect(geometry.tracePath.startsWith('M')).toBe(true);
    expect(geometry.tracePath).toContain(' C');
    expect(geometry.riddenPath(0)).toBe('');

    const quarter = geometry.riddenPath(loop.totalDistanceM / 4);
    const half = geometry.riddenPath(loop.totalDistanceM / 2);
    expect(half.length).toBeGreaterThan(quarter.length);
    expect(geometry.tracePath).not.toContain('NaN');
  });

  it('moves the rider dot across the frame in screen space', () => {
    const start = geometry.riderScreen(0);
    const later = geometry.riderScreen(loop.totalDistanceM / 3);
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
  const geometry = routeMapGeometry({ route: loop, width: WIDTH, height: HEIGHT, zoom: 'near' });

  it('zooms so the frame spans the 5 km window and clips', () => {
    expect(geometry.clipped).toBe(true);
    expect(geometry.scale).toBeGreaterThan(1);
    const metresAcrossShortSide =
      (Math.min(WIDTH, HEIGHT) / geometry.scale) * geometry.projection.metresPerUnit;
    expect(metresAcrossShortSide).toBeCloseTo(NEAR_WINDOW_M, 6);
  });

  it('centres the rider and pans the trace under it', () => {
    for (const distM of [0, 5000, loop.totalDistanceM]) {
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
    const whole = routeMapGeometry({ route: loop, width: WIDTH, height: HEIGHT, zoom: 'route' });
    expect(geometry.scaleBar.metres).toBeLessThanOrEqual(whole.scaleBar.metres);
    expect(impliedPxPerMetre).toBeGreaterThan(whole.scaleBar.lengthPx / whole.scaleBar.metres);
  });
});

describe('routeMapGeometry edge cases', () => {
  it('handles both bending fixtures without producing NaN', () => {
    for (const route of [loop, staircase]) {
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

describe('screenFor', () => {
  it('agrees with riderScreen when the frame is panned to the point itself', () => {
    for (const zoom of ['route', 'near'] as const) {
      const geometry = routeMapGeometry({ route: staircase, width: WIDTH, height: HEIGHT, zoom });
      const distM = staircase.totalDistanceM / 3;

      expect(geometry.screenFor(distM, distM)).toEqual(geometry.riderScreen(distM));
    }
  });

  it('ignores the pan on the whole-route view, which never pans', () => {
    const geometry = routeMapGeometry({
      route: staircase,
      width: WIDTH,
      height: HEIGHT,
      zoom: 'route',
    });
    const distM = staircase.totalDistanceM / 4;

    expect(geometry.screenFor(distM, 0)).toEqual(geometry.riderScreen(distM));
    expect(geometry.screenFor(distM, staircase.totalDistanceM)).toEqual(
      geometry.riderScreen(distM),
    );
  });

  it('places a point away from the rider off-centre on the 5 km view', () => {
    const geometry = routeMapGeometry({
      route: staircase,
      width: WIDTH,
      height: HEIGHT,
      zoom: 'near',
    });
    const riderM = staircase.totalDistanceM / 2;
    const centre = { x: WIDTH / 2, y: HEIGHT / 2 };

    // The rider is the centre of this view by construction, and a marker for somewhere
    // else must not be: riderScreen would have returned the centre for both.
    expect(geometry.screenFor(riderM, riderM)).toEqual(centre);
    const ahead = geometry.screenFor(riderM + 1000, riderM);
    expect(Math.hypot(ahead.x - centre.x, ahead.y - centre.y)).toBeGreaterThan(1);
  });
});

describe('nearestOnTrace', () => {
  /** A 100-unit horizontal run, one unit of plane per metre, so the sums are readable. */
  const straight: TraceVertex[] = [
    { x: 0, y: 0, distM: 0 },
    { x: 50, y: 0, distM: 50 },
    { x: 100, y: 0, distM: 100 },
  ];

  it('drops a perpendicular onto the chord the target is beside', () => {
    const hit = nearestOnTrace(straight, { x: 30, y: 7 });
    expect(hit.distM).toBeCloseTo(30, 9);
    expect(hit.offset).toBeCloseTo(7, 9);
  });

  it('reports no offset for a target sitting on the line', () => {
    const hit = nearestOnTrace(straight, { x: 72, y: 0 });
    expect(hit.distM).toBeCloseTo(72, 9);
    expect(hit.offset).toBeCloseTo(0, 9);
  });

  it('clamps past either end rather than running off the line it extends', () => {
    const before = nearestOnTrace(straight, { x: -40, y: 0 });
    expect(before.distM).toBe(0);
    expect(before.offset).toBeCloseTo(40, 9);

    const after = nearestOnTrace(straight, { x: 130, y: 30 });
    expect(after.distM).toBeCloseTo(100, 9);
    expect(after.offset).toBeCloseTo(Math.hypot(30, 30), 9);
  });

  it('interpolates the distance along a chord rather than snapping to a vertex', () => {
    // Vertices every 50 m, so a vertex-only answer could only ever say 50 or 100.
    expect(nearestOnTrace(straight, { x: 63, y: 2 }).distM).toBeCloseTo(63, 9);
  });

  /**
   * The hairpin. Two limbs 6 units apart, the pointer on the axis between them: the
   * search has no geometric reason to prefer either, and must still answer the same
   * thing every time. It takes the outward limb, because only a strict improvement
   * displaces the incumbent.
   */
  describe('on a hairpin', () => {
    const hairpin: TraceVertex[] = [
      { x: 0, y: 0, distM: 0 },
      { x: 100, y: 0, distM: 100 },
      { x: 100, y: 6, distM: 106 },
      { x: 0, y: 6, distM: 206 },
    ];

    it('takes the earlier limb when the two are exactly equidistant', () => {
      const hit = nearestOnTrace(hairpin, { x: 40, y: 3 });
      expect(hit.distM).toBeCloseTo(40, 9);
      expect(hit.offset).toBeCloseTo(3, 9);
    });

    it('is stable: the same pointer gives the same answer every time', () => {
      const once = nearestOnTrace(hairpin, { x: 40, y: 3 });
      expect(nearestOnTrace(hairpin, { x: 40, y: 3 })).toEqual(once);
    });

    it('switches limbs as the pointer crosses the midline, and not before', () => {
      expect(nearestOnTrace(hairpin, { x: 40, y: 2.9 }).distM).toBeCloseTo(40, 6);
      expect(nearestOnTrace(hairpin, { x: 40, y: 3.1 }).distM).toBeCloseTo(166, 6);
    });
  });

  it('survives a trace with no points, and one with a single point', () => {
    expect(nearestOnTrace([], { x: 1, y: 1 })).toEqual({ distM: 0, offset: Infinity });

    const single = nearestOnTrace([{ x: 10, y: 10, distM: 400 }], { x: 13, y: 14 });
    expect(single).toEqual({ distM: 400, offset: 5 });
  });

  it('treats a stalled route — two vertices in one place — as that one place', () => {
    const stalled: TraceVertex[] = [
      { x: 0, y: 0, distM: 0 },
      { x: 0, y: 0, distM: 10 },
    ];
    expect(nearestOnTrace(stalled, { x: 3, y: 4 })).toEqual({ distM: 0, offset: 5 });
  });
});

/**
 * The inverse of screenFor, and the thing the map's own hover is built on. Tested as a
 * round trip rather than against hand-computed pixels: the pair have to agree, and what
 * the projection puts where is screenFor's business and already covered above.
 */
describe('routeAt', () => {
  const at = (route: Route, zoom: 'route' | 'near') =>
    routeMapGeometry({ route, width: WIDTH, height: HEIGHT, zoom });

  /**
   * Position, not distance. A point on the map does not determine a distance — a loop
   * comes back to its own start, and the diamond is one — so the invariant that holds
   * for every route is that the distance it answers is drawn at the pixel that was
   * asked about. Where the route visits a place once, that is the same thing.
   */
  it('round-trips every distance back to the pixel screenFor put it at', () => {
    for (const route of [loop, staircase]) {
      for (const zoom of ['route', 'near'] as const) {
        const geometry = at(route, zoom);
        const pan = route.totalDistanceM / 2;
        for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
          const screen = geometry.screenFor(route.totalDistanceM * fraction, pan);
          const hit = geometry.routeAt(screen, pan);
          const back = geometry.screenFor(hit.distM, pan);
          expect(Math.hypot(back.x - screen.x, back.y - screen.y)).toBeLessThan(1);
          expect(hit.offsetPx).toBeLessThan(1);
        }
      }
    }
  });

  it('recovers the distance itself where the route passes a place only once', () => {
    for (const zoom of ['route', 'near'] as const) {
      const geometry = at(staircase, zoom);
      const pan = staircase.totalDistanceM / 2;
      for (const fraction of [0.1, 0.25, 0.5, 0.75]) {
        const distM = staircase.totalDistanceM * fraction;
        // Within a few metres of ground rather than exactly: the trace is resampled, so
        // the search answers from a chord rather than from the route's own vertex.
        expect(geometry.routeAt(geometry.screenFor(distM, pan), pan).distM).toBeCloseTo(distM, -1);
      }
    }
  });

  /**
   * The start of a loop is its finish, and both are drawn on the same pixel. There is no
   * right answer, so the only thing worth asserting is that it picks one of them rather
   * than something in between.
   */
  it('answers a loop closing on itself with one of its two ends', () => {
    const geometry = at(loop, 'route');
    const hit = geometry.routeAt(geometry.screenFor(0, 0), 0);
    expect(hit.offsetPx).toBeLessThan(1);
    expect(Math.min(hit.distM, Math.abs(loop.totalDistanceM - hit.distM))).toBeLessThan(5);
  });

  it('measures the offset in screen pixels at either zoom', () => {
    for (const zoom of ['route', 'near'] as const) {
      const geometry = at(staircase, zoom);
      const pan = staircase.totalDistanceM / 2;
      const on = geometry.screenFor(pan, pan);

      // A fixed pixel offset reads as the same number of pixels however far the view is
      // zoomed in, which is what lets HOVER_SNAP_PX be one constant for both views.
      for (const dy of [5, 20, 40]) {
        expect(geometry.routeAt({ x: on.x, y: on.y + dy }, pan).offsetPx).toBeLessThanOrEqual(
          dy + 1e-6,
        );
      }
      // Straight down from the rider is across the trace on neither route by more than
      // a pixel or two, so the large offset has to come back large.
      expect(geometry.routeAt({ x: on.x, y: on.y }, pan).offsetPx).toBeLessThan(1);
    }
  });

  it('reports empty space as well beyond the snap threshold', () => {
    const geometry = at(loop, 'route');
    // The frame corners are outside the padded box the trace is fitted into, so no part
    // of the route can be near them.
    for (const corner of [
      { x: 0, y: 0 },
      { x: WIDTH, y: 0 },
      { x: 0, y: HEIGHT },
      { x: WIDTH, y: HEIGHT },
    ]) {
      expect(geometry.routeAt(corner, 0).offsetPx).toBeGreaterThan(HOVER_SNAP_PX);
    }
  });

  it('answers for the frame the rider is holding, not the untransformed plane', () => {
    const geometry = at(staircase, 'near');
    const centre = { x: WIDTH / 2, y: HEIGHT / 2 };

    // The rider is the centre of the 5 km view, so the centre pixel is the rider's own
    // distance — whichever distance that is. A search that ignored the pan would answer
    // the same thing for both.
    for (const riderM of [3000, 12_000, 21_000]) {
      const hit = geometry.routeAt(centre, riderM);
      expect(hit.distM).toBeCloseTo(riderM, -1);
      expect(hit.offsetPx).toBeLessThan(1);
    }
    expect(geometry.routeAt(centre, 3000).distM).not.toBeCloseTo(
      geometry.routeAt(centre, 21_000).distM,
      -1,
    );
  });

  it('ignores the pan on the whole-route view, which never pans', () => {
    const geometry = at(staircase, 'route');
    const screen = geometry.screenFor(staircase.totalDistanceM / 3, 0);
    expect(geometry.routeAt(screen, 0)).toEqual(geometry.routeAt(screen, staircase.totalDistanceM));
  });

  it('survives a route with a single point', () => {
    const geometry = routeMapGeometry({
      route: singlePointRoute(),
      width: WIDTH,
      height: HEIGHT,
      zoom: 'route',
    });
    const hit = geometry.routeAt({ x: WIDTH / 2, y: HEIGHT / 2 }, 0);
    expect(hit.distM).toBe(0);
    expect(hit.offsetPx).toBeCloseTo(0, 9);
  });
});
