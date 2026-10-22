import { describe, expect, it } from 'vitest';
import formatTest from '../../../manual-tests/format-test.yaml?raw';
import { DEFAULT_SETTINGS } from '../../storage/settings';
import { expandWorkout, type ExpandedStep } from '../../workout/expand';
import { parseWorkout } from '../../workout/parse';
import { workoutFtp } from '../../workout/runner';
import {
  CEILING_HEADROOM,
  TRACE_WINDOW_S,
  blockForStep,
  planCeilingW,
  planChartGeometry,
  smoothTrace,
  type PlanChartSample,
} from './plan-chart';
import { ZONE_WASH_OPACITY } from './plan';
import { MAX_FRACTION_OF_FTP } from './power';

const FTP = 250;
const WIDTH = 912;
const HEIGHT = 220;

function step(durationS: number, percent: number | 'free'): ExpandedStep {
  return {
    kind: 'step',
    durationS,
    power:
      percent === 'free'
        ? { kind: 'free' }
        : { kind: 'constant', value: { unit: 'ftpPercent', value: percent } },
  };
}

function ramp(durationS: number, from: number, to: number): ExpandedStep {
  return {
    kind: 'step',
    durationS,
    power: {
      kind: 'ramp',
      from: { unit: 'ftpPercent', value: from },
      to: { unit: 'ftpPercent', value: to },
    },
  };
}

function geometry(
  steps: readonly ExpandedStep[],
  patch: Partial<{ samples: PlanChartSample[]; scalePct: number; elapsedS: number }> = {},
) {
  return planChartGeometry({
    steps,
    samples: patch.samples ?? [],
    ftpW: FTP,
    scalePct: patch.scalePct ?? 100,
    elapsedS: patch.elapsedS ?? 0,
    width: WIDTH,
    height: HEIGHT,
  });
}

/** `M0,17.5 L60,17.5 Z` -> [{x:0,y:17.5},{x:60,y:17.5}] */
function points(d: string): { x: number; y: number }[] {
  return d
    .split(' ')
    .filter((token) => token !== 'Z')
    .map((token) => token.slice(1).split(','))
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }));
}

describe('the x-axis is the ridden timeline', () => {
  it('splits the width by duration, so a long step takes more of it than a short one', () => {
    const { blocks } = geometry([step(300, 60), step(900, 90)]);
    const first = points(blocks[0]?.d ?? '');
    expect(first[2]?.x).toBeCloseTo(WIDTH / 4, 6);
  });

  it('follows a skip, which shortens the step it truncates and the session with it', () => {
    const planned = geometry([step(600, 60), step(600, 90)]);
    const skipped = geometry([step(120, 60), step(600, 90)]);
    expect(planned.totalS).toBe(1200);
    expect(skipped.totalS).toBe(720);
    // The second step still fills the rest of the chart: the axis is what was ridden.
    expect(points(skipped.blocks[1]?.d ?? '')[3]?.x).toBeCloseTo(WIDTH, 6);
  });

  it('labels the session with the length that will actually be ridden', () => {
    expect(geometry([step(1800, 60), step(1980, 90)]).totalLabel).toBe('63 min');
    expect(geometry([step(6, 60), step(6, 70)]).totalLabel).toBe('0:12');
  });
});

