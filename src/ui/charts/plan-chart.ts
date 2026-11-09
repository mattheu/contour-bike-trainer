/**
 * The workout screen's plan chart: steps in, path strings out.
 *
 * Time across, watts up, the whole session at once — a workout is bounded, so unlike the
 * route profile there is no window to project and nothing to zoom. The x-axis is the plan
 * as it will actually be ridden: a skip truncates its step in `workout.steps`, so the
 * session shortens and the chart follows without reconstructing a duration from anywhere.
 *
 * The plan alone. What the rider actually produced is two trend strips under this chart —
 * see strips.ts — which is also where the time axis and its figures now live, because that
 * axis rules the bottom of the block rather than this chart's own baseline.
 *
 * Pure, like every other geometry module here. The component draws and decides nothing.
 */

import type { ExpandedStep } from '../../workout/expand';
import { DEFAULT_SCALE_PCT } from '../../workout/runner';
import { zoneBoundaries, zoneForPower, type PowerZone } from '../../zones/power';
import { polylinePath, type Pt } from './path';
import {
  PLAN_FLOOR_FRACTION_OF_FTP,
  ZONE_WASH_OPACITY,
  planSegments,
  planTotalSeconds,
  type PlanSegment,
} from './plan';

export interface PlanChartInput {
  steps: readonly ExpandedStep[];
  /** The workout's own FTP where it has one, the rider's where it does not. */
  ftpW: number;
  /** Workout difficulty. The plan is drawn at it; the unscaled plan sits behind. */
  scalePct: number;
  elapsedS: number;
  width: number;
  height: number;
}

/** The zone figure sits in the middle of its band, nudged down to the type's baseline. */
const ZONE_LABEL_BASELINE = 4;

export interface ZoneLine {
  zone: PowerZone;
  /** The top of this zone's band, which is the rule drawn for it. Zone 6 has neither:
   *  it is open-ended, so it never appears here. */
  y: number;
  labelY: number;
  label: string;
}

/**
 * Air above the tallest block, as a fraction of its own height.
 *
 * The ceiling has to clear the plan rather than meet it: a block whose top edge is the
 * chart's top edge reads as a block that ran out of room, which is exactly what the trace
 * above it is now allowed to say and must not be confused with. A fraction of the peak
 * rather than a fixed number of watts so the gap looks the same whatever the plan reaches
 * — 8 % is about 16 px on the 220 px chart the desktop screen draws and still some 7 px on
 * the shortest window the layout will hand it, which is a gap and not a rounding.
 *
 * Deliberately smaller than a zone band is tall, so the space over the plan never reads as
 * another band that nothing is labelling.
 */
export const CEILING_HEADROOM = 0.08;

/** The tallest target in a plan, before any ceiling clamps it. */
function peakOf(segments: readonly PlanSegment[]): number {
  let peak = 0;
  for (const segment of segments) peak = Math.max(peak, segment.fromW, segment.toW);
  return peak;
}

/**
 * The watts at the top of the chart.
 *
 * PLAN_FLOOR_FRACTION_OF_FTP is the floor of it, so an ordinary session is drawn at the
 * height it has always been drawn at. Above that the ceiling follows the plan: the parser takes a target up to 300 % of FTP
 * or 2000 W, difficulty multiplies it by half as much again, and a chart that stopped at
 * 160 % drew a 200 % sprint and a 160 % one at exactly the same height. Showing the plan
 * is the chart's whole job, so the plan sets the top of it.
 *
 * Read off the plan and nothing else. The rider's own power is not drawn here at all now,
 * so there is nothing live that could move the scale: a chart that rescales itself while
 * being read is a chart you cannot read.
 *
 * Both the plan being ridden and the plan as written, so the two never disagree about how
 * high the chart is. The faint unscaled line is drawn whenever difficulty is off 100 % and
 * it is as much the plan as the scaled blocks are. It also makes the ceiling steadier than
 * taking the scaled peak alone would: easing a hard session off does not shrink the chart
 * around it, and raising difficulty — a deliberate act, and the one thing allowed to move
 * the scale — is the only thing that lifts it.
 *
 * A skip cannot move it either: skipStep shortens the step it ends rather than dropping
 * it, so its target is still in the plan and still counted here.
 */
export function planCeilingW(
  steps: readonly ExpandedStep[],
  ftpW: number,
  scalePct: number,
): number {
  const ftp = Math.max(ftpW, 1);
  const peak = Math.max(
    peakOf(planSegments(steps, ftp, scalePct)),
    peakOf(planSegments(steps, ftp, DEFAULT_SCALE_PCT)),
  );
  return Math.max(ftp * PLAN_FLOOR_FRACTION_OF_FTP, peak * (1 + CEILING_HEADROOM));
}

export interface PlanBlock {
  d: string;
  /**
   * The expanded step this block draws, 0-based — the block's identity, and the only
   * thing that lets a pointer on the chart name a row in the Steps panel. A free step
   * has no block at all, so there is no index that resolves to nothing: the gap is an
   * absence of hit area rather than a block that declines to answer.
   */
  stepIndex: number;
  zone: PowerZone;
  opacity: number;
}

export interface PlanChartGeometry {
  width: number;
  height: number;
  baselineY: number;
  /** The watts at the top of the chart. Power above it clips; see planCeilingW. */
  ceilingW: number;
  totalS: number;
  zoneLines: ZoneLine[];
  /** The plan's grey steps. Clipped to what is still ahead by the component. */
  blocks: PlanBlock[];
  /** The plan's outline, one path per run of targeted steps: a free block leaves a gap. */
  planPaths: string[];
  /** The unscaled plan, drawn faintly behind. Empty at 100 %, where it would be a copy. */
  historyPaths: string[];
  /** Where the rider is on the plan. Null before the session has a clock to place. */
  marker: { x: number; y: number } | null;
}

