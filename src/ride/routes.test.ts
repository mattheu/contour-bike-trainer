import { describe, expect, it } from 'vitest';

import { climbGpxText, flatGpxText, FIXTURE_LENGTH_M } from '../../test/fixtures';
import { parseGpx } from '../route/gpx';
import { MemoryRepository } from '../storage/memory';
import type { Route as StoredRoute } from '../storage/types';
import {
  backfillRouteSources,
  bundledRoute,
  bundledRoutes,
  seedRoutes,
  storedRouteGeometry,
  type BundledRoute,
} from './routes';

function repository(): MemoryRepository<StoredRoute> {
  return new MemoryRepository<StoredRoute>();
}

describe('bundledRoutes', () => {
  it('joins the manifest to the GPX files bundled with the build', () => {
    const routes = bundledRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(2);
    for (const route of routes) {
      // Not a tag check: a bundled route may be a recorded <trk> or a planned <rte>.
      // What matters is that the parser can read it.
      expect(parseGpx(route.gpx).points.length).toBeGreaterThan(1);
      expect(route.file).toMatch(/\.gpx$/);
    }
  });

  it('uses the id declared in the manifest rather than minting one', () => {
    // Rides reference this id. Minting one at runtime orphans every ride on reseed.
    expect(bundledRoute('test-rolling')?.name).toMatch(/Rolling/);
    expect(bundledRoute('test-mixed')?.name).toMatch(/Mixed/);
    expect(bundledRoute('no-such-route')).toBeUndefined();
  });
});

describe('storedRouteGeometry', () => {
  function stored(overrides: Partial<StoredRoute> = {}): StoredRoute {
    return {
      id: 'stored',
      updatedAt: '',
      name: 'Stored',
      totalDistanceM: 1000,
      totalAscentM: 10,
      ...overrides,
    };
  }

  it('parses the GPX on the record rather than reaching into the build', () => {
    const route = stored({ id: 'imported', gpx: flatGpxText });

    const result = storedRouteGeometry(route);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.geometry.totalDistanceM).toBeCloseTo(FIXTURE_LENGTH_M, 0);
  });

  it('rides a route nothing in the build has ever heard of', () => {
    // The whole point of the change: an imported route has no manifest entry and no file.
    expect(bundledRoute('imported')).toBeUndefined();
    expect(storedRouteGeometry(stored({ id: 'imported', gpx: climbGpxText })).status).toBe('ok');
  });

  it('reports a record with no source instead of throwing', () => {
    // A legacy record the backfill could not reach. It used to throw from inside a
    // useMemo in the list row, which took the whole screen down with it.
    const result = storedRouteGeometry(stored());

    expect(result).toEqual({ status: 'unavailable', reason: expect.stringContaining('no GPX') });
  });

  it('reports a source that will not parse instead of throwing', () => {
    const result = storedRouteGeometry(stored({ gpx: 'not a gpx file' }));

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toMatch(/could not be read/);
  });

  it('reports a route that is not there at all', () => {
    expect(storedRouteGeometry(undefined)).toEqual({
      status: 'unavailable',
      reason: expect.stringContaining('no longer'),
    });
  });
});

describe('seedRoutes', () => {
  it('writes every bundled route on first run', async () => {
    const repo = repository();
    const result = await seedRoutes(repo, false);

    const stored = await repo.list();
    expect(stored).toHaveLength(bundledRoutes().length);
    expect(result.written.sort()).toEqual(
      bundledRoutes()
        .map((r) => r.id)
        .sort(),
    );
    expect(result.unchanged).toEqual([]);
  });

  it('stores the route under its manifest id', async () => {
    const repo = repository();
    await seedRoutes(repo, false);

    const rolling = await repo.get('test-rolling');
    expect(rolling).toMatchObject({
      id: 'test-rolling',
      file: 'test-rolling.gpx',
      region: 'Synthetic',
    });
    expect(rolling?.totalDistanceM).toBeGreaterThan(0);
  });

  it('writes the GPX onto the record, which is what makes it rideable', () => {
    // ADR-0014 applied to routes: the seed copies the bytes out of the build once, and
    // nothing afterwards reads the build to ride it.
    const repo = repository();
    const entry: BundledRoute = {
      id: 'fixture-route',
      name: 'Fixture',
      file: 'fixture.gpx',
      gpx: flatGpxText,
      totalDistanceM: FIXTURE_LENGTH_M,
      totalAscentM: 0,
    };

    return seedRoutes(repo, false, [entry]).then(async () => {
      expect((await repo.get('fixture-route'))?.gpx).toBe(flatGpxText);
    });
  });

  it('is idempotent: running twice neither duplicates nor rewrites', async () => {
    const repo = repository();
    await seedRoutes(repo, false);
    const first = await repo.get('test-rolling');

    // The marker is true on every boot after the first, which is what the caller writes.
    const second = await seedRoutes(repo, true);

    expect(await repo.list()).toHaveLength(bundledRoutes().length);
    expect(second.written).toEqual([]);
    // Nothing is looked at once the marker is set, so nothing is reported as unchanged.
    expect(second.unchanged).toEqual([]);
    // updatedAt is untouched, so a later sync layer does not read a reseed as an edit.
    expect((await repo.get('test-rolling'))?.updatedAt).toBe(first?.updatedAt);
  });

  it('leaves a route alone even when its manifest entry has changed', async () => {
    // The seed cannot tell a corrected entry from a route the rider deleted, so it
    // rewrites neither. The cost of that choice, stated in seedRoutes, is this test.
    const repo = repository();
    const entry: BundledRoute = {
      id: 'fixture-route',
      name: 'Before',
      file: 'fixture.gpx',
      gpx: flatGpxText,
      totalDistanceM: 1000,
      totalAscentM: 10,
    };
    await seedRoutes(repo, false, [entry]);

    const result = await seedRoutes(repo, true, [{ ...entry, name: 'After', totalAscentM: 20 }]);

    expect(result.written).toEqual([]);
    expect(await repo.get('fixture-route')).toMatchObject({ name: 'Before', totalAscentM: 10 });
    expect(await repo.list()).toHaveLength(1);
  });

  it('does not bring back a route the rider deleted', async () => {
    // What a rider would actually check, in the order they would do it: boot, remove a
    // route, reload. A delete control that the next reload undoes is not a delete control,
    // and absent alone cannot carry that — the marker is what tells a deleted route from
    // one this install has never seen.
    const repo = repository();
    await seedRoutes(repo, false);
    await repo.delete('test-rolling');

    const result = await seedRoutes(repo, true);

    expect(result.written).toEqual([]);
    expect(await repo.get('test-rolling')).toBeUndefined();
    expect(await repo.list()).toHaveLength(bundledRoutes().length - 1);
  });

  it('seeds an install that was running before the marker existed, writing nothing', async () => {
    // Such a blob parses as not seeded, so the first boot after the change runs a full
    // pass. Safe because every record is already there and present means left alone.
    const repo = repository();
    await seedRoutes(repo, false);
    const before = await repo.get('test-rolling');

    const upgrade = await seedRoutes(repo, false);

    expect(upgrade.written).toEqual([]);
    expect((await repo.get('test-rolling'))?.updatedAt).toBe(before?.updatedAt);
  });
});

