import { buildRouteGpx } from '../export/route-gpx';
import { parseGpxTracks } from './gpx';

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
  | { status: 'read'; routes: ImportedRoute[]; reasons: string[] }
  | { status: 'failed'; reason: string };

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
 */
export function planRouteImport(text: string, fileName: string): RouteImportPlan {
  let read;
  try {
    read = parseGpxTracks(text);
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }

  const fallback = nameFromFileName(fileName);
  const verbatim = read.tracks.length === 1 && read.skipped.length === 0;

  const routes = read.tracks.map((track, position) => {
    const name =
      track.name ?? (read.tracks.length === 1 ? fallback : `${fallback} ${String(position + 1)}`);
    return {
      name,
      gpx: verbatim ? text : buildRouteGpx([{ name, points: track.route.points }]),
      totalDistanceM: Math.round(track.route.totalDistanceM),
      totalAscentM: Math.round(track.route.totalAscentM),
    };
  });

  const reasons = read.skipped.map(
    (track) =>
      `Track ${String(track.index)}${track.name === null ? '' : ` (${track.name})`} was skipped because ${track.reason}`,
  );

  return { status: 'read', routes, reasons };
}
