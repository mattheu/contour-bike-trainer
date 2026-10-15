import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RIDER,
  MAX_SPEED_MS,
  powerForSpeed,
  speedFromPower,
  speedFromPowerKmh,
} from './speed';

describe('speedFromPower', () => {
  it('gives 33-34 km/h for 200 W on the flat with the default rider', () => {
    expect(speedFromPowerKmh(200, 0)).toBeGreaterThan(33);
    expect(speedFromPowerKmh(200, 0)).toBeLessThan(34);
  });

  it('is a true inverse of powerForSpeed', () => {
    for (const [powerW, gradePercent] of [
      [200, 0],
      [120, 5],
      [350, 8],
      [80, -3],
    ] as const) {
      const speed = speedFromPower(powerW, gradePercent);
      expect(powerForSpeed(speed, gradePercent)).toBeCloseTo(powerW, 6);
    }
  });

  it('stops the rider at zero power on the flat', () => {
    expect(speedFromPower(0, 0)).toBe(0);
  });

  it('stops the rider at zero power on a climb', () => {
    expect(speedFromPower(0, 6)).toBe(0);
  });

  it('coasts to the gravity and drag balance at zero power on a steep descent', () => {
    // At -10 %: gravity gives 824.04 * (0.004*cos - sin) = -78.71 N, drag is
    // 0.196 v^2, so v = sqrt(78.71 / 0.196) = 20.04 m/s = 72.1 km/h. Below the
    // cap, and a genuine balance, so the residual power required there is zero.
    const speed = speedFromPower(0, -10);
    expect(speed).toBeLessThan(MAX_SPEED_MS);
    expect(speedFromPowerKmh(0, -10)).toBeCloseTo(72.1, 1);
    expect(powerForSpeed(speed, -10)).toBeCloseTo(0, 6);
  });

  it('caps a very steep descent at 80 km/h', () => {
    expect(speedFromPowerKmh(0, -14)).toBe(80);
    expect(speedFromPowerKmh(0, -20)).toBe(80);
    expect(speedFromPowerKmh(400, -14)).toBe(80);
  });

  it('caps absurd power on the flat at 80 km/h too', () => {
    expect(speedFromPowerKmh(5000, 0)).toBe(80);
  });

  it('grinds up a steep climb at a plausible speed', () => {
    // 250 W at 10 % for an 84 kg system: about 3 m/s.
    const kmh = speedFromPowerKmh(250, 10);
    expect(kmh).toBeGreaterThan(9);
    expect(kmh).toBeLessThan(12);
  });

  it('is monotonic in power at a fixed grade', () => {
    for (const gradePercent of [-8, 0, 4, 12]) {
      let previous = -1;
      for (let powerW = 0; powerW <= 500; powerW += 10) {
        const speed = speedFromPower(powerW, gradePercent);
        expect(speed).toBeGreaterThanOrEqual(previous);
        previous = speed;
      }
    }
  });

  it('is monotonically slower as the grade steepens at a fixed power', () => {
    let previous = Infinity;
    for (let gradePercent = -10; gradePercent <= 15; gradePercent += 1) {
      const speed = speedFromPower(200, gradePercent);
      expect(speed).toBeLessThanOrEqual(previous);
      previous = speed;
    }
  });

  it('treats negative and non-finite power as zero rather than producing nonsense', () => {
    expect(speedFromPower(-50, 0)).toBe(0);
    expect(speedFromPower(Number.NaN, 0)).toBe(0);
  });

  it('slows a heavier rider on a climb and barely changes them on the flat', () => {
    const heavy = { ...DEFAULT_RIDER, riderMassKg: 95 };
    expect(speedFromPower(250, 8, heavy)).toBeLessThan(speedFromPower(250, 8));
    expect(speedFromPowerKmh(250, 0, heavy)).toBeCloseTo(speedFromPowerKmh(250, 0), 0);
  });

  it('slows a rider with a bigger frontal area on the flat', () => {
    const upright = { ...DEFAULT_RIDER, cda: 0.45 };
    expect(speedFromPower(200, 0, upright)).toBeLessThan(speedFromPower(200, 0));
  });
});

describe('powerForSpeed', () => {
  it('is zero at a standstill', () => {
    expect(powerForSpeed(0, 5)).toBe(0);
  });

  it('is negative on a descent steep enough to need braking', () => {
    expect(powerForSpeed(5, -8)).toBeLessThan(0);
  });

  it('matches a hand-computed flat case', () => {
    // 84 kg * 9.81 * 0.004 = 3.2963 N rolling; 0.5 * 1.225 * 0.32 * 100 = 19.6 N drag.
    // (3.2963 + 19.6) * 10 / 0.97 = 236.04 W
    expect(powerForSpeed(10, 0)).toBeCloseTo(236.04, 1);
  });
});