describe('a manifest entry whose file is not bundled', () => {
  it('fails loudly and names both the file and the route', () => {
    // A route in the list that cannot be ridden is worse than a failed boot.
    expect(() =>
      bundledRoutes([
        { id: 'ghost', name: 'Ghost', file: 'missing.gpx', totalDistanceM: 1, totalAscentM: 1 },
      ]),
    ).toThrow(/missing\.gpx.*ghost/);
  });
});

describe('backfillRouteSources', () => {
  const entry: BundledRoute = {
    id: 'fixture-route',
    name: 'Fixture',
    file: 'fixture.gpx',
    gpx: flatGpxText,
    totalDistanceM: FIXTURE_LENGTH_M,
    totalAscentM: 0,
  };

  function legacy(overrides: Partial<StoredRoute> = {}): StoredRoute {
    // What the build before this change wrote: metadata and a path, no source.
    return {
      id: 'fixture-route',
      updatedAt: '',
      name: 'Fixture',
      file: 'fixture.gpx',
      totalDistanceM: FIXTURE_LENGTH_M,
      totalAscentM: 0,
      ...overrides,
    };
  }

  it('fills a record written before routes carried their own GPX', async () => {
    const repo = repository();
    await repo.put(legacy());

    const result = await backfillRouteSources(repo, [entry]);

    expect(result).toEqual({ filled: ['fixture-route'], orphaned: [] });
    expect((await repo.get('fixture-route'))?.gpx).toBe(flatGpxText);
  });

  it('finds the bytes by file when the id has gone from the manifest', async () => {
    const repo = repository();
    await repo.put(legacy({ id: 'renamed-in-the-manifest' }));

    const result = await backfillRouteSources(repo, [entry]);

    expect(result.filled).toEqual(['renamed-in-the-manifest']);
  });

  it('leaves a record it cannot fill exactly where it is, and names it', async () => {
    // Deleting the rider's record because a file left the build is the destructive
    // answer. The row stays, loses its sparkline, and cannot be started.
    const repo = repository();
    await repo.put(legacy({ id: 'gone', name: 'Gone', file: 'no-longer-bundled.gpx' }));

    const result = await backfillRouteSources(repo, [entry]);

    expect(result).toEqual({ filled: [], orphaned: ['Gone'] });
    expect(await repo.get('gone')).toBeDefined();
    expect(storedRouteGeometry(await repo.get('gone')).status).toBe('unavailable');
  });

  it('touches nothing that already has a source', async () => {
    const repo = repository();
    await repo.put(legacy({ gpx: climbGpxText }));
    const before = await repo.get('fixture-route');

    const result = await backfillRouteSources(repo, [entry]);

    expect(result.filled).toEqual([]);
    // Not rewritten: updatedAt is a sync layer's conflict signal, not a free field.
    expect((await repo.get('fixture-route'))?.updatedAt).toBe(before?.updatedAt);
    expect((await repo.get('fixture-route'))?.gpx).toBe(climbGpxText);
  });

  it('does not put back a route the rider deleted', async () => {
    // It repairs records that exist. Seeding decides which exist, and the seeded marker
    // is what makes a deletion stick; this runs on every boot and must not undo that.
    const repo = repository();

    const result = await backfillRouteSources(repo, [entry]);

    expect(result).toEqual({ filled: [], orphaned: [] });
    expect(await repo.list()).toEqual([]);
  });

  it('leaves an imported route alone: it never had a file and does not need one', async () => {
    const repo = repository();
    await repo.put({
      id: 'imported',
      updatedAt: '',
      name: 'Imported',
      gpx: climbGpxText,
      totalDistanceM: FIXTURE_LENGTH_M,
      totalAscentM: 100,
    });

    const result = await backfillRouteSources(repo, [entry]);

    expect(result).toEqual({ filled: [], orphaned: [] });
  });
});
