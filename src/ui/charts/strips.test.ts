import { describe, expect, it } from 'vitest';
import {
  DESKTOP_STRIP,
  HEART_RATE_CEILING_BPM,
  HEART_RATE_FLOOR_BPM,
  PHONE_LANDSCAPE_STRIP,
  PHONE_STRIP,
  POWER_CEILING_FRACTION_OF_FTP,
  TRACE_WINDOW_S,
  smoothPower,
  stripAxis,
  stripHeight,
  stripsHeight,
  trendSamplesByDistance,
  trendSamplesByTime,
  trendStripGeometry,
  type StripMetrics,
  type TrendKind,
  type TrendRideSample,
  type TrendSample,
} from './strips';

const WIDTH = 944;
const FTP = 200;
const END = 10_000;

function strip(
  values: readonly (number | null)[],
  kind: TrendKind = 'power',
  metrics: StripMetrics = DESKTOP_STRIP,
) {
  const samples: TrendSample[] = values.map((value, i) => ({
    at: (i * END) / Math.max(values.length - 1, 1),
    value,
  }));
  return trendStripGeometry({
    samples,
    kind,
    ftpW: FTP,
    startAt: 0,
    endAt: END,
    width: WIDTH,
    metrics,
  });
}

/** The y coordinates of a path, in order. */
function ys(d: string): number[] {
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((match) => Number(match[2]));
}

describe('strip metrics', () => {
  it('draws the heights design/DESIGN.md gives each breakpoint', () => {
    expect(stripHeight(DESKTOP_STRIP)).toBe(50);
    expect(stripHeight(PHONE_STRIP)).toBe(36);
    expect(stripHeight(PHONE_LANDSCAPE_STRIP)).toBe(34);
    expect([DESKTOP_STRIP.bandPx, DESKTOP_STRIP.tracePx]).toEqual([22, 28]);
    expect([PHONE_STRIP.bandPx, PHONE_STRIP.tracePx]).toEqual([16, 20]);
    expect([PHONE_LANDSCAPE_STRIP.bandPx, PHONE_LANDSCAPE_STRIP.tracePx]).toEqual([16, 18]);
  });

  it('drops the caption to 9 px turned sideways and nowhere else', () => {
    expect(DESKTOP_STRIP.captionPx).toBe(10);
    expect(PHONE_STRIP.captionPx).toBe(10);
    expect(PHONE_LANDSCAPE_STRIP.captionPx).toBe(9);
  });

  it('costs twice a strip for the pair', () => {
    expect(stripsHeight(DESKTOP_STRIP)).toBe(100);
    expect(stripsHeight(PHONE_STRIP)).toBe(72);
    expect(stripsHeight(PHONE_LANDSCAPE_STRIP)).toBe(68);
  });
});

