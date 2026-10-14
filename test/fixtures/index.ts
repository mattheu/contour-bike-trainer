import { parseGpx } from '../../src/route/gpx';
import type { Route } from '../../src/route/types';

// Hand-computable routes, deliberately not rideable ones. Each is 1 km of 11
// points spaced 100 m apart along a meridian at a single constant gradient, so
// every expected distance, grade, elevation and ascent is arithmetic a person
// can check in their head. Rideable routes live in routes/ and are generated.
import flatGpx from './flat-1km.gpx?raw';
import climbGpx from './climb-10pct-1km.gpx?raw';
import descentGpx from './descent-14pct-1km.gpx?raw';

/** 1 km at 0 %, elevation 100 m throughout. */
export const flatRoute = (): Route => parseGpx(flatGpx);

/** 1 km at a constant +10 %, 100 m to 200 m. */
export const climbRoute = (): Route => parseGpx(climbGpx);

/** 1 km at a constant -14 %: steep enough to reach the 80 km/h cap at zero power. */
export const descentRoute = (): Route => parseGpx(descentGpx);

export const FIXTURE_LENGTH_M = 1000;
export const FIXTURE_POINT_SPACING_M = 100;
