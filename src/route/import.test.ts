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
import {
  nameFromFileName,
  planRouteImport,
  routeFingerprint,
  sameRoute,
  type RouteFingerprint,
} from './import';

/** The fingerprints a rider's stored routes would contribute. */
function stored(...gpx: string[]): RouteFingerprint[] {
  return gpx.map((text) => routeFingerprint(parseGpx(text)));
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
      { name: 'Climb', points: climbRoute().points },
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
      { name: 'Climb', points: climbRoute().points },
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
      { name: 'Climb', points: climbRoute().points },
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

describe('sameRoute', () => {
  const alpe: RouteFingerprint = {
    startLat: 45.05435,
    startLon: 6.03255,
    endLat: 45.09497,
    endLon: 6.07068,
    totalDistanceM: 15712.57,
    totalAscentM: 1258.79,
  };

  it('holds through a round trip out of this app and back in', () => {
    // The measured figures for routes/alpe-dhuez.gpx as bundled, and the same file after
    // Download all re-emits it from the parsed points: distance is unmoved, ascent falls
    // 2.9 m because elevation written to 0.1 m changes which points the despike rejects.
    // This is the duplicate the feature exists to catch, so it is the one worth pinning.
    expect(sameRoute(alpe, { ...alpe, totalAscentM: 1255.9 })).toBe(true);

    // And it is why the fingerprint is compared rather than rounded: 1258.79 and 1255.9
    // round to 1260 and 1255 at a five-metre grid, so a bucketed fingerprint would call
    // the app's own export a different route.
    expect(Math.round(1258.79 / 5) * 5).not.toBe(Math.round(1255.9 / 5) * 5);
  });

  it('tolerates a start a few metres off, as two recordings of one ride are', () => {
    // 0.00005 deg of latitude is about 5.6 m: a GPS fix or a planner snapping to the road.
    expect(sameRoute(alpe, { ...alpe, startLat: alpe.startLat + 0.00005 })).toBe(true);
    // 0.0002 deg is about 22 m, which is a different place to start from.
    expect(sameRoute(alpe, { ...alpe, startLat: alpe.startLat + 0.0002 })).toBe(false);
  });

  it('separates rides that differ by more than measurement noise', () => {
    expect(sameRoute(alpe, { ...alpe, totalDistanceM: alpe.totalDistanceM + 40 })).toBe(false);
    expect(sameRoute(alpe, { ...alpe, totalAscentM: alpe.totalAscentM + 60 })).toBe(false);
    expect(sameRoute(alpe, { ...alpe, endLat: alpe.endLat + 0.01 })).toBe(false);
  });

  it('scales the ascent tolerance with the climbing, not with the route', () => {
    // Half a percent of 3,000 m is 15 m, so an alpine day absorbs the same proportional
    // drift the Alpe does; a flat route keeps the five-metre floor.
    const alpine = { ...alpe, totalAscentM: 3000 };
    expect(sameRoute(alpine, { ...alpine, totalAscentM: 3012 })).toBe(true);
    const flat = { ...alpe, totalAscentM: 20 };
    expect(sameRoute(flat, { ...flat, totalAscentM: 32 })).toBe(false);
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
    // geometry can catch this one.
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
    // A kilometre each from the same junction, one flat and one climbing: the distance
    // and the ends match, and the ascent is what tells them apart.
    const plan = planRouteImport(climbGpxText, 'climb.gpx', stored(flatGpxText));

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

  it('matches on geometry rather than on the elevation a file starts at', () => {
    // The limit of a first-point, last-point, distance, ascent fingerprint, written down
    // rather than discovered: the flat fixture and the descent fixture run between the
    // same two coordinates for the same kilometre and both climb nothing, so they read as
    // one route though one sits at 100 m and the other drops from 300 m. Two real routes
    // that collide this way share a start, an end, a length and a total ascent, which is
    // close enough that skipping the second is the lesser error.
    expect(sameRoute(routeFingerprint(flatRoute()), routeFingerprint(descentRoute()))).toBe(true);
  });
});
