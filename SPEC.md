# Contour — project spec

Contour is a minimal, gamification-free indoor cycling app. It connects to a Wahoo smart trainer over Bluetooth, lets you ride real routes with the trainer simulating the gradient, records the ride and exports it for Strava. No avatars, badges, drops, levels or leaderboards.

This document is the brief for building it. Where it says "default", make it a user setting with that default.

## Goals

- Ride a real-world route on a Wahoo trainer with realistic resistance.
- Follow a structured workout. Standalone, never laid over a route: in ERG the trainer holds the target whatever the gradient, so the terrain would be wallpaper. See [ADR-0016](docs/adr/0016-no-workouts-on-routes.md).
- Minimal UI: the numbers you need while riding, an elevation profile with a dot on it, a route trace.
- Record every ride, keep the history, export it to Strava.
- Small, readable, testable codebase that one person can maintain.

## Non-goals

- 3D graphics, other riders, group rides, chat.
- Native iOS/macOS apps. Web Bluetooth rules out Safari and iOS.
- Direct Apple Health integration. Strava is the route in; the Strava iOS app writes to Apple Health.

## Platform

Chrome on macOS, desktop only. Web Bluetooth is Chromium-only and unavailable on iOS at any version, so this is a hard constraint rather than a preference. The phone is a **view-only mirror** from phase 5, never a controller.

## Background operation — settled

**Decided 2026-10-13: the browser through phase 4, Electron from phase 5.** See
`docs/adr/0000-shell-and-tick-source.md` for the measurement and the reasoning. In short: a real
KICKR CORE run showed Chrome did *not* throttle a hidden tab's timer over 12 minutes 38 seconds —
756 ticks where intensive throttling would have given about 13 — but that contradicts Chrome's own
documentation, so it is not ground to build on permanently. Electron's `backgroundThrottling: false`
is a contract; an undocumented exemption in a self-updating browser is not.

The switch is deferred to phase 5 because that is when a server becomes the source of truth for
rides, so the one expensive cost of changing shell — ride history not surviving the origin change —
expires on the date it would otherwise be paid.

**One rule holds in the meantime: nothing under `src/` may import anything Electron.** Shell
capability goes behind a narrow interface, as `Trainer` and `Storage` already do. Hold that and the
renderer stays a plain web app Electron wraps; lose it and there are two applications.

The original framing of the question follows, since it is why the app is instrumented the way it is.

## Background operation — the original question

The end goal is riding while a video plays full screen over the app, with a phone showing live data. That makes the app's behaviour when it isn't the visible window a first-order design constraint, and it is **not currently settled**.

What is established:

- Chrome clamps `setInterval` in hidden tabs to roughly once per minute after five minutes. A timer-driven engine would stall outright.
- Screen Wake Lock is released by specification when the document becomes hidden. It cannot keep a backgrounded tab alive.

What is assumed but unverified, and matters most:

- **That Web Bluetooth `characteristicvaluechanged` events keep arriving at full rate in a hidden renderer.** Chrome exempts tabs holding certain active connections from freezing, so this is plausible — but if it's wrong, a notification-driven tick fails in exactly the scenario it exists for.
- That control point writes still reach the trainer from a hidden tab.

### The two shells

**Browser (Chrome tab).** Zero extra build machinery, open a URL, Playwright drives it directly. Depends entirely on the assumption above holding.

**Electron.** `webPreferences: { backgroundThrottling: false }` disables the throttling outright — a documented switch, not a workaround, and it doesn't depend on how the trainer behaves. `powerSaveBlocker` handles display sleep properly. Node runs in-process, so phase 5's phone mirror becomes a WebSocket server inside the app on the local network: no deployment, no hosting, no auth. That last point removes more work than the throttling fix does.

The costs: Electron ships no Bluetooth device chooser, so the app handles `select-bluetooth-device` and provides its own picker. Playwright drives Electron through `_electron.launch()`, which works but is less well-trodden. Unsigned local builds need right-click-to-open on macOS, which is acceptable for personal use. Roughly a day of setup, and a permanently slightly heavier dev loop.

### Deciding

Both shells run the same Vite build and the same `Trainer` interface, so the option costs nothing to keep open. Phase 1 measures the behaviour rather than guessing at it, and the result is recorded as ADR-0000 before phase 2 starts. See *Decision gate* below.

## Stack

- Vite + TypeScript + React. Vite is a build tool, not an architectural commitment — it is reversible in an afternoon and `electron-vite` assumes it if the phase 1 gate goes that way.
- React owns screens, the HUD, controls and forms. **Everything outside `src/ui/` is plain TypeScript with no React import**, and that boundary is the point: see *Keeping logic out of React* below.
- Inline SVG for the elevation profile and route trace. React renders the container and the static parts; the chart modules own the rider dot and the ridden-portion path and mutate them directly through a ref. Each chart splits in three: a pure geometry module that is fully tested, a thin React renderer, and an imperative `update()` handle. `PowerStrip` is the exception — its zone washes are a variable number of paths with no fixed node set to write to, so only its current-reading label goes through the ref. This is for ownership clarity rather than performance — 1 Hz is trivially cheap for any renderer. No canvas or WebGL unless SVG measurably struggles.
- Tailwind for styling. Chosen less for velocity than for consistency: plain CSS accumulates ad-hoc class names and near-duplicate rules across features, and there is no cascade to reason about with utilities. Design tokens — accent colour, dark palette, monospace scale — are defined once in the theme block.
- Web Bluetooth for trainer and heart rate.
- Vitest for unit tests, Playwright for integration tests.
- ESLint + Prettier. ESLint specifically rather than Biome, because `eslint-plugin-react-hooks` catches missing dependencies and stale closures, which is the failure mode this project is most exposed to.
- npm. Simple over clever. Short comments that say why, not what.

### Dependencies

Few, and each chosen for a stated reason rather than habit.

| Package | Why this one |
|---|---|
| `react`, `react-dom` | See ADR-0001 |
| `tailwindcss` | Above |
| `fast-xml-parser` | GPX parsing. **Not `DOMParser`**, which is built in and free but is a DOM API — it would make `route/gpx.ts` untestable in plain Node and pull happy-dom into Vitest to parse a text file, breaking this spec's own rule that nothing outside `ui/` touches the DOM |
| `yaml` | Workout parsing. **Not `js-yaml`**: phase 3 requires validation errors that name the offending line, and `yaml` reports line and column on parse failures |
| `idb` | IndexedDB wrapper, about 1 KB. The raw API is callback-shaped enough that hand-rolling it is a false economy |

Deliberately absent, so they don't creep in later:

- **No `uuid` package.** `crypto.randomUUID()` is built into browsers and Node.
- **No date library.** `Intl.DateTimeFormat` and arithmetic on seconds cover everything here.
- **No router library.** Hash routing is about thirty lines of pure code — a listener and a parse function — added in [ADR-0018](docs/adr/0018-hash-routing.md) once a confirmation made back safe mid-ride. The screen is still derived state; the hash is a view of it, not the source.
- **No state management library.** Ride state lives in a plain TypeScript store outside React; there is nothing for Redux or its descendants to do.
- **No React Testing Library.** Playwright covers the UI and Vitest covers the logic. A third layer would test the least valuable seam.
- **No chart or component library.** The profile, trace and workout chart are hand-written SVG.

### A note on library versions

Tailwind v4 moved configuration into CSS (`@theme`); most training data describes v3 (`tailwind.config.js`, `@tailwind base`). The same hazard applies to any dependency that has recently changed its public shape. Record the version and its conventions in `CLAUDE.md` so local context overrides the model's prior, and check generated setup code against the installed version rather than assuming it.

## Design

`design/DESIGN.md` is the source of truth for the visual rules — palette, type scale, marks, controls and motion — and `design/mockups/*.html` is the source of truth for layout. Where this document and the design system disagree, the design system wins; the accent colour is the known case.

Three decisions taken when the design landed:

- **The ghost rider is deferred to phase 4.** It appears in the design's ride settings panel, but racing a previous ride needs a replay model and a second position rendered on every chart. Phase 2's settings panel ships without it.
- **The phone and tablet mockups are phase 5 mirror designs, not phase 2 responsive layouts.** Web Bluetooth does not exist on iOS, so a phone can never run a ride; building those layouts now would mean building screens nobody can use until the mirror exists.
- **Alerts are a three-level system** (`design/DESIGN.md` > Alerts, with `design/mockups/alerts.html`): info clears itself after 5 s, warning stays until dismissed or resolved, fault blocks the ride and offers Retry. One 48 px full-width strip under the header, sliding in over 0.3 s. The `alert` token (`#F2C14E`) is for system messages only and never appears in ride data; red is never used.