describe('the plan', () => {
  it('draws a constant step as a block and a ramp as a slope', () => {
    const block = points(geometry([step(600, 60)]).blocks[0]?.d ?? '');
    expect(block[1]?.y).toBe(block[2]?.y);

    const slope = points(geometry([ramp(600, 50, 75)]).blocks[0]?.d ?? '');
    expect(slope[2]?.y).toBeLessThan(slope[1]?.y as number);
  });

  it('puts a harder block higher, and washes it darker', () => {
    const easy = geometry([step(600, 55)]).blocks[0];
    const hard = geometry([step(600, 110)]).blocks[0];
    expect(points(hard?.d ?? '')[1]?.y).toBeLessThan(points(easy?.d ?? '')[1]?.y as number);
    expect(hard?.opacity).toBeGreaterThan(easy?.opacity ?? 1);
  });

  it('washes a block at the shared zone scale the Steps panel uses', () => {
    const block = geometry([step(600, 95)]).blocks[0];
    expect(block?.zone).toBe(4);
    expect(block?.opacity).toBe(ZONE_WASH_OPACITY[4]);
  });

  it('leaves a free step out entirely, rather than drawing it along the floor', () => {
    const { blocks, planPaths } = geometry([step(600, 60), step(600, 'free'), step(600, 90)]);
    expect(blocks).toHaveLength(2);
    // Two runs, not one: the line breaks over the gap instead of bridging it.
    expect(planPaths).toHaveLength(2);
  });

  it('names the step each block draws, across the gap a free step leaves', () => {
    const { blocks } = geometry([step(600, 60), step(600, 'free'), step(600, 90)]);

    // The second block is step three. Its position in the list is not its position in
    // the plan, and the Steps panel is indexed by the plan.
    expect(blocks.map((block) => block.stepIndex)).toEqual([0, 2]);
  });

  it('breaks the line nowhere else: two targeted steps in a row are one path', () => {
    expect(geometry([step(600, 60), step(600, 90)]).planPaths).toHaveLength(1);
  });

  it('scales with workout difficulty, so the blocks are the work being asked for', () => {
    const full = points(geometry([step(600, 90)]).blocks[0]?.d ?? '');
    const easier = points(geometry([step(600, 90)], { scalePct: 80 }).blocks[0]?.d ?? '');
    expect(easier[1]?.y).toBeGreaterThan(full[1]?.y as number);
  });
});

describe('the plan as it was written, behind the plan as it is ridden', () => {
  it('is not drawn at 100 %, where it would be the same line twice', () => {
    expect(geometry([step(600, 90)]).historyPaths).toEqual([]);
  });

  it('is drawn off 100 %, at the unscaled target', () => {
    const chart = geometry([step(600, 90)], { scalePct: 80 });
    expect(chart.historyPaths).toHaveLength(1);
    expect(points(chart.historyPaths[0] as string)[0]?.y).toBe(
      points(geometry([step(600, 90)]).planPaths[0] as string)[0]?.y,
    );
  });

  it('is drawn above the scaled plan when the rider has made it harder', () => {
    const chart = geometry([step(600, 90)], { scalePct: 120 });
    expect(points(chart.historyPaths[0] as string)[0]?.y).toBeGreaterThan(
      points(chart.planPaths[0] as string)[0]?.y as number,
    );
  });
});

describe('actual power', () => {
  it('draws the samples as one line over the plan', () => {
    const chart = geometry([step(600, 60)], {
      samples: [
        { t: 0, powerW: 150 },
        { t: 300, powerW: 160 },
      ],
    });
    expect(chart.actualPaths).toHaveLength(1);
    const [start, end] = points(chart.actualPaths[0] as string);
    expect(start?.x).toBe(0);
    expect(end?.x).toBeCloseTo(WIDTH / 2, 6);
    expect(end?.y).toBeLessThan(start?.y as number);
  });

  it('breaks the line where the trainer reported nothing, rather than dropping to nought', () => {
    const chart = geometry([step(600, 60)], {
      samples: [
        { t: 0, powerW: 150 },
        { t: 100, powerW: 150 },
        { t: 200, powerW: null },
        { t: 300, powerW: 150 },
        { t: 400, powerW: 150 },
      ],
    });
    expect(chart.actualPaths).toHaveLength(2);
  });

  it('closes each run down to the axis for the hatch behind it', () => {
    const chart = geometry([step(600, 60)], {
      samples: [
        { t: 0, powerW: 150 },
        { t: 300, powerW: 160 },
      ],
    });
    expect(chart.actualAreaPaths[0]?.endsWith('Z')).toBe(true);
    expect(chart.actualAreaPaths[0]).toContain(`,${String(HEIGHT)}`);
  });
});

