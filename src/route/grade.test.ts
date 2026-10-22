import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOKAHEAD_M,
  MAX_GRADE_PERCENT,
  TRAINER_MAX_GRADE_PERCENT,
  clampGrade,
  gradeAt,
  trainerGrade,
} from './grade';
import { climbRoute, descentRoute, flatRoute } from '../../test/fixtures';
import type { Route } from './types';

/** Two points, one segment, an exact gradient: nothing to interpolate wrongly. */
function ramp(gradePercent: number, lengthM = 1000): Route {
  return {
    points: [
      { lat: 0, lon: 0, eleM: 0, distM: 0 },
      { lat: 0, lon: 0, eleM: (gradePercent / 100) * lengthM, distM: lengthM },
    ],
    totalDistanceM: lengthM,
    totalAscentM: Math.max(0, (gradePercent / 100) * lengthM),
  };
}

describe('gradeAt', () => {
  it('reads zero on the flat fixture', () => {
    expect(gradeAt(flatRoute(), 400)).toBe(0);
  });

  // Fixture coordinates are rounded to the GPX convention of 7 decimal places,
  // so distances land within ~1 cm and gradients within ~0.002 %, not exactly.
  it('reads the constant gradient of the climb fixture anywhere along it', () => {
    const route = climbRoute();
    for (const d of [0, 137, 500, 812.5]) {
      expect(gradeAt(route, d)).toBeCloseTo(10, 2);
    }
  });

  it('reads a negative gradient on a descent', () => {
    expect(gradeAt(descentRoute(), 250)).toBeCloseTo(-14, 2);
  });

  it('looks ahead, not behind: a step up is seen before it is reached', () => {
    const route: Route = {
      points: [
        { lat: 0, lon: 0, eleM: 0, distM: 0 },
        { lat: 0, lon: 0, eleM: 0, distM: 100 },
        { lat: 0, lon: 0, eleM: 10, distM: 200 },
      ],
      totalDistanceM: 200,
      totalAscentM: 10,
    };
    expect(gradeAt(route, 80, 40)).toBeCloseTo(5, 6); // last 20 m of flat, first 20 m of 10 %
    expect(gradeAt(route, 120, 40)).toBeCloseTo(10, 6);
  });

  it('honours a custom lookahead window', () => {
    const route = climbRoute();
    expect(gradeAt(route, 0, 500)).toBeCloseTo(10, 2);
    expect(() => gradeAt(route, 0, 0)).toThrow(/positive distance/);
  });

  it('defaults to the settings lookahead', () => {
    const route = climbRoute();
    expect(gradeAt(route, 100)).toBe(gradeAt(route, 100, DEFAULT_LOOKAHEAD_M));
  });

  it('shrinks the window at the finish and reports zero standing on the line', () => {
    const route = climbRoute();
    expect(gradeAt(route, route.totalDistanceM - 10)).toBeCloseTo(10, 2);
    expect(gradeAt(route, route.totalDistanceM)).toBe(0);
  });

  it('clamps beyond plus or minus 20 %', () => {
    expect(gradeAt(ramp(35), 100)).toBe(MAX_GRADE_PERCENT);
    expect(gradeAt(ramp(-35), 100)).toBe(-MAX_GRADE_PERCENT);
    expect(clampGrade(7.5)).toBe(7.5);
  });

  it('clamps a distance outside the route instead of throwing', () => {
    expect(gradeAt(climbRoute(), -50)).toBeCloseTo(10, 2);
    expect(gradeAt(climbRoute(), 50_000)).toBe(0);
  });

  /**
   * A loop's last metres are not the end of the road, they are the approach to the next
   * lap — so the lookahead wraps rather than shrinking. Without it the trainer is
   * released to flat for the length of the window every time round.
   */
  describe('on a loop', () => {
    /** Closed: last point is first. Climbs 10 % out of the start for 200 m and runs flat
     * for the last 200 m into it, so the window either side of the line is unambiguous. */
    const circuit = (): Route => ({
      points: [
        { lat: 51.5, lon: -0.1, eleM: 100, distM: 0 },
        { lat: 51.55, lon: -0.1, eleM: 120, distM: 200 },
        { lat: 51.55, lon: -0.15, eleM: 100, distM: 800 },
        { lat: 51.5, lon: -0.1, eleM: 100, distM: 1000 },
      ],
      totalDistanceM: 1000,
      totalAscentM: 20,
    });

    it('reads the road past the start line rather than running out of route', () => {
      // 10 m of flat into the line, then 30 m of the 10 % climb out of it.
      expect(gradeAt(circuit(), 990, 40)).toBeCloseTo(7.5, 6);
    });

    it('reads the lap ahead standing on the line, not zero', () => {
      expect(gradeAt(circuit(), 1000, 40)).toBeCloseTo(10, 6);
      expect(gradeAt(circuit(), 0, 40)).toBeCloseTo(10, 6);
    });

    it('wraps a distance already past the route, which is a second lap', () => {
      expect(gradeAt(circuit(), 1100, 40)).toBeCloseTo(10, 6);
    });

    it('does not wrap a window wider than the route itself', () => {
      // 2 km of lookahead round a 1 km circuit would read the same ground twice.
      expect(gradeAt(circuit(), 990, 2000)).toBe(0);
    });
  });
});

describe('trainerGrade', () => {
  it('reproduces the route exactly at difficulty 100', () => {
    expect(trainerGrade(8, 100)).toBeCloseTo(8);
    expect(trainerGrade(-8, 100)).toBeCloseTo(-8);
  });

  it('halves the grade at difficulty 50, descents included', () => {
    expect(trainerGrade(8, 50)).toBeCloseTo(4);
    expect(trainerGrade(-8, 50)).toBeCloseTo(-4);
  });

  it('is flat at difficulty 0', () => {
    expect(trainerGrade(12, 0)).toBe(0);
    expect(trainerGrade(-12, 0)).toBe(0);
  });

  it('clamps to what the trainer accepts, not to the physical bound', () => {
    expect(trainerGrade(28, 100)).toBe(TRAINER_MAX_GRADE_PERCENT);
    expect(trainerGrade(-28, 100)).toBe(-TRAINER_MAX_GRADE_PERCENT);
    expect(TRAINER_MAX_GRADE_PERCENT).toBeLessThan(MAX_GRADE_PERCENT);
  });

  it('does not let the trainer ceiling reach the grade the physics sees', () => {
    // The guard for docs/adr/0008. A 25 % wall is written to the trainer as 20 % because
    // that is all it accepts, but the rider must still climb it as 25 % — otherwise a
    // hardware limit silently makes the ride faster than the route, and nothing fails.
    const wall = 25;
    expect(trainerGrade(wall, 100)).toBe(20);
    expect(clampGrade(wall)).toBe(25);
  });
});
