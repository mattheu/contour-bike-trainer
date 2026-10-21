import { describe, expect, it } from 'vitest';
import { elevationAt, interpolateAt, positionAt } from './position';
import { climbRoute, descentRoute, flatRoute } from '../../test/fixtures';

describe('positionAt', () => {
  it('interpolates elevation linearly between neighbouring points', () => {
    const route = climbRoute();
    // Fixture points sit every 100 m; 150 m is halfway between the 110 m and 120 m points.
    expect(positionAt(route, 150).eleM).toBeCloseTo(115, 3);
    expect(positionAt(route, 375).eleM).toBeCloseTo(137.5, 3);
  });

  it('lands exactly on a point when the distance is a point distance', () => {
    const route = climbRoute();
    const third = route.points[3];
    expect(third).toBeDefined();
    const position = positionAt(route, third?.distM ?? 0);
    expect(position.lat).toBeCloseTo(third?.lat ?? 0, 9);
    expect(position.eleM).toBeCloseTo(130, 6);
  });

  it('interpolates lat/lon along the track', () => {
    const route = flatRoute();
    const a = route.points[0];
    const b = route.points[1];
    expect(a && b).toBeTruthy();
    const mid = positionAt(route, (b?.distM ?? 0) / 2);
    expect(mid.lat).toBeCloseTo(((a?.lat ?? 0) + (b?.lat ?? 0)) / 2, 9);
    expect(mid.lon).toBeCloseTo(-1.5, 9);
  });

  it('clamps to the ends rather than extrapolating', () => {
    const route = descentRoute();
    expect(positionAt(route, -500).eleM).toBe(300);
    expect(positionAt(route, 99999).eleM).toBe(160);
    expect(positionAt(route, 99999).distM).toBeCloseTo(route.totalDistanceM, 6);
  });

  it('agrees with elevationAt', () => {
    const route = climbRoute();
    expect(elevationAt(route, 620)).toBeCloseTo(positionAt(route, 620).eleM, 9);
  });
});

describe('interpolateAt', () => {
  it('refuses an empty series rather than returning a fabricated point', () => {
    expect(() => interpolateAt([], 0)).toThrow(/no points/);
  });

  it('returns the only point of a one-point series', () => {
    const only = { lat: 1, lon: 2, eleM: 3, distM: 0 };
    expect(interpolateAt([only], 500)).toEqual(only);
  });
});
