import { buildRouteGpx } from '../export/route-gpx';
import { haversineM, parseGpxTracks } from './gpx';
import type { Route } from './types';

/**
 * A GPX file the rider picked off disk, read as routes to store.
 *
 * Pure: no ids, no clock, no repository. services.ts mints the ids and writes the
 * records, which is where both of those belong — this decides what a file contains and
 * what each route in it is called.
 */

export interface ImportedRoute {
  name: string;
  /** What gets stored, and what everything downstream parses. See the rule below. */
  gpx: string;
  totalDistanceM: number;
  totalAscentM: number;
}

export type RouteImportPlan =
  | {
      status: 'read';
      routes: ImportedRoute[];
      /** Dropped because a route with this geometry is already stored, or appeared
       * earlier in this same file. */
      duplicates: number;
      reasons: string[];
    }
  | { status: 'failed'; reason: string };

/**
 * What makes two GPX files the same ride.
 *
 * Not a hash of the bytes. The one duplicate this most has to catch is the rider
 * re-importing this app's own Download all, and those bytes are never the file they came
 * from: a multi-track file is split into re-emitted single-track documents, and
 * buildRouteGpx writes from the parsed points at six decimal places, dropping timestamps
 * and extensions. A byte hash would miss precisely the likeliest case.
 *
 * So it is the geometry: where the ride starts, where it ends, how far and how much up.
 * Held as the measured numbers rather than rounded into buckets — see sameRoute for why.
 */
export interface RouteFingerprint {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  totalDistanceM: number;
  totalAscentM: number;
}

/**
 * Two start or end points this far apart are the same place.
 *
 * Consumer GPS is good to 3-5 m, and a planner that snaps a track to the road network
 * moves the first point by a similar amount, so the same ride recorded or exported twice
 * does not begin at the same coordinate. Ten metres absorbs that and is still far below
 * the distance between two genuinely different starts — two rides that begin and end
 * within ten metres of each other AND match on distance and ascent are the same ride by
 * any definition a rider would recognise.
 */
const POINT_TOLERANCE_M = 10;

/**
 * Distance is the stable figure: it is derived from the points, so a round trip through
 * buildRouteGpx moves it by under a fifth of a metre over 66 km, measured on the bundled
 * routes. Ten metres is therefore pure headroom, for a tool that resamples or drops a
 * point, rather than a figure the round trip needs.
 */
const DISTANCE_TOLERANCE_M = 10;

/**
 * Ascent is the noisy one, and the reason this compares rather than buckets.
 *
 * It is a sum of positive deltas, so writing elevation to 0.1 m changes which points the
 * despike filter rejects and the total moves with it. Measured on the bundled routes, a
 * round trip through the exporter moves ascent by up to 2.9 m (alpe-dhuez, 1259 m of
 * climbing); everything else is under 0.1 m. Five metres clears that with room, and is
 * below the gain of any feature that would make two routes different rides.
 *
 * The proportional term is for the routes we do not have: that 2.9 m is 0.23 % of the
 * Alpe's ascent, and the error is in the elevation series rather than in the route
 * length, so a 3,000 m alpine day would drift further in absolute metres. Half a percent
 * holds the same margin at any size.
 */
const ASCENT_TOLERANCE_M = 5;
const ASCENT_TOLERANCE_FRACTION = 0.005;

/**
 * The fingerprint of a parsed route. Every track that survives parsing has at least one
 * point — measure() throws otherwise — so there is always a first and a last.
 */
export function routeFingerprint(route: Route): RouteFingerprint {
  const first = route.points[0]!;
  const last = route.points[route.points.length - 1]!;
  return {
    startLat: first.lat,
    startLon: first.lon,
    endLat: last.lat,
    endLon: last.lon,
    totalDistanceM: route.totalDistanceM,
    totalAscentM: route.totalAscentM,
  };
}