describe('smoothTrace', () => {
  /** One reading a second, as the recorder writes them. */
  const series = (watts: readonly (number | null)[]): PlanChartSample[] =>
    watts.map((powerW, t) => ({ t, powerW }));

  const watts = (samples: readonly PlanChartSample[]) => samples.map((sample) => sample.powerW);

  it('averages over five seconds, which is longer than the hero reads power over', () => {
    expect(TRACE_WINDOW_S).toBe(5);
  });

  it('is the trailing mean of the window ending at each reading', () => {
    // 100, then 200 from t=1 on. At t=5 the window holds t=1..5, all 200.
    const smoothed = watts(smoothTrace(series([100, 200, 200, 200, 200, 200])));
    expect(smoothed[0]).toBeCloseTo(100, 6);
    expect(smoothed[1]).toBeCloseTo(150, 6);
    expect(smoothed[4]).toBeCloseTo(180, 6);
    expect(smoothed[5]).toBeCloseTo(200, 6);
  });

  it('gives the first reading of a session its own value, rather than withholding one', () => {
    expect(watts(smoothTrace(series([240])))).toEqual([240]);
  });

  it('cuts a manual half to something like an ERG one, which is why the window exists', () => {
    // The author's ride: ERG held to a few watts a second, manual swung by tens.
    const noisy = Array.from({ length: 300 }, (_, i) => 200 + (i % 2 === 0 ? 70 : -70));
    const step = (values: readonly (number | null)[]) =>
      values
        .slice(1)
        .map((value, i) => Math.abs((value as number) - (values[i] as number)))
        .reduce((total, delta) => total + delta, 0) /
      (values.length - 1);
    expect(step(noisy)).toBeCloseTo(140, 0);
    expect(step(watts(smoothTrace(series(noisy))))).toBeLessThan(30);
  });

  it('keeps a dropout absent, so the line breaks exactly where it broke before', () => {
    const smoothed = watts(smoothTrace(series([200, 200, null, 200, 200])));
    expect(smoothed[2]).toBeNull();
    expect(smoothed.filter((value) => value === null)).toHaveLength(1);
  });

  it('averages over a dropout shorter than the window rather than across a hole', () => {
    // t=2 is absent, so t=3 means t=0,1,3 — the readings there are, not an interpolation.
    const smoothed = watts(smoothTrace(series([300, 300, null, 0])));
    expect(smoothed[3]).toBeCloseTo(200, 6);
  });

  it('starts clean after a gap longer than the window, with nothing carried across it', () => {
    const smoothed = watts(
      smoothTrace([
        { t: 0, powerW: 300 },
        { t: 1, powerW: 300 },
        { t: 60, powerW: 100 },
      ]),
    );
    expect(smoothed[2]).toBeCloseTo(100, 6);
  });

  it("leaves the caller's samples untouched: the recording is what gets stored", () => {
    const recorded = series([100, 200, 300, 400, 500, 600]);
    const before = JSON.stringify(recorded);
    const smoothed = smoothTrace(recorded);
    expect(JSON.stringify(recorded)).toBe(before);
    expect(smoothed[5]?.powerW).not.toBe(recorded[5]?.powerW);
    expect(smoothed[0]).not.toBe(recorded[0]);
  });

  it('holds the clock still: a reading is smoothed in place, never moved along the axis', () => {
    const recorded = series([100, 200, 300]);
    expect(smoothTrace(recorded).map((sample) => sample.t)).toEqual([0, 1, 2]);
  });

  it('smooths nothing at a window of nought, which is the raw trace', () => {
    expect(watts(smoothTrace(series([100, 200, 300]), 0))).toEqual([100, 200, 300]);
  });
});

