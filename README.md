# Contour

A minimal, gamification-free indoor cycling app. It connects to a Wahoo smart trainer over
Bluetooth, rides real routes with the trainer simulating the gradient, records the ride and
exports it for Strava. See `SPEC.md` for the full brief.

**If you want to ride it rather than work on it, start at [`docs/`](docs/README.md).** This file
is about running and developing it.

This is **phase 3**: structured workouts on top of the phase 2 MVP. Storage, the route list,
simulation riding, the ride screen, the history and TCX export, plus a hand-written YAML workout
format, a library with an editor, and ERG-controlled sessions ridden with or without a route.
ADR-0000 — browser tab or Electron shell — was settled on 2026-10-13: browser now, Electron at
phase 5. The phase 1 background experiment below is kept as the instrument that re-checks the
assumption, not as an open question.

## Requirements

- Node 24. The version CI pins is in `.github/workflows/ci.yml`; vitest 5
  supports 22, 24 and 26 but not 25.
- Chrome on macOS. Web Bluetooth is Chromium-only and does not exist on Safari or iOS at any
  version, so this is a hard constraint.

## Running it

```sh
npm install
npm run dev
```

Then open the URL Vite prints, in Chrome.

| Command                   | What it does                                        |
| ------------------------- | --------------------------------------------------- |
| `npm run dev`             | Vite dev server                                     |
| `npm run build`           | Production build into `dist/`                       |
| `npm run preview`         | Serve the production build                          |
| `npm run test`            | Vitest unit tests                                   |
| `npm run test:e2e`        | Playwright integration tests, against a fresh build |
| `npm run test:e2e:report` | Open the last Playwright HTML report                |
| `npm run lint`            | ESLint                                              |
| `npm run typecheck`       | `tsc --noEmit`                                      |
| `npm run format`          | Prettier, in place                                  |

CI runs lint, typecheck, unit tests, build and Playwright on every pull request against `main`.
All five must pass before merge, and there are no pushes direct to `main`.

## URL flags

Three query parameters change how the app boots. None of them exists in a normal session; they
are how the app is developed and tested without hardware.

| Flag              | Effect                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| `?fake=<script>`  | Replaces the trainer and strap with scripted software ones                |
| `?storage=memory` | Uses the in-memory storage implementation instead of IndexedDB            |
| `?experiment=1`   | Replaces the whole app with the phase 1 background experiment (see below) |

They combine: `http://localhost:5173/?fake=constant&storage=memory`.

### `?fake=` — riding without a trainer

The series is seeded, so every run produces the same numbers. That is what makes an exported TCX
something a test can assert against, and it means a layout change does not have to be checked in
cycling shoes.

| Script      | Behaviour                                                              |
| ----------- | ---------------------------------------------------------------------- |
| `constant`  | Steady 200 W                                                           |
| `ramp`      | 100 W rising to 350 W over five minutes, then repeating                |
| `intervals` | Two minutes at 120 W alternating with two minutes at 280 W             |
| `dropout`   | Constant, but goes silent from 30 s to 45 s and reports `reconnecting` |

An unrecognised script name falls back to the real device and says so in the connection panel.
With no `fake` parameter at all the app uses `FtmsTrainer` and Chrome's device chooser.

In ERG mode the fake converges its reported power on whatever target you command, so the control
path is testable without hardware.

### `?storage=memory` — a clean slate every boot

Swaps IndexedDB for the in-memory implementation. Nothing above `src/storage/` can tell the
difference, which is the point of the interface. Everything is lost on reload, so use it when you
want a fresh database and not when you want to check that something persisted.

It also unlocks the one seeding hook the app has. With `?storage=memory` set, and only then, the
app reads `window.__contourSeed` before it boots and registers any routes it finds there as
though they were bundled:

```js
window.__contourSeed = { routes: [{ id, name, file, totalDistanceM, totalAscentM, gpx }] };
```

