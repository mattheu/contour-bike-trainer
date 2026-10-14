import { buildRouteGpx } from '../export/route-gpx';
import { parseGpxTracks } from './gpx';
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
 * What makes two GPX files the same route.
 *
 * The coordinate sequence as parsed, latitude and longitude rounded to five decimal
 * places — about a metre. Nothing derived, and nothing else from the point.
 *
 * Exact rather than fuzzy, which is the point of it. Two routes share a key only when
 * every point of one is within a metre of the same point of the other, and a route that
 * matches another that closely for its whole length is that route. The alternative —
 * start, end, distance and ascent, each within a tolerance — can call two genuinely
 * different rides one ride, and a false positive here is a route the rider silently does
 * not get. Failing to spot a duplicate is the cheaper mistake.
 *
 * Not a hash of the file. The duplicate this most has to catch is the rider re-importing
 * this app's own Download all, and those bytes are never the bytes that went out: a
 * multi-track file is split into re-emitted single-track documents, timestamps and
 * extensions dropped. A byte hash would miss precisely the likeliest case.
 *
 * Elevation is deliberately absent, and that is what makes the round trip survivable.
 * The exporter writes elevation to 0.1 m, which changes which points the despike filter
 * rejects, which moves ascent by metres — on alpe-dhuez, by 2.9 m. Coordinates do not
 * move that way: buildRouteGpx writes back the points it parsed.
 */

/** Five decimal places is about 1.1 m of latitude, and less of longitude away from the
 * equator — below the accuracy of the GPS that recorded the file, and far below the gap
 * between two different roads. */
const KEY_DP = 5;

/**
 * The precision buildRouteGpx writes, and why the key rounds through it rather than
 * straight to KEY_DP.
 *
 * A source written to seven decimal places sits at an arbitrary place inside its metre.
 * Round that to five and you get one answer; round the exporter's six-decimal copy of it
 * and you get a different one wherever the two straddle a boundary. Rounding to six first
 * means both the file and its export round the same value — and it has to be the
 * exporter's own toFixed rather than a multiply and round, because the generated routes
 * carry coordinates that land exactly on a tie (54.0258945), and the two disagree there.
 */
const EXPORT_DP = 6;

/** A coordinate as whole units of the key's grid. An integer rather than a fixed string
 * so that -0 and 0 cannot write themselves differently either side of a meridian. */
function gridded(degrees: number): number {
  return Math.round(Number(degrees.toFixed(EXPORT_DP)) * 10 ** KEY_DP);
}

/**
 * The identity of a parsed route: its rounded points, in order.
 *
 * Held as the string rather than digested down to a number. A Set lookup hashes it
 * anyway, so the comparison is the same cost, and a short digest of our own would put
 * back the one failure this exists to remove — two different routes reading as one.
 */
export function routeGeometryKey(route: Route): string {
  return route.points.map((point) => `${gridded(point.lat)},${gridded(point.lon)}`).join(';');
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
 * `existing` is the key of every route already stored, built-ins included — importing
 * Alpe d'Huez when the build already ships it is the likeliest duplicate there is. Tracks
 * within one file are matched against each other too, so a file holding the same track
 * twice lands once.
 */
export function planRouteImport(
  text: string,
  fileName: string,
  existing: readonly string[] = [],
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
  const seen = new Set(existing);
  const routes: ImportedRoute[] = [];
  let duplicates = 0;

  for (const [position, track] of read.tracks.entries()) {
    const key = routeGeometryKey(track.route);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);

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
