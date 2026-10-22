import { describe, expect, it } from 'vitest';
import staircaseGpx from '../../test/fixtures/staircase-24km.gpx?raw';
import { DESPIKE_THRESHOLD_M, DESPIKE_WINDOW, despikeElevations } from './elevation';
import { parseGpx } from './gpx';

describe('despikeElevations', () => {
  /**
   * The rule the window and threshold are tuned under: a correction must leave known-good
   * data unchanged. This fixture climbs 10 m a point by construction, so its ascent is 360 m
   * and not a matter of opinion — which no real route's is. Retune against this.
   */
  it('returns a series with a known answer exactly as it was given', () => {
    const climbed = parseGpx(staircaseGpx).totalAscentM;
    expect(climbed).toBeCloseTo(360, 6);
  });

  it('leaves a clean series exactly as it was', () => {
    // The rule the thresholds were tuned under: a correction must not touch good data.
    const climb = Array.from({ length: 60 }, (_, i) => 100 + i * 1.5);
    expect(despikeElevations(climb)).toEqual(climb);
  });

  it('replaces a single point its neighbours contradict', () => {
    const series = Array.from({ length: 40 }, () => 200);
    series[20] = 260;
    const out = despikeElevations(series);
    expect(out[20]).toBe(200);
    expect(out.filter((v) => v !== 200)).toHaveLength(0);
  });

  it('leaves a steep but real section alone', () => {
    // A genuine 12 % ramp at 13 m spacing climbs about 1.6 m a point. A mean would blunt
    // this; a median must not touch it at all.
    const ramp = Array.from({ length: 40 }, (_, i) => 500 + i * 1.6);
    expect(despikeElevations(ramp)).toEqual(ramp);
  });

  it('ignores a deviation inside the threshold', () => {
    const series = Array.from({ length: 40 }, () => 300);
    series[10] = 300 + DESPIKE_THRESHOLD_M - 0.01;
    expect(despikeElevations(series)[10]).toBeCloseTo(300 + DESPIKE_THRESHOLD_M - 0.01, 6);
  });

  it('corrects a run of bad points shorter than half the window', () => {
    const series = Array.from({ length: 60 }, () => 150);
    series[30] = 190;
    series[31] = 190;
    series[32] = 190;
    const out = despikeElevations(series);
    expect(out.slice(30, 33)).toEqual([150, 150, 150]);
  });

  it('cannot outvote a bad run longer than half the window, and says so by leaving it', () => {
    // Honest limit: once the errors are the majority of their own window the median is
    // theirs. A wider window would fix this and start eating real terrain instead.
    const series = Array.from({ length: 60 }, () => 150);
    for (let i = 20; i < 20 + DESPIKE_WINDOW; i += 1) series[i] = 190;
    expect(despikeElevations(series)[27]).toBe(190);
  });

  it('corrects against the original values, not its own output', () => {
    // One pass: a corrected point must not drag its neighbour's correction after it.
    const series = Array.from({ length: 40 }, () => 100);
    series[18] = 160;
    series[22] = 160;
    const out = despikeElevations(series);
    expect(out[18]).toBe(100);
    expect(out[22]).toBe(100);
  });

  it('passes a series too short to have a majority view through untouched', () => {
    const short = [10, 90, 12];
    expect(despikeElevations(short, 15)).toEqual(short);
  });

  it('rejects a window that cannot have a middle', () => {
    expect(() => despikeElevations([1, 2, 3], 4)).toThrow(RangeError);
    expect(() => despikeElevations([1, 2, 3], 1)).toThrow(RangeError);
  });

  it('handles an empty series', () => {
    expect(despikeElevations([])).toEqual([]);
  });
});
