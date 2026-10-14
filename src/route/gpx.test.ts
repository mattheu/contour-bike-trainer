import { describe, expect, it } from 'vitest';
import { haversineM, parseGpx, parseGpxTracks } from './gpx';
import { FIXTURE_LENGTH_M, climbRoute, flatGpxText, flatRoute } from '../../test/fixtures';

function gpxWith(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${body}</trkseg></trk></gpx>`;
}

describe('haversineM', () => {
  it('measures a degree of latitude at the mean earth radius', () => {
    expect(haversineM(0, 0, 1, 0)).toBeCloseTo(111194.9, 0);
  });

  it('is zero between identical points', () => {
    expect(haversineM(51.5, -1.5, 51.5, -1.5)).toBe(0);
  });
});

describe('parseGpx', () => {
  it('reads the flat fixture as 1 km with no ascent', () => {
    const route = flatRoute();
    expect(route.points).toHaveLength(11);
    expect(route.totalDistanceM).toBeCloseTo(FIXTURE_LENGTH_M, 0);
    expect(route.totalAscentM).toBe(0);
    expect(route.points[0]?.distM).toBe(0);
    expect(route.points[5]?.distM).toBeCloseTo(500, 0);
  });

  it('sums only the positive elevation deltas', () => {
    const route = climbRoute();
    expect(route.totalAscentM).toBeCloseTo(100, 6);
    expect(route.points.at(-1)?.eleM).toBe(200);
  });

  it('drops points with no elevation but keeps distance continuous', () => {
    const route = parseGpx(
      gpxWith(`
        <trkpt lat="51.5000000" lon="-1.5"><ele>100</ele></trkpt>
        <trkpt lat="51.5008993" lon="-1.5"></trkpt>
        <trkpt lat="51.5017986" lon="-1.5"><ele>110</ele></trkpt>`),
    );
    expect(route.points).toHaveLength(2);
    expect(route.totalDistanceM).toBeCloseTo(200, 0);
    expect(route.totalAscentM).toBeCloseTo(10, 6);
  });

  it('reads multiple segments as one continuous track', () => {
    const xml = `<?xml version="1.0"?><gpx><trk>
      <trkseg><trkpt lat="51.5" lon="-1.5"><ele>10</ele></trkpt></trkseg>
      <trkseg><trkpt lat="51.5008993" lon="-1.5"><ele>20</ele></trkpt></trkseg>
    </trk></gpx>`;
    expect(parseGpx(xml).points).toHaveLength(2);
  });

  it('tolerates a namespace prefix on the elements', () => {
    const xml = `<?xml version="1.0"?><gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1"><gpx:trk><gpx:trkseg>
      <gpx:trkpt lat="51.5" lon="-1.5"><gpx:ele>10</gpx:ele></gpx:trkpt>
      <gpx:trkpt lat="51.5008993" lon="-1.5"><gpx:ele>20</gpx:ele></gpx:trkpt>
    </gpx:trkseg></gpx:trk></gpx:gpx>`;
    expect(parseGpx(xml).totalAscentM).toBeCloseTo(10, 6);
  });
});

describe('parseGpx rejections', () => {
  it('names an empty input', () => {
    expect(() => parseGpx('   ')).toThrow(/GPX is empty/);
  });

  it('names the line of a well-formedness error', () => {
    expect(() => parseGpx('<gpx><trk></gpx>')).toThrow(/not well-formed XML.*line \d+/s);
  });

  it('names a missing gpx root', () => {
    expect(() => parseGpx('<kml><placemark/></kml>')).toThrow(/no <gpx> root element/);
  });

  it('names what it needed when there are only waypoints', () => {
    expect(() => parseGpx('<gpx><wpt lat="1" lon="2"/></gpx>')).toThrow(/no usable points/);
  });

  it('names an empty track', () => {
    expect(() => parseGpx(gpxWith(''))).toThrow(/no usable points/);
  });

  it('names the offending point index for a bad coordinate', () => {
    const xml = gpxWith(`
      <trkpt lat="51.5" lon="-1.5"><ele>1</ele></trkpt>
      <trkpt lat="not-a-number" lon="-1.5"><ele>2</ele></trkpt>`);
    expect(() => parseGpx(xml)).toThrow(/track point 2 has a missing or non-numeric lat\/lon/);
  });

  it('names an out-of-range coordinate', () => {
    expect(() => parseGpx(gpxWith('<trkpt lat="151.5" lon="-1.5"><ele>1</ele></trkpt>'))).toThrow(
      /point 1 has an out-of-range lat\/lon/,
    );
  });

  it('names a track with no elevation at all', () => {
    const xml = gpxWith(`
      <trkpt lat="51.5" lon="-1.5"/>
      <trkpt lat="51.6" lon="-1.5"/>`);
    expect(() => parseGpx(xml)).toThrow(/no track points with elevation: all 2 points/);
  });

  it('rejects a single usable point, which has no distance', () => {
    expect(() => parseGpx(gpxWith('<trkpt lat="51.5" lon="-1.5"><ele>1</ele></trkpt>'))).toThrow(
      /only one track point with elevation/,
    );
  });
});

describe('parseGpx route points', () => {
  // Route planners (Footpath, Komoot, RideWithGPS) export a planned route as a <rte> of
  // <rtept> rather than a recorded <trk> of <trkpt>. Both are valid GPX 1.1.
  const rteWith = (points: string): string =>
    `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><rte>${points}</rte></gpx>`;

  it('reads a <rte> of <rtept> the same as a track', () => {
    const route = parseGpx(
      rteWith(`
        <rtept lat="53.90815" lon="-1.69467"><ele>100</ele></rtept>
        <rtept lat="53.90825" lon="-1.69477"><ele>110</ele></rtept>`),
    );
    expect(route.points).toHaveLength(2);
    expect(route.points[0]?.eleM).toBe(100);
    expect(route.totalAscentM).toBeCloseTo(10);
    expect(route.totalDistanceM).toBeGreaterThan(0);
  });

  it('prefers a track when a file carries both, the track being the more precise record', () => {
    const xml = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">
      <trk><trkseg>
        <trkpt lat="51.5" lon="-1.5"><ele>10</ele></trkpt>
        <trkpt lat="51.501" lon="-1.5"><ele>20</ele></trkpt>
      </trkseg></trk>
      <rte>
        <rtept lat="40.0" lon="2.0"><ele>500</ele></rtept>
        <rtept lat="40.001" lon="2.0"><ele>600</ele></rtept>
      </rte>
    </gpx>`;
    expect(parseGpx(xml).points[0]?.eleM).toBe(10);
  });

  it('rejects a namespaced GPX with an empty route', () => {
    expect(() => parseGpx(rteWith(''))).toThrow(/no usable points/);
  });
});