## Architecture

Three abstractions carry the whole design. Get them right and every later phase is additive.

### 1. Storage

A full backend is the end goal. Phase 2 stores everything in the browser, phase 5 moves it to a server, and **nothing above the storage layer should change when it does.**

```ts
// src/storage/types.ts
export interface Repository<T extends Record> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface StoredRecord {
  id: string;         // client-generated UUID, never an autoincrement key
  updatedAt: string;  // ISO 8601, stamped by the repository on every write
}

export interface Storage {
  routes: Repository<Route>;
  rides: Repository<Ride>;          // aggregates only
  rideSamples: Repository<RideSamples>;  // id === the Ride's id
  workouts: Repository<Workout>;
  settings: SettingsRepository;     // get(): Settings; put(patch: Partial<Settings>)
}
```

Rules that make the phase 5 swap cheap, all of which are expensive to retrofit:

- **Every method is async**, even where the phase 2 implementation resolves immediately. Converting a synchronous caller to an asynchronous one later touches every line that reads data.
- **IDs are client-generated UUIDs.** A server accepts an existing record without renumbering it, and offline-created records don't collide.
- **`updatedAt` on every record**, so a later sync layer has a conflict signal to work with.
- **Records are plain JSON-serialisable objects.** No class instances, no `Date` objects, no Blobs, no DOM references.
- **No queries beyond `list` and `get` by id.** Filtering and sorting happen in memory. This keeps a REST implementation trivial.
- **Bulk data lives in its own collection, keyed by its owner's id.** A ride's 1 Hz samples are roughly 7,200 objects for a two-hour ride, so holding them on the `Ride` record would make `rides.list()` unusable for the history screen and return megabytes per call over HTTP. `Ride` keeps only the aggregates the lists render; `rideSamples.get(rideId)` fetches the rest. Deleting a ride deletes its samples.
- **A ride freezes the settings that produced it** — difficulty, FTP, `hrMax` and the rider parameters. Without that, changing your FTP silently re-zones every historic ride, and two rides of the same route at difficulty 20 and 80 look comparable when they are not.
- **One exception to client-generated ids**: a bundled route's id is declared in `routes/manifest.json`, not minted at runtime, so re-seeding into a fresh database does not orphan every `Ride.routeId`. Once rides reference an id it must never change.

Implementations: `storage/indexeddb/` (phase 2, the real one), `storage/memory/` (tests and Playwright seeding), `storage/http/` (phase 5). A single factory in `storage/index.ts` picks one; nothing else in the app knows which is active.

### 2. Trainer and sensors

Web Bluetooth cannot be driven by Playwright and needs hardware present, so the BLE layer sits behind an interface with a fake implementation from phase 1. This is what makes the tests deterministic and lets the app be developed without the trainer plugged in.

```ts
// src/ble/types.ts
export interface Trainer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(cb: (d: BikeData) => void): void;      // power, cadence, speed
  onStateChange(cb: (s: ConnectionState) => void): void;
  setTargetPower(watts: number): Promise<void>;  // ERG
  setGrade(percent: number): Promise<void>;      // simulation
}

export interface HeartRateMonitor {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(cb: (bpm: number) => void): void;
}
```

`FtmsTrainer` talks to real hardware. The FTMS byte-level encoding and decoding lives in `ftms.ts` as pure functions, tested against captured fixtures, separate from the Web Bluetooth plumbing that calls it.

**`FakeTrainer`** is a software stand-in implementing the same interface, emitting a scripted power, cadence and speed series instead of talking Bluetooth. Selected with `?fake=<script>` in the URL; nothing else in the app knows which implementation it has. It exists because:

- A trainer cannot be paired to a CI runner, so without it there are no integration tests.
- Playwright cannot drive Web Bluetooth at all — there is no device to grant permission to and no chooser to click.
- A real trainer produces different numbers on every run, so an exported TCX could never be asserted against. A scripted series is byte-identical each time.
- Day to day, checking a layout change shouldn't require being sat on the bike in cycling shoes.

Scripts: `constant` (steady 200 W), `ramp` (power rising over time), `intervals` (for the phase 3 workout runner), `dropout` (goes silent mid-ride then returns, exercising the 10-second grace period and reconnect handling without unplugging hardware).

In ERG mode the fake moves its reported power toward the last target it was given rather than ignoring commands, so the workout runner has something realistic to work against instead of only being testable on the bike.

### 3. Ride engine

```ts
export interface Clock { now(): number; }
```

The engine takes a `Clock` and a tick source rather than calling `Date.now()` and `setInterval` itself, so tests can run a 40-minute ride in milliseconds and the tick source can be swapped without touching the engine.

**What drives the tick in production is an open question, settled by the phase 1 experiment — see *Background operation* below.** The candidates are a timer, incoming Indoor Bike Data notifications, or neither because the app is an Electron shell with throttling disabled. Keeping the tick source injectable means the engine is written once regardless of which wins.

### Keeping logic out of React

React is capable enough to absorb the whole app, and letting it would destroy the testability the rest of this spec depends on. The boundary is therefore explicit:

- The ride engine is a plain TypeScript class with `subscribe(cb)` and a snapshot getter. It knows nothing about React and runs headless in Vitest.
- React attaches with `useSyncExternalStore`. No `useEffect` polling the engine, no interval inside a component, no stale-closure hazard — the subscription is the only connection.
- BLE connections, the engine and the storage layer are created once at startup and passed down through context. They are never created inside a component.
- No hook computes anything a Vitest test should own. If a calculation is worth testing, it belongs in `physics`, `route`, `workout` or `ride`, and the component only displays its result.

The practical effect is that the components are close to stateless renderers, and the parts of React that are genuinely fiddly — effect dependency arrays, stale closures over timers, synchronising external sources — mostly don't arise, because there is only one subscription and it is a solved pattern. Local `useState` is for local interaction only: which screen is open, whether a panel is expanded, the unsaved text in the workout editor.

### Module layout

```
src/
  ble/
    types.ts          Trainer, HeartRateMonitor, BikeData, ConnectionState
    ftms.ts           pure encode/decode: Indoor Bike Data, control point messages
    ftms-trainer.ts   Web Bluetooth implementation of Trainer
    hrm.ts            Heart Rate Service
    fake-trainer.ts   scripted power for dev and Playwright
  route/
    gpx.ts            parse GPX -> Route { points: {lat, lon, ele, dist}[], totalDistance }
    grade.ts          grade at a distance, smoothed over a lookahead window
    position.ts       distance -> interpolated lat/lon/ele
  physics/
    speed.ts          speed from power, grade and rider parameters
  workout/            (phase 3)
    parse.ts          YAML -> Workout, with validation errors that name the line
    runner.ts         elapsed seconds -> target power
  ride/
    engine.ts         tick: read power, advance distance, pick grade, command trainer, emit sample
    recorder.ts       accumulate samples into a Ride
    clock.ts          Clock interface and the real implementation
  storage/
    types.ts          Repository, Storage, record shapes
    indexeddb/        phase 2
    memory/           tests
    http/             phase 5
    index.ts          factory
  export/
    tcx.ts            samples -> TCX string
  ui/
    store.ts          plain TS observable store; the engine writes, React subscribes
    projection.ts     lat/lon to a local plane, fitted to a viewport box
    charts/           geometry as pure tested modules, thin renderers over them:
                      path, elevation, power, map + ElevationProfile, PowerStrip,
                      RouteMap, Sparkline
    components/       design-system primitives: Hero, Stat, ZoneLadder, Segmented,
                      Button, IconButton, AppHeader, RideHeader, ListRow,
                      SettingsPanel, GradientKey, Alert
    screens/          Connect, Routes, Ride, Rides, Settings
    App.tsx           screen routing
index.html            mount point only
routes/               bundled GPX files plus a manifest.json
docs/                 usage documentation (phase 2 onwards)
docs/adr/             architecture decision records (phase 2 onwards)
```

Nothing in `physics`, `route`, `workout`, `export` or `storage` may touch the DOM or Bluetooth.

## Bluetooth details

FTMS (Fitness Machine Service), UUID `0x1826`.

