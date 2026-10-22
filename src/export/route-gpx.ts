import type { RoutePoint } from '../route/types';

/**
 * Routes out as one GPX file.
 *
 * Not a ZIP, for the reason workout-bundle.ts is not one either: ADR-0012 rules out a
 * second archive dependency, and GPX already has an answer to "several of these" built
 * into the schema — a document may carry any number of <trk>, and every tool that reads
 * GPX reads them. One file, valid, and openable in anything.
 *
 * The way back in is parseGpxTracks: the export writes one track per route and the
 * import reads one route per track, so a Download all round-trips.
 *
 * What a bundle is called is ./file-name.ts, with the rest of the download names.
 */

export interface RouteTrack {
  name: string;
  /**
   * Written when there is one, so a route survives a round trip whole rather than losing
   * its description to the export. Absent is absent: an empty <desc> would come back as a
   * description that is the empty string, which is not the same as having none.
   */
  description?: string;
  points: readonly RoutePoint[];
}

/**
 * Six decimal places is about 0.1 m of latitude — an order of magnitude finer than the
 * GPS that recorded the file, and the precision every route planner writes. Elevation to
 * 0.1 m for the same reason: the despiked series this comes from is not accurate to the
 * centimetre and writing one implies it is.
 */
const COORD_DP = 6;
const ELEVATION_DP = 1;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function point(p: RoutePoint): string {
  const lat = p.lat.toFixed(COORD_DP);
  const lon = p.lon.toFixed(COORD_DP);
  return `      <trkpt lat="${lat}" lon="${lon}"><ele>${p.eleM.toFixed(ELEVATION_DP)}</ele></trkpt>`;
}

function track({ name, description, points }: RouteTrack): string {
  const described = description !== undefined && description.trim() !== '';
  return [
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    // After <name>, which is the order GPX 1.1 requires: name, cmt, desc, then the rest.
    // Out of order it is still readable by most tools and rejected by a strict one.
    ...(described ? [`    <desc>${escapeXml(description.trim())}</desc>`] : []),
    '    <trkseg>',
    ...points.map(point),
    '    </trkseg>',
    '  </trk>',
  ].join('\n');
}

/**
 * Every route as one document, each one its own named <trk>.
 *
 * Emitted from the parsed points rather than spliced out of the stored text, which is the
 * one place this departs from ADR-0014's "never re-serialise". It has to: a route's
 * source is a whole GPX document with its own root element, and documents do not nest.
 * What that costs is everything the parser does not read — timestamps, heart rate
 * extensions, the creator string — and what it buys is a file that is valid GPX rather
 * than five concatenated ones, and a <rte>-only export from a route planner coming back
 * as a track. Elevations are the despiked series, which is what the app rides anyway.
 */
export function buildRouteGpx(tracks: readonly RouteTrack[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Contour" xmlns="http://www.topografix.com/GPX/1/1">',
    ...tracks.map(track),
    '</gpx>',
    '',
  ].join('\n');
}
