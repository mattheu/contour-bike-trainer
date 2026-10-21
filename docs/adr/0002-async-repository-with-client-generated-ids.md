# 0002. Async repository interface with client-generated ids

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

A full backend is the end goal. Phase 2 stores everything in the browser with IndexedDB, phase 5
moves it to a server, and the point of the storage layer is that **nothing above it changes when
that happens**. Tests and Playwright want a third implementation in memory.

The retrofits we are trying to avoid are all the expensive kind. Converting synchronous callers
to asynchronous ones touches every line that reads data. Moving from autoincrement keys to server
ids means renumbering records and rewriting every reference to them. Discovering that a list
endpoint returns megabytes per call happens the first time someone opens the history screen with
real rides in it.

## Decision

A narrow repository interface, uniform across all three implementations:

```ts
interface Repository<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  delete(id: string): Promise<void>;
}
```

with the following rules:

- **Every method is async**, even where the phase 2 implementation resolves immediately.
- **Ids are client-generated UUIDs** (`crypto.randomUUID()`), never autoincrement keys. A server
  accepts an existing record without renumbering it, and records created offline do not collide.
- **`updatedAt` on every record**, ISO 8601, stamped by the repository on every write, so a later
  sync layer has a conflict signal to work with.
- **Records are plain JSON-serialisable objects.** No class instances, no `Date` objects, no
  Blobs, no DOM references.
- **No queries beyond `list` and `get` by id.** Filtering and sorting happen in memory, which
  keeps a REST implementation trivial.
- **Bulk data lives in its own collection, keyed by its owner's id.** A ride's 1 Hz samples are
  roughly 7,200 objects for a two-hour ride. Holding them on the `Ride` record would make
  `rides.list()` unusable for the history screen and return megabytes per call over HTTP, so
  `Ride` keeps only the aggregates the lists render and `rideSamples.get(rideId)` fetches the
  rest. Deleting a ride deletes its samples.
- **A ride freezes the settings that produced it** — difficulty, FTP, `hrMax`, rider parameters.
  Otherwise changing your FTP silently re-zones every historic ride, and two rides of the same
  route at difficulty 20 and 80 look comparable when they are not.
- **One exception to client-generated ids:** a bundled route's id is declared in
  `routes/manifest.json`, not minted at runtime. Re-seeding into a fresh database must not orphan
  every `Ride.routeId`. Once rides reference a manifest id, that id must never change.

A single factory in `storage/index.ts` picks the implementation; nothing else in the app knows
which one is active.

## Consequences

- Phase 2 code is asynchronous in places where it does not need to be, and reads slightly more
  awkwardly than it would with a synchronous IndexedDB wrapper. That is the price of the phase 5
  swap being a factory change.
- Filtering and sorting in memory is fine for one rider's history and will not survive a
  multi-user or multi-year dataset. If that day comes it is a new ADR, not a quiet addition of
  query methods to this interface.
- Two-step reads are now normal: the history screen lists rides, then fetches samples for the one
  you opened. Any screen wanting samples for _many_ rides at once is doing N round trips, and
  should be designed against.
- Frozen settings mean historic rides do not improve when your settings do. A ride recorded with
  a wrong FTP stays wrong. Correcting one means editing the stored snapshot deliberately, which
  is the right amount of friction.
- Manifest ids are a permanent commitment. Renaming or regenerating a bundled route is fine;
  changing its id breaks history.
- The `updatedAt` stamp costs nothing now and buys nothing now either. It is there solely so that
  phase 5 has a conflict signal without a migration.