**Indoor Bike Data** `0x2AD2`, notify. Parse the flags word and extract instantaneous speed, cadence (0.5 rpm units) and instantaneous power (int16 W). Fields we don't use still have to be parsed for their offsets to be correct.

**Fitness Machine Control Point** `0x2AD9`, write + indicate. On connect send `Request Control (0x00)` then `Start/Resume (0x07)`, waiting for the indication response before each next write.

- `Set Target Power (0x05)`: int16 watts. ERG mode.
- `Set Indoor Bike Simulation Parameters (0x11)`: wind speed int16 (0.001 m/s), grade int16 (0.01 %), Crr uint8 (0.0001), Cw uint8 (0.01 kg/m). Simulation mode.

Write at most once per second, and only when the value has actually changed — grade by at least 0.1 %, power by at least 1 W. Trainers respond badly to being spammed.

**Disconnects**: show the state clearly, offer reconnect, keep the ride running on the last known power for up to 10 s before pausing automatically.

**Heart Rate Service** `0x180D`, measurement characteristic `0x2A37`, notify. Optional; the app works without it.

Cadence comes from Indoor Bike Data. Don't add the separate CSC service unless the trainer turns out to omit it.

Modern KICKR, CORE and SNAP all speak FTMS. If the actual trainer fails FTMS discovery, add `wahoo.ts` for the proprietary service then — not before.

## Physics

Standard cycling power model, solved for speed on each tick:

```
P = (m·g·Crr·cosθ + m·g·sinθ + 0.5·ρ·CdA·v²) · v / η
```

m = rider mass + bike mass (75 kg + 9 kg), g = 9.81, ρ = 1.225, CdA = 0.32, Crr = 0.004, η = 0.97.

Solve for v by bisection on the cubic. On a steep descent with zero power, v comes from the gravity/drag balance and is not capped: drag rises with the cube of speed, so every gradient has a terminal velocity of its own and the solver finds it. The bisection needs an upper bracket, which sits far above any speed the physics can produce rather than being a limit. Advance distance by v × dt.

**Speed always uses the real route grade, never the trainer-scaled one.** Difficulty changes how the hill feels, not how fast you climb it. This matches Zwift and is the difference between a difficulty setting and a cheat.

Unit tested against hand-checked values — 200 W on the flat with defaults should give 33–34 km/h.

## Trainer difficulty

Integer 0–100, default 50. The grade written to the trainer is `trainerGrade(routeGrade, difficulty)` — a named, tested function rather than an inline multiplication, so the rule below has something to assert against instead of a comment hoping someone reads it.

**The ±20 % trainer ceiling is applied inside that function and nowhere else.** It is a property of the hardware, not of the terrain. An earlier version clamped at the single source of grade, upstream of both the control point and the physics, so a real 25 % wall was ridden as if it were 20 % — a device limitation silently making the ride faster than the route, with nothing visibly failing. Spike filtering belongs upstream of the physics because a spike is noise; the hardware ceiling does not, because a mountain is not noise. At 100 the trainer reproduces the route exactly, at 0 it stays flat. It applies to descents too: −8 % at difficulty 50 becomes −4 %. Adjustable mid-ride from the settings panel without stopping.

## Routes

- Phase 2 ships GPX files committed to `routes/` with a `manifest.json` listing name, distance, elevation gain and file. No upload in v1; adding a route means dropping the file in and adding a manifest entry.
- Parse track points to lat/lon/ele, compute cumulative distance with the haversine formula, drop points without elevation.
- Grade over a lookahead window, default 30 m, clamped to ±30 % — a physical plausibility bound that rejects GPS elevation spikes. **This is not the trainer's range**; see Trainer difficulty.
- Position by linear interpolation between neighbouring points.
- Reaching the route end ends the ride, with a finish flag in the recording. No looping in v1.

### The bundled routes

Real places, six of them, chosen to be worth riding rather than to demonstrate anything: Greenhow Hill, Settle to Grassington, Rosedale Chimney, Box Hill, Sa Calobra and Alpe d'Huez. The name is the place and the line under it is where that place is, so a row reads "Box Hill / Surrey, UK" rather than repeating the country in both. Each is a GPX plus a manifest entry, and an imported route is indistinguishable from a bundled one except that it can be removed.

This replaces two synthetic routes generated by a committed script. They were reproducible and tunable, which is a real thing to give up — but they were also the first two things a rider saw, and an app about riding real roads should not open on `Test Route 1 — Rolling`.

**What they were for still matters, and the job moved rather than disappeared.** They were chosen to exercise specific paths: near-continuous grade change, which stresses the once-per-second and ≥0.1 % control point write thresholds and catches any spamming of the trainer; a sustained climb with a ramp, which exercises grade clamping; and a fast descent reaching the zero-power gravity and drag balance. Those paths are now exercised by `test/fixtures/` alone — see [ADR-0011](docs/adr/0011-test-fixtures-are-not-routes.md), which is where the rule lives.


### Test fixtures are not routes

Kept separate under `test/fixtures/`, because the two have opposite requirements. Rideable routes are long enough to be worth riding; fixtures are small enough to hand-compute and fast enough to run in a loop. A 1 km flat, a single constant 10 % climb, and a steep descent give exact expected values for the physics, grade and position tests, and let a Playwright run ride a route to completion in seconds rather than making assertions against a 30 km profile nobody can verify by eye.

### Map view

The "map view" is not a tile map — no network dependency, no attribution, no API key, and it works offline. The mockups show more than a bare trace, though: a smoothed cubic-bezier polyline in the route's own projected space, a muted full trace under an accent ridden prefix, a start marker, a rider dot with a halo, a north arrow, a metric scale bar, and a pan/zoom transform with clipping for the 500 m view. It is a second chart, not a reuse of `profile.ts`. If a real basemap is wanted later, that's a phase 4 decision with its own ADR.

## Zones

Neither ladder's scale was written down; both were recovered by fitting the mockups.

The lit segment says which zone you are in now; a separate accent band says what you are aiming at.

**Power — the six Coggan zones**, as fractions of FTP: 1 active recovery under 55 %, 2 endurance 55–75, 3 tempo 75–90, 4 threshold 90–105, 5 VO2 max 105–120, 6 anaerobic over 120.

The spans are uneven because the physiology is: threshold work sits at 90–105 % of FTP, not wherever an even split would put it. An earlier version of this spec used five even 20 % splits, on the grounds that the ladder was only an orientation aid. That stopped being true once a workout states its targets as a percentage of FTP and the ladder has to show whether 90 % is threshold. Six rather than five because zone 5 and zone 6 are different systems — a 5x3 at 115 % is not the session that 30-second efforts at 140 % are.

**Heart rate — five zones** as percentages of `hrMax`: under 60 %, then 60–70, 70–80, 80–90, over 90.

Five against power's six is correct rather than inconsistent. Power is instantaneous and unbounded, so 140 % of FTP for thirty seconds is a different system from 115 % for three minutes and the model separates them. Heart rate is lagged and capped: it cannot exceed your maximum and takes minutes to respond, so those two efforts land nowhere distinguishable on it. There is nothing a sixth heart-rate zone could mean.

**The ladder has no absolute axis.** It is five equal segments, and a value's position is its zone plus how far through that zone it sits. Zones 1 and 5 are open-ended, so their fractions clamp at the edges. An earlier draft of this document gave axes of 100–400 W and 90–190 bpm; those were inferred from mockup pixels and were never real.

**Targets** render as an accent band across the same ladder: the target value ± `targetMarginPct` (default 5, as `design/mockups/ride-settings.html` has it), as a percentage of the target rather than of FTP. The band is nearly pointless in ERG, where the trainer holds the target for you; it earns its place in simulation and free riding, and ± 5 % is roughly the breath-to-breath variation of someone genuinely holding steady, which is what makes leaving it mean something. At ± 10 % you would never leave it, and a signal that never fires is worse than none.

All of it lives in `src/zones/` as pure, tested functions.

## Route analysis

The elevation profile needs considerably more than `grade.ts`'s point query, and it has no home in the module layout as originally drawn. It belongs in `src/route/profile.ts` and `src/route/climbs.ts`, both pure:

- **Gradient bins**: 250 m bins, uphill only, classified 2–4 / 4–7 / 7–10 / >10 %, with contiguous same-class bins merged into single runs for filling.
- **Climb detection**: segment the route into climbs and emit each summit's distance and the climb's gain, which is what the `+188 m` tick labels — the gain, not the summit elevation.
- **Cumulative ascent** as a series, so `climbed 212 / 512` has both halves.
- **Window projection** for the 5 km and 500 m zoom modes. Bins stay 250 m and simply render wider.

