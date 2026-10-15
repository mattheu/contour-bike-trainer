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

export interface ScaleBar {
  lengthPx: number;
  metres: number;
  label: string;
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
    tracePath: smoothPath(trace.map(toPt)),
    riddenPath: (distM) => smoothPath(prefix(distM)),
    transform,
    startScreen: (distM) => toScreen(toPt(route.points[0] as RoutePoint), distM),
    riderScreen: (distM) => toScreen(planeAt(distM), distM),
    screenFor: (distM, panM) => toScreen(planeAt(distM), panM),
    strokeWidth: (basePx) => basePx / scale,
    scaleBar: {
      lengthPx: (metres / projection.metresPerUnit) * scale,
      metres,
      label: scaleBarLabel(metres),
    },
  };
}