describe('the drawn trace', () => {
  it('is the smoothed line, not the raw one', () => {
    /** Where the second point of a two-sample trace is drawn. */
    const secondY = (samples: PlanChartSample[]) =>
      points(geometry([step(600, 60)], { samples }).actualPaths[0] as string)[1]?.y as number;

    const spike = secondY([
      { t: 0, powerW: 100 },
      { t: 1, powerW: 300 },
    ]);
    // A flat series smooths to itself, so these two are the raw heights of 200 and 300 W.
    const flat200 = secondY([
      { t: 0, powerW: 200 },
      { t: 1, powerW: 200 },
    ]);
    const flat300 = secondY([
      { t: 0, powerW: 300 },
      { t: 1, powerW: 300 },
    ]);
    // The spike is drawn at the mean of the pair, not at the 300 W it actually reached.
    expect(spike).toBeCloseTo(flat200, 6);
    expect(spike).toBeGreaterThan(flat300);
  });

  it('still breaks where the trainer reported nothing', () => {
    const chart = geometry([step(600, 60)], {
      samples: [
        { t: 0, powerW: 150 },
        { t: 1, powerW: 150 },
        { t: 2, powerW: null },
        { t: 3, powerW: 150 },
        { t: 4, powerW: 150 },
      ],
    });
    expect(chart.actualPaths).toHaveLength(2);
  });

  it('leaves the marker on the plan, which is what keeps the two from disagreeing', () => {
    // A trace nowhere near the plan: the marker still sits on the block's top edge.
    const chart = geometry([step(600, 60), step(600, 90)], {
      elapsedS: 300,
      samples: Array.from({ length: 300 }, (_, t) => ({ t, powerW: 400 })),
    });
    expect(chart.marker?.y).toBe(points(chart.blocks[0]?.d ?? '')[1]?.y);
  });
});

describe('the marker', () => {
  it('sits where the rider is, on the plan', () => {
    const chart = geometry([step(600, 60), step(600, 90)], { elapsedS: 300 });
    expect(chart.marker?.x).toBeCloseTo(WIDTH / 4, 6);
    expect(chart.marker?.y).toBe(points(chart.blocks[0]?.d ?? '')[1]?.y);
  });

  it('drops to the axis on a free step, which has no height to sit at', () => {
    const chart = geometry([step(600, 'free')], { elapsedS: 300 });
    expect(chart.marker?.y).toBe(chart.baselineY);
  });

  it('stops at the end rather than running off the chart', () => {
    expect(geometry([step(600, 60)], { elapsedS: 9000 }).marker?.x).toBe(WIDTH);
  });
});

describe('the axes', () => {
  it('rules the top of every zone that has one, which is five of the six', () => {
    const { zoneLines, height } = geometry([step(600, 60)]);
    expect(zoneLines.map((line) => line.zone)).toEqual([1, 2, 3, 4, 5]);
    // Ascending zones climb the chart.
    for (let i = 1; i < zoneLines.length; i += 1) {
      expect(zoneLines[i]?.y).toBeLessThan(zoneLines[i - 1]?.y ?? height);
    }
  });

  /**
   * Zone 6 is "over 120 % of FTP" and has no top in the model, so a rule across the chart
   * was drawing a boundary that does not exist — and once the ceiling follows the plan it
   * was a line that moved with the tallest step, which is worse again. The band's space
   * still runs to the top; the line and the figure under it are what go.
   */
  it('leaves zone 6 open: no rule across the top of the chart, and no figure for it', () => {
    for (const plan of [[step(600, 60)], [step(600, 200)], [step(600, 130)]]) {
      const { zoneLines } = geometry(plan);
      expect(zoneLines.some((line) => line.zone === 6)).toBe(false);
      expect(zoneLines.some((line) => line.label === 'Z6')).toBe(false);
      expect(zoneLines.some((line) => line.y === 0)).toBe(false);
    }
  });

  it('puts every zone figure inside its own band', () => {
    const { zoneLines, baselineY } = geometry([step(600, 60)]);
    zoneLines.forEach((line, index) => {
      const bottom = index === 0 ? baselineY : (zoneLines[index - 1]?.y ?? baselineY);
      expect(line.labelY).toBeLessThan(bottom);
      expect(line.labelY).toBeGreaterThan(line.y);
    });
  });

  it('picks a tick spacing that reads, for twelve seconds and for an hour alike', () => {
    expect(geometry([step(12, 60)]).ticks.length).toBeLessThanOrEqual(25);
    expect(geometry([step(3780, 60)]).ticks.length).toBeLessThanOrEqual(25);
    expect(geometry([step(10_800, 60)]).ticks.length).toBeLessThanOrEqual(25);
  });

  it('labels a long session in whole minutes, as the mockup does', () => {
    const labels = geometry([step(3780, 60)])
      .ticks.map((tick) => tick.label)
      .filter((label) => label !== null);
    expect(labels).toEqual(['15', '30', '45']);
  });

  it('keeps the last figure clear of the total, so the two never collide', () => {
    const { ticks, width } = geometry([step(3600, 60)]);
    const last = ticks.filter((tick) => tick.label !== null).at(-1);
    expect(last?.x).toBeLessThanOrEqual(width - 52);
  });
});

