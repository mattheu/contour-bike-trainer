import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { despikeElevations } from './elevation.ts';
import type { Route, RoutePoint } from './types';

// IUGG mean radius. The spherical approximation is wrong by well under a metre
// per kilometre at these latitudes, which is far below GPS noise.
const EARTH_RADIUS_M = 6371008.8;

const DEG_TO_RAD = Math.PI / 180;

// fast-xml-parser rather than DOMParser: this module has to run in plain Node.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  // Parse numbers ourselves so a bad value can be reported against its point index.
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) =>
    name === 'trk' || name === 'trkseg' || name === 'trkpt' || name === 'rte' || name === 'rtept',
});

/** Great-circle distance between two lat/lon pairs, metres. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface RawTrackPoint {
  lat?: string;
  lon?: string;
  ele?: string;
}

interface RawTrack {
  name?: unknown;
  desc?: unknown;
  trkseg?: { trkpt?: RawTrackPoint[] }[];
}

interface RawRoute {
  name?: unknown;
  desc?: unknown;
  rtept?: RawTrackPoint[];
}

/** Everything under the gpx root is optional in the schema, so read it defensively. */
interface RawGpx {
  gpx?: {
    /** Read for its <desc> only, and never <wpt>: a waypoint's description is a note
     * about a place on the way, not a description of the route. */
    metadata?: { desc?: unknown };
    trk?: RawTrack[];
    rte?: RawRoute[];
  };
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a GPX document's track points into a Route.
 *
 * Points without elevation are dropped rather than interpolated: a GPX with
 * partial elevation is usually a broken export, and guessing would quietly
 * corrupt the gradient profile built on top of this.
 */
export function parseGpx(xml: string): Route {
  const root = readRoot(xml);

  // A recorded ride is a <trk> of <trkpt>; a planned route is a <rte> of <rtept>. Route
  // planners (Footpath, Komoot, RideWithGPS) commonly export the latter, so accept both.
  // Tracks win when a file somehow carries both, being the more precise record.
  const raw: RawTrackPoint[] = [];
  for (const track of root.trk ?? []) {
    for (const segment of track.trkseg ?? []) {
      raw.push(...(segment.trkpt ?? []));
    }
  }
  if (raw.length === 0) {
    for (const route of root.rte ?? []) {
      raw.push(...(route.rtept ?? []));
    }
  }
  if (raw.length === 0) {
    throw new Error(
      'GPX has no usable points: expected a <trk> of <trkpt> or a <rte> of <rtept>, ' +
        'not just waypoints',
    );
  }

  return measure(raw);
}

/** Validation and the root element, shared by the whole-document and per-track readers. */
function readRoot(xml: string): NonNullable<RawGpx['gpx']> {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('GPX is empty: no XML content to parse');
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    throw new Error(`GPX is not well-formed XML: ${msg} (line ${line}, column ${col})`);
  }

  const document = parser.parse(xml) as RawGpx;
  if (!document.gpx) {
    throw new Error('GPX has no <gpx> root element');
  }
  return document.gpx;
}

/** A <name> or <desc> only where it is text. One carrying attributes parses as an object,
 * and an empty or self-closing one as a blank string; neither is something to show in a
 * list, and neither should be stored as an empty string. */
function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** One track, read on its own rather than merged into whatever sits beside it. */
export interface GpxTrack {
  /** Its position in the file, 1-based, as a person would count tracks in it. */
  index: number;
  /** Its <name>, where it has one. The rider's own label for the route. */
  name: string | null;
  /** Its <desc>, where it has one, falling back to the document's. See parseGpxTracks
   * for which of those wins and when. */
  description: string | null;
  route: Route;
}

export interface GpxTrackSkipped {
  index: number;
  name: string | null;
  /** Why this one track could not be read, in a sentence that completes "because …". */
  reason: string;
}

export interface GpxTracks {
  tracks: GpxTrack[];
  skipped: GpxTrackSkipped[];
}

/**
 * Every track in a document as its own route, rather than one route of all of them.
 *
 * parseGpx concatenates: a file of five tracks is one route whose distance includes the
 * jump from the end of one to the start of the next, which is right for a ride recorded
 * in several segments and wrong for a file that carries five separate routes. This is the
 * reader for the second case, and it is what makes a Download all round-trip — the export
 * writes one <trk> per route and the import reads one route per <trk>.
 *
 * Partial by design, the way splitWorkoutDocuments is: one unreadable track is named and
 * counted rather than costing the other four. A document that is not GPX at all still
 * throws, because then there is nothing to be partial about.
 *
 * Descriptions come from <desc> on the <trk> or <rte> first, and from <metadata> only as
 * a fallback — the per-track one describes the thing being read, the document one
 * describes the file. <wpt> is never read: a waypoint's <desc> is a turn note about a
 * place on the route, and taking one would describe Alpe d'Huez as where to park.
 */
