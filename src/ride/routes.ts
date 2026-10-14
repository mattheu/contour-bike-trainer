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

function toStoredRoute(entry: BundledRoute): Omit<StoredRoute, 'updatedAt'> {
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.region === undefined ? {} : { region: entry.region }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    // The record carries the GPX itself; the file name rides along as provenance only.
    gpx: entry.gpx,
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

/**
 * The ids this build supplies, which is the whole definition of a built-in route: derived
 * from the manifest on every read rather than stored as a flag on the record, so there is
 * no second copy of the truth to fall out of step with routes/manifest.json.
 *
 * One property of that, deliberate: drop an entry from the manifest and its stored record
 * stops being built in, which is how a stale route the build no longer supplies gets a way
 * out of an install. Nothing else gives the rider a way to remove one.
 */
export function builtInRouteIds(routes: BundledRoute[] = bundledRoutes()): ReadonlySet<string> {
  return new Set(routes.map((route) => route.id));
}

/**
 * What a stored route has to ride on, or why it has nothing.
 *
 * Total rather than throwing, because every caller is a screen. The old version read the
 * bundle by id and threw when it found nothing, and the one in RouteRow's render threw
 * inside a useMemo — a single stored route whose manifest entry had been removed took the
 * whole routes list down with it. A record that cannot be ridden is a row without a
 * sparkline, not a blank screen.
 */
export type StoredGeometry =
  { status: 'ok'; geometry: RouteGeometry } | { status: 'unavailable'; reason: string };

/**
 * The points, distances and elevations the engine rides, parsed from the record's own
 * GPX. ADR-0014's rule: the source is the record and the geometry is computed from it on
 * read, so a route is rideable wherever it came from — the build or a file the rider
 * picked off disk.
 *
 * Parsed on demand and not cached, exactly as a workout's YAML is. ADR-0014 settled that
 * trade too: a cache here is an invalidation question, and one route is parsed at a time.
 */
export function storedRouteGeometry(route: StoredRoute | undefined): StoredGeometry {
  if (route === undefined) {
    return { status: 'unavailable', reason: 'it is no longer in this install' };
  }
  if (route.gpx === undefined || route.gpx.trim() === '') {
    // Nothing in the build to seed it from: its manifest entry has gone. See seedRoutes.
    return { status: 'unavailable', reason: 'this install has no GPX for it' };
  }
  try {
    return { status: 'ok', geometry: parseGpx(route.gpx) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'unavailable', reason: `its GPX could not be read: ${reason}` };
  }
}

export interface SeedResult {
  /** Ids written, because they were absent or the manifest entry had changed. */
  written: string[];
  /** Ids already present and identical to the manifest, left alone. */
  unchanged: string[];
}

/** Every field a record takes from its manifest entry, the GPX included: a corrected
 * figure and a re-exported track both have to count as a change. updatedAt is excluded
 * because the repository stamps it, and id because it is what joined the two. */
function sameRoute(stored: StoredRoute, next: Omit<StoredRoute, 'updatedAt'>): boolean {
  return (
    stored.name === next.name &&
    stored.region === next.region &&
    stored.description === next.description &&
    stored.gpx === next.gpx &&
    stored.file === next.file &&
    stored.totalDistanceM === next.totalDistanceM &&
    stored.totalAscentM === next.totalAscentM
  );
}

/**
 * Seeds the bundled routes into the repository on every boot, using each route's declared
 * id: write what is absent, rewrite what differs from the manifest.
 *
 * Deliberately not the rule seedWorkouts uses, and the difference is what each record is.
 * A route is not editable — there is no screen that changes one — and a built-in route is
 * not deletable either, so nothing the rider owns can be sitting in one of these records.
 * That makes the manifest their single source, and a figure corrected in it should reach an
 * install that has already been used rather than only a fresh database. A starter workout is
 * the opposite case: see seedWorkouts.
 *
 * It is also what repairs a record written by an older build. A route that predates
 * records carrying their own GPX differs from its manifest entry, so this rewrites it with
 * the bytes — there is no separate backfill pass, because "changed" already covers it.
 *
 * Idempotent: an identical route is not rewritten, so booting twice does not churn
 * updatedAt, which a later sync layer would read as a genuine edit.
 *
 * Imported routes are untouched. Their ids are minted, so no manifest entry claims one.
 */
export async function seedRoutes(
  repository: Repository<StoredRoute>,
  routes: BundledRoute[] = bundledRoutes(),
): Promise<SeedResult> {
  const result: SeedResult = { written: [], unchanged: [] };

  for (const entry of routes) {
    const next = toStoredRoute(entry);
    const existing = await repository.get(entry.id);
    if (existing !== undefined && sameRoute(existing, next)) {
      result.unchanged.push(entry.id);
      continue;
    }
    // updatedAt is stamped by the repository on write.
    await repository.put({ ...next, updatedAt: existing?.updatedAt ?? '' });
    result.written.push(entry.id);
  }

  return result;
}
