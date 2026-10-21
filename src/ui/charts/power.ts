/**
 * Power-so-far strip geometry. Shares the elevation profile's x-axis, so it takes
 * the same distance window and maps power onto its own short vertical scale.
 */

import { zoneForPower, type PowerZone } from '../../zones/power';
import { areaPath, polylinePath, type Pt } from './path';

/** 944 x 74 with the axis at 56, from design/mockups/ride.html. */
export const BASELINE_FRACTION = 56 / 74;

/**
 * The top of the strip is 160 % of FTP: the ceiling of zone 5, so a hard effort
 * fills the strip without a sprint running off the top. This puts the dashed FTP
 * reference at 37.5 % of the way down, which is where the mockup draws it.
 */
export const MAX_FRACTION_OF_FTP = 1.6;

/**
 * The rider's marker runs from just under the FTP rule down to the axis. It took the y
 * the current-reading label used to sit at: the label was the only thing marking where
 * the rider had got to, and dropping it without putting a tick there would have left the
 * strip a shape with no position on it.
 */
const MARKER_TOP_Y_FRACTION = 24 / 74;

/**
 * Three washes for six zones, as the mockups show. Zones 1-2 are "easier than threshold",
 * 3-4 "at or around it", 5-6 "above it" — the strip is a shape to glance at, and six
 * separable greys at these opacities would not be separable anyway.
 */
export const ZONE_OPACITY: Record<PowerZone, number> = {
  1: 0.14,
  2: 0.14,
  3: 0.2,
  4: 0.2,
  5: 0.28,
  6: 0.28,
};

export interface PowerSample {
  distM: number;
  watts: number;
}

export interface ZoneFill {
  d: string;
  zone: PowerZone;
  opacity: number;
}

export interface PowerStripGeometry {
  width: number;
  height: number;
  baselineY: number;
  ftpY: number;
  /** Top of the rider's marker; it runs from here to the baseline. */
  markerTopY: number;
  xFor(distM: number): number;
  yFor(watts: number): number;
  fills: ZoneFill[];
  /** The 1 px accent line over the washes. */
  linePath: string;
  averageW: number | null;
}

export interface PowerStripInput {
  samples: readonly PowerSample[];
  ftpW: number;
  width: number;
  height: number;
  /** The distance window, shared with the elevation profile above it. */
  startM: number;
  endM: number;
}

export function powerStripGeometry(input: PowerStripInput): PowerStripGeometry {
  const { samples, ftpW, width, height, startM, endM } = input;
  const baselineY = height * BASELINE_FRACTION;
  const ceilingW = Math.max(ftpW, 1) * MAX_FRACTION_OF_FTP;
  const spanM = Math.max(endM - startM, 1e-9);

  const xFor = (distM: number): number =>
    ((Math.min(Math.max(distM, startM), endM) - startM) / spanM) * width;
  const yFor = (watts: number): number =>
    baselineY - Math.min(Math.max(watts, 0), ceilingW) * (baselineY / ceilingW);

  const visible = samples.filter((sample) => sample.distM >= startM && sample.distM <= endM);
  const points: Pt[] = visible.map((sample) => ({
    x: xFor(sample.distM),
    y: yFor(sample.watts),
  }));

  // Contiguous samples in the same zone become one fill, so the strip reads as
  // blocks of effort rather than a comb.
  const fills: ZoneFill[] = [];
  let run: Pt[] = [];
  let runZone: PowerZone | null = null;
  const flush = (): void => {
    if (runZone !== null && run.length >= 2) {
      fills.push({
        d: areaPath(run, baselineY, false),
        zone: runZone,
        opacity: ZONE_OPACITY[runZone],
      });
    }
    run = [];
  };
  visible.forEach((sample, i) => {
    const zone = zoneForPower(sample.watts, Math.max(ftpW, 1));
    if (zone !== runZone) {
      const boundary = points[i - 1];
      flush();
      runZone = zone;
      // Carry the previous sample into the new run so the washes abut at the zone
      // change instead of leaving a sample-wide hole, and a single-sample
      // excursion still encloses an area.
      if (boundary) run.push(boundary);
    }
    run.push(points[i] as Pt);
  });
  flush();

  const averageW =
    visible.length > 0
      ? visible.reduce((total, sample) => total + sample.watts, 0) / visible.length
      : null;

  return {
    width,
    height,
    baselineY,
    ftpY: yFor(ftpW),
    markerTopY: height * MARKER_TOP_Y_FRACTION,
    xFor,
    yFor,
    fills,
    linePath: polylinePath(points),
    averageW,
  };
}
