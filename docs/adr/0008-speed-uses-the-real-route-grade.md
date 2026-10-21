# 0008. Speed uses the real route grade, never the trainer-scaled one

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Trainer difficulty is an integer 0–100, default 50. The grade written to the trainer's control
point is `routeGrade × difficulty / 100`: at 100 the trainer reproduces the route exactly, at 0 it
stays flat, and it applies to descents too, so −8 % at difficulty 50 is written as −4 %.

That leaves a question the setting itself does not answer. Two grades now exist on every tick —
the route's and the trainer's — and the physics model has to be given one of them to solve for
speed. Passing the scaled grade is the obvious mistake: it is the number just computed, it is
sitting right there in the tick, and using it produces a ride that runs, records and exports
without any visible complaint.

Difficulty exists because a 12 % ramp at full resistance is unrideable on a 39×25 with a trainer
that has no virtual gearing. It is a compensation for the hardware in the room, not a statement
about the road.

## Decision

**`speedFromPower` is always given the real route grade. Difficulty scales only what is written
to the trainer.**

`src/physics/speed.ts` takes a grade and knows nothing about difficulty; the setting does not
reach it, by construction. The HUD likewise displays the real grade, not the scaled one.

The consequence is the whole point: difficulty changes how the hill _feels_, and changes nothing
about how fast you climb it, how long the route takes or what gets recorded. This matches Zwift,
and it is the difference between a difficulty setting and a cheat.

## Consequences

- Rides of the same route are comparable regardless of difficulty. Distance, elapsed time and the
  recorded track are functions of the route and your power, and of nothing in the settings panel.
- Difficulty can be dragged mid-ride without corrupting the ride in progress. Only the feel
  changes, so there is no reason to disable the control while riding — which is what makes the
  live slider safe to offer at all.
- The rider on a steep climb at low difficulty genuinely is moving as slowly as the numbers say,
  while their legs are being asked for much less than the road would ask. That mismatch is
  intentional and will feel odd the first time; it is preferable to the alternative.
- **What breaks if someone "fixes" this.** Feeding the scaled grade into the physics is a
  one-token change that looks like a tidy-up — the scaled grade is the one the tick just
  computed. The damage is total and silent:
  - Distance and elapsed time become a function of a UI setting. Riding at difficulty 0 makes
    every climb flat, so you cover the route faster for the same power, and the ride "improves".
  - Every recorded ride becomes incomparable with every other one, including retrospectively.
    Two rides of the same route at difficulty 20 and 80 stop being two efforts on the same road.
  - Exported TCX files carry the inflated speed to Strava, against real route coordinates.
  - **Nothing fails.** No test errors unless one is written for this specifically, no exception
    is thrown, no screen looks wrong, and the ride feels entirely plausible while you are on it.
    It is discoverable only by noticing that the numbers are too good, months later.
- Because the failure is invisible, it needs an explicit guard: a unit test asserting that speed
  for a given power and route grade is identical across difficulty 0, 50 and 100, and a note in
  the manual test plan to watch for a speed jump when the slider moves mid-climb. A comment alone
  is not enough, and this ADR is not either.
