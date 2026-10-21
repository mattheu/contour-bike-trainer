import { describe, expect, it } from 'vitest';
import { fitProjection } from './projection';

const METRES_PER_DEGREE = 6371008.8 * (Math.PI / 180);

describe('fitProjection', () => {
  it('maps a known bounding box onto the corners of the fitted extent', () => {
    // 0.002 deg of longitude by 0.001 deg of latitude at the equator: twice as
    // wide as it is tall, so a square box is filled horizontally.
    const points = [
      { lat: 0, lon: 0 },
      { lat: 0.001, lon: 0.002 },
    ];
    const projection = fitProjection(points, { width: 100, height: 100 });

    expect(projection.width).toBeCloseTo(100, 6);
    expect(projection.height).toBeCloseTo(50, 4);

    // North-west corner is the origin; y grows southward.
    expect(projection.project({ lat: 0.001, lon: 0 })).toEqual({ x: 0, y: 0 });
    const southEast = projection.project({ lat: 0, lon: 0.002 });
    expect(southEast.x).toBeCloseTo(100, 6);
    expect(southEast.y).toBeCloseTo(50, 4);
  });

  it('preserves aspect ratio rather than stretching to the box', () => {
    const points = [
      { lat: 50, lon: -1 },
      { lat: 50.02, lon: -0.9 },
    ];
    const projection = fitProjection(points, { width: 300, height: 300 });

    const spanXm = 0.1 * METRES_PER_DEGREE * Math.cos(50.01 * (Math.PI / 180));
    const spanYm = 0.02 * METRES_PER_DEGREE;
    expect(projection.width / projection.height).toBeCloseTo(spanXm / spanYm, 6);

    // Contained, not stretched: the long axis touches the box, the short one does not.
    expect(Math.max(projection.width, projection.height)).toBeCloseTo(300, 6);
    expect(Math.min(projection.width, projection.height)).toBeLessThan(300);
  });

  it('corrects longitude by cos(latitude)', () => {
    const box = { width: 1000, height: 1000 };
    const equator = fitProjection(
      [
        { lat: 0, lon: 0 },
        { lat: 0.01, lon: 0.01 },
      ],
      box,
    );
    const sixty = fitProjection(
      [
        { lat: 60, lon: 0 },
        { lat: 60.01, lon: 0.01 },
      ],
      box,
    );

    // cos(60 deg) is a half, so the same degrees of longitude are half as wide.
    expect(equator.width / equator.height).toBeCloseTo(1, 3);
    expect(sixty.width / sixty.height).toBeCloseTo(0.5, 3);
  });

  it('is isotropic: one plane unit is the same number of metres on both axes', () => {
    const projection = fitProjection(
      [
        { lat: 53.9, lon: -2.55 },
        { lat: 54.05, lon: -2.46 },
      ],
      { width: 280, height: 262 },
    );
    const spanYm = 0.15 * METRES_PER_DEGREE;
    expect(projection.height * projection.metresPerUnit).toBeCloseTo(spanYm, 3);
  });

  it('does not divide by zero on a degenerate single-point route', () => {
    const projection = fitProjection([{ lat: 51.5, lon: -0.1 }], { width: 320, height: 302 });

    expect(projection.width).toBe(0);
    expect(projection.height).toBe(0);
    expect(Number.isFinite(projection.metresPerUnit)).toBe(true);
    const point = projection.project({ lat: 51.5, lon: -0.1 });
    expect(point).toEqual({ x: 0, y: 0 });
  });

  it('fits a route with extent on one axis only to that axis', () => {
    // Due north: no longitude span at all.
    const projection = fitProjection(
      [
        { lat: 10, lon: 5 },
        { lat: 10.01, lon: 5 },
      ],
      { width: 400, height: 200 },
    );

    expect(projection.width).toBe(0);
    expect(projection.height).toBeCloseTo(200, 6);
    expect(Number.isNaN(projection.project({ lat: 10, lon: 5 }).x)).toBe(false);
  });

  it('handles an empty point list without producing NaN', () => {
    const projection = fitProjection([], { width: 100, height: 100 });
    expect(projection.width).toBe(0);
    expect(projection.project({ lat: 0, lon: 0 })).toEqual({ x: 0, y: 0 });
  });
});
