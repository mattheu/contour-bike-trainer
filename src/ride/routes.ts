import manifest from '../../routes/manifest.json';
import { parseGpx } from '../route/gpx';
import type { Route as RouteGeometry } from '../route/types';
import type { Repository, Route as StoredRoute } from '../storage/types';

/**
 * The GPX files are bundled by Vite rather than fetched, so the app works offline and a
 * route cannot 404 mid-session. A glob rather than named imports because SPEC.md says
 * adding a route is dropping a file in and adding a manifest entry — nothing more.
 */
const gpxByPath = import.meta.glob('../../routes/*.gpx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const gpxByFile = new Map<string, string>(
  Object.entries(gpxByPath).map(([path, gpx]) => [path.slice(path.lastIndexOf('/') + 1), gpx]),
);

export interface ManifestRoute {
  /** Declared, never minted. Rides reference it, so it must never change. */
  id: string;
  name: string;
  region?: string;
  description?: string;
  file: string;
  totalDistanceM: number;
  totalAscentM: number;
}

export interface BundledRoute extends ManifestRoute {
  gpx: string;
}

function toStoredRoute(entry: ManifestRoute): Omit<StoredRoute, 'updatedAt'> {
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.region === undefined ? {} : { region: entry.region }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    file: entry.file,
    totalDistanceM: entry.totalDistanceM,
    totalAscentM: entry.totalAscentM,
  };
}

/**
 * Routes supplied at runtime rather than bundled, and the only reason this exists is the
 * Playwright suite: the rideable routes are 20 and 30 km, and a test that rides one to
 * completion would take half an hour. A registered route behaves exactly like a bundled
 * one — it seeds, it lists, it rides — so the test drives the real code path.
 *
 * Empty in every normal session. The one caller, src/ui/services.ts, registers nothing
 * unless ?storage=memory is set, so this cannot reach a database with real rides in it.
 */
const registered = new Map<string, BundledRoute>();

export function registerRoute(route: BundledRoute): void {
  registered.set(route.id, route);
}

/** The manifest joined to the file contents. Throws if a declared file is missing,
 * because a route list entry that cannot be ridden is worse than a failed boot. */
export function bundledRoutes(entries: ManifestRoute[] = manifest.routes): BundledRoute[] {
  const bundled = entries.map((entry) => {
    const gpx = gpxByFile.get(entry.file);
    if (gpx === undefined) {
      throw new Error(
        `routes/manifest.json lists "${entry.file}" for route "${entry.id}", but no such file is bundled`,
      );
    }
    return { ...entry, gpx };
  });
  return [...bundled, ...registered.values()];
}

export function bundledRoute(id: string): BundledRoute | undefined {
  return bundledRoutes().find((route) => route.id === id);
}

/** The points, distances and elevations the engine rides. Parsed on demand: a route's
 * geometry is thousands of points and only one route is ridden at a time. */
export function loadRouteGeometry(id: string): RouteGeometry {
  const route = bundledRoute(id);
  if (route === undefined) {
    throw new Error(`No bundled route with id "${id}". Add it to routes/manifest.json.`);
  }
  return parseGpx(route.gpx);
}

export interface SeedResult {
  /** Ids written, because the repository had never seen them. */
  written: string[];
  /** Ids already present, left exactly as the rider has them. Empty when the pass was
   * skipped outright, because then nothing was looked at. */
  unchanged: string[];
}

/**
 * Seeds the bundled routes into the repository, using each route's declared id, exactly
 * as seedWorkouts seeds the starters.
 *
 * Two rules, and it takes both to make a deletion stick.
 *
 * Present means left alone, whatever the manifest now says. This used to compare the
 * stored record to the manifest entry and rewrite any route that differed, which made the
 * routes list a mirror of the build rather than something the rider owns.
 *
 * Absent is only written on an install that has never been seeded, which is what `seeded`
 * says. On its own the first rule is not enough: a route the rider deleted is absent, and
 * absent is indistinguishable from never-seen, so without the marker every deletion would
 * be undone by the next reload.
 *
 * The marker is a setting rather than an argument this function derives, because the only
 * honest moment to set it is after a whole pass has finished — a pass that threw halfway
 * must run again. Its caller, src/ui/services.ts, owns that ordering.
 *
 * The cost, accepted: a route added to routes/manifest.json later, or an entry corrected
 * in it, never reaches an install that has already booted. Only a fresh database picks
 * either up.
 */
export async function seedRoutes(
  repository: Repository<StoredRoute>,
  /** Whether this install has already had a seeding pass complete. */
  seeded: boolean,
  routes: ManifestRoute[] = bundledRoutes(),
): Promise<SeedResult> {
  const result: SeedResult = { written: [], unchanged: [] };
  if (seeded) return result;

  for (const entry of routes) {
    const existing = await repository.get(entry.id);
    if (existing !== undefined) {
      result.unchanged.push(entry.id);
      continue;
    }
    // updatedAt is stamped by the repository on write.
    await repository.put({ ...toStoredRoute(entry), updatedAt: '' });
    result.written.push(entry.id);
  }

  return result;
}
