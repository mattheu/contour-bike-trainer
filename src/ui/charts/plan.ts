/**
 * The plan's shape for a workouts list row: expanded steps in, path strings out.
 *
 * The routes list draws a route's profile at 120 x 28 with no axis, marker or fill, and
 * this is the same slot doing the same job for a workout — target power over time.
 * Pure, like every other geometry module here, so the paths can be asserted against
 * known numbers rather than inspected in a browser.
 */

import type { ExpandedStep } from '../../workout/expand';
import { targetWattsAt } from '../../workout/runner';
import { polylinePath, type Pt } from './path';
import { MAX_FRACTION_OF_FTP } from './power';

/** The routes list's sparkline size, so the two lead columns align down the page. */
export const PLAN_SPARKLINE_WIDTH = 120;
export const PLAN_SPARKLINE_HEIGHT = 28;

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
  const totalS = steps.reduce((total, step) => total + step.durationS, 0);
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
  let at = 0;

  const flush = (): void => {
    // A single point is a step with no duration: nothing to draw, and polylinePath would
    // return a path with no second coordinate for the browser to stroke.
    if (run.length >= 2) paths.push(polylinePath(run));
    run = [];
  };

  for (const step of steps) {
    const end = at + step.durationS;
    const from = targetWattsAt(step.power, 0, step.durationS, ftpW);
    const to = targetWattsAt(step.power, step.durationS, step.durationS, ftpW);
    if (from === null || to === null) {
      flush();
      at = end;
      continue;
    }
    peakW = Math.max(peakW, from, to);
    // Two points per step: a constant is a horizontal segment, a ramp is linear in time,
    // and the vertical between two steps falls out of them sharing an x.
    run.push({ x: xFor(at), y: yFor(from) }, { x: xFor(end), y: yFor(to) });
    at = end;
  }
  flush();

  return { width, height, paths, peakW };
}
