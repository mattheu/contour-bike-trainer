/**
 * Elevation profile geometry: route in, path strings and coordinates out.
 *
 * Everything here is pure so the paths can be asserted against known numbers;
 * the React component is a renderer over this and owns no geometry of its own.
 */

import type { Climb } from '../../route/climbs';
import { gradeAt } from '../../route/grade';
import { elevationAt, interpolateAt } from '../../route/position';
import {
  WINDOW_NARROW_M,
  WINDOW_WIDE_M,
  resample,
  type GradientBand,
  type ProfileWindow,
  type RouteProfile,
} from '../../route/profile';
import type { Route, RoutePoint } from '../../route/types';
import { areaPath, smoothPath, type Pt } from './path';

/**
 * Vertical exaggeration.
 *
 * The elevation axis is drawn at ten times the horizontal scale — a metre climbed
 * is ten times as tall as a metre travelled. Fixed rather than fitted, because
 * fitting each route to the chart height destroys the only comparison that matters:
 * the bundled rolling route rises 16 m over 20 km and the mixed route 517 m over
 * 30 km, and a fit-to-height scale draws both as the same mountain range.
 *
 * Ten was chosen so the steeper of the two real routes lands inside the linear
 * regime rather than against a clamp: 517 m x (944 px / 29 937 m) x 10 = 163 px,
 * comfortably under the 176 px ceiling. Anything much above 11 would clip it.
 *
 * Both clamps then bite only where honesty and legibility genuinely conflict:
 *
 * - Floor, 10 % of the chart height. The rolling route would otherwise occupy 8 px
 *   and read as a ruled line. At the floor it occupies 22 px: still unmistakably
 *   seven times flatter than the mixed route, but with visible shape.
 * - Ceiling, 80 % of the chart height, leaving room for summit labels and the
 *   rider's gradient bubble. An alpine route (1 000 m in 15 km) would want 630 px.
 *
 * The scale is recomputed per visible window, so zooming to 5 km or 500 m
 * re-exaggerates against the new horizontal scale. That is deliberate and matches
 * the zoomed mockup: the same terrain fills the chart when you zoom into it.
 */
export const VERTICAL_EXAGGERATION = 10;
export const MIN_RELIEF_FRACTION = 0.1;
export const MAX_RELIEF_FRACTION = 0.8;

/** The lowest ground on screen sits this far above the axis, so the area has body. */
export const BASE_PAD_FRACTION = 0.08;

export type ReliefClamp = 'none' | 'floor' | 'ceiling' | 'level';

export interface ElevationScale {
  baselineY: number;
  minEleM: number;
  maxEleM: number;
  /** Chart pixels per metre of elevation, after clamping. */
  pxPerMetre: number;
  /** Height in pixels between the lowest and highest visible ground. */
  reliefPx: number;
  clamp: ReliefClamp;
  yFor(eleM: number): number;
}

export function elevationScale(options: {
  eleMinM: number;
  eleMaxM: number;
  spanM: number;
  width: number;
  height: number;
}): ElevationScale {
  const { eleMinM, eleMaxM, spanM, width, height } = options;
  const baselineY = height;
  const basePad = height * BASE_PAD_FRACTION;
  const reliefM = Math.max(0, eleMaxM - eleMinM);

  const pxPerMetreDistance = spanM > 0 ? width / spanM : 0;
  const wanted = pxPerMetreDistance * VERTICAL_EXAGGERATION;
  const floorPx = height * MIN_RELIEF_FRACTION;
  const ceilingPx = height * MAX_RELIEF_FRACTION;

  let pxPerMetre = wanted;
  let clamp: ReliefClamp = 'none';
  if (reliefM <= 0) {
    // Perfectly level ground has no relief to scale; it draws flat on the base pad.
    pxPerMetre = 0;
    clamp = 'level';
  } else if (reliefM * wanted < floorPx) {
    pxPerMetre = floorPx / reliefM;
    clamp = 'floor';
  } else if (reliefM * wanted > ceilingPx) {
    pxPerMetre = ceilingPx / reliefM;
    clamp = 'ceiling';
  }

  return {
    baselineY,
    minEleM: eleMinM,
    maxEleM: eleMaxM,
    pxPerMetre,
    reliefPx: reliefM * pxPerMetre,
    clamp,
    yFor(eleM: number): number {
      return baselineY - basePad - (eleM - eleMinM) * pxPerMetre;
    },
  };
}

