/**
 * Lat/lon to a local plane for the map.
 *
 * Equirectangular with a cos(latitude) correction on the longitude axis. Over a
 * route's few kilometres the distortion against a proper conformal projection is
 * far below a stroke width, and the plane stays isotropic — one unit is the same
 * number of metres on both axes — which is what lets the scale bar be honest.
 */

/** IUGG mean radius, matching route/gpx.ts so distances agree between the two. */
const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const METRES_PER_DEGREE = EARTH_RADIUS_M * DEG_TO_RAD;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PlanePoint {
  x: number;
  y: number;
}

export interface PlaneProjection {
  /** Extent the route actually occupies. At most `box`, with the route's own aspect ratio. */
  width: number;
  height: number;
  /** One plane unit in metres. The scale bar and the zoom factor are both derived from this. */
  metresPerUnit: number;
  project(point: LatLon): PlanePoint;
}

function span(values: readonly number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

/**
 * Fit a set of positions into `box`, preserving aspect ratio and north-up
 * orientation (y grows southward, the SVG convention).
 *
 * The origin is the north-west corner of the route's bounding box, so a route
 * always starts at (0, 0)-(width, height) and the caller positions it with a
 * transform rather than the projection knowing about viewport padding.
 */
export function fitProjection(points: readonly LatLon[], box: Size): PlaneProjection {
  const lats = span(points.map((point) => point.lat));
  const lons = span(points.map((point) => point.lon));

  // A mid-latitude reference keeps the longitude correction from drifting across
  // a tall route; over a route's extent the residual error is sub-metre.
  const midLat = (lats.min + lats.max) / 2;
  const xPerDegree = METRES_PER_DEGREE * Math.cos(midLat * DEG_TO_RAD);

  const spanXm = (lons.max - lons.min) * xPerDegree;
  const spanYm = (lats.max - lats.min) * METRES_PER_DEGREE;

  // A single point, or a route running exactly along one axis, has no extent on
  // at least one side. Only the axes that exist constrain the fit; if neither
  // does, the scale is arbitrary and 1 keeps everything finite.
  const candidates: number[] = [];
  if (spanXm > 0) candidates.push(box.width / spanXm);
  if (spanYm > 0) candidates.push(box.height / spanYm);
  const scale = candidates.length > 0 ? Math.min(...candidates) : 1;

  return {
    width: spanXm * scale,
    height: spanYm * scale,
    metresPerUnit: 1 / scale,
    project(point: LatLon): PlanePoint {
      return {
        x: (point.lon - lons.min) * xPerDegree * scale,
        y: (lats.max - point.lat) * METRES_PER_DEGREE * scale,
      };
    },
  };
}
