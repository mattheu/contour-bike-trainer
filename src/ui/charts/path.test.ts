import { describe, expect, it } from 'vitest';
import { areaPath, polylinePath, smoothPath } from './path';

describe('polylinePath', () => {
  it('is empty for no points', () => {
    expect(polylinePath([])).toBe('');
  });

  it('moves to the first point and lines to the rest', () => {
    expect(
      polylinePath([
        { x: 0, y: 1 },
        { x: 2.005, y: 3 },
      ]),
    ).toBe('M0,1 L2.01,3');
  });
});

describe('smoothPath', () => {
  it('falls back to straight segments below three points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ];
    expect(smoothPath(points)).toBe(polylinePath(points));
  });

  it('emits Catmull-Rom control points at the standard one-sixth tension', () => {
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
      ]),
    ).toBe('M0,0 C1.67,1.67 6.67,10 10,10 C13.33,10 18.33,1.67 20,0');
  });

  it('interpolates: every segment ends on one of its own data points', () => {
    const points = [
      { x: 0, y: 4 },
      { x: 5, y: 9 },
      { x: 10, y: 2 },
      { x: 15, y: 7 },
    ];
    const ends = smoothPath(points)
      .split(' C')
      .slice(1)
      .map((segment) => segment.split(' ')[2]);
    expect(ends).toEqual(['5,9', '10,2', '15,7']);
  });
});

describe('areaPath', () => {
  it('needs two points to enclose anything', () => {
    expect(areaPath([{ x: 0, y: 0 }], 100)).toBe('');
  });

  it('closes the line down to the baseline and back', () => {
    const d = areaPath(
      [
        { x: 0, y: 10 },
        { x: 20, y: 30 },
      ],
      100,
      false,
    );
    expect(d).toBe('M0,10 L20,30 L20,100 L0,100 Z');
  });

  it('smooths the upper edge when asked', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ];
    const d = areaPath(points, 50);
    expect(d.startsWith(smoothPath(points))).toBe(true);
    expect(d.endsWith(' L20,50 L0,50 Z')).toBe(true);
  });
});