/**
 * The chart used to stop at 160 % of FTP whatever the plan asked for, so a 200 % sprint
 * and a 160 % one drew at exactly the same height — and the parser accepts targets to
 * 300 % of FTP or 2000 W, which difficulty then multiplies by up to half as much again.
 * Showing the plan is the chart's whole job, so the plan sets the top of it.
 */
describe('the ceiling covers the plan', () => {
  /** Where a block's top edge sits, 0 at the ceiling and 1 on the axis. */
  function topOf(chart: ReturnType<typeof geometry>, index = 0): number {
    return (points(chart.blocks[index]?.d ?? '')[1]?.y as number) / chart.baselineY;
  }

  it('is the power strip ceiling for a plan that fits under it', () => {
    expect(geometry([step(600, 90), step(600, 120)]).ceilingW).toBe(FTP * MAX_FRACTION_OF_FTP);
  });

  it('rises to clear a target the old ceiling could not draw', () => {
    const chart = geometry([step(600, 200)]);
    expect(chart.ceilingW).toBeGreaterThan(FTP * 2);
    expect(chart.ceilingW).toBeCloseTo(FTP * 2 * (1 + CEILING_HEADROOM), 6);
  });

  it('draws a 200 % step above a 160 % one, which at a fixed ceiling it could not', () => {
    // Both were clamped to the old 160 % ceiling and came out identical. The comparison is
    // within one plan: the ceiling follows the tallest step, so a plan of nothing but a
    // sprint fills the chart whatever the sprint is, and it is the steps beside it that
    // the height has to be read against.
    const chart = geometry([step(600, 160), step(600, 200)]);
    expect(topOf(chart, 1)).toBeLessThan(topOf(chart, 0));
    // And at their true ratio, not merely in the right order.
    expect((1 - topOf(chart, 0)) / (1 - topOf(chart, 1))).toBeCloseTo(160 / 200, 3);
  });

  it('never puts the tallest block flush with the top edge', () => {
    for (const percent of [160, 200, 300]) {
      const chart = geometry([step(600, percent)]);
      expect(topOf(chart)).toBeGreaterThan(0);
      // The air above it is the headroom, and is there at every peak.
      expect(topOf(chart)).toBeCloseTo(CEILING_HEADROOM / (1 + CEILING_HEADROOM), 3);
    }
  });

  it('leaves the blocks below in proportion rather than squashing them together', () => {
    const chart = geometry([step(600, 200), step(600, 100), step(600, 50)]);
    const [tall, middle, low] = [topOf(chart, 0), topOf(chart, 1), topOf(chart, 2)];
    // Heights, not depths: twice the target is twice the block, at any ceiling.
    expect((1 - middle) / (1 - tall)).toBeCloseTo(0.5, 3);
    expect((1 - low) / (1 - middle)).toBeCloseTo(0.5, 3);
  });

  it('counts a ramp by the end of it that goes highest', () => {
    expect(geometry([ramp(600, 60, 200)]).ceilingW).toBe(geometry([step(600, 200)]).ceilingW);
    expect(geometry([ramp(600, 200, 60)]).ceilingW).toBe(geometry([step(600, 200)]).ceilingW);
  });

  it('ignores a free step, which asks for nothing and so asks for no room', () => {
    expect(geometry([step(600, 'free')]).ceilingW).toBe(FTP * MAX_FRACTION_OF_FTP);
  });
});

/**
 * A scale that moves while it is being read is a scale you cannot read: every block under
 * the rider would be redrawn mid-interval. Only the plan sets it, and only the rider
 * deliberately asking for more work can lift it.
 */
