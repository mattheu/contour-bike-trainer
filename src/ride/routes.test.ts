import { describe, expect, it } from 'vitest';

import { climbGpxText, flatGpxText, FIXTURE_LENGTH_M } from '../../test/fixtures';
import { parseGpx } from '../route/gpx';
import { MemoryRepository } from '../storage/memory';
import { createId, type Route as StoredRoute } from '../storage/types';
import {
  builtInRouteIds,
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
    expect(bundledRoute('greenhow-hill')?.name).toBe('Greenhow Hill, UK');
    expect(bundledRoute('sa-calobra')?.name).toBe('Sa Calobra, Mallorca');
    expect(bundledRoute('no-such-route')).toBeUndefined();
  });

  it('states figures that agree with what the parser reads out of each file', () => {
    // The route list shows the manifest's distance and ascent, never the file's. So a
    // route replaced without its entry being corrected reads as something it is not, on
    // the one screen where the rider is choosing between them.
    for (const route of bundledRoutes()) {
      const parsed = parseGpx(route.gpx);
      expect(route.totalDistanceM).toBe(Math.round(parsed.totalDistanceM));
      expect(route.totalAscentM).toBe(Math.round(parsed.totalAscentM));
    }
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
    // A legacy record no manifest entry claims, so no reseed can fill it. It used to
    // throw from inside a useMemo in the list row, taking the whole screen down with it.
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

describe('builtInRouteIds', () => {
  it('is exactly what routes/manifest.json declares', () => {
    const ids = builtInRouteIds();
    expect(ids.has('greenhow-hill')).toBe(true);
    expect(ids.size).toBe(bundledRoutes().length);
  });

  it('does not claim a route the rider imported', () => {
    // An imported route's id is minted, so no manifest entry can claim it. This is what
    // makes it the one kind of route the rider is offered a Remove control for.
    expect(builtInRouteIds().has(createId())).toBe(false);
  });

  it('stops claiming a route once its manifest entry is gone', () => {
    // Deliberate, and the only way a stale record gets out of an install: drop the entry
    // and its stored route becomes the rider's to remove.
    const ids = builtInRouteIds([
      {
        id: 'kept',
        name: 'Kept',
        file: 'fixture.gpx',
        gpx: flatGpxText,
        totalDistanceM: 1,
        totalAscentM: 0,
      },
    ]);
    expect([...ids]).toEqual(['kept']);
  });
});

describe('seedRoutes', () => {
  const entry: BundledRoute = {
    id: 'fixture-route',
    name: 'Fixture',
    file: 'fixture.gpx',
    gpx: flatGpxText,
    totalDistanceM: FIXTURE_LENGTH_M,
    totalAscentM: 0,
  };

  it('writes every bundled route on first run', async () => {
    const repo = repository();
    const result = await seedRoutes(repo);

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
    await seedRoutes(repo);

    const greenhow = await repo.get('greenhow-hill');
    expect(greenhow).toMatchObject({
      id: 'greenhow-hill',
      file: 'greenhow-hill.gpx',
      region: 'Yorkshire Dales',
    });
    expect(greenhow?.totalDistanceM).toBeGreaterThan(0);
  });

  it('writes the GPX onto the record, which is what makes it rideable', async () => {
    // ADR-0014 applied to routes: the seed copies the bytes out of the build, and nothing
    // afterwards reads the build to ride it.
    const repo = repository();
    await seedRoutes(repo, [entry]);

    expect((await repo.get('fixture-route'))?.gpx).toBe(flatGpxText);
  });

  it('is idempotent: running twice neither duplicates nor rewrites', async () => {
    const repo = repository();
    await seedRoutes(repo);
    const first = await repo.get('greenhow-hill');

    const second = await seedRoutes(repo);

    expect(await repo.list()).toHaveLength(bundledRoutes().length);
    expect(second.written).toEqual([]);
    expect(second.unchanged.sort()).toEqual(
      bundledRoutes()
        .map((r) => r.id)
        .sort(),
    );
    // updatedAt is untouched, so a later sync layer does not read a reseed as an edit.
    expect((await repo.get('greenhow-hill'))?.updatedAt).toBe(first?.updatedAt);
  });

  it('reaches an install that has already booted when the manifest changes', async () => {
    // What a rider would check: a figure corrected in the build shows up on the next
    // launch rather than only on a fresh database. Safe because nothing edits a route.
    const repo = repository();
    await seedRoutes(repo, [{ ...entry, name: 'Before', totalAscentM: 10 }]);

    const result = await seedRoutes(repo, [{ ...entry, name: 'After', totalAscentM: 20 }]);

    expect(result.written).toEqual(['fixture-route']);
    expect(await repo.get('fixture-route')).toMatchObject({ name: 'After', totalAscentM: 20 });
    expect(await repo.list()).toHaveLength(1);
  });

  it('rewrites a record whose GPX in the build has changed', async () => {
    const repo = repository();
    await seedRoutes(repo, [entry]);

    await seedRoutes(repo, [{ ...entry, gpx: climbGpxText }]);

    expect((await repo.get('fixture-route'))?.gpx).toBe(climbGpxText);
  });

  it('fills in a record written before routes carried their own GPX', async () => {
    // The old backfill pass, subsumed: a sourceless record differs from its manifest
    // entry, so the ordinary changed-or-absent rule repairs it on the next boot.
    const repo = repository();
    await repo.put({
      id: 'fixture-route',
      updatedAt: '',
      name: 'Fixture',
      file: 'fixture.gpx',
      totalDistanceM: FIXTURE_LENGTH_M,
      totalAscentM: 0,
    });

    const result = await seedRoutes(repo, [entry]);

    expect(result.written).toEqual(['fixture-route']);
    const stored = await repo.get('fixture-route');
    expect(stored?.gpx).toBe(flatGpxText);
    expect(storedRouteGeometry(stored).status).toBe('ok');
  });

  it('leaves an imported route alone: no manifest entry claims its id', async () => {
    const repo = repository();
    const imported: StoredRoute = {
      id: createId(),
      updatedAt: '',
      name: 'Imported',
      gpx: climbGpxText,
      totalDistanceM: FIXTURE_LENGTH_M,
      totalAscentM: 100,
    };
    await repo.put(imported);

    await seedRoutes(repo, [entry]);

    expect(await repo.get(imported.id)).toMatchObject({ name: 'Imported', gpx: climbGpxText });
  });

  it('puts a built-in route back if something managed to delete it', async () => {
    // Not a regression: a built-in route has no Remove control and services refuses the
    // id, so the only way to reach this state is a database edited from outside. Seeding
    // repairing it is the behaviour to want — the build is the source for these records.
    const repo = repository();
    await seedRoutes(repo, [entry]);
    await repo.delete('fixture-route');

    const result = await seedRoutes(repo, [entry]);

    expect(result.written).toEqual(['fixture-route']);
    expect(await repo.get('fixture-route')).toBeDefined();
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
