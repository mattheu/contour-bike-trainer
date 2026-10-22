import { describe, expect, it } from 'vitest';

import { climbRoute, flatRoute, FIXTURE_LENGTH_M } from '../../test/fixtures';
import { parseGpx, parseGpxTracks } from '../route/gpx';
import { buildRouteGpx } from './route-gpx';

describe('buildRouteGpx', () => {
  it('writes one named <trk> per route in a single valid document', () => {
    const gpx = buildRouteGpx([
      { name: 'Flat', points: flatRoute().points },
      { name: 'Climb', points: climbRoute().points },
    ]);

    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx.match(/<trk>/g)).toHaveLength(2);
    expect(gpx).toContain('<name>Flat</name>');
    expect(gpx).toContain('<name>Climb</name>');
    // One document, not two concatenated: a second root would make it unreadable.
    expect(gpx.match(/<gpx /g)).toHaveLength(1);
  });

  it('round-trips through the reader as the same routes, in order', () => {
    const flat = flatRoute();
    const climb = climbRoute();

    const { tracks, skipped } = parseGpxTracks(
      buildRouteGpx([
        { name: 'Flat', points: flat.points },
        { name: 'Climb', points: climb.points },
      ]),
    );

    expect(skipped).toEqual([]);
    expect(tracks.map((track) => track.name)).toEqual(['Flat', 'Climb']);
    // A metre of tolerance on a kilometre: the file carries six decimal places, so a
    // round trip moves a point by centimetres rather than not at all.
    expect(tracks[0]?.route.totalDistanceM).toBeCloseTo(FIXTURE_LENGTH_M, 0);
    expect(tracks[1]?.route.totalAscentM).toBeCloseTo(climb.totalAscentM, 0);
    expect(tracks[1]?.route.points).toHaveLength(climb.points.length);
  });

  it('carries a description back out, so a route survives the round trip whole', () => {
    // The asymmetry this closes: a route split out of a multi-track file is re-emitted
    // rather than stored verbatim, so without this its description lived on the record and
    // vanished the moment it was downloaded.
    const gpx = buildRouteGpx([
      { name: 'Flat', description: 'A level kilometre.', points: flatRoute().points },
    ]);

    expect(gpx).toContain('<desc>A level kilometre.</desc>');
    // After <name>, which is the order the GPX 1.1 schema requires.
    expect(gpx.indexOf('<desc>')).toBeGreaterThan(gpx.indexOf('<name>'));
    expect(parseGpxTracks(gpx).tracks[0]?.description).toBe('A level kilometre.');
  });

  it('writes no description element at all when there is none', () => {
    // Absent must stay absent: an empty <desc> reads back as a description that is the
    // empty string, which is not the same as having none.
    const gpx = buildRouteGpx([
      { name: 'Flat', points: flatRoute().points },
      { name: 'Blank', description: '   ', points: flatRoute().points },
    ]);

    expect(gpx).not.toContain('<desc>');
    expect(parseGpxTracks(gpx).tracks.map((track) => track.description)).toEqual([null, null]);
  });

  it('escapes a name rather than letting it break the document', () => {
    const gpx = buildRouteGpx([{ name: 'Fred & <Ginger>', points: flatRoute().points }]);

    expect(gpx).toContain('<name>Fred &amp; &lt;Ginger&gt;</name>');
    expect(parseGpxTracks(gpx).tracks[0]?.name).toBe('Fred & <Ginger>');
  });

  it('writes a document with no routes in it rather than throwing', () => {
    // Download all is disabled on an empty list, so this is unreachable from the screen.
    // It still has to be a GPX file and not a crash if it is ever reached another way.
    const gpx = buildRouteGpx([]);
    expect(gpx).toContain('</gpx>');
    expect(() => parseGpx(gpx)).toThrow(/no usable points/);
  });

  it('writes coordinates at the precision the reader needs and no more', () => {
    const gpx = buildRouteGpx([{ name: 'Flat', points: flatRoute().points }]);
    const first = /<trkpt lat="([^"]+)" lon="([^"]+)"><ele>([^<]+)<\/ele>/.exec(gpx);

    expect(first?.[1]).toBe('51.500000');
    expect(first?.[2]).toBe('-1.500000');
    expect(first?.[3]).toBe('100.0');
  });
});
