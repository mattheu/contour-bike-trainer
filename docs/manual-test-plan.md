# Manual test plan

Hardware cannot be automated: Playwright cannot drive Web Bluetooth, and no CI runner has a
trainer paired to it. Everything below is what the automated suite structurally cannot cover.

Run this before any release, and after any change to `src/ble/`, `src/ride/` or `src/export/`.
Record the date, the app version or commit, and the trainer's firmware version, because a
behaviour change that appears out of nowhere is usually the firmware.

**Setup:** real trainer powered and awake, heart rate strap on and damp, Chrome on macOS, no
other app connected to the trainer (a phone with the Wahoo app open will hold the connection and
the pairing will silently fail). Open DevTools and keep the console visible throughout — a caught
error that does not surface in the UI still counts as a failure.

---

## 1. Pairing

1. Open the app on the Connect screen with nothing paired.
2. Click connect for the trainer. The Chrome device chooser appears.
3. Pick the trainer.

Look for:

- [ ] The chooser lists the trainer within a couple of seconds, by a recognisable name.
- [ ] Connection state moves through connecting to connected, visibly — not a silent jump.
- [ ] Power and cadence start updating at roughly 1 Hz within a few seconds of connecting, with
      no long initial stall.
- [ ] Cadence reads zero when you stop pedalling, rather than freezing at its last value.
- [ ] Repeat for the heart rate strap. Heart rate appears and moves.
- [ ] Disconnect the heart rate strap and confirm the app still rides fine without it — it is
      optional by design.
- [ ] Console is clean.

## 2. Disconnect and reconnect

**This section is the only cover this path has.** There was a Playwright spec for it; it was
removed on 2026-10-13 because it took sixteen minutes to fail for reasons that were never pinned
down, and the engine's grace period and alert escalation are covered by unit tests. What a browser
test could not cover anyway is the thing that actually matters here — a real radio going quiet —
so the loss is smaller than it looks. Walk this section rather than assuming it.

Start a ride, then force a disconnect mid-ride — power the trainer off, or walk it out of range.

**To rehearse the UI without hardware**, run with `?fake=constant&storage=memory`, start a ride and
call `window.__contourFakeTrainer.dropout()` in the console, then `.reconnect()`. That hook exists
only with `?storage=memory` and a fake trainer, so it cannot appear in a real session. It proves the
alert, the grace period and the resume control behave — it does not prove Bluetooth does.

- [ ] The connection state changes within a second or two, clearly and without ambiguity.
- [ ] The ride keeps running on the last known power for up to 10 s, then pauses **automatically**.
      Time this: a grace period that never ends, or one that fires instantly, are both bugs.
- [ ] The alert is a warning (stays until resolved), not an info toast that clears itself.
- [ ] Power the trainer back on and reconnect. The reconnect control is obvious and works.
- [ ] The ride resumes from the same distance and elapsed time, not from zero.
- [ ] Afterwards, the recorded samples show the gap honestly — no fabricated data across it, and
      no duplicated timestamps at the join.
- [ ] Repeat once with the heart rate strap instead of the trainer. Heart rate drops out, the
      ride continues, no pause.

## 3. Difficulty change mid-ride

Ride into a section with a sustained gradient of 5 % or more — the climb on the Mixed route.

1. With difficulty at 50, note how the resistance feels and what grade the HUD shows.
2. Open the settings panel and drag difficulty to 100 without stopping.
3. Then to 0.

Look for:

- [ ] Resistance changes noticeably within about a second, both times, and in the right direction.
- [ ] At 0 the trainer goes flat regardless of the route.
- [ ] The HUD keeps showing the **real** route grade throughout, not the scaled one.
- [ ] **Your speed does not change** when difficulty does. Difficulty changes how the hill feels,
      not how fast you climb it. If speed jumps, the physics is using the scaled grade and that
      is a serious bug.
- [ ] The panel can be opened and adjusted without pausing the ride.
- [ ] Ride on into a descent and confirm it scales too: −8 % at difficulty 50 should feel like −4 %.

## 4. ERG holding a target

Write a two-minute workout with a step change in it — `{ duration: 1m, power: 150W }` then
`{ duration: 1m, power: 250W }` — and ride it. The phase 1 control panel's ERG slider does the
same job if you prefer to drive it by hand.

1. Ride the first step at 150 W, pedalling at a comfortable cadence.
2. Let it change to 250 W and watch what the trainer does with the step.
3. Then vary your cadence deliberately between roughly 70 and 100 rpm at a fixed target.
4. Stop pedalling for five seconds, then start again.

