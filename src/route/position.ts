import type { Route, RoutePoint } from './types';

/**
 * Index of the last point at or before distM, via binary search.
 * Returns at most points.length - 2 so the caller always has a following point.
 */
function segmentIndex(points: readonly RoutePoint[], distM: number): number {
  let low = 0;
  let high = points.length - 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const point = points[mid];
    if (point && point.distM <= distM) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Linear interpolation between the two points either side of distM.
 * Lat/lon are interpolated in degrees: over a GPS point spacing of tens of
 * metres the great-circle and straight-line answers differ by millimetres.
 */
export function interpolateAt(points: readonly RoutePoint[], distM: number): RoutePoint {
  if (points.length === 0) {
    throw new Error('Cannot interpolate a position on a route with no points');
  }
  const first = points[0] as RoutePoint;
  const last = points[points.length - 1] as RoutePoint;
  if (points.length === 1 || distM <= first.distM) return { ...first };
  if (distM >= last.distM) return { ...last };

  const i = segmentIndex(points, distM);
  const a = points[i] as RoutePoint;
  const b = points[i + 1] as RoutePoint;
  const span = b.distM - a.distM;
  const t = span > 0 ? (distM - a.distM) / span : 0;

  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    eleM: a.eleM + (b.eleM - a.eleM) * t,
    distM,
  };
}

/** Position along the route at a distance, clamped to the route's ends. */
export function positionAt(route: Route, distM: number): RoutePoint {
  return interpolateAt(route.points, distM);
}

export function elevationAt(route: Route, distM: number): number {
  return interpolateAt(route.points, distM).eleM;
}
