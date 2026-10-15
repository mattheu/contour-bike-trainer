import { describe, expect, it } from 'vitest';

import {
  climbGpxText,
  climbRoute,
  descentRoute,
  flatGpxText,
  flatRoute,
  FIXTURE_LENGTH_M,
} from '../../test/fixtures';
import { buildRouteGpx } from '../export/route-gpx';
import { parseGpx } from './gpx';
import type { Route } from './types';
import { nameFromFileName, planRouteImport, routeGeometryKey } from './import';

/**
 * The climb fixture moved 700 m east: the same kilometre of road, in another place.
 *
 * All three fixtures run along one meridian and differ only in their elevations, so this
 * is how a test gets two routes that are genuinely different lines rather than the same
 * line ridden at two heights.
 */
const climbEastGpxText = climbGpxText.replace(/lon="-1\.5000000"/g, 'lon="-1.4900000"');

const climbEastRoute = (): Route => parseGpx(climbEastGpxText);

/** The keys a rider's stored routes would contribute. */
function stored(...gpx: string[]): string[] {
  return gpx.map((text) => routeGeometryKey(parseGpx(text)));
}

/**
 * The flat fixture as a GPX of its own, snapped to whole units of the key's grid and
 * then shifted north by `latShift` degrees.
 *
 * Snapped because the fixture's seven-decimal coordinates sit at an arbitrary place
 * inside their metre — one of them is 2e-7 from a rounding boundary — and a test of what
 * the rounding does needs to start from the middle of a cell, not the edge of one.
 */
function shiftedFlatGpx(latShift: number): string {
  const points = flatRoute().points.map((point) => ({
    ...point,
    lat: Math.round(point.lat * 1e5) / 1e5 + latShift,
    lon: Math.round(point.lon * 1e5) / 1e5,
  }));
  return buildRouteGpx([{ name: 'Flat', points }]);
}

describe('nameFromFileName', () => {
  it('reads a file name as something a person would call a route', () => {
    expect(nameFromFileName('Mallorca.gpx')).toBe('Mallorca');
    expect(nameFromFileName('alpe-dhuez.gpx')).toBe('Alpe dhuez');
    expect(nameFromFileName('greenhow_hill.gpx')).toBe('Greenhow hill');
  });

  it('still produces a name when the file name has nothing in it', () => {
    expect(nameFromFileName('.gpx')).toBe('Imported route');
    expect(nameFromFileName('   ')).toBe('Imported route');
  });
});

