import { describe, expect, it } from 'vitest';
import { ZONE_COUNT, ladderFraction, targetBand, zoneBoundaries, zoneForPower } from './power';

const FTP = 200;

// At FTP 200 the six Coggan zones fall at 110 / 150 / 180 / 210 / 240 W, and the ladder's
// open ends are pinned at 80 W (40 %) and 300 W (150 %).

describe('zoneBoundaries', () => {
  it('sits at the Coggan fractions of FTP, not an even split', () => {
    expect(zoneBoundaries(FTP)).toEqual([110, 150, 180, 210, 240]);
    expect(ZONE_COUNT).toBe(6);
  });

  it('scales with FTP', () => {
    expect(zoneBoundaries(265)).toEqual([145.75, 198.75, 238.5, 278.25, 318]);
  });

  it('rejects an FTP that cannot produce zones', () => {
    expect(() => zoneBoundaries(0)).toThrow(RangeError);
    expect(() => zoneBoundaries(-10)).toThrow(RangeError);
    expect(() => zoneBoundaries(Number.NaN)).toThrow(RangeError);
  });
});

describe('zoneForPower', () => {
  it('places a value in the middle of each zone', () => {
    expect(zoneForPower(95, FTP)).toBe(1);
    expect(zoneForPower(130, FTP)).toBe(2);
    expect(zoneForPower(165, FTP)).toBe(3);
    expect(zoneForPower(195, FTP)).toBe(4);
    expect(zoneForPower(225, FTP)).toBe(5);
    expect(zoneForPower(270, FTP)).toBe(6);
  });

  it('puts a value exactly on a boundary into the zone above', () => {
    expect(zoneForPower(110, FTP)).toBe(2);
    expect(zoneForPower(150, FTP)).toBe(3);
    expect(zoneForPower(180, FTP)).toBe(4);
    expect(zoneForPower(210, FTP)).toBe(5);
    expect(zoneForPower(240, FTP)).toBe(6);
  });

  it('puts a value just under a boundary into the zone below', () => {
    expect(zoneForPower(109.99, FTP)).toBe(1);
    expect(zoneForPower(239.99, FTP)).toBe(5);
  });

  it('keeps the open-ended ends open', () => {
    expect(zoneForPower(0, FTP)).toBe(1);
    expect(zoneForPower(1, FTP)).toBe(1);
    expect(zoneForPower(1200, FTP)).toBe(6);
  });

  it('rejects a power that is not a number', () => {
    expect(() => zoneForPower(Number.NaN, FTP)).toThrow(RangeError);
  });
});

describe('ladderFraction', () => {
  it('puts each zone boundary on a sixth of the ladder', () => {
    expect(ladderFraction(110, FTP)).toBeCloseTo(1 / 6, 10);
    expect(ladderFraction(150, FTP)).toBeCloseTo(2 / 6, 10);
    expect(ladderFraction(180, FTP)).toBeCloseTo(3 / 6, 10);
    expect(ladderFraction(210, FTP)).toBeCloseTo(4 / 6, 10);
    expect(ladderFraction(240, FTP)).toBeCloseTo(5 / 6, 10);
  });

  it('puts the middle of a zone in the middle of its segment', () => {
    // Zone 3 runs 150-180, so 165 is halfway along the third segment.
    expect(ladderFraction(165, FTP)).toBeCloseTo(2.5 / 6, 10);
    // Zone 5 runs 210-240.
    expect(ladderFraction(225, FTP)).toBeCloseTo(4.5 / 6, 10);
  });

  it('pins the open-ended low end at the left edge', () => {
    // 40 % FTP, the bottom of zone 1's segment.
    expect(ladderFraction(80, FTP)).toBe(0);
    expect(ladderFraction(0, FTP)).toBe(0);
    expect(ladderFraction(-50, FTP)).toBe(0);
  });

  it('pins the open-ended high end at the right edge', () => {
    // 150 % FTP, the top of zone 6's segment.
    expect(ladderFraction(300, FTP)).toBe(1);
    expect(ladderFraction(600, FTP)).toBe(1);
  });

  it('leaves a plausible ride clear of both edges', () => {
    // A recovery spin and a hard interval both sit inside the ladder, not against it.
    expect(ladderFraction(100, FTP)).toBeGreaterThan(0);
    expect(ladderFraction(270, FTP)).toBeLessThan(1);
  });

  it('never goes backwards as power rises', () => {
    let previous = -1;
    for (let watts = 0; watts <= 400; watts += 5) {
      const fraction = ladderFraction(watts, FTP);
      expect(fraction).toBeGreaterThanOrEqual(previous);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
      previous = fraction;
    }
  });

  it('rejects a power that is not a number', () => {
    expect(() => ladderFraction(Number.NaN, FTP)).toThrow(RangeError);
  });
});

describe('targetBand', () => {
  it('brackets a target that sits well inside one zone', () => {
    const band = targetBand(165, FTP, 5); // 156.75-173.25 W, both inside zone 3
    expect(band.from).toBeCloseTo(ladderFraction(156.75, FTP), 10);
    expect(band.to).toBeCloseTo(ladderFraction(173.25, FTP), 10);
    expect(band.from).toBeLessThan(band.to);
  });

  it('still returns a sensible pair when the band straddles a zone boundary', () => {
    const band = targetBand(200, FTP, 10); // 180-220 W, across the 210 W boundary
    expect(band.from).toBeCloseTo(3 / 6, 10);
    expect(band.to).toBeCloseTo((4 + 10 / 30) / 6, 10);
    expect(band.from).toBeLessThan(4 / 6);
    expect(band.to).toBeGreaterThan(4 / 6);
  });

  it('collapses to a line at zero margin', () => {
    const band = targetBand(180, FTP, 0);
    expect(band.from).toBe(band.to);
    expect(band.from).toBe(ladderFraction(180, FTP));
  });

  it('clamps a band that runs off either edge', () => {
    expect(targetBand(60, FTP, 50)).toEqual({ from: 0, to: ladderFraction(90, FTP) });
    expect(targetBand(300, FTP, 50).to).toBe(1);
  });

  it('always returns from <= to, inside 0..1', () => {
    for (const target of [0, 50, 120, 200, 275, 500]) {
      const band = targetBand(target, FTP, 15);
      expect(band.from).toBeGreaterThanOrEqual(0);
      expect(band.to).toBeLessThanOrEqual(1);
      expect(band.from).toBeLessThanOrEqual(band.to);
    }
  });

  it('rejects a negative margin, which would invert the band', () => {
    expect(() => targetBand(180, FTP, -5)).toThrow(RangeError);
  });
});