That exists for Playwright. The bundled routes are 20 and 30 km, and riding one to completion in
a test would take half an hour, so the integration suite seeds a 200 m fixture instead. Without
the flag the payload is ignored, so it cannot reach a database with real rides in it.

## Tests

**Unit tests** (`npm run test`) cover every pure module: physics, GPX parsing, grade, position,
the profile and climb analysis, zones, TCX generation and the FTMS codec. They run in plain Node
because nothing outside `src/ui/` touches the DOM.

**Integration tests** (`npm run test:e2e`) drive the built app in Chromium through the flags
above. They cover connecting, picking a route, riding, pausing and resuming, riding a fixture
route to completion, exporting a TCX from both places it is offered, recovering from a dropout,
and the settings panel. Playwright builds and serves the app itself; you do not need a dev server
running.

The Playwright fixture route lives in `e2e/fixtures/`, separate from both `routes/` and
`test/fixtures/` for the reasons in
[ADR-0011](docs/adr/0011-test-fixtures-are-not-routes.md): it exists to be finished inside a test,
not to be ridden.

What neither can cover is hardware. `docs/manual-test-plan.md` is the checklist for that, and it
has to be run by a person on a bike.

## Adding a route

Drop the GPX into `routes/` and add an entry to `routes/manifest.json` giving its id, name,
distance, elevation gain and file name. Nothing else. **The id is declared, never generated, and
once a ride references it, it must never change** — renaming the file is fine, editing the id
orphans every ride recorded against it.

The bundled routes are real places. Adding one means dropping a GPX into `routes/` and adding a
manifest entry with its name, region and measured distance and ascent — measure those with the
app's own parser so the manifest cannot disagree with what gets ridden.

## The background experiment

Phase 1 material. It settled ADR-0000 and is kept to re-check that decision on each release —
Chrome's throttling behaviour is undocumented, so it is an assumption with a shelf life. Behind `?experiment=1`, it replaces the ride flow outright — running it alongside a
ride would put a second interval next to the probe and stop the control being a control. The
spec's _Background operation_ section explains why any of it matters.

### What is being measured

A plain `setInterval(1000)` runs alongside the app doing nothing but logging a tick. It
is the **control variable**: Chrome is known to clamp timers in hidden tabs to roughly
once a minute after five minutes, so the probe should visibly degrade. The question is
whether Web Bluetooth `characteristicvaluechanged` notifications degrade with it.

- Probe throttled, notifications intact → stay in the browser, drive the ride tick from
  notifications.
- Both throttled, or notifications dropped → Electron with `backgroundThrottling: false`.
- Ambiguous, or the browser works but only just → Electron. A ride that silently loses
  data an hour in is worse than a heavier dev loop.

Every Indoor Bike Data notification, timer tick, heart rate notification, control point
write, control point response, connection state change and `visibilitychange` is logged
with a `performance.now()` timestamp and a wall clock time. The experiment panel shows
live per-kind inter-arrival statistics — count, min, median, p95, max, mean and the
number of gaps over five seconds — and the whole log exports to JSON.

### Before you start

- Use the **real trainer** if you have it. The fakes are driven by `setInterval`
  themselves, so they will be throttled exactly as the probe is and tell you nothing
  about Bluetooth. A fake run is only useful for rehearsing the procedure.
- Disable Chrome's "Memory Saver" for this tab (Settings → Performance), or a discarded
  tab will look like a throttled one.
- Plug the laptop in. Battery saver adds its own throttling and would confound the result.
- Do not open DevTools during a run. An attached debugger suppresses some throttling and
  invalidates the measurement.
- One Chrome window, one tab. Other busy tabs add noise.

### Procedure, per condition

1. Open `http://localhost:5173/` in Chrome and connect the trainer (and the HRM, if used).
2. Confirm power is updating in the Live panel.
3. Press **Clear log**, then **Start probe**.
4. Press **Marker**. This stamps the start of the measured window.
5. Put the window into the condition's state (below) and **leave it for ten full
   minutes**.