describe('parseGpxTracks', () => {
  const POINT = '<trkpt lat="51.5" lon="-1.5"><ele>100</ele></trkpt>';
  const SECOND = '<trkpt lat="51.51" lon="-1.5"><ele>110</ele></trkpt>';

  function tracks(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
  }

  it('reads each track as its own route rather than concatenating them', () => {
    // The two tracks are 600 km apart. parseGpx would measure the jump between them as
    // ridden distance, which is the whole reason this reader exists.
    const xml = tracks(
      `<trk><name>One</name><trkseg>${POINT}${SECOND}</trkseg></trk>` +
        `<trk><name>Two</name><trkseg><trkpt lat="46.5" lon="-1.5"><ele>50</ele></trkpt>` +
        `<trkpt lat="46.51" lon="-1.5"><ele>60</ele></trkpt></trkseg></trk>`,
    );

    const { tracks: read, skipped } = parseGpxTracks(xml);

    expect(skipped).toEqual([]);
    expect(read).toHaveLength(2);
    expect(read.map((track) => track.name)).toEqual(['One', 'Two']);
    expect(read[0]?.route.totalDistanceM).toBeLessThan(2000);
    expect(read[1]?.route.totalDistanceM).toBeLessThan(2000);
  });

  it('joins the segments within one track, which are one route', () => {
    const xml = tracks(
      `<trk><name>Segmented</name><trkseg>${POINT}</trkseg><trkseg>${SECOND}</trkseg></trk>`,
    );

    const { tracks: read } = parseGpxTracks(xml);

    expect(read).toHaveLength(1);
    expect(read[0]?.route.points).toHaveLength(2);
  });

  it('carries a nameless track rather than dropping it', () => {
    const { tracks: read } = parseGpxTracks(
      tracks(`<trk><trkseg>${POINT}${SECOND}</trkseg></trk>`),
    );

    expect(read[0]?.name).toBeNull();
    expect(read[0]?.index).toBe(1);
  });

  it('skips one unreadable track and keeps the rest, naming what it skipped', () => {
    const xml = tracks(
      `<trk><name>Good</name><trkseg>${POINT}${SECOND}</trkseg></trk>` +
        `<trk><name>Short</name><trkseg>${POINT}</trkseg></trk>`,
    );

    const { tracks: read, skipped } = parseGpxTracks(xml);

    expect(read.map((track) => track.name)).toEqual(['Good']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ index: 2, name: 'Short' });
    expect(skipped[0]?.reason).toMatch(/at least two/);
  });

  it('reads a planner export of <rte> as a route, as parseGpx does', () => {
    const xml = tracks(
      '<rte><name>Planned</name><rtept lat="51.5" lon="-1.5"><ele>100</ele></rtept>' +
        '<rtept lat="51.51" lon="-1.5"><ele>110</ele></rtept></rte>',
    );

    const { tracks: read } = parseGpxTracks(xml);

    expect(read[0]?.name).toBe('Planned');
    expect(read[0]?.route.totalAscentM).toBeCloseTo(10, 1);
  });

  it('throws on a file that is not a route at all, rather than returning nothing', () => {
    // Nothing partial about it: there is no track to report as skipped, so the caller
    // needs the whole file reported as unreadable.
    expect(() => parseGpxTracks(tracks('<wpt lat="51.5" lon="-1.5"></wpt>'))).toThrow(
      /no usable points/,
    );
    expect(() => parseGpxTracks('not xml at all')).toThrow(/GPX/);
  });

  it('reads the bundled fixtures the same way parseGpx does', () => {
    const { tracks: read } = parseGpxTracks(flatGpxText);

    expect(read).toHaveLength(1);
    expect(read[0]?.route.totalDistanceM).toBeCloseTo(flatRoute().totalDistanceM, 6);
  });
});