## Recording and export

Sample at 1 Hz: timestamp, distance, speed, power, cadence, heart rate, lat, lon, elevation. Pause stops the clock; resuming carries on from the same distance.

On finish, build a TCX (`TrainingCenterDatabase`, one Activity of sport Biking, one Lap, Trackpoints with Position, AltitudeMeters, DistanceMeters, HeartRateBpm, Cadence and `ns3:TPX/Watts`) and download it as `contour-YYYY-MM-DD-HHmm.tcx`.

TCX rather than FIT for v1: plain XML, accepted by Strava, no binary encoder to write or debug. Revisit only if Strava rejects something we need.

## Settings

| key | default |
|---|---|
| controlMode | `simulation` |
| trainerDifficulty | 50 |
| riderMassKg | 75 |
| bikeMassKg | 9 |
| ftp | 200 |
| hrMax | 190 |
| targetMarginPct | 5 |
| workoutScalePct | 100 |
| targetPowerW | null |
| targetCadenceRpm | null |
| targetHeartRateBpm | null |
| cda | 0.32 |
| crr | 0.004 |
| gradeLookaheadM | 30 |
| units | metric |

Metric only in v1; `units` exists so the setting has somewhere to live when imperial arrives.

---

# Phases

## Phase 1 — Proof of concept

Web app only, no design, no tests, no persistence. Prove the hardware works.

1. Connect to the trainer over FTMS and to an HRM. Show connection state plainly.
2. Free ride: live power, cadence, heart rate.
3. Control panel with a mode toggle:
   - **ERG**: target power slider, 50–400 W in 5 W steps.
   - **Simulation**: grade slider, −10 % to +20 % in 0.5 % steps.
4. `FakeTrainer` behind `?fake=` so the app runs without hardware.
5. **The background experiment.** See below — this is a primary objective of the POC, not a side quest.

Building both control modes here is deliberate: ERG is the FTMS opcode phase 3 needs and simulation is the one phase 2 needs, so every control-point write path is proven against real hardware before anything is built on top of it.

### The background experiment

Instrument the POC to log, with high-resolution timestamps, every Indoor Bike Data notification, every tick of a plain `setInterval(1000)` running alongside, every control point write and its indication response, and every `visibilitychange`. Dump the log to JSON.

Then run the same ten-minute session under four conditions:

| # | Condition | Question it answers |
|---|---|---|
| 1 | Chrome, window visible and focused | Baseline inter-arrival rate |
| 2 | Chrome, window visible but unfocused | Does merely losing focus matter? |
| 3 | Chrome, window fully hidden behind a full-screen video | **The one that decides it** |
| 4 | Electron spike, `backgroundThrottling: false`, hidden | Does Electron actually fix it? |

Condition 3 needs at least ten minutes, because Chrome's intensive throttling only engages after five.

For each, record the notification inter-arrival distribution, whether the timer was clamped, whether control point writes still landed, and whether any samples were lost. Condition 4 means building a minimal Electron shell — around half a day, including the `select-bluetooth-device` handler. Worth it: guessing at this decision costs far more than measuring it.

**Done when:** the real trainer connects, power and heart rate display live, both sliders produce a resistance change you can feel, and the experiment log exists for all four conditions.

## Decision gate — phase 1 to phase 2

Do not start phase 2 until these are settled and written up.

**1. Shell: browser or Electron.** Decided by the experiment, recorded as ADR-0000 with the measurements in it.

- Notifications survive condition 3 intact → stay in the browser, drive the tick from notifications, revisit only if phase 5 needs Node.
- Notifications are throttled or dropped in condition 3 → Electron, and phase 5 gets simpler as a consequence.
- Ambiguous, or the browser works but marginally → Electron. A ride that silently loses data an hour in is worse than a heavier dev loop, and the phase 5 saving breaks the tie.

**2. Tick source**, which falls out of the shell decision.

**3. Whether the trainer speaks FTMS**, verified on first connect rather than assumed.

**4. Does the trainer behave under sustained control point writes** — any drift, lag or refusal over a long session, and does it hold an ERG target cleanly.

Phase 2's engineering standards (docs, ADRs, tests, CI) start at this gate. ADR-0000 is the exception that gets written at the end of phase 1, because phase 2 is built on top of its answer.

## Phase 2 — MVP

Everything from here on carries documentation, ADRs, tests and CI. See *Engineering standards* below.

1. Storage layer with the IndexedDB implementation.
2. Route list from the bundled GPX set; pick one and ride it.
3. Simulation-mode riding: real-grade physics for speed, scaled grade to the trainer, difficulty slider live during the ride.
4. Ride screen: dark, one accent colour, large monospace numbers. Power, cadence, heart rate, speed on top; distance ridden against total, elapsed time, current real grade and elevation gained below. Elevation profile with the ridden portion in the accent colour and a rider dot. Route trace below it with the same dot. Start, pause/resume and end controls. Space bar toggles pause.
5. Rides recorded, stored and listed as a history with date, route, distance, time and average power.
6. TCX export from the ride screen and from any entry in the history.

**Done when:** a full route can be ridden end to end on the real trainer, the difficulty slider noticeably changes resistance mid-ride, and the resulting TCX uploads to Strava with a map and a power curve.

### Phase 2 decisions

Taken after the design mockups were analysed against this spec:

- **No import UI.** Routes are the bundled GPX files with a manifest entry, exactly as above. The design's accent `Import GPX` button is dropped from the routes screen for phase 2; GPX *parsing* is still required, just not a file picker.
- **The Workouts tab is hidden** until phase 3, rather than shipping an empty screen. The segmented nav is a shared component and its widths will shift when the third tab arrives; that is accepted.
- **Connect, post-ride summary and TCX export have no mockups** and are extrapolated from `design/DESIGN.md` using the existing components and rules, then reviewed against the built screens.
- **Fonts are self-hosted**, not CDN-linked as in the mockups. Offline operation is a stated virtue elsewhere in this spec and a webfont request is the one thing that would break it.
- **Lists scroll within their own region**, with the header and segmented nav fixed. The mockups show six rows in a fixed viewport with no defined overflow behaviour; the no-scroll rule applies to page chrome, not to an unbounded collection.
- **Where a mockup contradicts `design/DESIGN.md`, the written rule wins.** The motion reference uses an overshoot curve that the design system explicitly forbids; the rule stands and the curve does not.

## Phase 3 — Workouts

1. **The workout format.** YAML, hand-written in a textarea, validated on save with errors that name the offending line. Our own format, not Zwift's `.zwo` — see ADR-0006. A full example, which is also the whole grammar:

   ```yaml
   name: 2x20 threshold
   description: Two long blocks at threshold, five easy between. # optional
   ftp: 250 # optional; falls back to the rider profile

   warmup: { duration: 10m, ramp: [50%, 75%] }

   steps:
     - repeat: 2
       steps:
         - { duration: 20m, power: 95%, cadence: 90 }
         - { duration: 5m, power: 55% }
     - { duration: 3m, power: 65% }

   cooldown: { duration: 10m, ramp: [60%, 40%] }
   ```

   **`warmup` and `cooldown` are ordinary steps given their own keys**, so they come first and last whatever the file does, and the screen can name them without the author writing a label. They are optional, and anything they can hold a step in `steps` can hold too — a warmup is a ramp with a job, not a different kind of thing.

   **Duration** — `90s`, `10m`, `1h30m`. Required on every step.

   **Power**, one of:
   - `power: 95%` — a percentage of FTP
   - `power: 250W` — absolute watts, for when you mean a number rather than a fraction
   - `ramp: [50%, 75%]` — linear between the two over the step, in either direction, and the two ends may mix forms
   - `power: free` — no target. ERG releases and you ride as you like

   **A free block is a control-mode change, not a step type**, which is the only thing in this format that reaches the trainer differently. FTMS switches mode by which command you send — `Set Target Power` puts the trainer in ERG, `Set Indoor Bike Simulation Parameters` takes it out — so a free block simply sends simulation parameters instead, and the next targeted step sends a target power again. No mode command, no special handling.

   What it simulates follows the ride: **no route, flat** — zero gradient, resistance rising with speed as it would on a level road; **over a route** (phase 4), the route's own gradient, which is what free riding means when there is terrain under you. The screen's ERG indicator reads off during the block, which is what that indicator is for.

   `MaxEffort` in Zwift's format is this with a name, so `{ duration: 30s, power: free, name: Max effort }` covers it.

   **Cadence** is optional: `cadence: 90`, or `cadence: [85, 95]` for a range. It is a target shown to the rider, never something written to the trainer — the trainer holds power, the legs choose the gear.

   **`description`** is optional on the workout: a line saying what the session is for, shown where a workout is picked. The name says what it is; the description says why you would ride it.

   **`name`** is optional on any step and is what the Steps panel shows — `Sweet spot`, `Recovery`. A step inside a `repeat` carries its name into every expansion, so three sweet-spot blocks all read as such. `warmup` and `cooldown` are named for free. An unnamed step shows its target alone: no name is derived from its power, for the same reason no intensity label is (see the workouts list) — a guess dressed as a measurement is worse than a blank.

   **`repeat`** takes a count and its own `steps`, and nests. Writing 4x4 by hand as eight blocks is how a format stops being hand-writable.

   **Deliberately left out: timed text prompts.** Zwift's `textevent` shows a message partway through a step ("settle in", "two minutes to go"). The Steps panel already names what you are doing and what comes next, which covers most of why those exist, and the rest is coaching tone rather than information. Not ruled out for good — just not worth a UI surface and a timing concern in phase 3.

   **The stored record keeps the YAML source**, not a parsed tree. Comments and layout survive a round trip through the editor, the file the rider wrote is the file they get back, and the parse is a pure function from that text. Errors carry a line and column, for semantic failures as well as malformed YAML — `yaml`'s AST keeps node ranges, so "step 3 has no duration" can point at the line rather than the index.

