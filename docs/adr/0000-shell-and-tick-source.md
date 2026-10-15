# 0000. Shell and tick source

- **Status:** Accepted — browser now, Electron at phase 5.
- **Date:** 2026-09-30, decided 2026-10-13

## Context

Contour is meant to be ridden with a video playing full screen over it, and from phase 5 with a
phone showing live data beside the bike. The app therefore spends most of a ride as the window
you are _not_ looking at, which makes its behaviour when hidden a first-order design constraint
rather than a polish item.

Two things are already known and neither is in dispute:

- Chrome clamps `setInterval` in a hidden tab to roughly once a minute after five minutes of
  hiding. A timer-driven ride engine stalls outright.
- Screen Wake Lock is released by specification when the document becomes hidden, so it cannot
  keep a backgrounded tab alive.

One thing is assumed and unverified, and it decides the whole question: **do Web Bluetooth
`characteristicvaluechanged` notifications keep arriving at full rate in a hidden renderer, and
do control point writes still reach the trainer from one?** Chrome exempts tabs holding certain
active connections from freezing, so a notification-driven tick is plausible. If the assumption
is wrong, that tick fails in exactly the scenario it exists for — an hour into a ride, silently.

### The two candidate shells

**Chrome tab.** No extra build machinery, open a URL, Playwright drives it directly. Depends
entirely on the assumption above holding.

**Electron.** `webPreferences: { backgroundThrottling: false }` disables throttling outright —
a documented switch, not a workaround, and independent of how the trainer behaves.
`powerSaveBlocker` handles display sleep properly. Node runs in-process, so phase 5's phone
mirror becomes a WebSocket server inside the app on the local network: no hosting, no
deployment, no auth beyond a session code. That saving is larger than the throttling fix. The
costs are a hand-rolled Bluetooth chooser (Electron ships none, so the app must handle
`select-bluetooth-device`), Playwright via the less well-trodden `_electron.launch()`,
right-click-to-open on unsigned local macOS builds, about a day of setup and a permanently
heavier dev loop.

Both shells run the same Vite build and the same `Trainer` interface, so keeping the option open
costs nothing. The tick source falls out of the shell choice, not the other way round.

## Decision

**Ship in the browser through phase 4. Move to Electron at phase 5.**

### What the measurement showed

A KICKR CORE was connected on 2026-10-13 and the instrumented POC run with the Contour tab
hidden behind a full-screen video in another Chrome tab, for 12 minutes 38 seconds — well past
the five-minute intensive-throttling threshold.

**Chrome did not throttle the timer.** 756 ticks in 758 seconds of hidden time, median interval
1000 ms, maximum 1972 ms, no gap over five seconds. Intensive throttling would have produced
roughly 13. The run carried no Bluetooth stream — the connection had been dropped by a page
reload — so it says nothing about notifications, and that was never followed up because the
result made the question moot.

Separately, the same session validated the FTMS codec against real hardware: every Indoor Bike
Data packet from the KICKR arrives with flags `0x0044` — speed, cadence and power, eight bytes —
and decodes exactly as the hand-built fixtures predicted.

### Why the result does not settle it in the browser's favour

The behaviour contradicts Chrome's own documentation, which says a hidden, silent page is
intensively throttled after five minutes. We are therefore relying on an exemption nobody wrote
down, in a browser that updates itself. A release restoring the documented behaviour would make
rides silently lose distance mid-climb — the failure is corrupt data noticed weeks later on
Strava, not a crash. `backgroundThrottling: false` is a contract; "it did not throttle when we
tried it" is not.

### Why not switch immediately

The costs below are real but small, except one: ride history does not survive the origin change.
That cost is zero today and grows with every ride — which argues for switching now. It is
nevertheless deferred to phase 5 because **phase 5 is when a server becomes the source of truth
for rides**, so history stops living in a browser-scoped database at exactly the moment the shell
changes. The expensive cost expires on the date it would otherwise be paid.

Until then the browser is good enough on the evidence, and the deferral buys a fast dev loop and
a cheap headless test suite through the phases where the UI is still moving.

### What this requires in the meantime

**Nothing under `src/` may import anything Electron.** Shell-specific capability goes behind a
narrow interface, as `Trainer` and `Storage` already do. Hold that line and the renderer stays a
plain web app that Electron wraps; lose it and there are two applications. The notification-driven
tick stays as built — it is insurance while in the browser and costs nothing once the shell makes
it unnecessary, because the tick source is injectable.

### The original gate, for the record

This ADR was written so the gate was recorded before it was passed. The four-condition matrix
below was designed expecting throttling; once condition 3 came back unthrottled, running the rest
would have characterised a phenomenon that was not occurring, so it was abandoned deliberately
rather than forgotten.

The phase 1 POC is instrumented to log, with high-resolution timestamps, every Indoor Bike Data
notification, every tick of a plain `setInterval(1000)` running alongside, every control point
write and its indication response, and every `visibilitychange`. The same ten-minute session is
then run under four conditions:

