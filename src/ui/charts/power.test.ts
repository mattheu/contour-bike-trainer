import { describe, expect, it } from 'vitest';
import {
  BASELINE_FRACTION,
  MAX_FRACTION_OF_FTP,
  ZONE_OPACITY,
  powerStripGeometry,
  type PowerSample,
} from './power';

const WIDTH = 944;
const HEIGHT = 74;
const FTP = 265;

function strip(samples: readonly PowerSample[], endM = 10000) {
  return powerStripGeometry({
    samples,
    ftpW: FTP,
    width: WIDTH,
    height: HEIGHT,
    startM: 0,
    endM,
  });
}

function ramp(watts: readonly number[], spacingM = 100): PowerSample[] {
  return watts.map((w, i) => ({ distM: i * spacingM, watts: w }));
}

describe('powerStripGeometry', () => {
  it('puts the axis at 56 and the FTP rule where the mockup draws it', () => {
    const geometry = strip(ramp([200, 200]));
    expect(geometry.baselineY).toBeCloseTo(56, 9);
    expect(geometry.baselineY).toBeCloseTo(HEIGHT * BASELINE_FRACTION, 9);
    // FTP sits 1/1.6 of the way up from the axis.
    expect(geometry.ftpY).toBeCloseTo(56 - 56 / MAX_FRACTION_OF_FTP, 9);
    expect(geometry.ftpY).toBeCloseTo(21, 6);
  });

  it('maps nought to the axis and clamps a sprint to the top of the strip', () => {
    const geometry = strip(ramp([100, 100]));
    expect(geometry.yFor(0)).toBeCloseTo(geometry.baselineY, 9);
    expect(geometry.yFor(FTP * MAX_FRACTION_OF_FTP)).toBeCloseTo(0, 9);
    expect(geometry.yFor(FTP * 4)).toBe(0);
    expect(geometry.yFor(-50)).toBeCloseTo(geometry.baselineY, 9);
  });

  it('shares the profile x-axis, clamping outside the window', () => {
    const geometry = strip(ramp([100, 100]), 20000);
    expect(geometry.xFor(0)).toBe(0);
    expect(geometry.xFor(10000)).toBeCloseTo(WIDTH / 2, 9);
    expect(geometry.xFor(99999)).toBeCloseTo(WIDTH, 9);
  });

  it('merges contiguous samples of the same zone into one fill', () => {
    // 100 W and 130 W are zone 1; 300 W is zone 5 at FTP 265.
    const geometry = strip(ramp([100, 130, 120, 300, 310, 305]));
    expect(geometry.fills).toHaveLength(2);
    expect(geometry.fills.map((fill) => fill.zone)).toEqual([1, 5]);
    expect(geometry.fills[0]?.opacity).toBe(ZONE_OPACITY[1]);
    expect(geometry.fills[1]?.opacity).toBe(ZONE_OPACITY[5]);
  });

  it('maps five zones onto the three washes the mockups show', () => {
    expect(ZONE_OPACITY[1]).toBe(ZONE_OPACITY[2]);
    expect(ZONE_OPACITY[3]).toBe(ZONE_OPACITY[4]);
    expect(ZONE_OPACITY[5]).toBeGreaterThan(ZONE_OPACITY[3]);
    expect(ZONE_OPACITY[3]).toBeGreaterThan(ZONE_OPACITY[1]);
  });

  it('fills from the line down to the axis with straight segments', () => {
    const geometry = strip(ramp([100, 130]));
    const fill = geometry.fills[0];
    expect(fill?.d).toContain(`L0,${geometry.baselineY}`);
    expect(fill?.d.endsWith('Z')).toBe(true);
    expect(fill?.d).not.toContain(' C');
  });

  it('abuts the washes at a zone change rather than leaving a hole', () => {
    const geometry = strip(ramp([100, 130, 300, 310], 100));
    const [low, high] = geometry.fills;
    // The wash closes "L x,baseline L x0,baseline Z", so the last vertex of its
    // upper edge is four tokens from the end.
    const tokens = low?.d.split(' ') ?? [];
    const lastUpperX = tokens[tokens.length - 4]?.replace(/^[ML]/, '').split(',')[0];
    expect(lastUpperX).toBeDefined();
    expect(high?.d.startsWith(`M${lastUpperX},`)).toBe(true);
  });

  it('still encloses a single-sample zone excursion', () => {
    const geometry = strip(ramp([100, 100, 300, 100, 100]));
    expect(geometry.fills.map((fill) => fill.zone)).toEqual([1, 5, 1]);
  });

  it('averages only the samples inside the window', () => {
    const samples = ramp([100, 200, 300, 400]);
    expect(strip(samples).averageW).toBeCloseTo(250, 9);
    // Window ends at 100 m: only the first two samples are in it.
    expect(strip(samples, 100).averageW).toBeCloseTo(150, 9);
  });

  it('has no average and no fills before the ride starts', () => {
    const geometry = strip([]);
    expect(geometry.averageW).toBeNull();
    expect(geometry.fills).toHaveLength(0);
    expect(geometry.linePath).toBe('');
  });

  it('draws the accent line through every sample', () => {
    const geometry = strip(ramp([100, 200, 300]));
    expect(geometry.linePath.split(' ')).toHaveLength(3);
    expect(geometry.linePath.startsWith('M0,')).toBe(true);
  });
});
