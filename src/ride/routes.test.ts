import { describe, expect, it } from 'vitest';

import { parseGpx } from '../route/gpx';
import { MemoryRepository } from '../storage/memory';
import type { Route as StoredRoute } from '../storage/types';
import {
  bundledRoute,
  bundledRoutes,
  loadRouteGeometry,
  seedRoutes,
  type ManifestRoute,
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

  it('parses a bundled route into rideable geometry', () => {
    const geometry = loadRouteGeometry('test-mixed');
    expect(geometry.points.length).toBeGreaterThan(100);
    expect(Math.round(geometry.totalDistanceM)).toBe(bundledRoute('test-mixed')?.totalDistanceM);
  });

  it('says which route is missing rather than failing obscurely', () => {
    expect(() => loadRouteGeometry('no-such-route')).toThrow(/no-such-route/);
  });
});

describe('seedRoutes', () => {
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

    const rolling = await repo.get('test-rolling');
    expect(rolling).toMatchObject({
      id: 'test-rolling',
      file: 'test-rolling.gpx',
      region: 'Synthetic',
    });
    expect(rolling?.totalDistanceM).toBeGreaterThan(0);
  });

  it('is idempotent: running twice neither duplicates nor rewrites', async () => {
    const repo = repository();
    await seedRoutes(repo);
    const first = await repo.get('test-rolling');

    const second = await seedRoutes(repo);

    expect(await repo.list()).toHaveLength(bundledRoutes().length);
    expect(second.written).toEqual([]);
    expect(second.unchanged.sort()).toEqual(
      bundledRoutes()
        .map((r) => r.id)
        .sort(),
    );
    // updatedAt is untouched, so a later sync layer does not read a reseed as an edit.
    expect((await repo.get('test-rolling'))?.updatedAt).toBe(first?.updatedAt);
  });

  it('rewrites a route whose manifest entry has changed', async () => {
    const repo = repository();
    const entry: ManifestRoute = {
      id: 'fixture-route',
      name: 'Before',
      file: 'test-rolling.gpx',
      totalDistanceM: 1000,
      totalAscentM: 10,
    };
    await seedRoutes(repo, [entry]);

    const result = await seedRoutes(repo, [{ ...entry, name: 'After', totalAscentM: 20 }]);

    expect(result.written).toEqual(['fixture-route']);
    expect(await repo.get('fixture-route')).toMatchObject({ name: 'After', totalAscentM: 20 });
    expect(await repo.list()).toHaveLength(1);
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