describe('the power scale', () => {
  it('runs nought to 110 % of FTP over the trace, fixed', () => {
    const geometry = strip([0, 100]);
    expect(POWER_CEILING_FRACTION_OF_FTP).toBe(1.1);
    expect(geometry.ceiling).toBeCloseTo(220, 9);
    expect(geometry.floor).toBe(0);
    expect(geometry.yFor(0)).toBeCloseTo(geometry.baselineY, 9);
    expect(geometry.yFor(220)).toBeCloseTo(geometry.traceTopY, 9);
    expect(geometry.yFor(110)).toBeCloseTo(geometry.baselineY - DESKTOP_STRIP.tracePx / 2, 9);
  });

  it('is never fitted to the data, so a flat ride draws flat', () => {
    const easy = strip([120, 120, 120]);
    const hard = strip([120, 120, 120, 300]);
    expect(easy.ceiling).toBe(hard.ceiling);
    // Three samples at 120 W sit just over half way up the trace whatever follows them.
    expect(ys(easy.linePaths[0] as string).slice(0, 3)).toEqual(
      ys(hard.linePaths[0] as string).slice(0, 3),
    );
  });

  it('needles up through the caption band above the ceiling rather than flattening at it', () => {
    const geometry = strip([0, 100]);
    const over = geometry.yFor(260);
    expect(over).toBeLessThan(geometry.traceTopY);
    expect(over).toBeGreaterThan(0);
    // The same watt is the same height either side of the ceiling: one linear scale.
    const perWatt = DESKTOP_STRIP.tracePx / 220;
    expect(geometry.traceTopY - over).toBeCloseTo(40 * perWatt, 9);
  });

  it('clips a sprint at the top rule rather than rescaling the strip', () => {
    const geometry = strip([0, 100]);
    // 22 px of band on 28 px of trace: the rule is reached a little under twice the ceiling.
    const pinsAt = 220 * (1 + DESKTOP_STRIP.bandPx / DESKTOP_STRIP.tracePx);
    expect(pinsAt).toBeCloseTo(392.86, 1);
    expect(geometry.yFor(pinsAt)).toBeCloseTo(0, 6);
    expect(geometry.yFor(1000)).toBe(0);
    expect(geometry.yFor(2000)).toBe(0);
    expect(geometry.ceiling).toBeCloseTo(220, 9);
  });

  it('puts a trainer reporting nought watts on the baseline, not off the bottom', () => {
    const geometry = strip([0, 0]);
    expect(ys(geometry.linePaths[0] as string)).toEqual([geometry.baselineY, geometry.baselineY]);
  });

  it('survives an FTP of nought rather than dividing by it', () => {
    const geometry = trendStripGeometry({
      samples: [
        { at: 0, value: 100 },
        { at: END, value: 100 },
      ],
      kind: 'power',
      ftpW: 0,
      startAt: 0,
      endAt: END,
      width: WIDTH,
      metrics: DESKTOP_STRIP,
    });
    expect(Number.isFinite(geometry.ceiling)).toBe(true);
    expect(ys(geometry.linePaths[0] as string).every(Number.isFinite)).toBe(true);
  });
});

describe('the heart-rate scale', () => {
  it('runs 80 to 200 bpm, fixed and absolute', () => {
    const geometry = strip([120, 120], 'heartRate');
    expect([geometry.floor, geometry.ceiling]).toEqual([
      HEART_RATE_FLOOR_BPM,
      HEART_RATE_CEILING_BPM,
    ]);
    expect(geometry.yFor(80)).toBeCloseTo(geometry.baselineY, 9);
    expect(geometry.yFor(200)).toBeCloseTo(geometry.traceTopY, 9);
    expect(geometry.yFor(140)).toBeCloseTo(geometry.baselineY - DESKTOP_STRIP.tracePx / 2, 9);
  });

  it('takes no notice of FTP', () => {
    const low = trendStripGeometry({
      samples: [{ at: 0, value: 150 }],
      kind: 'heartRate',
      ftpW: 150,
      startAt: 0,
      endAt: END,
      width: WIDTH,
      metrics: DESKTOP_STRIP,
    });
    expect(low.ceiling).toBe(HEART_RATE_CEILING_BPM);
  });

  it('rests a resting heart rate on the baseline and needles a 210 up the band', () => {
    const geometry = strip([60, 60], 'heartRate');
    expect(geometry.yFor(50)).toBe(geometry.baselineY);
    expect(geometry.yFor(210)).toBeLessThan(geometry.traceTopY);
  });
});