/** The watts the plan asks for at a moment, or null in the gap a free block leaves. */
function wattsAt(segments: readonly PlanSegment[], seconds: number): number | null {
  for (const segment of segments) {
    if (seconds < segment.startS || seconds > segment.endS) continue;
    const span = segment.endS - segment.startS;
    const progress = span > 0 ? (seconds - segment.startS) / span : 0;
    return segment.fromW + (segment.toW - segment.fromW) * progress;
  }
  return null;
}

/** Runs of segments that touch, so a free block between two blocks breaks the line. */
function runsOf(segments: readonly PlanSegment[]): PlanSegment[][] {
  const runs: PlanSegment[][] = [];
  let run: PlanSegment[] = [];
  for (const segment of segments) {
    const previous = run[run.length - 1];
    if (previous !== undefined && segment.startS !== previous.endS) {
      runs.push(run);
      run = [];
    }
    run.push(segment);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

export function planChartGeometry(input: PlanChartInput): PlanChartGeometry {
  const { steps, ftpW, scalePct, elapsedS, width, height } = input;

  const totalS = planTotalSeconds(steps);
  const ftp = Math.max(ftpW, 1);
  const ceilingW = planCeilingW(steps, ftp, scalePct);
  const baselineY = height;

  const xFor = (seconds: number): number =>
    totalS <= 0 ? 0 : (Math.min(Math.max(seconds, 0), totalS) / totalS) * width;
  const yFor = (watts: number): number =>
    baselineY - (Math.min(Math.max(watts, 0), ceilingW) / ceilingW) * baselineY;

  // The zone bands, bottom to top: each rule is the top of its own band, which is where
  // the next zone starts. There are five of them for six zones, and zone 6 is the one
  // with none — it is "over 120 %", so it has no top, and a rule across the chart would
  // be drawing a boundary the model does not have. Its space still runs to the top of
  // the chart; what it does not get is a line, or a figure sitting under one.
  const edges = [0, ...zoneBoundaries(ftp)];
  const zoneLines: ZoneLine[] = [];
  for (let zone = 1; zone <= edges.length - 1; zone += 1) {
    const bottomY = yFor(edges[zone - 1] as number);
    const topY = yFor(edges[zone] as number);
    zoneLines.push({
      zone: zone as PowerZone,
      y: topY,
      labelY: (bottomY + topY) / 2 + ZONE_LABEL_BASELINE,
      label: `Z${String(zone)}`,
    });
  }

  const segments = planSegments(steps, ftp, scalePct);

  const blocks: PlanBlock[] = segments.map((segment) => {
    const x0 = xFor(segment.startS);
    const x1 = xFor(segment.endS);
    const y0 = yFor(segment.fromW);
    const y1 = yFor(segment.toW);
    const zone = zoneForPower((segment.fromW + segment.toW) / 2, ftp);
    return {
      // A constant is a rectangle and a ramp the same shape with a sloped top, so one
      // path covers both rather than the chart owning two kinds of block.
      d: polylinePath([
        { x: x0, y: baselineY },
        { x: x0, y: y0 },
        { x: x1, y: y1 },
        { x: x1, y: baselineY },
      ]).concat(' Z'),
      stepIndex: segment.stepIndex,
      zone,
      opacity: ZONE_WASH_OPACITY[zone],
    };
  });

  const outline = (from: readonly PlanSegment[]): string[] =>
    runsOf(from).map((run) => {
      const points: Pt[] = [];
      for (const segment of run) {
        points.push(
          { x: xFor(segment.startS), y: yFor(segment.fromW) },
          { x: xFor(segment.endS), y: yFor(segment.toW) },
        );
      }
      return polylinePath(points);
    });

  const planPaths = outline(segments);
  // Only off 100 %: at full scale the unscaled plan is the same line, and drawing it
  // twice is noise rather than the comparison it exists to offer.
  const historyPaths =
    scalePct === DEFAULT_SCALE_PCT ? [] : outline(planSegments(steps, ftp, DEFAULT_SCALE_PCT));

  // The marker rides the plan, not the power: it answers "where in the session am I", and
  // the strips below already say what the rider is actually doing. On a free block the plan
  // has no height to sit at, so it drops to the axis rather than inventing one.
  const planW = wattsAt(segments, Math.min(Math.max(elapsedS, 0), totalS));
  const marker =
    totalS <= 0 ? null : { x: xFor(elapsedS), y: planW === null ? baselineY : yFor(planW) };

  return {
    width,
    height,
    baselineY,
    ceilingW,
    totalS,
    zoneLines,
    blocks,
    planPaths,
    historyPaths,
    marker,
  };
}

/**
 * The block a hovered Steps row points at, or null where the row has none.
 *
 * The exact inverse of `hoveredRowNumber` in workout-view.ts, and the reason hovering a
 * free step's row marks nothing on the chart: a free step produces no segment and so no
 * block, so there is no entry here to find. The absence is in the list being searched
 * rather than in a test for freeness written above it — which is also what keeps a plan
 * that shortens under a skip from outlining a block that is gone.
 *
 * Null in, null out: a pointer on no row is a chart with nothing outlined.
 */
export function blockForStep(
  blocks: readonly PlanBlock[],
  stepIndex: number | null,
): PlanBlock | null {
  if (stepIndex === null) return null;
  return blocks.find((block) => block.stepIndex === stepIndex) ?? null;
}
