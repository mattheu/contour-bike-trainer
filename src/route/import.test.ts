import { describe, expect, it } from 'vitest';

import {
  climbGpxText,
  climbRoute,
  flatGpxText,
  flatRoute,
  FIXTURE_LENGTH_M,
} from '../../test/fixtures';
import { buildRouteGpx } from '../export/route-gpx';
import { parseGpx } from './gpx';
import { nameFromFileName, planRouteImport } from './import';

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