2. Workout runner: elapsed time to target power, driving the trainer in ERG mode.
3. **The workout screen.** Three primaries — power, cadence, heart rate — with power shown as actual against target (`246 W / 239`, labelled `target 90 % FTP`). Cadence gets a target band rather than zones, because a cadence target is a request, not a measurement of effort.

   **Workout difficulty sits in the header's action group**, beside Pause and End ride: a three-part control — minus, the current percentage, plus — sharing edges like the other button groups. It scales every power target in the session, 5 % a press, clamped 50–150 %.

   It belongs in the header rather than the settings panel because of when it is used. Trainer difficulty is set once for a route and lives in the panel; this is reached for in the third minute of a twenty-minute block, when opening a panel is the last thing anyone wants. It appears only during a workout — on a free ride there are no targets to scale.

   **It is not trainer difficulty and must not be built as though it were.** Trainer difficulty scales the gradient written to the trainer and deliberately never changes how fast you move (ADR-0008). This changes the work itself: at 80 % you do roughly 64 % of the TSS, because load scales quadratically with intensity. The setting is `workoutScalePct` — not `workoutDifficulty`, which would sit beside `trainerDifficulty` while behaving nothing like it, and not anything with "intensity" in it, which already means two other things here.

   **A `Ride` freezes the scale it was ridden at**, alongside FTP and trainer difficulty. Without it, "2x20 threshold" is ambiguous for ever and two sessions with the same name are not comparable. The planned TSS on the workouts list is the figure at 100 %; what you actually earned comes from recorded power, so it is right regardless.

   **Four secondaries: interval time, workout time, distance, speed. No gradient.** With no route the gradient is zero for the whole session, and a readout pinned at `0.0 %` for an hour is worse than no readout. Distance and speed stay because they still mean something — the physics runs at zero grade, so you cover ground.

   **A Steps panel lists the whole workout**, headed with its count and total (`8 · 63 min`): every step numbered, named, with its target and its duration — `2 Sweet spot 90 % 10:00`. The current step counts down in place, so its figure matches the interval clock. A `next` line names what follows, and an indicator shows whether ERG is engaged.

   It lists the whole session rather than only what remains: seeing step 4 of 8 with two sweet-spot blocks still below it is what tells you where you are in the work. The accent and muted rule applies down the list exactly as it does along the elevation profile — done behind you, plan ahead.

   The list reads off the expanded step list — `repeat` blocks flattened into the steps actually ridden — which is the same expansion the runner uses, so the two cannot disagree. That expansion is tested once, in the parser, rather than twice in two places that must match.

   **A skip control in the panel's header** ends the current step and starts the next. One control rather than one per row: only one step is ever current, so there is nothing to choose between. No confirmation — it is not destructive, and a dialogue three minutes into an interval is worse than an occasional mis-tap.

   **Skipping truncates the step to what was actually ridden**, which is what makes the clock honest. Skip a ten-minute block at 6:42 and the session is 3:18 shorter: the workout clock's total becomes completed time plus the plan that remains, so it answers "how long will this be" rather than "how long was it meant to be". A fixed total that you then finish early is a number that stops being true the moment you use the button.

   Skipping the last step finishes the workout. The recorded ride needs no special handling either way — the samples are what happened, and its TSS comes from actual power, so a skipped session scores what it earned without anything having to track the skip.
4. **The workouts list.** One row per workout: a sparkline of the plan's shape, its name, its length, and its load in TSS. Pick one, ride it, and see completed workouts in the history. All stored through the same storage layer.

   **The accent action is "New workout"**, opening the editor on an empty file. Selecting a row opens it for editing. The slot is free because `Import .zwo` is dropped, and there is no editor artboard, so this is the smallest thing that fits what is drawn.

   **Starter workouts ship with the app**, seeded on first run exactly as the bundled routes are: files under `workouts/` with a manifest declaring each one's id. A fresh install should not be an empty list and a blank textarea for a format nobody has seen. Five of them — Thirty by thirty, Sweet spot 3x9, Over-unders, VO2 max 5x3 and Aerobic builds — chosen as sessions worth riding and written in the forms a session of that shape would naturally use. They are not the format's documentation: that is the reference beside the editor, and `manual-tests/format-test.yaml`, which uses every part of the grammar and ships with the repository rather than with the app, precisely so it never appears in a rider's list.

   **A `Ride` records which workout it was.** It carries `routeId` and `routeName` already; it gains `workoutId` and `workoutName`, nullable and frozen the same way, because a completed session that cannot say what it was is not history. The rides list shows workout rides alongside route rides, naming the workout where there is one.

   **No intensity column and no intensity filter.** `design/mockups/Workouts.dc.html` has both, labelling workouts Endurance, Tempo, Threshold or VO2 max — but there is no standard mapping from a plan to those words, so any boundaries would be invented precision dressed as a measurement. The author already knows what a session is, and the name usually says so.

5. **TSS**, in `src/workout/load.ts`, pure and tested. Coggan's score, anchored so that **100 is one hour at FTP**:

   - normalised power: a 30-second rolling average of the targets, each raised to the fourth power, averaged, fourth root
   - intensity factor: `NP / FTP`
   - `TSS = hours × IF² × 100`

   It scales linearly with duration and quadratically with intensity, which is what lets it say a short hard session and a long steady one cost the same. The rolling average barely moves a steady block but does smooth ramps and short intervals, so it stays.

   **A free block has no target, so it contributes nothing to planned TSS**, and a workout built mostly of them will show a figure lower than the work it asks for. That is the honest answer rather than a guess at what you might do — and the ride's actual TSS, computed from recorded power, is unaffected and correct.

   **The same function computes TSS for a completed ride from its recorded power**, which is the reason it earns its place: it turns "was that harder than last Tuesday" into a number. Every figure is relative to one FTP, so a wrong FTP makes every score wrong — which is why a `Ride` freezes the FTP it was ridden with, and updating the profile never rewrites training history.

**A workout with no route is the default, and stays supported for good.** It is not a phase 3 simplification to be replaced later: riding a workout without a course is the ordinary case, and laying one over a route (phase 4) is the addition. Both modes are permanent.

That makes the route optional in the engine rather than assumed:

- **No route**: the gradient is zero throughout, samples carry no position or elevation, and speed still comes from the physics at zero grade — so distance accrues and the exported TCX has the distance Strava expects, rather than a ride that went nowhere. It is what a dumb trainer would report, which is the honest answer when there is no hill.
- **With a route**: exactly as a free ride behaves today, with the workout driving target power in ERG while the route drives nothing but the view and the recorded track.

The screen follows: the elevation profile and the map appear only when there is a route, and the layout works without them rather than leaving holes. Gradient is absent from the workout screen in both cases — on a standalone workout it would read zero all session, and over a route it is the route's business rather than the workout's.