describe('a sample the sensor did not report', () => {
  it('breaks the trace rather than being drawn at nought', () => {
    const geometry = strip([200, 200, null, 200, 200]);
    expect(geometry.linePaths).toHaveLength(2);
    expect(geometry.areaPaths).toHaveLength(2);
    expect(geometry.connected).toBe(true);
  });

  it('closes each run down to the baseline on its own', () => {
    const geometry = strip([200, 200, null, 200, 200]);
    for (const d of geometry.areaPaths) {
      expect(d.endsWith('Z')).toBe(true);
      expect(ys(d).at(-1)).toBe(geometry.baselineY);
    }
  });

  it('leaves a sensor that reported nothing at all with a strip and no trace', () => {
    const geometry = strip([null, null, null], 'heartRate');
    expect(geometry.connected).toBe(false);
    expect(geometry.linePaths).toEqual([]);
    // The strip is still a strip: same height, same band, same rules.
    expect(geometry.height).toBe(stripHeight(DESKTOP_STRIP));
    expect(geometry.traceTopY).toBe(DESKTOP_STRIP.bandPx);
    expect(geometry.baselineY).toBe(stripHeight(DESKTOP_STRIP));
  });

  it('says the same of one reading, which draws no line and is no trend either', () => {
    const geometry = strip([200], 'power');
    expect(geometry.linePaths).toEqual([]);
    expect(geometry.connected).toBe(false);
  });

  it('says the same of a session with no samples yet', () => {
    const geometry = trendStripGeometry({
      samples: [],
      kind: 'heartRate',
      ftpW: FTP,
      startAt: 0,
      endAt: END,
      width: WIDTH,
      metrics: PHONE_STRIP,
    });
    expect(geometry.connected).toBe(false);
    expect(geometry.height).toBe(36);
  });
});

describe('the window', () => {
  it('maps the window across the full width', () => {
    const geometry = strip([100, 100]);
    expect(geometry.xFor(0)).toBe(0);
    expect(geometry.xFor(END)).toBeCloseTo(WIDTH, 9);
    expect(geometry.xFor(END / 2)).toBeCloseTo(WIDTH / 2, 9);
  });

  it('breaks the trace at a sample outside it rather than pinning it to the edge', () => {
    const geometry = trendStripGeometry({
      samples: [
        { at: -100, value: 200 },
        { at: 0, value: 200 },
        { at: END, value: 200 },
        { at: END + 100, value: 200 },
      ],
      kind: 'power',
      ftpW: FTP,
      startAt: 0,
      endAt: END,
      width: WIDTH,
      metrics: DESKTOP_STRIP,
    });
    expect(geometry.linePaths).toHaveLength(1);
    expect(ys(geometry.linePaths[0] as string)).toHaveLength(2);
  });
});

describe('the axis under the block', () => {
  it('ticks the distance every 5 km on a whole route, alternating long and short', () => {
    const axis = stripAxis({ kind: 'distance', startAt: 0, endAt: 30_000, width: WIDTH });
    expect(axis.ticks.map((tick) => tick.long).slice(0, 4)).toEqual([true, false, true, false]);
    expect(axis.ticks[1]?.x).toBeCloseTo((5000 / 30_000) * WIDTH, 6);
    // The profile above still prints the route's total, so the ticks carry no figures.
    expect(axis.ticks.every((tick) => tick.label === null)).toBe(true);
    expect(axis.totalLabel).toBeNull();
  });

  it('ticks a workout in minutes, every third labelled, with the total at the right', () => {
    const axis = stripAxis({ kind: 'time', startAt: 0, endAt: 3780, width: 912 });
    expect(axis.ticks).toHaveLength(13);
    expect(axis.ticks.filter((tick) => tick.label !== null).map((tick) => tick.label)).toEqual([
      '15',
      '30',
      '45',
    ]);
    expect(axis.totalLabel).toBe('63 min');
  });

  it('reads a short session as a clock rather than as nought minutes', () => {
    expect(stripAxis({ kind: 'time', startAt: 0, endAt: 12, width: 912 }).totalLabel).toBe('0:12');
  });

  it('keeps the last figure clear of the total', () => {
    const axis = stripAxis({ kind: 'time', startAt: 0, endAt: 3600, width: 912 });
    const last = axis.ticks.filter((tick) => tick.label !== null).at(-1);
    expect(last?.x).toBeLessThanOrEqual(912 - 52);
  });

  it('draws nothing where the block has no axis of its own', () => {
    const axis = stripAxis({ kind: 'none', startAt: 0, endAt: END, width: WIDTH });
    expect(axis.ticks).toEqual([]);
    expect(axis.totalLabel).toBeNull();
  });
});

