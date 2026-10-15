/**
 * Route map geometry. Not a tile map: a smoothed polyline through the route's own
 * projected space, positioned by a transform on a <g> so the same path serves both
 * the whole-route view and the 5 km view.
 */

import { interpolateAt } from '../../route/position';
import { resample } from '../../route/profile';
import type { Route, RoutePoint } from '../../route/types';
import { fitProjection, type PlanePoint, type PlaneProjection } from '../projection';
import { smoothPath, type Pt } from './path';

export type MapZoom = 'route' | 'near';

/** Breathing room around the whole-route trace so the start circle is not on the frame. */
export const MAP_PADDING_PX = 20;

/**
 * How much ground the zoomed view spans across the frame's short side.
 *
 * Deliberately not the profile's WINDOW_WIDE_M. The profile's 5 km is distance *along
 * the route*; this is a straight-line span *across the ground*, and on a switchbacked
 * climb the two are nothing alike — 5 km of ground covers the whole of Alpe d'Huez,
 * while 5 km of route is about a third of the ascent. Sharing the number made the two
 * zoom toggles read as the same measurement when they never were. 5 km of ground is
 * the scale at which you can see which hairpin you are on.
 */
export const NEAR_WINDOW_M = 5000;

/**
 * Enough vertices that a hairpin still reads at the 5 km zoom, few enough that
 * rebuilding the ridden prefix once a second stays a trivial string join.
 */
const MAX_TRACE_POINTS = 1500;

/** The scale bar is drawn at this nominal length, then snapped to a round distance. */
export const SCALE_BAR_TARGET_PX = 50;

/**
 * How near the trace the pointer has to be, in screen pixels, before the map marks a
 * point on the route.
 *
 * A map is mostly empty space, so without a limit every move across the panel would
 * snap to some arbitrary distance and plant a marker on the profile — the chart would
 * twitch at a pointer that is nowhere near the road. The trace is a 1.25 px hairline
 * though, so demanding a hit on the line itself would feel broken. This is the slop a
 * pointer target normally gets, and it costs no accuracy: the answer is the foot of
 * the perpendicular either way, so widening the tolerance only decides whether to
 * mark, never where. What it buys back is a 24 px band to aim at instead of one.
 *
 * Widening it costs no accuracy, which is why it is as generous as it is: the answer is
 * the foot of the perpendicular either way, so this decides only whether to mark, never
 * where. It still is not wide enough to be sloppy against the frame — 24 px of a 320 px
 * map, or of the 240 px one layout.ts will still draw, leaves the empty quarters of the
 * panel empty.
 *
 * Screen pixels, not metres: the ground it covers depends on the route and the zoom —
 * about 360 m on Sa Calobra at 320 px — and that is correct, because the tolerance is
 * a property of the pointer rather than of the road. It is emphatically not a figure
 * that can separate the limbs of a hairpin: on Sa Calobra the road passes within a
 * pixel of itself, so no threshold could.
 */
export const HOVER_SNAP_PX = 24;

export interface ScaleBar {
  lengthPx: number;
  metres: number;
  label: string;
}

/** A projected trace vertex: where it sits on the plane, and how far along the route. */
export interface TraceVertex extends Pt {
  distM: number;
}

/** The nearest point on the trace, in whatever space the search was run in. */
export interface TraceHit {
  /** Distance along the route, in metres. */
  distM: number;
  /** Gap between the target and that point, in the units of the points given. */
  offset: number;
}