describe('planRouteImport', () => {
  it('reads one track as one route, measured from the file', () => {
    const plan = planRouteImport(flatGpxText, 'anything.gpx');

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    expect(plan.routes).toHaveLength(1);
    expect(plan.routes[0]?.totalDistanceM).toBe(Math.round(FIXTURE_LENGTH_M));
    expect(plan.routes[0]?.totalAscentM).toBe(0);
    expect(plan.reasons).toEqual([]);
  });

  it('stores a single-track file exactly as it arrived', () => {
    // ADR-0014: the source is the record. Nothing re-serialises the bytes the rider
    // handed over, so what comes back out of Download is what went in.
    const plan = planRouteImport(flatGpxText, 'flat.gpx');

    expect(plan.status === 'read' && plan.routes[0]?.gpx).toBe(flatGpxText);
  });

  it('prefers the name in the file to the name of the file', () => {
    const plan = planRouteImport(flatGpxText, 'untitled-1.gpx');

    expect(plan.status === 'read' && plan.routes[0]?.name).toBe('Fixture: flat 1 km');
  });

  it('falls back to the file name for a track with no name of its own', () => {
    const nameless = flatGpxText.replace(/<name>[^<]*<\/name>/g, '');

    const plan = planRouteImport(nameless, 'Box Hill.gpx');

    expect(plan.status === 'read' && plan.routes[0]?.name).toBe('Box Hill');
  });

  it('reads a Download all back as the routes that went into it', () => {
    // The round trip the footer promises: one file out, the same routes back in.
    const bundle = buildRouteGpx([
      { name: 'Flat', points: flatRoute().points },
      { name: 'Climb', points: climbEastRoute().points },
    ]);

    const plan = planRouteImport(bundle, 'contour-routes-2026-10-14.gpx');

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    expect(plan.routes.map((route) => route.name)).toEqual(['Flat', 'Climb']);
    // Measured per track rather than concatenated: these two fixtures are a kilometre
    // each, and a single merged route would measure the jump between them as ridden.
    expect(plan.routes[0]?.totalDistanceM).toBe(Math.round(FIXTURE_LENGTH_M));
    expect(plan.routes[1]?.totalDistanceM).toBe(Math.round(FIXTURE_LENGTH_M));
    expect(plan.routes[1]?.totalAscentM).toBe(100);
  });

  it('gives each route of a multi-track file a source of its own', () => {
    const bundle = buildRouteGpx([
      { name: 'Flat', points: flatRoute().points },
      { name: 'Climb', points: climbEastRoute().points },
    ]);

    const plan = planRouteImport(bundle, 'two.gpx');

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    for (const route of plan.routes) {
      // One record, one rideable document. Not the whole bundle stored twice.
      expect(parseGpx(route.gpx).totalDistanceM).toBeCloseTo(FIXTURE_LENGTH_M, 0);
    }
  });

  it('numbers the routes of a nameless multi-track file after the file', () => {
    const bundle = buildRouteGpx([
      { name: 'Flat', points: flatRoute().points },
      { name: 'Climb', points: climbEastRoute().points },
    ]).replace(/<name>[^<]*<\/name>/g, '');

    const plan = planRouteImport(bundle, 'ride-log.gpx');

    expect(plan.status === 'read' && plan.routes.map((route) => route.name)).toEqual([
      'Ride log 1',
      'Ride log 2',
    ]);
  });

  it('keeps the readable tracks of a file and names what it skipped', () => {
    const half = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Good</name><trkseg>
    <trkpt lat="51.5" lon="-1.5"><ele>100</ele></trkpt>
    <trkpt lat="51.51" lon="-1.5"><ele>110</ele></trkpt>
  </trkseg></trk>
  <trk><name>Stub</name><trkseg>
    <trkpt lat="51.5" lon="-1.5"><ele>100</ele></trkpt>
  </trkseg></trk>
</gpx>`;

    const plan = planRouteImport(half, 'mixed.gpx');

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    expect(plan.routes.map((route) => route.name)).toEqual(['Good']);
    expect(plan.reasons).toHaveLength(1);
    expect(plan.reasons[0]).toMatch(/Track 2 \(Stub\) was skipped because/);
  });

  it('fails the whole file when it is not a GPX at all, and says why', () => {
    // Nothing is written in this case: the alert strip is the only report there is.
    const notGpx = planRouteImport('name: Sweet spot\nsteps:\n  - 20m @ 90%\n', 'workout.yaml');

    expect(notGpx.status).toBe('failed');
    if (notGpx.status !== 'failed') return;
    expect(notGpx.reason).toMatch(/GPX/);

    expect(planRouteImport('', 'empty.gpx').status).toBe('failed');
  });

  it('fails a GPX carrying nothing but waypoints', () => {
    const waypoints = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="51.5" lon="-1.5"><ele>100</ele></wpt>
</gpx>`;

    const plan = planRouteImport(waypoints, 'pins.gpx');

    expect(plan.status === 'failed' && plan.reason).toMatch(/no usable points/);
  });

  it('reads a planner export of <rte> as a route', () => {
    // Komoot and RideWithGPS write this, and it is half of what a rider will import.
    // A <rte> holds its <rtept> directly: there is no segment inside one.
    const rte = climbGpxText
      .replace(/<\/?trkseg>/g, '')
      .replace(/trkpt/g, 'rtept')
      .replace('<trk>', '<rte>')
      .replace('</trk>', '</rte>');

    const plan = planRouteImport(rte, 'planned.gpx');

    expect(plan.status === 'read' && plan.routes[0]?.totalAscentM).toBe(100);
  });
});

