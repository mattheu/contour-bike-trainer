# Contour — project spec

Contour is a minimal, gamification-free indoor cycling app. It connects to a Wahoo smart trainer over Bluetooth, lets you ride real routes with the trainer simulating the gradient, records the ride and exports it for Strava. No avatars, badges, drops, levels or leaderboards.

This document is the brief for building it. Where it says "default", make it a user setting with that default.

## Goals

- Ride a real-world route on a Wahoo trainer with realistic resistance.
- Follow a structured workout, standalone or laid over a route.
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
- **No router.** Screens are a `useState` enum. Phase 5's mirror view is one `location.pathname` check.
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

Solve for v by bisection on the cubic. On a steep descent with zero power, v comes from the gravity/drag balance; cap it at 80 km/h. Advance distance by v × dt.

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

### The two starting routes

Synthetic, generated by a committed script in `scripts/` so they are reproducible and tunable, and named plainly as test routes rather than dressed up as real places. They are chosen to exercise different code paths, not just to look different.

**Rolling** — roughly 20 km as a loop, about 250 m of gain, gradients mostly between ±2 and ±5 % with nothing sustained. Grade changes almost continuously, which is what stresses the once-per-second and ≥0.1 % control point write thresholds; any spamming of the trainer shows up here first. Its profile has no dominant feature, which checks the vertical exaggeration doesn't collapse it into a flat line.

**Mixed** — roughly 30 km, about 700 m of gain: a flat start, a sustained 4–5 km climb at around 6 % with a ramp to about 12 %, a fast descent, then rolling terrain to the finish. The climb exercises grade clamping and makes the difficulty slider unmistakably felt. The descent is the only thing in either route that reaches the zero-power gravity and drag balance and the 80 km/h cap.

Real GPX files go in alongside them and need nothing beyond a manifest entry.

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

   **Starter workouts ship with the app**, seeded on first run exactly as the bundled routes are: files under `workouts/` with a manifest declaring each one's id. A fresh install should not be an empty list and a blank textarea for a format nobody has seen. Four of them — a 2x20 threshold, a 5x3 VO2, a 90-minute endurance, an openers session — chosen between them to use every feature of the format, so the examples are the documentation.

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

## Phase 4 — Regroup and polish

Scope to be confirmed once phases 1–3 are real. Candidates: workout laid over a route (ERG for power, simulation ignored, route used for the visuals and the recorded track), GPX upload, workout import, richer history and summary statistics, a real basemap.

## Phase 5 — Backend and phone mirror

1. Server with the API the `storage/http/` implementation expects. Rides, routes and workouts persist server-side; the browser syncs.
2. WebSocket channel publishing live ride state.
3. Phone view: a URL that renders live data read-only, in large type, for a phone propped next to the bike.

This is where the async storage interface and the phase 1 shell decision pay off. How the mirror is built depends on that decision: in Electron the WebSocket server runs in-process on the local network, needing no hosting, no deployment and no auth beyond a session code, and `powerSaveBlocker` keeps the display awake. In the browser it needs a real server somewhere, and display sleep has no reliable answer, since Screen Wake Lock is released the moment the document is hidden.

## Phase 6 — Strava sync

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