6. Bring the window back, press **Marker** again, then **Stop probe**.
7. Press **Download JSON** and rename the file for the condition, e.g.
   `condition-3-hidden.json`.
8. Note the on-screen statistics table as a sanity check against the exported summary.

Ten minutes is a floor, not a target. Chrome's _intensive_ throttling only engages after
a tab has been hidden for five minutes, so a shorter run measures the gentle throttling
and misses the thing that decides the question.

### The four conditions

| #   | Condition             | How to set it up                                                                                                                                                                                                              | Question it answers                                       |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Visible and focused   | Chrome window in front, clicked into, nothing on top of it. Do not touch the machine.                                                                                                                                         | Baseline inter-arrival rate                               |
| 2   | Visible but unfocused | Click another app (a text editor) so Chrome loses focus, but keep the Chrome window fully on screen and not covered.                                                                                                          | Does merely losing focus matter?                          |
| 3   | **Fully hidden**      | Play a video full screen on the same display, completely covering Chrome. `document.visibilityState` must read `hidden` — check it in the experiment panel before you switch away. **This is the condition that decides it.** | Does Chrome throttle a tab holding a live BLE connection? |
| 4   | Electron, hidden      | Same as 3, but running the Electron spike with `webPreferences: { backgroundThrottling: false }`. Not built yet — it is a separate piece of work.                                                                             | Does Electron actually fix it?                            |

In condition 3, "minimised" or "on another Space" is not the same as "behind a
full-screen video", and the video is the real-world scenario. Use the video. If the
experiment panel still reads `visible` when you return, the condition did not hold and
the run should be discarded.

During each run, move the grade or target power slider two or three times so the log
contains control point writes and their responses. If a write is not acknowledged while
hidden, that fact matters as much as the notification rate.

### Reading the results

For each condition, compare the `timer-tick` row against the `ibd-notification` row in
the exported `summary`:

- `median` near 1000 ms for both → nothing was throttled.
- `timer-tick` median blowing out to tens of seconds while `ibd-notification` stays near
  1000 ms → the Bluetooth connection is exempt, and the browser shell is viable.
- Both blowing out, or a non-zero `gapsOver5s` on `ibd-notification` → notifications are
  throttled and the answer is Electron.
- A non-zero `metadata.dropped` means the ring buffer overflowed and the run is
  incomplete. Shorten the run or raise the recorder capacity and repeat it.

Also check that every `control-write` has a matching `control-response`. A write with no
response means the command did not land.

Compare against the measurements already recorded in
[`docs/adr/0000-shell-and-tick-source.md`](docs/adr/0000-shell-and-tick-source.md). A run that
disagrees with them is the signal that the decision needs revisiting.

## Layout

```
src/
  ble/          Trainer and HRM interfaces, FTMS codec, fakes
  route/        GPX parsing, grade, position, profile and climb analysis
  physics/      speed from power, grade and rider parameters
  ride/         the engine, the recorder, the tick source, route loading
  storage/      the repository interface, IndexedDB and in-memory implementations
  export/       TCX
  zones/        power and heart rate zones
  instrument/   The phase 1 experiment: event recorder, timer probe, statistics
  ui/           React, plus the plain-TypeScript store the engine writes to
routes/         bundled GPX plus manifest.json
test/fixtures/  small hand-computable GPX for the unit tests
e2e/            Playwright specs and the fixture route they ride to completion
docs/           usage documentation and ADRs
```

Everything outside `src/ui/` is plain TypeScript with no React import and no DOM access. React
attaches to the store through a single `useSyncExternalStore` subscription in
`src/ui/useRideStore.ts`; there is no effect polling and no interval inside a component. Anything
worth a unit test lives outside `src/ui/`, and the components are close to stateless renderers
over it.