export function parseGpxTracks(xml: string): GpxTracks {
  const root = readRoot(xml);

  // Tracks win over routes for the same reason they do in parseGpx, and the fallback is
  // whole-document: a file mixing one <trk> with one <rte> is a recorded ride plus its
  // plan, not two routes.
  const sources: { name: string | null; description: string | null; points: RawTrackPoint[] }[] = (
    root.trk ?? []
  ).map((track) => ({
    name: textValue(track.name),
    description: textValue(track.desc),
    points: (track.trkseg ?? []).flatMap((segment) => segment.trkpt ?? []),
  }));
  if (sources.length === 0) {
    sources.push(
      ...(root.rte ?? []).map((route) => ({
        name: textValue(route.name),
        description: textValue(route.desc),
        points: route.rtept ?? [],
      })),
    );
  }
  if (sources.length === 0) {
    throw new Error(
      'GPX has no usable points: expected a <trk> of <trkpt> or a <rte> of <rtept>, ' +
        'not just waypoints',
    );
  }

  // <metadata><desc> describes the document, which is the route only when the document is
  // one route. A file of five tracks splits into five records, and stamping the file's own
  // sentence onto each would describe four of them wrongly, so there it is dropped rather
  // than copied — a track in such a file is described by its own <desc> or by nothing.
  const documentDescription = sources.length === 1 ? textValue(root.metadata?.desc) : null;

  const tracks: GpxTrack[] = [];
  const skipped: GpxTrackSkipped[] = [];

  for (const [position, source] of sources.entries()) {
    const index = position + 1;
    try {
      tracks.push({
        index,
        name: source.name,
        description: source.description ?? documentDescription,
        route: measure(source.points),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skipped.push({ index, name: source.name, reason });
    }
  }

  return { tracks, skipped };
}

function measure(raw: RawTrackPoint[]): Route {
  if (raw.length === 0) {
    throw new Error('GPX track has no points');
  }

  // Two passes: read every point, then despike the elevation series, then measure. Distance
  // and ascent have to come from the corrected elevations, because an uncorrected ascent on
  // a real file runs over 10 % high and that number is what reaches Strava.
  const read: { lat: number; lon: number; eleM: number }[] = [];
  let droppedForElevation = 0;

  for (let i = 0; i < raw.length; i += 1) {
    const point = raw[i] as RawTrackPoint;
    const lat = numberOrNull(point.lat);
    const lon = numberOrNull(point.lon);

    // Index is 1-based in the message because that is how a person counts points in a file.
    if (lat === null || lon === null) {
      throw new Error(
        `GPX track point ${i + 1} has a missing or non-numeric lat/lon (lat="${point.lat ?? ''}", lon="${point.lon ?? ''}")`,
      );
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`GPX track point ${i + 1} has an out-of-range lat/lon (${lat}, ${lon})`);
    }

    const eleM = numberOrNull(point.ele);
    if (eleM === null) {
      droppedForElevation += 1;
      continue;
    }
    read.push({ lat, lon, eleM });
  }

  const elevations = despikeElevations(read.map((point) => point.eleM));

  const points: RoutePoint[] = [];
  let totalDistanceM = 0;
  let totalAscentM = 0;

  for (let i = 0; i < read.length; i += 1) {
    const { lat, lon } = read[i]!;
    const eleM = elevations[i]!;
    const previous = points[points.length - 1];
    if (previous) {
      totalDistanceM += haversineM(previous.lat, previous.lon, lat, lon);
      if (eleM > previous.eleM) totalAscentM += eleM - previous.eleM;
    }
    points.push({ lat, lon, eleM, distM: totalDistanceM });
  }

  if (points.length === 0) {
    throw new Error(
      `GPX has no track points with elevation: all ${droppedForElevation} points lack an <ele> value`,
    );
  }
  if (points.length < 2) {
    throw new Error(
      'GPX has only one track point with elevation; a route needs at least two to have a distance',
    );
  }

  return { points, totalDistanceM, totalAscentM };
}
