/**
 * The plan's shape for a workouts list row: expanded steps in, path strings out.
 *
 * The routes list draws a route's profile at 120 x 28 with no axis, marker or fill, and
 * this is the same slot doing the same job for a workout — target power over time.
 * Pure, like every other geometry module here, so the paths can be asserted against
 * known numbers rather than inspected in a browser.
 */

import type { ExpandedStep } from '../../workout/expand';
import { DEFAULT_SCALE_PCT, targetWattsAt } from '../../workout/runner';
import { zoneForPower, type PowerZone } from '../../zones/power';
import { polylinePath, type Pt } from './path';
import { MAX_FRACTION_OF_FTP } from './power';

/** The routes list's sparkline size, so the two lead columns align down the page. */
export const PLAN_SPARKLINE_WIDTH = 120;
export const PLAN_SPARKLINE_HEIGHT = 28;

/**
 * One targeted step as a span of the session, in seconds and watts.
 *
 * A free step produces nothing at all, so a discontinuity between one segment's end and
 * the next one's start IS the gap in the plan — which is not the same as nought watts,
 * and is why both the sparkline and the full chart break their line there rather than
 * running it along the floor.
 */
export interface PlanSegment {
  startS: number;
  endS: number;
  fromW: number;
  toW: number;
}

/**
 * The steps walked once, shared by the list sparkline and the ride screen's plan chart.
 * Two charts resolving targets, ramps and free blocks separately is two chances to draw
 * a different plan from the one the runner is riding.
 */
export function planSegments(
  steps: readonly ExpandedStep[],
  ftpW: number,
  scalePct: number = DEFAULT_SCALE_PCT,
): PlanSegment[] {
  const segments: PlanSegment[] = [];
  let at = 0;
  for (const step of steps) {
    const end = at + step.durationS;
    const fromW = targetWattsAt(step.power, 0, step.durationS, ftpW, scalePct);
    const toW = targetWattsAt(step.power, step.durationS, step.durationS, ftpW, scalePct);
    if (fromW !== null && toW !== null) segments.push({ startS: at, endS: end, fromW, toW });
    at = end;
  }
  return segments;
}

/** The session's length as it will actually be ridden, skips included. */
export function planTotalSeconds(steps: readonly ExpandedStep[]): number {
  return steps.reduce((total, step) => total + step.durationS, 0);
}

/**
 * How dark a step's block is, as a fraction of ink. One scale, used by the plan chart's
 * blocks and by the Steps panel's rows — design/DESIGN.md asks the two to match, and two
 * ramps that merely look alike is exactly the drift that asking buys.
 *
 * An even ramp rather than the power strip's three tiers: the strip is a shape to glance
 * at, these are a chart and a list you read a step off, and six separable levels are what
 * let a sweet-spot block be told from a threshold one without reading the axis. The floor
 * is set by legibility rather than by the ramp — below about 5 % of ink the wash stops
 * being visible against the ground and the row reads as having no target at all, which is
 * what a free step is supposed to look like.
 */
export const ZONE_WASH_OPACITY: Record<PowerZone, number> = {
  1: 0.05,
  2: 0.08,
  3: 0.11,
  4: 0.15,
  5: 0.19,
  6: 0.23,
};

/** The wash for a zone, or null where there is no zone: absence is not zone 1. */
export function zoneWash(zone: PowerZone | null): number | null {
  return zone === null ? null : ZONE_WASH_OPACITY[zone];
}

/**
 * The zone a step asks for, at the difficulty it is being ridden at, or null on a free
 * step. A ramp is classed by its mean, which is the effort it averages out to.
 */
export function stepZone(
  step: ExpandedStep,
  ftpW: number,
  scalePct: number = DEFAULT_SCALE_PCT,
): PowerZone | null {
  const ftp = Math.max(ftpW, 1);
  const fromW = targetWattsAt(step.power, 0, step.durationS, ftp, scalePct);
  const toW = targetWattsAt(step.power, step.durationS, step.durationS, ftp, scalePct);
  if (fromW === null || toW === null) return null;
  return zoneForPower((fromW + toW) / 2, ftp);
}

/** Half the 1 px stroke, so a target at the floor or the ceiling is not sliced in half. */
const STROKE_PAD = 0.5;

export interface PlanSparklineInput {
  steps: readonly ExpandedStep[];
  /** The workout's own FTP where it has one, the rider's where it does not. */
  ftpW: number;
  width: number;
  height: number;
}

export interface PlanSparklineGeometry {
  width: number;
  height: number;
  /**
   * One path per run of targeted steps. A free block has no target, so it leaves a gap
   * rather than a line along the floor — nothing to draw is not the same as zero watts.
   */
  paths: string[];
  /** The highest target in the plan, before the ceiling clamps it. */
  peakW: number;
}

/**
 * The vertical scale is the power strip's: the top of the chart is 160 % of FTP.
 *
 * Fixed rather than fitted, for the reason the elevation sparkline is fixed — a plan
 * scaled to its own peak draws an hour at 70 % and five minutes at 120 % as the same
 * mountain, and the one comparison a list of workouts is for is which one is harder.
 */
export function planSparklineGeometry(input: PlanSparklineInput): PlanSparklineGeometry {
  const { steps, ftpW, width, height } = input;
  const totalS = planTotalSeconds(steps);
  const ceilingW = Math.max(ftpW, 1) * MAX_FRACTION_OF_FTP;
  const floorY = height - STROKE_PAD;
  const span = Math.max(floorY - STROKE_PAD, 0);

  const xFor = (seconds: number): number =>
    totalS <= 0 ? 0 : (Math.min(Math.max(seconds, 0), totalS) / totalS) * width;
  const yFor = (watts: number): number =>
    floorY - (Math.min(Math.max(watts, 0), ceilingW) / ceilingW) * span;

  const paths: string[] = [];
  let run: Pt[] = [];
  let peakW = 0;
  let previousEndS: number | null = null;

  const flush = (): void => {
    // A single point is a step with no duration: nothing to draw, and polylinePath would
    // return a path with no second coordinate for the browser to stroke.
    if (run.length >= 2) paths.push(polylinePath(run));
    run = [];
  };

  for (const segment of planSegments(steps, ftpW)) {
    // A segment that does not start where the last one ended is a free block between
    // them, so the run breaks rather than bridging the gap.
    if (previousEndS !== null && segment.startS !== previousEndS) flush();
    peakW = Math.max(peakW, segment.fromW, segment.toW);
    // Two points per step: a constant is a horizontal segment, a ramp is linear in time,
    // and the vertical between two steps falls out of them sharing an x.
    run.push(
      { x: xFor(segment.startS), y: yFor(segment.fromW) },
      { x: xFor(segment.endS), y: yFor(segment.toW) },
    );
    previousEndS = segment.endS;
  }
  flush();

  return { width, height, paths, peakW };
}