describe('routeGeometryKey', () => {
  it('holds through a round trip out of this app and back in', () => {
    // The duplicate the feature exists to catch: Download all re-emits a route from the
    // parsed points, so the bytes differ and only the geometry can match it. Proved
    // through buildRouteGpx rather than assumed, because this is the case that decides
    // whether the identity works at all.
    const exported = buildRouteGpx([{ name: 'Climb', points: climbRoute().points }]);

    expect(routeGeometryKey(parseGpx(exported))).toBe(routeGeometryKey(climbRoute()));
  });

  it('ignores elevation, which is what lets it survive that round trip', () => {
    // The exporter writes elevation to 0.1 m, which changes which points the despike
    // filter rejects and moves total ascent with it — on alpe-dhuez, by 2.9 m. A key that
    // read elevation would call this app's own export a different route.
    const higher = climbGpxText.replace(
      /<ele>([\d.]+)<\/ele>/g,
      (_, ele: string) => `<ele>${String(Number(ele) + 7)}</ele>`,
    );

    expect(routeGeometryKey(parseGpx(higher))).toBe(routeGeometryKey(climbRoute()));
  });

  it('rounds a coordinate the way the exporter will', () => {
    // A seven-decimal coordinate landing exactly on a tie — the generated routes in
    // routes/ carry a few dozen between them. buildRouteGpx takes 54.0258945 down to
    // 54.025894 and a multiply-and-round takes it up, so the key has to quantise through
    // the exporter's own rounding or this app's export comes back as a new route.
    const tie = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Tie</name><trkseg>
    <trkpt lat="54.0258945" lon="-2.5363155"><ele>100</ele></trkpt>
    <trkpt lat="54.0268945" lon="-2.5363155"><ele>110</ele></trkpt>
  </trkseg></trk>
</gpx>`;
    const route = parseGpx(tie);
    const exported = buildRouteGpx([{ name: 'Tie', points: route.points }]);

    expect(routeGeometryKey(parseGpx(exported))).toBe(routeGeometryKey(route));
  });

  it('reads a coordinate shift below the rounding as the same route', () => {
    // 0.000004 deg is about 0.4 m: inside the metre the key rounds to.
    expect(routeGeometryKey(parseGpx(shiftedFlatGpx(0.000004)))).toBe(
      routeGeometryKey(parseGpx(shiftedFlatGpx(0))),
    );
  });

  it('reads a coordinate shift above the rounding as a different route', () => {
    // 0.00002 deg is about 2.2 m, which is two cells along.
    expect(routeGeometryKey(parseGpx(shiftedFlatGpx(0.00002)))).not.toBe(
      routeGeometryKey(parseGpx(shiftedFlatGpx(0))),
    );
  });

  it('is the same line at two elevations, by design', () => {
    // The flat and descent fixtures run between the same coordinates for the same
    // kilometre, one sitting at 100 m and the other dropping from 300 m. Same line on the
    // map, so same route: elevation is left out deliberately, and a file of the same road
    // with a different elevation source is the duplicate that leaves out catches.
    expect(routeGeometryKey(flatRoute())).toBe(routeGeometryKey(descentRoute()));
  });
});

describe('planRouteImport, against routes already stored', () => {
  it('imports a file once however many times the rider picks it', () => {
    const first = planRouteImport(flatGpxText, 'flat.gpx');
    expect(first.status === 'read' && first.routes).toHaveLength(1);

    const again = planRouteImport(flatGpxText, 'flat.gpx', stored(flatGpxText));

    expect(again.status).toBe('read');
    if (again.status !== 'read') return;
    expect(again.routes).toEqual([]);
    expect(again.duplicates).toBe(1);
    expect(again.reasons).toEqual([]);
  });

  it('skips a route the build already ships, whatever the file is called', () => {
    // A route that came with the app is stored like any other, so this is the same
    // question as any duplicate: importing Alpe d'Huez when it is already in the list.
    const plan = planRouteImport(climbGpxText, 'alpe-dhuez-2.gpx', stored(climbGpxText));

    expect(plan.status === 'read' && plan.duplicates).toBe(1);
  });

  it('skips a stored route coming back through Download all', () => {
    // The bytes differ — the export re-emits from the parsed points — so only the
    // coordinates can catch this one.
    const exported = buildRouteGpx([{ name: 'Climb', points: climbRoute().points }]);

    const plan = planRouteImport(exported, 'contour-routes-2026-10-14.gpx', stored(climbGpxText));

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    expect(plan.routes).toEqual([]);
    expect(plan.duplicates).toBe(1);
  });

  it('imports a repeated track in one file once', () => {
    const twice = buildRouteGpx([
      { name: 'Climb', points: climbRoute().points },
      { name: 'Climb again', points: climbRoute().points },
    ]);

    const plan = planRouteImport(twice, 'two.gpx');

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    expect(plan.routes.map((route) => route.name)).toEqual(['Climb']);
    expect(plan.duplicates).toBe(1);
  });

  it('lands two different routes of the same length', () => {
    // A kilometre each, one here and one 700 m east. Same length, same shape, different
    // road: every point differs, so both land.
    const plan = planRouteImport(climbEastGpxText, 'climb.gpx', stored(flatGpxText));

    expect(plan.status === 'read' && plan.routes).toHaveLength(1);
    expect(plan.status === 'read' && plan.duplicates).toBe(0);
  });

  it('counts a duplicate and an unreadable track separately', () => {
    const mixed = `${buildRouteGpx([{ name: 'Climb', points: climbRoute().points }]).replace(
      '</gpx>',
      '  <trk><name>Stub</name><trkseg>\n' +
        '    <trkpt lat="51.5" lon="-1.5"><ele>100</ele></trkpt>\n' +
        '  </trkseg></trk>\n</gpx>',
    )}`;

    const plan = planRouteImport(mixed, 'mixed.gpx', stored(climbGpxText));

    expect(plan.status).toBe('read');
    if (plan.status !== 'read') return;
    expect(plan.routes).toEqual([]);
    expect(plan.duplicates).toBe(1);
    expect(plan.reasons).toHaveLength(1);
  });

  it('lands both of two roads between the same two places', () => {
    // A parallel road 20 m east of the flat fixture: it starts and ends at the same two
    // points, runs within five metres of the same length, and climbs nothing either. A
    // fingerprint of start, end, distance and ascent reads that as the route the rider
    // already has and silently drops it; the parsed line keeps both.
    const points = flatRoute().points;
    const parallel = points.map((point, index) =>
      index === 0 || index === points.length - 1 ? point : { ...point, lon: point.lon + 0.0003 },
    );
    const other = buildRouteGpx([{ name: 'Parallel', points: parallel }]);

    const read = parseGpx(other);
    const flat = flatRoute();
    expect(read.points[0]?.lat).toBeCloseTo(flat.points[0]?.lat ?? 0, 5);
    expect(read.points[read.points.length - 1]?.lat).toBeCloseTo(
      flat.points[flat.points.length - 1]?.lat ?? 0,
      5,
    );
    expect(read.totalDistanceM).toBeCloseTo(flat.totalDistanceM, -1);
    expect(read.totalAscentM).toBe(flat.totalAscentM);

    const plan = planRouteImport(other, 'parallel.gpx', stored(flatGpxText));

    expect(plan.status === 'read' && plan.routes).toHaveLength(1);
    expect(plan.status === 'read' && plan.duplicates).toBe(0);
  });
});