/**
 * Whether two fingerprints are the same ride, each field within its tolerance.
 *
 * Compared pairwise rather than rounded to a grid and matched exactly, which is the
 * obvious implementation and does not work. Rounding puts a tolerance-wide gap between
 * two values that straddle a bucket edge: alpe-dhuez measures 1258.8 m of ascent from the
 * bundled file and 1255.9 m after a round trip through the exporter, which is well inside
 * five metres and on opposite sides of every five-metre boundary. A rounded fingerprint
 * fails the exact case this feature exists for.
 *
 * The cost is that matching is a scan rather than a set lookup, and that sameness is not
 * quite transitive near a tolerance. Neither matters at the scale of a routes list, and
 * the first match wins, which is deterministic.
 */
export function sameRoute(a: RouteFingerprint, b: RouteFingerprint): boolean {
  const ascentTolerance = Math.max(
    ASCENT_TOLERANCE_M,
    Math.max(a.totalAscentM, b.totalAscentM) * ASCENT_TOLERANCE_FRACTION,
  );
  return (
    haversineM(a.startLat, a.startLon, b.startLat, b.startLon) <= POINT_TOLERANCE_M &&
    haversineM(a.endLat, a.endLon, b.endLat, b.endLon) <= POINT_TOLERANCE_M &&
    Math.abs(a.totalDistanceM - b.totalDistanceM) <= DISTANCE_TOLERANCE_M &&
    Math.abs(a.totalAscentM - b.totalAscentM) <= ascentTolerance
  );
}

/** Mallorca.gpx → "Mallorca", alpe-dhuez.gpx → "Alpe dhuez". A fallback for a track with
 * no <name>, which is most of what a GPS head unit writes. */
export function nameFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]*$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (base === '') return 'Imported route';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Reads a GPX file as one route per track.
 *
 * One track per route rather than one route per file, because that is what makes Download
 * all reversible: the export writes every route as its own <trk> in one document, and a
 * file written by anything else usually holds exactly one track, which is the same rule
 * seen from the other end.
 *
 * What is stored is the rider's own bytes wherever that is possible — a file holding one
 * readable track is stored exactly as it arrived, comments, extensions and all, which is
 * ADR-0014's rule. It is only when one file becomes several records that each one gets a
 * re-emitted single-track document instead: records do not share a source, and slicing
 * XML out of a document by hand is a worse answer than writing a clean one.
 *
 * Partial, like the workout bundle import: an unreadable track is counted and named
 * rather than costing the readable ones. A file that is not GPX at all fails whole,
 * because then there is nothing to be partial about.
 *
 * A track whose geometry the rider already has is dropped and counted, never written and
 * never used to overwrite the stored copy. A route is not editable, so the stored one is
 * the same route by definition, and replacing it would churn an id that rides reference.
 * `existing` is every route already stored, built-ins included — importing Alpe d'Huez
 * when the build already ships it is the likeliest duplicate there is. Tracks within one
 * file are matched against each other too, so a file holding the same track twice lands
 * once.
 */
export function planRouteImport(
  text: string,
  fileName: string,
  existing: readonly RouteFingerprint[] = [],
): RouteImportPlan {
  let read;
  try {
    read = parseGpxTracks(text);
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }

  const fallback = nameFromFileName(fileName);
  const verbatim = read.tracks.length === 1 && read.skipped.length === 0;

  // Grows as the file is read, so the second copy of a track inside one file matches the
  // first. Names still number from the track's position in the file, not from what landed.
  const seen = [...existing];
  const routes: ImportedRoute[] = [];
  let duplicates = 0;

  for (const [position, track] of read.tracks.entries()) {
    const fingerprint = routeFingerprint(track.route);
    if (seen.some((other) => sameRoute(fingerprint, other))) {
      duplicates += 1;
      continue;
    }
    seen.push(fingerprint);

    const name =
      track.name ?? (read.tracks.length === 1 ? fallback : `${fallback} ${String(position + 1)}`);
    routes.push({
      name,
      gpx: verbatim ? text : buildRouteGpx([{ name, points: track.route.points }]),
      totalDistanceM: Math.round(track.route.totalDistanceM),
      totalAscentM: Math.round(track.route.totalAscentM),
    });
  }

  const reasons = read.skipped.map(
    (track) =>
      `Track ${String(track.index)}${track.name === null ? '' : ` (${track.name})`} was skipped because ${track.reason}`,
  );

  return { status: 'read', routes, duplicates, reasons };
}