/**
 * Gradient band opacities. Uphill only, four classes, from design/DESIGN.md.
 *
 * Ahead of the rider the bands are ink; behind, accent — the same "grey is the
 * route ahead, orange is behind you" rule as the hatch. The mockups only show two
 * of the four accent levels, so the accent ramp is the ink ramp lifted to stay
 * legible against the 0.75 accent hatch it is drawn over.
 */
export const AHEAD_BAND_OPACITY: Record<GradientBand, number> = {
  '2-4': 0.04,
  '4-7': 0.08,
  '7-10': 0.12,
  '10+': 0.17,
};

export const RIDDEN_BAND_OPACITY: Record<GradientBand, number> = {
  '2-4': 0.1,
  '4-7': 0.14,
  '7-10': 0.18,
  '10+': 0.24,
};

/** Axis tick spacing: ~5 km on the whole route, 1 km at 5 km zoom, 100 m at 500 m. */
export function tickStepM(spanM: number): number {
  if (spanM > WINDOW_WIDE_M) return 5000;
  if (spanM > WINDOW_NARROW_M) return 1000;
  return 100;
}

export interface AxisTick {
  x: number;
  distM: number;
  /** Ticks alternate 8 px and 4 px along the axis. */
  long: boolean;
}

export interface BandShape {
  d: string;
  band: GradientBand;
  startM: number;
  endM: number;
}

export interface SummitTick {
  x: number;
  /** y of the ground at the summit; the stalk rises from here. */
  y: number;
  label: string;
}

export interface RiderMarker {
  x: number;
  y: number;
  gradePercent: number;
}

export interface ElevationGeometry {
  width: number;
  height: number;
  baselineY: number;
  startM: number;
  endM: number;
  scale: ElevationScale;
  xFor(distM: number): number;
  /**
   * A chart x back to the distance it stands for: the inverse of xFor, clamped to the
   * window the chart is drawn over. Pointing at the profile is the only thing that needs
   * it — a mouse arrives as a pixel and the route is indexed by metres.
   */
  distFor(x: number): number;
  yFor(eleM: number): number;
  /** The whole visible route: smoothed line, and the same line closed to the axis. */
  linePath: string;
  areaPath: string;
  bands: BandShape[];
  ticks: AxisTick[];
  /** Window views label where the window starts; the route view has no left label. */
  startLabel: string | null;
  endLabel: string;
  /** Start and end circles belong to the route view only. */
  showEndCircles: boolean;
  summits: SummitTick[];
  /** The ridden prefix of the line and of the area, for the accent knockout. */
  riddenLinePath(distM: number): string;
  riddenAreaPath(distM: number): string;
  marker(distM: number): RiderMarker;
}