describe('the ceiling holds still through a session', () => {
  const plan = [step(600, 200), step(600, 60)];

  it('does not follow live power, however far over the top it goes', () => {
    const quiet = geometry(plan);
    const spiking = geometry(plan, {
      samples: Array.from({ length: 60 }, (_, t) => ({ t, powerW: FTP * 3 })),
    });
    expect(spiking.ceilingW).toBe(quiet.ceilingW);
  });

  it('does not move as the session runs', () => {
    expect(geometry(plan, { elapsedS: 900 }).ceilingW).toBe(geometry(plan).ceilingW);
  });

  it('does not move under a skip, which shortens a step rather than dropping it', () => {
    expect(geometry([step(42, 200), step(600, 60)]).ceilingW).toBe(geometry(plan).ceilingW);
  });

  it('rises when the rider makes the session harder, which is a deliberate act', () => {
    expect(geometry(plan, { scalePct: 150 }).ceilingW).toBeGreaterThan(geometry(plan).ceilingW);
  });

  it('does not drop when they make it easier: the plan as written is still drawn', () => {
    // The faint unscaled line is as much the plan as the blocks are, and clipping it would
    // make the one comparison difficulty exists for a line along the top of the chart.
    const eased = geometry(plan, { scalePct: 50 });
    expect(eased.ceilingW).toBe(geometry(plan).ceilingW);
    expect(points(eased.historyPaths[0] as string)[0]?.y).toBeGreaterThan(0);
  });
});

/**
 * The author's words: "spikes in power can go off the edge". No autoscale, no mark on the
 * clipped span — with no rule across the top of zone 6 the edge claims no boundary, so a
 * trace that reaches it reads as going off rather than as holding a value.
 */
describe('actual power above the ceiling clips', () => {
  const traceY = (watts: number) =>
    points(
      geometry([step(600, 90)], {
        samples: Array.from({ length: 30 }, (_, t) => ({ t, powerW: watts })),
      }).actualPaths[0] as string,
    ).map((point) => point.y);

  it('draws a 300 % spike along the top edge rather than off the chart', () => {
    const ys = traceY(FTP * 3);
    expect(Math.min(...ys)).toBe(0);
    // Never above it: the geometry clamps, and PlanChart cuts the stroke at the same line.
    expect(ys.every((y) => y >= 0)).toBe(true);
  });

  it('clips at the ceiling and not at 160 % of FTP, which is no longer the ceiling', () => {
    const chart = geometry([step(600, 200)], {
      samples: Array.from({ length: 30 }, (_, t) => ({ t, powerW: FTP * 1.9 })),
    });
    // 190 % is over the old ceiling and under this plan's, so it draws at its own height.
    expect(points(chart.actualPaths[0] as string)[0]?.y).toBeGreaterThan(0);
  });

  it('holds the plan inside the chart, so only the trace ever reaches the edge', () => {
    for (const percent of [160, 200, 300]) {
      const chart = geometry([step(600, percent)]);
      expect(chart.ceilingW).toBeGreaterThan(FTP * (percent / 100));
    }
  });
});

describe('planCeilingW', () => {
  it('is a pure read of the plan: the same steps give the same ceiling', () => {
    const steps = [step(600, 200), step(600, 60)];
    expect(planCeilingW(steps, FTP, 100)).toBe(planCeilingW(steps, FTP, 100));
  });

  it('survives a nonsense FTP rather than dividing the chart by nought', () => {
    expect(planCeilingW([step(600, 90)], 0, 100)).toBe(MAX_FRACTION_OF_FTP);
    expect(planCeilingW([], FTP, 100)).toBe(FTP * MAX_FRACTION_OF_FTP);
  });
});

describe('an empty plan', () => {
  it('draws nothing and places no marker, rather than dividing by nought', () => {
    const chart = geometry([]);
    expect(chart.blocks).toEqual([]);
    expect(chart.planPaths).toEqual([]);
    expect(chart.marker).toBeNull();
  });
});

/**
 * The bug this pins: riding a workout that declares `ftp: 250` on a `power: 100%` step
 * while holding exactly the commanded watts drew the accent actual line clear of the
 * grey plan block. The chart was handed the profile's FTP, so it resolved 100 % to 200 W
 * and drew the block there while the rider held the 250 W the trainer had asked for.
 *
 * A session's FTP is the workout's own where it declares one, so the plan and the power
 * ridden against it have to be one number — see docs/writing-a-workout.md.
 */