`design/mockups/Workout.dc.html` as first drawn shows the phase 4 combined screen (`3 × 10 Sweet Spot · Ditchling Beacon Loop`, with distance, speed and the elevation profile). The design is being revised to show the standalone default.

Also note that mockup's zones legend reads `Z1 <55 · Z2 56–75 · Z3 76–90 · Z4 91–105 · Z5 106–120 %` with a six-segment power ladder — the Coggan model this spec replaced with five equal 20 %-of-FTP splits (see Zones, and ADR-0007). The code is on five; that mockup is the place the two still disagree.

**Done when:** the 2x20 above can be written in the textarea, ridden in ERG mode with the trainer holding each target, and appears afterwards in the history.

**Not in phase 3:** importing `.zwo`. `design/mockups/Workouts.dc.html` has an accent *Import .zwo* button; it is dropped from the build for now, as the routes screen's *Import GPX* was. An importer is a one-way converter into this format and is a phase 4 candidate — it costs nothing to defer and buys a large public library when it lands.

## Phases were renumbered on 2026-10-22

Phases 1 to 3 shipped as the MVP. What follows was re-cut afterwards, once riding the thing had shown what mattered:

| Now | Was |
| --- | --- |
| 4 — the ghost | 4, which was a list |
| 5 — usage and errors | nothing; added once it shipped to other people |
| 6 — the phone mirror | the mirror half of 5 |
| 7 — FTP tests | unscheduled |
| 8 — accounts and storage | the backend half of 5 |
| 9 — Strava sync | 6 |

**ADRs written before this date use the old numbers** — "a backend in phase 5" means phase 8, "phase 6's Strava upload" means phase 9, and ADR-0000's "Electron from phase 5" means the mirror, now 6. They are left as written: an ADR records what was believed when it was decided, and editing one to match a later plan is the one thing `docs/adr/README.md` forbids. This table is the key.

## Not losing things

Three items, none of them a phase, all of them the same concern: this app keeps a rider's riding in one browser on one machine, and that is only a feature for as long as it does not lose it.

**Autosave a ride in progress.** The recorder holds every sample in memory and nothing reaches storage until the ride is ended, so a crash, a closed tab or a flat battery takes the lot. The `beforeunload` guard warns before a reload and can do nothing about the rest. This is the only failure here that cannot be undone, and it is the first thing to build — ahead of the ghost, ahead of everything.

**Ask for persistent storage when there is something to lose.** `navigator.storage.persist()` exempts the store from eviction, and Chrome weighs site engagement when deciding, so asking on first load is the weakest possible moment. Ask after the first thing a rider would mind losing: a completed ride, an imported archive, a workout they wrote, a GPX they added. It matters more once autosave makes the local store the only copy of a ride in progress.

**Export everything, in one file you can unpack.** The rides archive carries rides and their samples and nothing else, so routes, workouts and — most seriously — the rider profile have no way out. FTP, maximum heart rate and the masses are the smallest data here and the only part with no export at all: lose them and every future ride is zoned against a number typed from memory.

[ADR-0019](docs/adr/0019-data-is-legible-on-the-way-out.md) puts the obligation at the boundary and nowhere else: how any of this is held in IndexedDB is ours to optimise, and what comes out is a folder of real files. The archive converts rather than copies where it has to.

```
manifest.json          version, counts, exported at
profile.json           FTP, hrMax, masses, CdA, Crr
rides/<id>.json        the record and its samples
routes/<slug>.gpx      real GPX, openable anywhere
workouts/<slug>.yaml   the source as written
```

**`.tar.gz`, not `.zip`.** Tar is 512-byte headers and nothing else — no CRC, no central directory, no offset bookkeeping — so writing and reading it correctly is a fraction of the work, and a malformed zip fails silently rather than loudly. `CompressionStream` is in the browser, so the compression needs no dependency either; samples are repetitive and compress roughly ten to one. macOS unpacks `.tar.gz` on a double click.

[ADR-0012](docs/adr/0012-deliberate-non-dependencies.md) rules out an archive dependency, which is why the workout and route bundles are multi-document YAML and multi-track GPX. If the container proves fiddly enough to want a library, that is an amendment to 0012 with a stated reason — "zip has sharp edges and a bad one fails silently" is a good one — rather than a rule to work around.

The per-collection exports stay. They are portable artefacts for sharing one thing; this is a backup of everything.

## Phase 4 — Regroup and polish

**Not a workout laid over a route.** Decided against on 2026-10-14 and recorded as [ADR-0016](docs/adr/0016-no-workouts-on-routes.md): in ERG the trainer holds the target whatever the gradient, so the route has no effect on the ride and the terrain is wallpaper. Either the hills are real or they are not. A plan held by the rider against real simulated terrain — the version where the hills stay real — is a different feature and is deferred to a later phase rather than smuggled in as a variant of this one.

**The ghost, and nothing else.** A previous ride on this route, drawn against the one you are on, so a route you have ridden before has something to ride against.

### Same clock, different places

The ghost is where that ride had got to **at your elapsed time**. Both of you run on one clock and your positions differ, which is what makes it a race you can watch — the convention every racing ghost uses.

The alternative was to draw it at your *distance* and compare times. That is a post-ride framing: both dots would sit permanently in the same place and there would be nothing to see.

Position comes from interpolating a sample's `distanceM` at your `elapsedS`. Both are already pause-aware, so a pause advances neither of you and there is no free time in stopping.

**The gap is read in seconds, not metres.** "12 s up" means something; "180 m up" means nothing without knowing the gradient. It is the same samples read the other way: when did the ghost reach the distance you are at now.

### Choosing one

In the ride settings panel, which already opens over a running ride. Three slots, filled top down, and **no ride appears twice** — a picker showing one ride under two labels looks broken:

1. **Best** — the fastest you have covered this route. The target.
2. **Best, 12 months** — the fastest of the last 365 days. If that is the same ride as Best, the next fastest within the window instead.
3. **Most recent.** If that is already shown, the next most recent.

A slot with no candidate of its own falls through to the next unused ride, newest first, so three slots fill whenever three rides exist.

**Rolling 365 days, not the calendar year.** The slot exists to say where your form is now when your all-time best is old, and form is a rolling thing — a calendar year implies that your best on 31 December and your best on 1 January are different questions, when the only thing that changed was the date. It is labelled "12 months" rather than "this year" for the same reason: the shorter phrase promises a calendar this does not use.

The cost, which is real: the slot can change without you riding. An old ride drops out of the window and a slower one becomes the best within it. Nothing you did, and briefly puzzling — but the alternative is a window that resets on a date rather than when it stops describing you.

**A historic ride's summary offers Race ghost**, which starts a ride on that route with that ride selected. It is the other direction into the same feature: you are looking at a ride and want to beat it.

### What counts as best

**The fastest time over one route length.** On a point-to-point that is the ride; on a loop it is a lap — the quickest one you have done, from any ride.

One definition rather than two, and it is forced rather than tidy: on a loop, "fastest ride" rewards the shortest ride, so a single lap would beat a three-lap session every time. Fastest lap is the only reading that means anything there, and it has the better consequence — your best lap out of a long session is raceable, which is exactly the lap you would want to chase.

**A ride that never completed a route length cannot be best**, because there is no comparable time. It can still be raced individually.

### Partial rides race fine

A ride that stopped early is a legitimate ghost: your climb-then-quit is still something to beat up the climb. The ghost ends where that ride ended — **marked where it stopped, then faded out**, rather than a dot that blinks away unexplained.

### Drawing it

Muted, on **both the profile and the map**. The profile is where a gap reads as time; the map is where position reads on a loop, and it already draws a rider dot. Accent stays the rider's.

**One ghost, modelled as a collection of one.** Racing your best self, your best of this year and a friend at once is a real want and the data supports it — three positions on one clock. What it needs is a readout that does not become three numbers, which is a design problem for the day it arrives. Build the list now so that day is additive, and differentiate by **shape** when it comes, because tone is already spoken for.

### Where lap times live

Splitting samples at each route length is expensive, and the samples are deliberately out of the rides list's reach. So **a ride stores its lap splits when it is saved** — an array of seconds, one entry per completed route length. Ten numbers for a ten-lap ride, one for a point-to-point, **empty for a ride that never finished one**, which says "not eligible for best" without a flag saying so.