/** What the pointer found: where on the route, and how near it actually got. */
export interface RouteHit {
  /** Distance along the route, in metres, of the nearest point on the trace. */
  distM: number;
  /** Gap between the pointer and that point, in screen pixels, for HOVER_SNAP_PX. */
  offsetPx: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The point on a projected polyline nearest `target`, as a distance along the route.
 *
 * Going the other way is a formula — a distance interpolates to one position. Coming
 * back is a search, and has to be: a route folds over itself, so a position does not
 * determine a distance and nothing can be inverted. So every chord is tested and the
 * global best wins. Linear over a trace capped at MAX_TRACE_POINTS, which is a couple
 * of thousand multiply-adds per pointer move — far less than the paint it triggers,
 * and cheaper than keeping an index correct across two zooms.
 *
 * A strict improvement replaces the best, so a tie goes to the lower distance. That
 * decides a hairpin, where the pointer on the apex is genuinely equidistant from both
 * limbs: the answer is the way out rather than the way back, and it is at least the
 * same answer every time the pointer returns to the same pixel.
 */
export function nearestOnTrace(trace: readonly TraceVertex[], target: Pt): TraceHit {
  const first = trace[0];
  if (first === undefined) return { distM: 0, offset: Infinity };

  let bestSq = (first.x - target.x) ** 2 + (first.y - target.y) ** 2;
  let bestM = first.distM;

  for (let i = 0; i < trace.length - 1; i += 1) {
    const a = trace[i] as TraceVertex;
    const b = trace[i + 1] as TraceVertex;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    // A zero-length chord — a route that pauses in one place — is just its own vertex.
    const t =
      lengthSq > 0 ? clamp01(((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSq) : 0;
    const gapSq = (a.x + dx * t - target.x) ** 2 + (a.y + dy * t - target.y) ** 2;
    if (gapSq < bestSq) {
      bestSq = gapSq;
      bestM = a.distM + (b.distM - a.distM) * t;
    }
  }

  return { distM: bestM, offset: Math.sqrt(bestSq) };
}

export interface RouteMapGeometry {
  width: number;
  height: number;
  zoom: MapZoom;
  projection: PlaneProjection;
  /** Zoom factor applied to the trace group; strokes divide by it to stay constant. */
  scale: number;
  /** True only for the 5 km view, which pans the trace past the frame. */
  clipped: boolean;
  tracePath: string;
  riddenPath(distM: number): string;
  /** The <g> transform. Constant on the route view; follows the rider on the near view. */
  transform(distM: number): string;
  /** Screen-space positions, so markers keep a constant radius at any zoom. */
  startScreen(distM: number): PlanePoint;
  riderScreen(distM: number): PlanePoint;
  /**
   * Where `distM` lands on screen while the frame is panned to `panM`.
   *
   * riderScreen is the case where the two are the same, which is why it reads as the
   * rider's own position. Anything else on the route — a point the rider is not at —
   * has to be placed in the frame the rider is holding: on the 5 km view the pan IS
   * the rider, so asking riderScreen for another distance would re-centre the map on
   * it and every marker would come back at the middle of the frame.
   */
  screenFor(distM: number, panM: number): PlanePoint;
  /**
   * screenFor backwards: the point on the route nearest a pointer sitting at `screen`
   * while the frame is panned to `panM`, and how far off the trace that pointer was.
   *
   * The pan is not optional here for the same reason it is not optional there. On the
   * 5 km view the frame is panned and zoomed around the rider, so the same pixel is a
   * different place on the route every second; searching in the untransformed plane
   * would answer for a map nobody is looking at.
   */
  routeAt(screen: PlanePoint, panM: number): RouteHit;
  strokeWidth(basePx: number): number;
  scaleBar: ScaleBar;
}

/** Nearest 1/2/5 x 10^n to the target, so the bar always reads as a round distance. */
export function niceMetres(targetM: number): number {
  if (!Number.isFinite(targetM) || targetM <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(targetM));
  const candidates = [base, 2 * base, 5 * base, 10 * base];
  let best = candidates[0] as number;
  for (const candidate of candidates) {
    if (Math.abs(Math.log(candidate / targetM)) < Math.abs(Math.log(best / targetM))) {
      best = candidate;
    }
  }
  return best;
}

export function scaleBarLabel(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${metres / 1000} km`;
}

export interface RouteMapInput {
  route: Route;
  width: number;
  height: number;
  zoom: MapZoom;
  /** Metres of ground across the frame's short side on the zoomed view. */
  nearWindowM?: number;
}

export function routeMapGeometry(input: RouteMapInput): RouteMapGeometry {
  const { route, width, height, zoom, nearWindowM = NEAR_WINDOW_M } = input;

  const projection = fitProjection(route.points, {
    width: Math.max(width - 2 * MAP_PADDING_PX, 1),
    height: Math.max(height - 2 * MAP_PADDING_PX, 1),
  });

  // resample needs at least two targets; a one-point route is already its own trace.
  const trace = resample(
    route.points,
    Math.max(2, Math.min(route.points.length, MAX_TRACE_POINTS)),
  );
  const toPt = (point: RoutePoint): Pt => projection.project(point);

  // The route view projects at 1:1 into the padded frame, so only the zoomed view
  // carries a zoom factor. Both divide stroke widths by it.
  const nearUnits = nearWindowM / projection.metresPerUnit;
  const scale =
    zoom === 'near' && Number.isFinite(nearUnits) && nearUnits > 0
      ? Math.min(width, height) / nearUnits
      : 1;

  const centre = { x: width / 2, y: height / 2 };
  const offset = { x: (width - projection.width) / 2, y: (height - projection.height) / 2 };

  const planeAt = (distM: number): PlanePoint =>
    projection.project(interpolateAt(route.points, distM));

  const round = (value: number): string => String(Math.round(value * 100) / 100);

  const transform = (distM: number): string => {
    if (zoom !== 'near') return `translate(${round(offset.x)},${round(offset.y)})`;
    const rider = planeAt(distM);
    return (
      `translate(${round(centre.x)},${round(centre.y)}) scale(${round(scale)}) ` +
      `translate(${round(-rider.x)},${round(-rider.y)})`
    );
  };

  const toScreen = (point: PlanePoint, distM: number): PlanePoint => {
    if (zoom !== 'near') return { x: point.x + offset.x, y: point.y + offset.y };
    const rider = planeAt(distM);
    return {
      x: centre.x + (point.x - rider.x) * scale,
      y: centre.y + (point.y - rider.y) * scale,
    };
  };

  /** toScreen undone, so a pointer can be searched against the untransformed trace. */
  const toPlane = (point: PlanePoint, distM: number): PlanePoint => {
    if (zoom !== 'near') return { x: point.x - offset.x, y: point.y - offset.y };
    const rider = planeAt(distM);
    return {
      x: rider.x + (point.x - centre.x) / scale,
      y: rider.y + (point.y - centre.y) / scale,
    };
  };

  // Projected once, shared by the drawn path and by every pointer move: the search runs
  // on the vertices the trace is actually drawn through, so what it reports is what the
  // rider can see rather than a higher-resolution route hidden under it.
  const vertices: TraceVertex[] = trace.map((point) => ({
    ...projection.project(point),
    distM: point.distM,
  }));

  const prefix = (distM: number): Pt[] => {
    if (distM <= 0) return [];
    const head = trace.filter((point) => point.distM < distM).map(toPt);
    head.push(toPt(interpolateAt(route.points, distM)));
    return head;
  };

  const targetM = (SCALE_BAR_TARGET_PX / scale) * projection.metresPerUnit;
  const metres = niceMetres(targetM);

  return {
    width,
    height,
    zoom,
    projection,
    scale,
    clipped: zoom === 'near',
    tracePath: smoothPath(vertices),
    riddenPath: (distM) => smoothPath(prefix(distM)),
    transform,
    startScreen: (distM) => toScreen(toPt(route.points[0] as RoutePoint), distM),
    riderScreen: (distM) => toScreen(planeAt(distM), distM),
    screenFor: (distM, panM) => toScreen(planeAt(distM), panM),
    routeAt: (screen, panM) => {
      const hit = nearestOnTrace(vertices, toPlane(screen, panM));
      // The plane is isotropic and the zoom uniform, so one multiply carries a plane
      // gap into the pixels the pointer measures in. That is what makes HOVER_SNAP_PX
      // one number for both views rather than one per zoom.
      return { distM: hit.distM, offsetPx: hit.offset * scale };
    },
    strokeWidth: (basePx) => basePx / scale,
    scaleBar: {
      lengthPx: (metres / projection.metresPerUnit) * scale,
      metres,
      label: scaleBarLabel(metres),
    },
  };
}
