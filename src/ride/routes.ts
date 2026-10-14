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
    // Backfill could not reach it: its file left the build. See backfillRouteSources.
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
  routes: BundledRoute[] = bundledRoutes(),
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

export interface BackfillResult {
  /** Ids given their GPX out of the build, because the record had none. */
  filled: string[];
  /** Names of records with no source and nothing in the build to fill it from. */
  orphaned: string[];
}

/**
 * Fills in the GPX of records written before a route carried one.
 *
 * Not seeding, and deliberately not gated on the seeded marker. Seeding decides whether a
 * route should exist in this install at all, and the marker is what makes a deletion
 * stick; this repairs records that already exist and were written by an older build, so
 * skipping it on a seeded install would mean it never ran anywhere it was needed. It
 * writes nothing a record already has and adds nothing the rider removed.
 *
 * The lookup is by id first and by file second. The id is the join routes/manifest.json
 * promises never to change — the file name it may; and the file is the only key left when
 * the id itself has gone from the manifest, which is how a route renamed in the build
 * still finds its bytes.
 *
 * What cannot be filled is left exactly as it is. The alternative is deleting a record
 * the rider may have ridden a dozen times, on the strength of a file having left the
 * build — the destructive answer to a problem whose honest answer is a row that says so.
 * Such a route keeps its name, its distances and its ride count, loses its sparkline, and
 * cannot be started: storedRouteGeometry returns unavailable for it everywhere. The names
 * come back so the caller can say which ones, once, rather than per row.
 */
export async function backfillRouteSources(
  repository: Repository<StoredRoute>,
  routes: BundledRoute[] = bundledRoutes(),
): Promise<BackfillResult> {
  const result: BackfillResult = { filled: [], orphaned: [] };

  const byId = new Map(routes.map((route) => [route.id, route.gpx]));
  const byFile = new Map(routes.map((route) => [route.file, route.gpx]));

  for (const stored of await repository.list()) {
    if (stored.gpx !== undefined && stored.gpx.trim() !== '') continue;

    const gpx =
      byId.get(stored.id) ?? (stored.file === undefined ? undefined : byFile.get(stored.file));
    if (gpx === undefined) {
      result.orphaned.push(stored.name);
      continue;
    }

    await repository.put({ ...stored, gpx });
    result.filled.push(stored.id);
  }

  return result;
}