Best is then `min()` over short arrays across the aggregates the list already loads, and no samples are read until a ghost is actually raced. The index matters as much as the value: to race a best lap you have to slice *that* lap's samples, which a stored scalar could not tell you.

**The rule worth writing into the ADR**, because it is what stops someone adding a `bestLapS` beside it or deleting the array as redundant: *store the expensive derivation, derive the cheap one from it.*

**The same computation feeds the export.** TCX models laps natively and we write exactly one `<Lap>` per activity, which has been wrong since loops shipped. One per lap, triggered by distance, from the same split — so the file and the record cannot disagree about where a lap ended, and Strava shows the splits without any work of ours.

**A ride also stores its TSS**, computed at save from its recorded power and the FTP it was ridden at. Same rule and the same reason: it needs the samples, so not storing it means either a backfill later or a permanent gap where earned load is unknowable. Displaying it can wait — the obvious home is beside the planned figure a workout already shows in the library — but storing it cannot, because the day it is wanted the samples would have to be walked again.

Unlike the splits, this one **is** backfilled, and completely: every existing ride still has its samples and its frozen FTP, so a single pass fills the history exactly rather than approximately.

**No backfill for the splits.** Rides recorded before this have none and will not get any: loops shipped days before the ghost did, so there is no history of lapped rides to recover. A ride with no splits is simply not eligible to be best, which the empty array already says.

### Not on workouts

A workout is effort against a plan, and the plan chart already draws what you are chasing. A ghost there would be a second thing to beat on a screen that has one.

### Two things that look like problems and are not, and one that is

**Trainer difficulty does not affect it.** [ADR-0008](docs/adr/0008-speed-uses-the-real-route-grade.md) means difficulty changes how a hill feels and never how fast you move, so a ghost ridden at 0 is directly comparable to one at 100.

**Storage is not a limit.** A thousand rides is about 500 KB of aggregates and 500 MB of samples, against a browser quota measured in a large share of free disk.

**Weight is the honest caveat.** Speed comes from power and mass, and a ride freezes the settings it was ridden at. Lose five kilos and you will beat an old ghost at the same power. That is true rather than a bug — it was a real ride at a real weight — but it is not purely a fitness comparison, and someone will notice before we explain it.

### Afterwards

The summary says whether you beat it, and by how much. Cheap, from two numbers, and it is the point of having raced.

### Why the rest of the phase went

The phase was a list; it is now one item. GPX upload shipped early. **Richer history and summary statistics moved to phase 8** — they rely on data being reliably persistent, which is what a backend is for, and a trend computed over a store a browser can clear is a trend about nothing. Workout import and a real basemap stay unscheduled.

Nothing in that list is a loss, because **this app is not trying to replace the ones that already do analysis.** Strava and TrainingPeaks read a ride back better than a side project will, and the export exists so they can. What Contour owes a rider is the ride itself.

## A loop can be ridden round again

A route whose start and finish are the same place should not stop you at the start line. Reaching the end of a loop rolls through it onto the next lap; a point-to-point route finishes as it does now.

1. **A loop is detected from the geometry**, not declared in the manifest. Start and finish within a tolerance of each other — a planned loop closes exactly, a recorded one is a few metres out — so nothing has to be marked up and an imported GPX gets it for free.

2. **Position and distance stop being the same number**, which is the whole of the work. Today "18.2 km" is both how far you have ridden and where you are. On a second lap they diverge: distance ridden keeps accumulating, and position on the route is that distance modulo the route's length. Everything that reads one must be checked for which it meant.

3. **The secondary reading is lap progress; the lap number is the mark.** "Distance of total" has no meaning when the total is however long you choose to keep going, so on a loop the reading becomes this lap's progress against the route and the count lives in the tag beside the route's name — one slot, which is also what tells you it is a loop before a lap is complete.

4. **The elevation profile and the map show the current lap.** The ridden portion fills, reaches the end, and starts again. That is what makes a second lap legible as a second lap rather than as a chart that has run out.

5. **Only the rider ends it**, and there is no longer a flag saying so. `Ride.finished` existed to mark a ride as *ended early*, which a loop can never be — but the question it answered was "did I complete this?", and distance answers that better once the route's length is beside it. The summary reads `12.4 / 15.7 km` part-way and `15.7 / 15.7 km` complete, so a ride ended a hundred metres from the summit of the Alpe no longer gets the same label as one abandoned after two minutes. A lapped ride shows its distance alone, because a thing with no completion cannot be early of one. The field is gone rather than special-cased.

6. **Nothing new is recorded.** The lap count is the ride's distance over the route's length, and routes now carry their own GPX, so it stays derivable rather than stored — the same rule [ADR-0015](docs/adr/0015-tss-is-the-only-load-figure.md) applies to load.

7. **The export is unchanged.** Distance keeps accumulating and coordinates repeat, which is exactly what a real lapped ride looks like to Strava.

**Out of scope:** a lap target, auto-stopping after N laps, and per-lap splits in the history. The ghost — your previous ride drawn against this one — meets this feature at phase 4 and the two want designing together rather than separately.

## ERG is optional

A workout can be ridden with the trainer holding the target, or with the rider holding it. ERG on is the default and is what the app does today; ERG off shows the same targets and leaves the rider to hit them with gears and cadence.

**Why it earns its place.** ERG's failure mode is the spiral of death: cadence sags, resistance climbs to keep the watts, the rider stalls. It has no road feel, and it cannot respond fast enough for short maximal efforts. And holding a target is a skill — ride only in ERG and you get good at pedalling while a machine paces you. This is also the honest half of the plan-over-terrain idea [ADR-0016](docs/adr/0016-no-workouts-on-routes.md) defers: a plan the rider holds themselves, with no hills yet.

1. **A toggle in the ride header**, beside Pause and End ride, switchable mid-session. Changing it mid-step takes effect at once rather than at the next step: it is a statement about how you want to ride now.

2. **ERG off writes simulation parameters instead of a target.** Mechanically it is a `free` step extended over the whole session — that path already exists and is already tested.

3. **It simulates a flat road.** The same physics a free ride uses: resistance comes from speed and gearing, which is what makes it feel like riding rather than pushing a wall.

   **Trainer difficulty is not the resistance.** Reusing it would mean the slider changes how fast you move, which [ADR-0008](docs/adr/0008-speed-uses-the-real-route-grade.md) forbids and the manual test plan checks for by name. With no route there is no gradient to scale, so the control is inert in this mode and the screen says so rather than leaving a dead slider to be discovered. A fixed drag, if ever wanted, is a separately named setting and not this one.

4. **The ride records which way it was ridden**, in `RideSettings` beside `workoutScalePct` and for the same reason: a session the trainer held and one the rider held are not the same session, and without the field two rides of one workout are not comparable.

5. **Everything else is unchanged.** Steps still advance on time, the scale still applies to the displayed target, a `free` step is simply a no-op, and TSS still comes from recorded power.

   One thing improves. With ERG on, a ride's actual TSS is close to the planned figure by construction, because the trainer made it so. With ERG off the recorded figure measures the rider, and the plan chart's accent-over-grey stops being a formality.

## Phase 5 — Usage and errors

It is in other people's hands now, and nothing comes back. This is the phase that fixes that, and it is **not** the training statistics ruled out of phase 4 — that is a rider learning about themselves, which Strava does better. This is the author learning whether anyone rides the thing and what breaks when they do.

**Errors are worth more than counts.** "Forty-seven people opened it" is a number to look at; "the app threw in Safari at the route list" is something to fix. Weight the work accordingly.

What is worth knowing: whether a ride completes or is abandoned, whether pairing fails and at which step, which browser and platform, which features are never touched, and what threw. That last one answers the two unknowns this app currently has — what a private window does when IndexedDB is unavailable, and what someone on an iPhone sees before they press connect.

**Self-hosted, on the same box.** A third-party tracker in an app whose premise is that it does not phone home would be a contradiction a rider could read in the network tab. Running it ourselves keeps that honest and keeps the data ours.

**What never leaves: ride data.** No power, no heart rate, no routes, no positions, no files. Counts, error strings and the shape of a session. A rider's ride stays theirs, which is the whole arrangement this app makes.

**Say so, plainly, and let it be turned off.** The app's first line is that it has no avatars, badges or leaderboards; something that reports back needs stating in the same voice rather than buried.

It comes before the mirror for a practical reason as well as a product one. It is the same shape of deployment — a small process behind nginx on the VPS — so it establishes that pattern on something where a crash costs nothing, and it tells you whether anyone would use a mirror before you build one.

