/**
 * The workout screen's plan chart: steps and samples in, path strings out.
 *
 * Time across, watts up, the whole session at once — a workout is bounded, so unlike the
 * route profile there is no window to project and nothing to zoom. The x-axis is the plan
 * as it will actually be ridden: a skip truncates its step in `workout.steps`, so the
 * session shortens and the chart follows without reconstructing a duration from anywhere.
 *
 * Pure, like every other geometry module here. The component draws and decides nothing.
 */

import type { ExpandedStep } from '../../workout/expand';
import { DEFAULT_SCALE_PCT } from '../../workout/runner';
import { zoneBoundaries, zoneForPower, type PowerZone } from '../../zones/power';
import { duration, type PowerReading } from '../format';
import { polylinePath, type Pt } from './path';
import { ZONE_WASH_OPACITY, planSegments, planTotalSeconds, type PlanSegment } from './plan';
import { MAX_FRACTION_OF_FTP } from './power';

/** The ride recorder's series, narrowed to what a power-over-time line needs. */
export interface PlanChartSample {
  /** Seconds from the start, pause-aware — the same clock the runner rides. */
  t: number;
  powerW: number | null;
}

export interface PlanChartInput {
  steps: readonly ExpandedStep[];
  samples: readonly PlanChartSample[];
  /** The workout's own FTP where it has one, the rider's where it does not. */
  ftpW: number;
  /** Workout difficulty. The plan is drawn at it; the unscaled plan sits behind. */
  scalePct: number;
  elapsedS: number;
  width: number;
  height: number;
}

/**
 * The window the drawn trace is averaged over, and the reason it is longer than the
 * hero's three seconds rather than the same figure reused.
 *
 * Measured on the author's second hardware ride, which was ERG for the first half and
 * manual for the second: second-to-second power change went from a mean of 3.4 W (p95 12)
 * under ERG to 17.6 W (p95 68, max 293) under manual, and the raw line read as a hedge
 * rather than a trace. Five seconds takes the manual half to a mean of 5.4 W and a p95 of
 * 27 — about what ERG produces with no smoothing at all.
 *
 * Longer than POWER_WINDOW_S on purpose, because the two are read differently. The hero
 * is a number the rider reacts to, so its lag is the cost of every correction they make
 * and three seconds is as far as it can be pushed. Nobody reads a watt value off the
 * trace: it answers "how steady was that block", which lag does not change. So the trade
 * runs the other way here and the legibility is worth the delay.
 *
 * For drawing, and for nothing else. See smoothTrace.
 */
export const TRACE_WINDOW_S = 5;

/** A sample the trainer actually reported, or null. A sample with no placeable time is
 *  no reading either: it cannot sit on the x-axis, so it breaks the line like a dropout. */
function readingOf(sample: PlanChartSample): number | null {
  if (!Number.isFinite(sample.t)) return null;
  return sample.powerW === null || !Number.isFinite(sample.powerW) ? null : sample.powerW;
}

/**
 * The samples as the trace draws them: every reading replaced by the trailing mean of the
 * readings inside `windowS` ending at it.
 *
 * A fresh array, never the caller's. That is the whole of how the recording stays raw —
 * the series handed in is the recorder's own, which is what gets stored, exported to TCX
 * and scored for TSS, and it is read here and never written. The smoothed copy is local to
 * one geometry call and leaves this module as path strings.
 *
 * Absence survives exactly: a sample the trainer did not report comes back null, so the
 * line breaks where it always broke rather than being bridged by a mean. Readings age out
 * of the window by time and not by count, so a gap longer than the window empties it and
 * nothing is averaged across the hole — the same rule trailingMeanPower follows for the
 * hero, and the reason the first sample of a run is simply its own mean.
 *
 * Trailing, not centred. A centred mean would draw the line ahead of where the rider
 * actually was, and the last half-window would have to be drawn by a different rule from
 * the rest of the trace.
 *
 * One pass with a sliding sum rather than a mean computed per sample: the chart recomputes
 * every second as the series grows, so an hour of plan has to cost an hour of samples and
 * not their square. Assumes samples in time order, which the recorder's 1 Hz series is.
 */
export function smoothTrace(
  samples: readonly PlanChartSample[],
  windowS: number = TRACE_WINDOW_S,
): PlanChartSample[] {
  if (!Number.isFinite(windowS) || windowS <= 0)
    return samples.map((sample) => ({ t: sample.t, powerW: readingOf(sample) }));

  // Values, not the sample objects: the output is built from these and must not be able
  // to feed a smoothed watt back into the window it was averaged from.
  const readings: PowerReading[] = [];
  for (const sample of samples) {
    const w = readingOf(sample);
    if (w !== null) readings.push({ t: sample.t, w });
  }

  let head = 0;
  let tail = 0;
  let total = 0;
  return samples.map((sample) => {
    const w = readingOf(sample);
    if (w === null) return { t: sample.t, powerW: null };
    // Exclusive at the old end, inclusive at the new, as trailingMeanPower is: a reading
    // landing exactly now counts, and one exactly a window old has had its turn.
    while (head < readings.length) {
      const next = readings[head] as PowerReading;
      if (next.t > sample.t) break;
      total += next.w;
      head += 1;
    }
    const since = sample.t - windowS;
    while (tail < head) {
      const oldest = readings[tail] as PowerReading;
      if (oldest.t > since) break;
      total -= oldest.w;
      tail += 1;
    }
    const count = head - tail;
    return { t: sample.t, powerW: count === 0 ? w : total / count };
  });
}