describe('the plan is drawn at the FTP the session is ridden at', () => {
  /**
   * The y the plan block sits at, and the y a sample of the watts that step commands
   * lands at. The step is whichever percentage one comes first and the watts are derived
   * from it, so editing the workout's targets cannot quietly stop this testing anything.
   */
  function heights(source: string, ftpW?: number) {
    const parsed = parseWorkout(source);
    const steps = expandWorkout(parsed).steps;
    const at = steps.findIndex(
      (s) => s.power.kind === 'constant' && s.power.value.unit === 'ftpPercent',
    );
    const step = steps[at]?.power;
    if (step?.kind !== 'constant') throw new Error('no percentage step to test against');
    const sessionFtp = workoutFtp(parsed, DEFAULT_SETTINGS.ftp);
    const heldW = (step.value.value / 100) * sessionFtp;
    const chart = planChartGeometry({
      steps,
      samples: [
        { t: 0, powerW: heldW },
        { t: 1, powerW: heldW },
      ],
      // Exactly what services.ts hands the engine and publishes on the snapshot.
      ftpW: ftpW ?? sessionFtp,
      scalePct: 100,
      elapsedS: 0,
      width: WIDTH,
      height: HEIGHT,
    });
    return {
      plan: points(chart.blocks[at]?.d ?? '')[1]?.y,
      actual: points(chart.actualPaths[0] ?? '')[0]?.y,
    };
  }

  it("is the workout's own FTP, not the rider's: holding the commanded watts sits on the plan", () => {
    // The test only means anything while the two numbers differ.
    expect(parseWorkout(formatTest).ftp).toBe(250);
    expect(DEFAULT_SETTINGS.ftp).not.toBe(250);

    const { plan, actual } = heights(formatTest);
    expect(plan).toBeDefined();
    expect(actual).toBe(plan);

    // And the regression itself: handed the profile's FTP instead, the same held watts
    // draw clear of the block, which is exactly what the rider saw.
    const wrong = heights(formatTest, DEFAULT_SETTINGS.ftp);
    expect(wrong.actual).not.toBe(wrong.plan);
  });

  it('leaves a workout that declares none exactly as it was, on the profile FTP', () => {
    const source = 'name: Relative\nsteps:\n  - { duration: 1m, power: 100% }\n';
    const { plan, actual } = heights(source);
    expect(plan).toBeDefined();
    expect(actual).toBe(plan);
  });
});

describe('blockForStep', () => {
  const PLAN = [step(600, 60), step(600, 'free'), step(600, 90)];

  it('is the block drawing that step, so a hovered row outlines its own work', () => {
    const { blocks } = geometry(PLAN);
    expect(blockForStep(blocks, 0)?.d).toBe(blocks[0]?.d);
    expect(blockForStep(blocks, 2)?.d).toBe(blocks[2 - 1]?.d);
  });

  it('is nothing when nothing is hovered', () => {
    expect(blockForStep(geometry(PLAN).blocks, null)).toBeNull();
  });

  it('is nothing for a free step, which has no block to outline', () => {
    // Not a test for freeness: step 1 produces no segment, so no block carries its index.
    const { blocks } = geometry(PLAN);
    expect(blocks.map((block) => block.stepIndex)).toEqual([0, 2]);
    expect(blockForStep(blocks, 1)).toBeNull();
  });

  it('is nothing past the end, so a plan shortened by a skip outlines nothing stale', () => {
    expect(blockForStep(geometry(PLAN).blocks, 9)).toBeNull();
  });

  it('finds the block by its step, not by its place in the list', () => {
    // The free step leaves a hole in the indices, so position and identity diverge: step 2
    // is the second block, and reading blocks[2] would outline nothing at all.
    const { blocks } = geometry(PLAN);
    expect(blocks[2]).toBeUndefined();
    expect(blockForStep(blocks, 2)?.stepIndex).toBe(2);
  });
});
