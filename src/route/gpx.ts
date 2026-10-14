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

/** Everything under the gpx root is optional in the schema, so read it defensively. */
interface RawGpx {
  gpx?: {
    trk?: { trkseg?: { trkpt?: RawTrackPoint[] }[] }[];
    rte?: { rtept?: RawTrackPoint[] }[];
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

  // A recorded ride is a <trk> of <trkpt>; a planned route is a <rte> of <rtept>. Route
  // planners (Footpath, Komoot, RideWithGPS) commonly export the latter, so accept both.
  // Tracks win when a file somehow carries both, being the more precise record.
  const raw: RawTrackPoint[] = [];
  for (const track of document.gpx.trk ?? []) {
    for (const segment of track.trkseg ?? []) {
      raw.push(...(segment.trkpt ?? []));
    }
  }
  if (raw.length === 0) {
    for (const route of document.gpx.rte ?? []) {
      raw.push(...(route.rtept ?? []));
    }
  }
  if (raw.length === 0) {
    throw new Error(
      'GPX has no usable points: expected a <trk> of <trkpt> or a <rte> of <rtept>, ' +
        'not just waypoints',
    );
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