## Phase 6 — The phone mirror

**Browser-only is a feature, not a stage to grow out of.** Open a URL and ride: no install, no update, nothing to trust. That is worth keeping, and this phase exists for one reason only — a phone propped next to the bike showing live data in large type.

So the phase is **not** a backend. An earlier draft of it was: a server owning rides, routes and workouts, with the browser syncing to it. That was never wanted for itself, and it carried two costs for nothing — hosting, and a store the app would stop being able to work without.

1. **Live ride state reaches a second screen.** The riding machine publishes, the phone subscribes, and nothing is stored. Two shapes are worth comparing: a thin hosted relay that forwards messages and keeps none, or a direct peer connection with a small signalling step. Both keep the app a page you open. Neither needs a database.
2. **The phone view is read-only**, in large type, and is never a controller. The phone shows what is happening; the bars and the bike are where the ride is.

Two things that are easier here than the old framing assumed. The mirror page is **visible and in the foreground** on the phone, so Screen Wake Lock applies to it — the wake lock problem belongs to the riding machine running behind a video, which is ADR-0000's question and unrelated. And no ride data crosses the wire except what is already on screen, so there is nothing to secure beyond pairing the two.

**This weakens the case for Electron, which [ADR-0000](docs/adr/0000-shell-and-tick-source.md) placed at exactly this phase.** The strongest argument there was an in-process WebSocket server on the local network needing no hosting — a reason to leave the browser that largely evaporates if the mirror is a relay or a peer connection. What remains is background throttling, which the phase 1 measurement found Chrome did not apply but could not prove it would not. That ADR is Accepted and stands until a new one supersedes it; this is the fact that would prompt one.

Richer history and summary statistics are **not** here. They belong with the storage that makes them trustworthy, in phase 7: a trend computed over a store the browser can clear is a trend about nothing.

## Phase 7 — FTP tests

The strongest candidate once the ghost is done, and the last phase that needs no server.

**Why this and not the rest of the analytics.** FTP is not a statistic the app reports, it is a parameter the app runs on: zones are fractions of it, a workout's targets are percentages of it, TSS is anchored to an hour at it. A wrong FTP makes every number on every screen wrong. That is what separates it from best-efforts tables and fitness trends, which are a record of what happened and belong to the apps that already do them well.

Two features, in order:

1. **An FTP test.** A ramp test is already expressible in the workout format; what is missing is a step that runs until failure rather than for a duration, a rule for when that is (power below target by a margin for a few seconds, or cadence collapsing), and something that reads the result and offers a number. Ramp gives FTP ≈ 75 % of the best one-minute power; a 20-minute test gives 95 % of the average.
2. **FTP detection.** Offer a higher FTP when a ride's best 20-minute effort implies one. It must **offer**, never apply, and say what the number came from: a 20-minute effort inside an unstructured ride is not the maximal evenly-paced effort the 0.95 coefficient assumes, so this method over-reads for some riders.

   This needs the best 20 minutes **within one ride**, computed when it is saved — not a power curve maintained across every ride. An earlier draft of this section put a cross-ride best-efforts record first and called it the enabling primitive. It is not: it is the analytics feature wearing the parameter's clothes, and detection works without it.

**Adaptive training is explicitly out of scope** — adjusting what is prescribed based on how the rider coped needs a plan model, compliance tracking and progression rules, which is a product in itself and a coaching layer close to what this app is not.

Both are bound by [ADR-0017](docs/adr/0017-changing-ftp-never-rewrites-history.md): a new FTP changes only what is ahead. That was your FTP at that time.

## Phase 8 — Accounts and storage

The point at which a ride stops living only in one browser. Deferred this long deliberately: browser-only is a feature, and every phase before this works without a server.

1. **Accounts.** The login screen and the session record are already shaped for it — a session carries a mode, and `guest` is one of two rather than a placeholder. Guest stays a permanent, first-class choice: someone who never wants an account must be able to ride forever.
2. **Rides, routes and workouts persist server-side**, with the browser syncing. [ADR-0002](docs/adr/0002-async-repository-with-client-generated-ids.md) paid for this in advance: the repository interface is already async and ids are minted on the client, so two devices offline cannot collide and nothing waits on a round trip to name a record.
3. **Richer history and summary statistics**, which arrive here because this is where the data becomes reliable enough to draw a trend from.

**What this does not become.** A server owning the ride does not make the app need one. The local store stays the thing the ride is recorded into, and sync is what happens afterwards — a ride must never fail because a network did.

## Phase 9 — Strava sync

A manual "upload to Strava" button on a completed ride. OAuth with a small serverless token exchange so the client secret never ships to the browser; upload the TCX; set the activity type to `VirtualRide`.

On not looking like a bad actor: mark rides honestly. `VirtualRide` with `trainer: true` is exactly the category Strava provides for this, and it keeps indoor rides out of segment leaderboards where fabricated GPS traces would otherwise land. The positions in the TCX are real route coordinates ridden indoors, which is what every virtual cycling platform uploads — the honesty is in the activity type, not in withholding the track.

**A workout with no route uploads with no coordinates at all.** `Position` is optional in TCX and Strava accepts a file without it: you get an activity with no map, full power and heart rate, and the distance read from `DistanceMeters` rather than derived from GPS. That is what a trainer and a head unit produce for an indoor session.

Zwift's trick of placing its fictional worlds in the sea solves a different problem — a virtual *course* needs coordinates to render as a map, and open water keeps it off real segments. A routeless workout is not a place; it is effort over time, and inventing coordinates would claim a journey that did not happen. Still `VirtualRide` with `trainer: true`, so it is categorised as what it was rather than looking like a ride that lost its signal.

---

# Engineering standards (phase 2 onwards)

## Documentation

`docs/` holds usage documentation written for a person using the app: getting started, pairing a trainer, riding a route, writing a workout, exporting to Strava. `README.md` covers running and developing it. Documentation is part of the change that introduces a feature, not a follow-up.

## ADRs

`docs/adr/NNNN-title.md`, one per decision, in the standard form: context, decision, consequences. Superseded ADRs are marked, never edited to say something else. Write the backlog of existing decisions at the start of phase 2:

- React and TypeScript for the UI (ADR-0001, superseding the original Alpine.js choice). Alternatives considered and rejected: Alpine.js, because its logic lives in untyped HTML attributes that TypeScript cannot check; Svelte 5 and Solid, better reactivity models but thin and version-confused training data, which is a poor trade when the code is not being closely reviewed; Next.js, a server framework for an app that is client-only by necessity and possibly Electron-bound. The deciding argument is that the app's reactive surface is one store at 1 Hz, so reactivity ergonomics does not discriminate between the options and correctness under light review does.
- Async repository interface and client-generated IDs
- BLE behind an interface with a fake implementation
- Inline SVG rather than a chart library or canvas
- TCX rather than FIT for v1
- YAML for workouts
- Shell and tick source (ADR-0000, written at the end of phase 1 from the experiment)

## Tests

**Unit tests (Vitest)** for every pure module: physics, GPX parsing, grade, position, TCX generation, workout parsing and the runner, and FTMS encode/decode against captured byte fixtures. Pure modules should be genuinely pure — if something is hard to test, that's the design telling you it's in the wrong module.

**Integration tests (Playwright)** run against a seeded, deterministic fixture set: a small GPX route, a short workout and a couple of completed rides, loaded into the in-memory storage implementation before the page boots. The trainer is `FakeTrainer` with a scripted power series, so a ride produces byte-identical output on every run. Cover connecting, picking a route, riding it to completion, pausing and resuming, exporting a TCX, editing a workout and riding it, and reconnecting after a dropout.

Every feature ships with both.

## CI

GitHub Actions on every pull request against `main`: lint, typecheck, unit tests, Playwright, build. All must pass before merge. No pushes direct to `main`.

## Manual test plan

Hardware can't be automated, so keep a written checklist in `docs/`: pairing, disconnect and reconnect, difficulty change mid-ride, ERG holding a target, a full route ridden end to end, and a TCX upload to Strava.

---

## Assumptions to confirm

- Routes are GPX files committed to the repository, not fetched from anywhere.
- Metric units only in v1.
- The route ends the ride; no looping.
- The trainer speaks FTMS. Verified at the phase 1 gate, not assumed.
- Whether the app is a browser tab or an Electron shell is deliberately unresolved and decided at the phase 1 gate.