describe('smoothPower', () => {
  /** One reading a second, as the recorder writes them. */
  const series = (watts: readonly (number | null)[]): TrendRideSample[] =>
    watts.map((powerW, t) => ({ t, distanceM: t * 10, powerW, heartRateBpm: 140 }));

  it('averages over five seconds, which is longer than the hero reads power over', () => {
    expect(TRACE_WINDOW_S).toBe(5);
  });

  it('is the trailing mean of the window ending at each reading', () => {
    // 100, then 200 from t=1 on. At t=5 the window holds t=1..5, all 200.
    const smoothed = smoothPower(series([100, 200, 200, 200, 200, 200]));
    expect(smoothed[0]).toBeCloseTo(100, 6);
    expect(smoothed[1]).toBeCloseTo(150, 6);
    expect(smoothed[4]).toBeCloseTo(180, 6);
    expect(smoothed[5]).toBeCloseTo(200, 6);
  });

  it('gives the first reading of a session its own value, rather than withholding one', () => {
    expect(smoothPower(series([240]))).toEqual([240]);
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
    expect(step(smoothPower(series(noisy)))).toBeLessThan(30);
  });

  it('keeps a dropout absent, so the trace breaks exactly where it broke before', () => {
    const smoothed = smoothPower(series([200, 200, null, 200, 200]));
    expect(smoothed[2]).toBeNull();
    expect(smoothed.filter((value) => value === null)).toHaveLength(1);
  });

  it('averages over a dropout shorter than the window rather than across a hole', () => {
    // t=2 is absent, so t=3 means t=0,1,3 — the readings there are, not an interpolation.
    expect(smoothPower(series([300, 300, null, 0]))[3]).toBeCloseTo(200, 6);
  });

  it('starts clean after a gap longer than the window, with nothing carried across it', () => {
    const smoothed = smoothPower([
      { t: 0, distanceM: 0, powerW: 300, heartRateBpm: null },
      { t: 1, distanceM: 10, powerW: 300, heartRateBpm: null },
      { t: 60, distanceM: 600, powerW: 100, heartRateBpm: null },
    ]);
    expect(smoothed[2]).toBeCloseTo(100, 6);
  });

  it("leaves the caller's samples untouched: the recording is what gets stored", () => {
    const recorded = series([100, 200, 300, 400, 500, 600]);
    const before = JSON.stringify(recorded);
    const smoothed = smoothPower(recorded);
    expect(JSON.stringify(recorded)).toBe(before);
    expect(smoothed[5]).not.toBe(recorded[5]?.powerW);
  });

  it('smooths nothing at a window of nought, which is the raw trace', () => {
    expect(smoothPower(series([100, 200, 300]), 0)).toEqual([100, 200, 300]);
  });

  it('leaves heart rate alone: it already moves at the pace of the body', () => {
    const { heartRate } = trendSamplesByTime([
      { t: 0, distanceM: 0, powerW: 100, heartRateBpm: 120 },
      { t: 1, distanceM: 10, powerW: 300, heartRateBpm: 180 },
    ]);
    expect(heartRate.map((sample) => sample.value)).toEqual([120, 180]);
  });
});

describe('placing a recorded series on an axis', () => {
  const recorded: TrendRideSample[] = [
    { t: 0, distanceM: 0, powerW: 200, heartRateBpm: 120 },
    { t: 1, distanceM: 10, powerW: 200, heartRateBpm: null },
    { t: 2, distanceM: 20, powerW: null, heartRateBpm: 130 },
  ];

  it('indexes by distance for a ride, and by the clock for a workout', () => {
    expect(trendSamplesByDistance(recorded).power.map((sample) => sample.at)).toEqual([0, 10, 20]);
    expect(trendSamplesByTime(recorded).power.map((sample) => sample.at)).toEqual([0, 1, 2]);
  });

  it('keeps a missing reading as a gap in its own series and not in the other', () => {
    const { power, heartRate } = trendSamplesByDistance(recorded);
    expect(power.map((sample) => sample.value === null)).toEqual([false, false, true]);
    expect(heartRate.map((sample) => sample.value === null)).toEqual([false, true, false]);
  });

  it('drops the previous lap rather than folding it back over this one', () => {
    const { power } = trendSamplesByDistance(recorded, 10);
    expect(power.map((sample) => sample.at)).toEqual([0, 10]);
  });
});
