import { describe, expect, it } from 'vitest';
import { ladderFraction, targetBand, zoneBoundaries, zoneForHeartRate } from './hr';

const HR_MAX = 190;

describe('zoneBoundaries', () => {
  it('gives 114/133/152/171 at the default hrMax of 190', () => {
    expect(zoneBoundaries(HR_MAX)).toEqual([114, 133, 152, 171]);
  });

  it('scales with hrMax', () => {
    expect(zoneBoundaries(180)).toEqual([108, 126, 144, 162]);
  });

  it('rejects an hrMax that cannot produce zones', () => {
    expect(() => zoneBoundaries(0)).toThrow(RangeError);
    expect(() => zoneBoundaries(-190)).toThrow(RangeError);
    expect(() => zoneBoundaries(Number.NaN)).toThrow(RangeError);
  });
});

describe('zoneForHeartRate', () => {
  it('places a value in the middle of each zone', () => {
    expect(zoneForHeartRate(105, HR_MAX)).toBe(1);
    expect(zoneForHeartRate(124, HR_MAX)).toBe(2);
    expect(zoneForHeartRate(143, HR_MAX)).toBe(3);
    expect(zoneForHeartRate(162, HR_MAX)).toBe(4);
    expect(zoneForHeartRate(180, HR_MAX)).toBe(5);
  });

  it('puts a value exactly on a boundary into the zone above', () => {
    expect(zoneForHeartRate(114, HR_MAX)).toBe(2);
    expect(zoneForHeartRate(133, HR_MAX)).toBe(3);
    expect(zoneForHeartRate(152, HR_MAX)).toBe(4);
    expect(zoneForHeartRate(171, HR_MAX)).toBe(5);
  });

  it('puts a value just under a boundary into the zone below', () => {
    expect(zoneForHeartRate(113, HR_MAX)).toBe(1);
    expect(zoneForHeartRate(170, HR_MAX)).toBe(4);
  });

  it('keeps the open-ended ends open', () => {
    expect(zoneForHeartRate(45, HR_MAX)).toBe(1);
    expect(zoneForHeartRate(205, HR_MAX)).toBe(5);
  });

  it('rejects a bpm that is not a number', () => {
    expect(() => zoneForHeartRate(Number.NaN, HR_MAX)).toThrow(RangeError);
  });
});

describe('ladderFraction', () => {
  it('puts each zone boundary on a fifth of the ladder', () => {
    expect(ladderFraction(114, HR_MAX)).toBeCloseTo(0.2, 10);
    expect(ladderFraction(133, HR_MAX)).toBeCloseTo(0.4, 10);
    expect(ladderFraction(152, HR_MAX)).toBeCloseTo(0.6, 10);
    expect(ladderFraction(171, HR_MAX)).toBeCloseTo(0.8, 10);
  });

  it('puts the middle of a zone in the middle of its segment', () => {
    expect(ladderFraction(123.5, HR_MAX)).toBeCloseTo(0.3, 10);
    expect(ladderFraction(161.5, HR_MAX)).toBeCloseTo(0.7, 10);
  });

  it('pins the open-ended low end at the left edge', () => {
    // 50 % of hrMax, the bottom of the working range.
    expect(ladderFraction(95, HR_MAX)).toBe(0);
    expect(ladderFraction(55, HR_MAX)).toBe(0);
  });

  it('pins the open-ended high end at the right edge', () => {
    expect(ladderFraction(HR_MAX, HR_MAX)).toBe(1);
    expect(ladderFraction(210, HR_MAX)).toBe(1);
  });

  it('leaves a plausible ride clear of both edges', () => {
    // A warm-up and a hard effort both sit inside the ladder, not against it.
    expect(ladderFraction(105, HR_MAX)).toBeGreaterThan(0);
    expect(ladderFraction(185, HR_MAX)).toBeLessThan(1);
  });

  it('never goes backwards as heart rate rises', () => {
    let previous = -1;
    for (let bpm = 40; bpm <= 210; bpm += 1) {
      const fraction = ladderFraction(bpm, HR_MAX);
      expect(fraction).toBeGreaterThanOrEqual(previous);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
      previous = fraction;
    }
  });

  it('rejects a bpm that is not a number', () => {
    expect(() => ladderFraction(Number.NaN, HR_MAX)).toThrow(RangeError);
  });
});

describe('targetBand', () => {
  it('brackets a target that sits well inside one zone', () => {
    const band = targetBand(143, HR_MAX, 5); // 135.85–150.15 bpm, both in zone 3
    expect(band.from).toBeGreaterThan(0.4);
    expect(band.to).toBeLessThan(0.6);
    expect(band.from).toBeLessThan(band.to);
  });

  it('still returns a sensible pair when the band straddles a zone boundary', () => {
    const band = targetBand(152, HR_MAX, 5); // 144.4–159.6, across the 152 bpm boundary
    expect(band.from).toBeLessThan(0.6);
    expect(band.to).toBeGreaterThan(0.6);
    expect(band.from).toBeGreaterThanOrEqual(0);
    expect(band.to).toBeLessThanOrEqual(1);
  });

  it('collapses to a line at zero margin', () => {
    const band = targetBand(143, HR_MAX, 0);
    expect(band.from).toBe(band.to);
    expect(band.from).toBe(ladderFraction(143, HR_MAX));
  });

  it('clamps a band that runs off either edge', () => {
    expect(targetBand(90, HR_MAX, 20).from).toBe(0);
    expect(targetBand(185, HR_MAX, 20).to).toBe(1);
  });

  it('always returns from <= to, inside 0..1', () => {
    for (const target of [60, 100, 133, 160, 190, 220]) {
      const band = targetBand(target, HR_MAX, 10);
      expect(band.from).toBeGreaterThanOrEqual(0);
      expect(band.to).toBeLessThanOrEqual(1);
      expect(band.from).toBeLessThanOrEqual(band.to);
    }
  });

  it('rejects a negative margin, which would invert the band', () => {
    expect(() => targetBand(143, HR_MAX, -5)).toThrow(RangeError);
  });
});