Look for:

- [ ] Reported power settles within a few watts of target within a few seconds of each change.
- [ ] Power stays on target as cadence varies — that is what ERG means.
- [ ] No oscillation or hunting around the target, and no slow drift over several minutes.
- [ ] Recovering from a full stop does not leave the trainer stuck at a wall of resistance.
- [ ] Over a 20-minute block, the trainer neither refuses a write nor lags further behind. This is
      the decision-gate question about sustained control point writes; it only shows up over time.

## 5. A workout session, end to end

**Nothing below has ever run against real hardware.** The whole workout feature writes target
power to the trainer and releases it again, and every test of that path so far has been against
the fake. Ride `Format test` — fifteen minutes that use every part of the format, which is exactly what
this section needs to exercise. Then ride `Thirty by thirty` for sustained step changes under
load.

- [ ] The warmup ramp climbs smoothly rather than in audible jumps. Watch the trainer's reported
      power follow the target up, not lag a block behind it.
- [ ] Each step change reaches the new target within a few seconds, including the short 30 s ones
      where a slow trainer would spend most of the step catching up.
- [ ] The cadence target is shown and nothing changes when you ride outside it. Cadence is never
      written to the trainer.
- [ ] **The `free` block releases ERG.** The screen says released and drops the target; the
      trainer should feel like riding rather than pushing into a wall. Then confirm the next step
      takes ERG back — a trainer left in simulation for the rest of the session is the failure
      this step exists to catch.
- [ ] Press skip mid-step. The next step starts immediately and the session's remaining time drops
      by what was left, not by the whole step.
- [ ] Nudge intensity up and down a few times during a steady block. The target moves 5 % a press
      and the trainer follows; at 50 % and 150 % it stops rather than wrapping.
- [ ] The session ends itself on the last step. The summary names **the workout**, not "Free ride",
      and the ride appears in the history under the same name.
- [ ] Over the whole session the trainer neither refuses a write nor drifts behind. A workout sends
      far more control point writes than a route ride does, so this is the harder version of the
      question section 4 asks.

## 6. A full route, end to end

Ride one of the bundled routes to completion. Mixed is the better test — it has the climb, the
grade clamp and the descent that reaches the zero-power gravity and drag balance.

- [ ] Resistance tracks the profile: the climb is hard, the descent is free.
- [ ] The rider dot moves along both the elevation profile and the route trace, and the two agree.
- [ ] The ridden portion fills in the accent colour behind the dot on both charts.
- [ ] Distance, elapsed time, elevation gained and average power all look plausible and monotonic.
- [ ] Space bar pauses and resumes. Paused means the clock stops and distance does not advance.
- [ ] Resuming carries on from the same distance, not a new one.
- [ ] On the descent, coasting at zero power gives a fast but finite speed — the balance of
      gravity against drag, around 72 km/h at 10 % and faster on anything steeper — rather than
      running away or sticking at a round number.
- [ ] Reaching the end ends the ride, with a finish flag, rather than looping or stalling.
- [ ] The ride appears in the history with the right date, route, distance, time and average power.
- [ ] **Leave the window hidden behind a full-screen video for at least ten minutes** during the
      ride (Chrome's intensive throttling only engages after five). On returning: no gap in the
      samples, the distance is consistent with the elapsed time, and resistance changed while you
      were not looking. This is ADR-0000's assumption being re-checked on every release.

## 7. TCX upload to Strava

Export the ride you just rode, from the ride screen, then again from the history entry.

- [ ] Both exports download as `contour-YYYY-MM-DD-HHmm.tcx` and are byte-identical to each other.
- [ ] Open the file: it is well-formed XML, one Activity of sport Biking, one Lap, and Trackpoints
      carrying Position, AltitudeMeters, DistanceMeters, HeartRateBpm, Cadence and `ns3:TPX/Watts`.
- [ ] Sample count roughly matches the ride's moving seconds — no missing tail, no duplicates.
- [ ] Upload it to Strava. It is accepted with no warnings.
- [ ] Strava shows a map that follows the real route, a power curve, cadence and heart rate.
- [ ] Distance and elevation gain match what the app reported, within rounding.
- [ ] The activity is marked as a virtual ride on a trainer, not as an outdoor ride.
- [ ] Upload a ride that included a disconnect and confirm Strava handles the gap without
      inventing a straight line through it at implausible speed.
