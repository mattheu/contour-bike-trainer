import { elevationAt, interpolateAt } from './position';
import type { Route, RoutePoint } from './types';

/** The chart's fixed bin width. Bins never re-bin when zoomed; they render wider. */
export const BIN_LENGTH_M = 250;

/** Below this, a bin is unclassified: it reads as flat on the chart. */
export const MIN_CLASSIFIED_GRADE_PERCENT = 2;

export const WINDOW_WIDE_M = 5000;
export const WINDOW_NARROW_M = 500;

/** Gradient bands, labelled by their bounds so the chart's colours stay traceable to the spec. */
export type GradientBand = '2-4' | '4-7' | '7-10' | '10+';

const BAND_LOWER_BOUNDS: { band: GradientBand; minGradePercent: number }[] = [
  { band: '10+', minGradePercent: 10 },
  { band: '7-10', minGradePercent: 7 },
  { band: '4-7', minGradePercent: 4 },
  { band: '2-4', minGradePercent: MIN_CLASSIFIED_GRADE_PERCENT },
];

export interface GradientBin {
  startM: number;
  endM: number;
  /** Mean grade across the bin, signed. Negative bins are always unbanded. */
  gradePercent: number;
  /** Null for descents and anything under 2 %. */
  band: GradientBand | null;
}

/** Contiguous bins of the same band, merged because the chart fills runs, not bins. */
export interface GradientRun {
  startM: number;
  endM: number;
  band: GradientBand;
  binCount: number;
}

export interface AscentPoint {
  distM: number;
  ascentM: number;
}

export interface AscentSeries {
  points: AscentPoint[];
  /** The route total, so "climbed 212 / 512" has both halves. */
  totalM: number;
}

export interface RouteProfile {
  bins: GradientBin[];
  runs: GradientRun[];
  ascent: AscentSeries;
}

export interface ProfileWindow {
  startM: number;
  endM: number;
  centreM: number;
  widthM: number;
  /** Route points inside the window, with interpolated points pinned to each edge. */
  points: RoutePoint[];
  /** Bins overlapping the window, unclipped and still BIN_LENGTH_M long. */
  bins: GradientBin[];
  runs: GradientRun[];
}

export function bandFor(gradePercent: number): GradientBand | null {
  for (const { band, minGradePercent } of BAND_LOWER_BOUNDS) {
    if (gradePercent >= minGradePercent) return band;
  }
  return null;
}

/**
 * Fixed 250 m bins across the whole route. The final bin is short where the
 * route does not divide evenly; its grade still uses its real length.
 */
export function gradientBins(route: Route): GradientBin[] {
  const bins: GradientBin[] = [];
  for (let startM = 0; startM < route.totalDistanceM; startM += BIN_LENGTH_M) {
    const endM = Math.min(startM + BIN_LENGTH_M, route.totalDistanceM);
    const run = endM - startM;
    if (run <= 0) break;
    const rise = elevationAt(route, endM) - elevationAt(route, startM);
    const gradePercent = (rise / run) * 100;
    bins.push({ startM, endM, gradePercent, band: bandFor(gradePercent) });
  }
  return bins;
}

export function mergeRuns(bins: readonly GradientBin[]): GradientRun[] {
  const runs: GradientRun[] = [];
  for (const bin of bins) {
    if (bin.band === null) continue;
    const open = runs[runs.length - 1];
    // Contiguity is by distance as well as band: an unbanded bin between two
    // banded ones breaks the fill, it does not merge through it.
    if (open && open.band === bin.band && open.endM === bin.startM) {
      open.endM = bin.endM;
      open.binCount += 1;
    } else {
      runs.push({ startM: bin.startM, endM: bin.endM, band: bin.band, binCount: 1 });
    }
  }
  return runs;
}

/**
 * Cumulative ascent at every route point. The series is piecewise linear in
 * distance, so ascentAt can interpolate inside a segment without re-summing.
 */
export function cumulativeAscent(route: Route): AscentSeries {
  const points: AscentPoint[] = [];
  let ascentM = 0;
  for (let i = 0; i < route.points.length; i += 1) {
    const point = route.points[i] as RoutePoint;
    const previous = route.points[i - 1];
    if (previous && point.eleM > previous.eleM) ascentM += point.eleM - previous.eleM;
    points.push({ distM: point.distM, ascentM });
  }
  return { points, totalM: ascentM };
}

export function ascentAt(series: AscentSeries, distM: number): number {
  const { points } = series;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (distM <= first.distM) return first.ascentM;
  if (distM >= last.distM) return last.ascentM;

  let low = 0;
  let high = points.length - 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const point = points[mid];
    if (point && point.distM <= distM) low = mid;
    else high = mid - 1;
  }
  const a = points[low] as AscentPoint;
  const b = points[low + 1] as AscentPoint;
  const span = b.distM - a.distM;
  if (span <= 0) return a.ascentM;
  return a.ascentM + (b.ascentM - a.ascentM) * ((distM - a.distM) / span);
}

export function buildProfile(route: Route): RouteProfile {
  const bins = gradientBins(route);
  return { bins, runs: mergeRuns(bins), ascent: cumulativeAscent(route) };
}

/**
 * The slice of the route visible in a zoom window.
 *
 * The window is slid back inside the route rather than clipped short at the
 * ends, so the chart's x-scale is constant and the rider dot moves towards the
 * edge on the first and last half-window instead of the terrain stretching.
 */
export function projectWindow(
  route: Route,
  profile: RouteProfile,
  centreM: number,
  widthM: number,
): ProfileWindow {
  if (!Number.isFinite(widthM) || widthM <= 0) {
    throw new Error(`Profile window width must be a positive distance, got ${widthM}`);
  }

  const width = Math.min(widthM, route.totalDistanceM);
  const maxStart = Math.max(0, route.totalDistanceM - width);
  const startM = Math.min(Math.max(centreM - width / 2, 0), maxStart);
  const endM = startM + width;

  const points: RoutePoint[] = [interpolateAt(route.points, startM)];
  for (const point of route.points) {
    if (point.distM > startM && point.distM < endM) points.push({ ...point });
  }
  points.push(interpolateAt(route.points, endM));

  return {
    startM,
    endM,
    centreM,
    widthM: width,
    points,
    bins: profile.bins.filter((bin) => bin.endM > startM && bin.startM < endM),
    runs: profile.runs.filter((run) => run.endM > startM && run.startM < endM),
  };
}

/**
 * Reduce a point series to roughly one vertex per pixel by even distance
 * spacing. Even spacing rather than peak-preserving decimation: at chart
 * widths the two are visually identical, and this one is trivially testable.
 */
export function resample(points: readonly RoutePoint[], targetCount: number): RoutePoint[] {
  if (!Number.isInteger(targetCount) || targetCount < 2) {
    throw new Error(`Resample target must be an integer of at least 2, got ${targetCount}`);
  }
  if (points.length <= targetCount) return points.map((point) => ({ ...point }));

  const first = points[0] as RoutePoint;
  const last = points[points.length - 1] as RoutePoint;
  const span = last.distM - first.distM;
  const out: RoutePoint[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    out.push(interpolateAt(points, first.distM + (span * i) / (targetCount - 1)));
  }
  return out;
}