/**
 * Tick spacings, smallest first. A twelve-second plan and a three-hour one both have to
 * land on a figure a rider reads without counting, so the ladder runs from a second to an
 * hour rather than dividing the session into a fixed number of parts.
 */
const TICK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Beyond this the axis is a comb. 63 minutes at 5-minute ticks is 13, which is the mockup. */
const MAX_TICKS = 24;

/** Every third tick carries a figure; every sixth is drawn long, as design/mockups/workout.html has it. */
const LABEL_EVERY = 3;
const LONG_EVERY = 6;

/** Room kept clear at the right so the last tick figure never collides with the total. */
const TOTAL_LABEL_CLEARANCE = 52;

/** The zone figure sits in the middle of its band, nudged down to the type's baseline. */
const ZONE_LABEL_BASELINE = 4;

export interface ZoneLine {
  zone: PowerZone;
  /** The top of this zone's band, which is the rule drawn for it. */
  y: number;
  labelY: number;
  label: string;
}

export interface TimeTick {
  x: number;
  long: boolean;
  /** Null on a tick that carries no figure, or one that would sit under the total. */
  label: string | null;
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
  totalS: number;
  /** `63 min`, bottom right, of the plan that will actually be ridden. */
  totalLabel: string;
  zoneLines: ZoneLine[];
  ticks: TimeTick[];
  /** The plan's grey steps. Clipped to what is still ahead by the component. */
  blocks: PlanBlock[];
  /** The plan's outline, one path per run of targeted steps: a free block leaves a gap. */
  planPaths: string[];
  /** The unscaled plan, drawn faintly behind. Empty at 100 %, where it would be a copy. */
  historyPaths: string[];
  /** Actual power, one path per run of samples that reported a reading. */
  actualPaths: string[];
  actualAreaPaths: string[];
  /** Where the rider is on the plan. Null before the session has a clock to place. */
  marker: { x: number; y: number } | null;
}

function tickStepFor(totalS: number): number {
  const last = TICK_STEPS_S[TICK_STEPS_S.length - 1] as number;
  return TICK_STEPS_S.find((step) => totalS / step <= MAX_TICKS) ?? last;
}

/** Minutes read as bare figures once the ticks are minutes apart; below that, a clock. */
function tickLabel(seconds: number, stepS: number): string {
  return stepS >= 60 ? String(Math.round(seconds / 60)) : duration(seconds);
}

function totalLabel(totalS: number): string {
  return totalS >= 60 ? `${String(Math.round(totalS / 60))} min` : duration(totalS);
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
  const { steps, samples, ftpW, scalePct, elapsedS, width, height } = input;

  const totalS = planTotalSeconds(steps);
  const ftp = Math.max(ftpW, 1);
  // The power strip's ceiling, so a watt is the same height on both charts and a block
  // that filled two thirds of the list sparkline fills two thirds of this one.
  const ceilingW = ftp * MAX_FRACTION_OF_FTP;
  const baselineY = height;

  const xFor = (seconds: number): number =>
    totalS <= 0 ? 0 : (Math.min(Math.max(seconds, 0), totalS) / totalS) * width;
  const yFor = (watts: number): number =>
    baselineY - (Math.min(Math.max(watts, 0), ceilingW) / ceilingW) * baselineY;

  // The zone bands, bottom to top: each rule is the top of its own band, and the last
  // one is the chart's own ceiling rather than an open-ended zone 6.
  const edges = [0, ...zoneBoundaries(ftp), ceilingW];
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

  const stepS = tickStepFor(totalS);
  const ticks: TimeTick[] = [];
  for (let index = 0, at = 0; at <= totalS; index += 1, at += stepS) {
    const x = xFor(at);
    const labelled = index > 0 && index % LABEL_EVERY === 0 && x <= width - TOTAL_LABEL_CLEARANCE;
    ticks.push({
      x,
      long: index % LONG_EVERY === 0,
      label: labelled ? tickLabel(at, stepS) : null,
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

  // A sample with no reading breaks the line for the same reason a free step does: the
  // trainer not reporting is not the rider at nought watts.
  const actualPaths: string[] = [];
  const actualAreaPaths: string[] = [];
  let run: Pt[] = [];
  const flushRun = (): void => {
    if (run.length >= 2) {
      actualPaths.push(polylinePath(run));
      const first = run[0] as Pt;
      const last = run[run.length - 1] as Pt;
      actualAreaPaths.push(
        `${polylinePath(run)} L${last.x.toFixed(2)},${baselineY.toFixed(2)} L${first.x.toFixed(2)},${baselineY.toFixed(2)} Z`,
      );
    }
    run = [];
  };
  // Smoothed here, at the point of drawing, and nowhere upstream of it: `samples` is the
  // recorder's own series and is only read. See smoothTrace.
  for (const sample of smoothTrace(samples)) {
    if (sample.powerW === null) {
      flushRun();
      continue;
    }
    run.push({ x: xFor(sample.t), y: yFor(sample.powerW) });
  }
  flushRun();

  // The marker rides the plan, not the power: it answers "where in the session am I",
  // and the accent line already says what the rider is actually doing. On a free block
  // the plan has no height to sit at, so it drops to the axis rather than inventing one.
  const planW = wattsAt(segments, Math.min(Math.max(elapsedS, 0), totalS));
  const marker =
    totalS <= 0 ? null : { x: xFor(elapsedS), y: planW === null ? baselineY : yFor(planW) };

  return {
    width,
    height,
    baselineY,
    totalS,
    totalLabel: totalLabel(totalS),
    zoneLines,
    ticks,
    blocks,
    planPaths,
    historyPaths,
    actualPaths,
    actualAreaPaths,
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
