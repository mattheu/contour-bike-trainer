import { describe, expect, it } from 'vitest';

import { routeGpxFileName, workoutBundleFileName, workoutFileName } from './file-name';

describe('routeGpxFileName', () => {
  it('names the file after the route, in the house style', () => {
    expect(routeGpxFileName('Test Route 1 — Rolling')).toBe('contour-test-route-1-rolling.gpx');
  });

  it('falls back to something openable when the name slugs to nothing', () => {
    expect(routeGpxFileName('···')).toBe('contour-route.gpx');
  });
});

describe('workoutFileName', () => {
  it('names the file after the workout', () => {
    expect(workoutFileName('Sweet Spot 3x12')).toBe('contour-sweet-spot-3x12.yaml');
  });

  it('collapses punctuation rather than carrying it into a file name', () => {
    expect(workoutFileName('  Over/Under — 2 × 20!  ')).toBe('contour-over-under-2-20.yaml');
  });

  it('still produces a file for a name the slug cannot carry', () => {
    // An extension on its own is not a file name, and a name can be all punctuation or
    // written in a script with no ASCII in it at all.
    expect(workoutFileName('!!!')).toBe('contour-workout.yaml');
    expect(workoutFileName('интервалы')).toBe('contour-workout.yaml');
  });
});

describe('workoutBundleFileName', () => {
  it('dates the bundle in local time, like the rides archive', () => {
    // Late evening local, which is the next day in UTC: the rider's date is the one that
    // makes the file findable, so the two exports agree on using theirs.
    expect(workoutBundleFileName(new Date(2026, 9, 14, 23, 30))).toBe(
      'contour-workouts-2026-10-14.yaml',
    );
  });
});
