import { describe, expect, it } from 'vitest';
import { ZONE_COUNT as HR_ZONE_COUNT } from '../../zones/hr';
import { ZONE_COUNT as POWER_ZONE_COUNT, ladderFraction, zoneForPower } from '../../zones/power';
import { ladderLabel, ladderSegments } from './ZoneLadder';

/**
 * The ladder drew a hardcoded five segments while power has six zones, so the marker —
 * which src/zones/power.ts computes as a fraction of six — pointed at the wrong segment
 * above zone 1, and zone 6 lit nothing. The count now comes from the caller, and these
 * are the assertions that stop it drifting back.
 */
describe('ladderSegments', () => {
  it('renders as many segments as it is given', () => {
    expect(ladderSegments(6, 1)).toHaveLength(6);
    expect(ladderSegments(5, 1)).toHaveLength(5);
  });

  it('divides the ladder evenly and covers it exactly', () => {
    const segments = ladderSegments(6, 1);
    expect(segments[0]?.leftPct).toBe(0);
    const last = segments[segments.length - 1];
    expect((last?.leftPct ?? 0) + (last?.widthPct ?? 0)).toBeCloseTo(100, 10);
  });

  it('lights the top zone, which five segments could never do for six zones', () => {
    const segments = ladderSegments(POWER_ZONE_COUNT, POWER_ZONE_COUNT);
    expect(segments.filter((segment) => segment.lit)).toHaveLength(1);
    expect(segments[segments.length - 1]?.lit).toBe(true);
  });

  it('lights nothing when the zone is off the ladder, rather than lighting the wrong one', () => {
    expect(ladderSegments(5, 6).some((segment) => segment.lit)).toBe(false);
  });

  it('keeps at least one segment, so a bad count renders rather than dividing by nought', () => {
    expect(ladderSegments(0, 1)).toHaveLength(1);
    expect(ladderSegments(Number.NaN, 1)).toHaveLength(1);
  });
});

describe('ladderLabel', () => {
  it('counts against the caller zones, not the ladder own idea of how many there are', () => {
    expect(ladderLabel(6, POWER_ZONE_COUNT)).toBe('Zone 6 of 6');
    expect(ladderLabel(3, HR_ZONE_COUNT)).toBe('Zone 3 of 5');
  });
});

/**
 * The failure was the marker and the segments being scaled by different numbers, so this
 * pins them together: the segment a power lights must be the segment its marker sits in.
 */
describe('the marker and the segments agree', () => {
  const FTP = 250;
  /** Mid zone 5, far enough from both boundaries that no rounding can rescue it. */
  const EFFORT_W = FTP * 1.1;

  function segmentUnder(fraction: number, count: number): number {
    return Math.floor(fraction * count) + 1;
  }

  it('puts a zone 5 effort inside the fifth of six segments', () => {
    const zone = zoneForPower(EFFORT_W, FTP);
    expect(zone).toBe(5);
    expect(segmentUnder(ladderFraction(EFFORT_W, FTP), POWER_ZONE_COUNT)).toBe(zone);
  });

  it('puts it in the wrong segment at five, which is the bug this replaced', () => {
    expect(segmentUnder(ladderFraction(EFFORT_W, FTP), 5)).not.toBe(zoneForPower(EFFORT_W, FTP));
  });
});
