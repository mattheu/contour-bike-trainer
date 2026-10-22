import { parseGpx } from '../../src/route/gpx';
import type { Route } from '../../src/route/types';

// Hand-computable routes, deliberately not rideable ones. Every figure quoted below is
// arithmetic a person can check against the file; ADR-0011 is why that matters.
//
// The first three are 1 km of 11 points spaced 100 m apart along a meridian at a single
// constant gradient, so distance, grade, elevation and ascent are all readable off the
// coordinates. They are straight lines, which is the whole of their shape — nothing that
// needs a route to bend can use them.
import flatGpx from './flat-1km.gpx?raw';
import climbGpx from './climb-10pct-1km.gpx?raw';
import descentGpx from './descent-14pct-1km.gpx?raw';

// The two that bend, for the map, whose geometry is about plan shape rather than profile.
import diamondLoopGpx from './diamond-loop-17km.gpx?raw';
import staircaseGpx from './staircase-24km.gpx?raw';

/**
 * The fixture text itself, for the modules that take GPX rather than a parsed route —
 * the importer and the multi-track export. ADR-0011 again: a 153 kB bundled route in a
 * unit test is the thing these exist to avoid.
 */
export const flatGpxText = flatGpx;
export const climbGpxText = climbGpx;
export const descentGpxText = descentGpx;

/** 1 km at 0 %, elevation 100 m throughout. */
export const flatRoute = (): Route => parseGpx(flatGpx);

/** 1 km at a constant +10 %, 100 m to 200 m. */
export const climbRoute = (): Route => parseGpx(climbGpx);

/** 1 km at a constant -14 %: steep enough to reach the 80 km/h cap at zero power. */
export const descentRoute = (): Route => parseGpx(descentGpx);

export const FIXTURE_LENGTH_M = 1000;
export const FIXTURE_POINT_SPACING_M = 100;

/**
 * The <desc> on the flat fixture's <trk>, and the only fixture that carries one.
 *
 * Here rather than in a sixth fixture file: a route that differs from this one only by a
 * line of text would be the near-duplicate ADR-0011 warns about, and a description is a
 * property of a file as handed over rather than of a shape. The flat fixture is the one
 * the import tests use as "a file the rider picked", so it is the one that carries it.
 */
export const FLAT_FIXTURE_DESCRIPTION =
  'A level kilometre at 100 m, for tests that need no gradient.';

/**
 * A closed diamond: four straight limbs of six equal steps, N to E to S to W and back to
 * the point it started from. 25 points, 17.0 km round, about 6 km across either way —
 * wide enough that the map's 5 km view has to zoom in, and the only fixture whose last
 * point is its first, which is what a loop does to a search for "where is this pixel".
 *
 * Flat at 100 m throughout. A loop has to come back to the height it left, and a peak
 * halfway round a 25-point route is a minority inside the 15-point despike window, so
 * the parser would correct away any profile short enough to put here. Elevation is what
 * the three straight fixtures above are for.
 */
export const diamondLoopRoute = (): Route => parseGpx(diamondLoopGpx);

/**
 * Six 2 km legs east alternating with six 2 km legs north: 37 points, 24.0 km, bending
 * twelve times and never passing the same place twice. Climbs 10 m a point throughout,
 * 100 m to 460 m — 360 m of ascent at a steady 1.5 %, monotone so the despike window
 * leaves every point as written.
 *
 * The counterpart to the loop: where a loop makes a pixel ambiguous, this makes every
 * position on it answer exactly one distance.
 */
export const staircaseRoute = (): Route => parseGpx(staircaseGpx);

/** Round figures, asserted against rather than measured. */
export const DIAMOND_LOOP_LENGTH_M = 16_977;
export const STAIRCASE_LENGTH_M = 23_996;
export const STAIRCASE_ASCENT_M = 360;