export interface ElevationInput {
  route: Route;
  width: number;
  height: number;
  profile?: RouteProfile | null;
  climbs?: readonly Climb[];
  /** A zoom window from profile.projectWindow; omit for the whole route. */
  window?: ProfileWindow | null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** One vertex per pixel is the most the chart can show; below that, keep every point. */
function visibleSamples(points: readonly RoutePoint[], width: number): RoutePoint[] {
  const target = Math.max(2, Math.round(width));
  return resample(points, target);
}

export function elevationGeometry(input: ElevationInput): ElevationGeometry {
  const { route, width, height, profile = null, climbs = [], window: win = null } = input;

  const startM = win ? win.startM : 0;
  const endM = win ? win.endM : route.totalDistanceM;
  const spanM = Math.max(endM - startM, 1e-9);
  const visible = win ? win.points : route.points;

  let eleMinM = Infinity;
  let eleMaxM = -Infinity;
  for (const point of visible) {
    if (point.eleM < eleMinM) eleMinM = point.eleM;
    if (point.eleM > eleMaxM) eleMaxM = point.eleM;
  }
  if (!Number.isFinite(eleMinM)) {
    eleMinM = 0;
    eleMaxM = 0;
  }

  const scale = elevationScale({ eleMinM, eleMaxM, spanM, width, height });
  const xFor = (distM: number): number => ((clamp(distM, startM, endM) - startM) / spanM) * width;
  // spanM carries a floor, so a route with no length would otherwise map every x past
  // its own end; the clamp is what keeps the inverse inside the window at both edges.
  const distFor = (x: number): number =>
    width <= 0 ? startM : clamp(startM + (clamp(x, 0, width) / width) * spanM, startM, endM);
  const yFor = scale.yFor;

  const samples = visibleSamples(visible, width);
  const toPt = (point: RoutePoint): Pt => ({ x: xFor(point.distM), y: yFor(point.eleM) });
  const points = samples.map(toPt);

  const runs = win ? win.runs : (profile?.runs ?? []);
  const bands: BandShape[] = runs.map((run) => {
    const runStart = Math.max(run.startM, startM);
    const runEnd = Math.min(run.endM, endM);
    const steps = Math.max(2, Math.round(xFor(runEnd) - xFor(runStart)));
    const shape: Pt[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const distM = runStart + ((runEnd - runStart) * i) / steps;
      shape.push({ x: xFor(distM), y: yFor(elevationAt(route, distM)) });
    }
    // Straight segments, not smoothed: a band's edge must sit under the profile
    // line, and a smoothed fill overshoots it at the run's ends.
    return {
      d: areaPath(shape, scale.baselineY, false),
      band: run.band,
      startM: runStart,
      endM: runEnd,
    };
  });

  const step = tickStepM(spanM);
  const ticks: AxisTick[] = [];
  for (let i = 0; startM + i * step <= endM + 1e-6; i += 1) {
    const distM = startM + i * step;
    ticks.push({ x: xFor(distM), distM, long: i % 2 === 0 });
  }

  const km = (metres: number): string => (metres / 1000).toFixed(1);

  const summits: SummitTick[] = climbs
    .filter((climb) => climb.summitM >= startM && climb.summitM <= endM)
    .map((climb) => ({
      x: xFor(climb.summitM),
      y: yFor(climb.summitEleM),
      // DESIGN.md: summit ticks carry the climb's gain, not the summit's height.
      label: `+${Math.round(climb.gainM)} m`,
    }));

  const prefix = (distM: number): Pt[] => {
    const d = clamp(distM, startM, endM);
    if (d <= startM) return [];
    const head = samples.filter((point) => point.distM < d).map(toPt);
    head.push(toPt(interpolateAt(samples, d)));
    return head;
  };

  return {
    width,
    height,
    baselineY: scale.baselineY,
    startM,
    endM,
    scale,
    xFor,
    distFor,
    yFor,
    linePath: smoothPath(points),
    areaPath: areaPath(points, scale.baselineY),
    bands,
    ticks,
    startLabel: win ? km(startM) : null,
    endLabel: `${km(endM)} km`,
    showEndCircles: !win,
    summits,
    riddenLinePath: (distM) => smoothPath(prefix(distM)),
    riddenAreaPath: (distM) => areaPath(prefix(distM), scale.baselineY),
    marker: (distM) => {
      const d = clamp(distM, 0, route.totalDistanceM);
      return {
        x: xFor(d),
        y: yFor(elevationAt(route, d)),
        gradePercent: gradeAt(route, d),
      };
    },
  };
}