| #   | Condition                                             | Question                        |
| --- | ----------------------------------------------------- | ------------------------------- |
| 1   | Chrome, visible and focused                           | Baseline inter-arrival rate     |
| 2   | Chrome, visible but unfocused                         | Does losing focus alone matter? |
| 3   | Chrome, fully hidden behind a full-screen video       | The one that decides it         |
| 4   | Electron spike, `backgroundThrottling: false`, hidden | Does Electron actually fix it?  |

Condition 3 must run at least ten minutes, because Chrome's intensive throttling only engages
after five. For each condition we record the notification inter-arrival distribution, whether
the timer was clamped, whether control point writes landed, and whether any samples were lost.

Decision criteria, fixed in advance:

- Notifications survive condition 3 intact → **stay in the browser**, drive the tick from
  notifications, and revisit only if phase 5 needs Node.
- Notifications are throttled or dropped in condition 3 → **Electron**, and phase 5 gets simpler
  as a consequence.
- **Tiebreak:** ambiguous, or the browser works but only marginally → **Electron**. A ride that
  silently loses data an hour in is worse than a heavier dev loop, and the phase 5 saving breaks
  the tie.

This ADR is updated to Accepted, with the measurements in it, at the end of phase 1. Phase 2
does not start before that.

## Consequences

- Phase 1 costs roughly half a day more than it otherwise would, because condition 4 means
  building a minimal Electron shell including the `select-bluetooth-device` handler. That shell
  is thrown away if the browser wins.
- The ride engine must take its `Clock` and its tick source by injection, and must not call
  `Date.now()` or `setInterval` itself. This is a constraint on code written before the decision
  is made.
- Phase 5's architecture is unresolved until this is. The mirror is a local in-process WebSocket
  server under Electron, or a hosted server with an unsolved display-sleep story in the browser.
  Estimating phase 5 before this gate is guesswork.
- The tiebreak is biased toward Electron on purpose. If the measurements are marginal we will
  pay for build machinery we might not have needed, and we accept that in exchange for not
  discovering the problem mid-ride.
- A hidden risk stays open either way: the experiment measures one trainer, one Chrome version
  and one macOS version. A Chrome release can change throttling behaviour under us, so if the
  browser wins, this ADR should be re-run rather than trusted indefinitely.

## What would make a later move to Electron harder

Recorded while the decision is still open, so the cost of changing course does not have to
be rediscovered. The three abstractions this project is built on — storage behind an async
repository, Bluetooth behind an interface, an injectable tick source — all survive the move
untouched. What follows is everything that does not.

**Ride history does not come with you.** This is the one with a user-visible consequence.
IndexedDB is scoped to an origin, and an Electron renderer loading from `file://` or a
custom protocol is a different origin from `http://localhost`. Every ride recorded in the
browser would simply not be there. Mitigations, cheapest first: serve the renderer from a
fixed custom protocol so the origin is stable from the outset; or ship an export/import
before switching; or treat the move as coinciding with phase 5, where the server becomes
the source of truth and local storage stops mattering. Deciding this _before_ a year of
rides accumulate costs nothing; deciding it after is a migration.

**Electron has no Bluetooth device chooser.** `navigator.bluetooth.requestDevice()` in the
renderer does not open a picker — it fires `select-bluetooth-device` on the `webContents`
in the main process, repeatedly as devices are discovered, and **hangs for ever if nothing
calls the callback**. So a working build needs main-process plumbing plus our own picker
UI. Perhaps fifty lines and a small component, but it is not optional and it is the first
thing that will appear broken.

**Asset paths break under `file://`.** Vite emits absolute paths by default, so the
self-hosted fonts in `public/fonts/` and the built CSS and JS would 404. An Electron build
needs `base: './'`, or the custom protocol above.

**The URL flags need another way in.** `?fake=`, `?storage=memory` and `?experiment=1` are
read from `window.location.search`. They still work in Electron but are awkward to set, and
the test hooks are gated on them. A command-line argument or an environment variable
forwarded into the renderer would be the equivalent, and the reading of them is already
isolated in `storageKindFromSearch` and `services.ts`.

**The Playwright suite needs reworking.** Specs navigate to `baseURL` with query strings;
under Electron they would use `_electron.launch()` and the flags above. The assertions and
page objects survive; the harness does not.

**`navigator.wakeLock` becomes `powerSaveBlocker`.** The browser API is released whenever
the document is hidden, which is why it cannot help a backgrounded tab. Electron's blocker
has no such limit — so this is a capability gained rather than lost, but it is a swap.
`createWakeLock()` already takes its API by injection, so the seam exists.

**Nothing in `src/` uses a Node API**, which is what keeps `nodeIntegration: false`
available — the correct setting, and one that is painful to retrofit once something has
reached for `fs`. Worth keeping true.
