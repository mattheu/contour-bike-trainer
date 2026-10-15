# 0016. No workouts ridden on routes

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Zwift lets you run a structured workout while riding a world, and phase 4 carried "workout laid
over a route" as a candidate largely because of that. It was never justified beyond the fact that
the obvious competitor does it.

The mechanics decide the question. A workout holds the trainer in ERG, and ERG means the trainer
produces the target wattage whatever the gradient. The route's climb does not make the interval
harder and its descent does not make it easier. Everything ADR-0008 is about — simulating the real
grade, and the care taken that trainer difficulty never changes how fast you move — is switched
off for the duration.

What a route would actually contribute to such a ride is:

- **Free blocks.** ERG releases on a `free` step and simulation takes over, so during those the
  terrain genuinely matters. Real, but it is a small fraction of a session.
- **Plausible speed and distance.** A standalone workout accrues distance against flat ground; on
  a route the same watts would produce realistic speed and elevation.
- **A map on Strava.** Which is the problem rather than the benefit: publishing a GPS track of
  Alpe d'Huez for a session where the mountain had no effect on the effort is a ride that did not
  happen. Phase 6 already names not looking like a bad actor as a requirement.
- **Something to look at.** This is the one Zwift is really solving, and this app's first line is
  that it has no gamification.

## Decision

Workouts are not ridden on routes. A session is either a route ride with real simulated gradient,
or a workout in ERG with no route. Either the hills are real or they are not.

The screen split already in the code — `Ride` for a route, `Workout` for a plan, chosen by whether
the snapshot carries a workout — is therefore permanent rather than provisional, and
`App.tsx` need never grow a third combined case.

**A plan held against real terrain is a different feature, deliberately deferred.** Rather than
ERG with scenery, it would be a plan that tells the rider what to aim for while they hold it
themselves with gears and legs on a simulated route — what structured training outdoors actually
is. It is judged more complex than its value warrants today and is not phase 4. The primitives
exist if it is ever wanted: the ride screen already carries manual power, cadence and heart rate
targets, and the plan chart already draws a target timeline.

## Consequences

- Phase 4's headline becomes the ghost — your previous ride on a route, drawn against the current
  one — which is a feature about a route ride being more interesting, not about blending two modes.
- `Ride` and `Workout` stay two screens with no combined third. Code written on the assumption
  that a ride has a route _or_ a workout is now correct by decision rather than by accident, which
  is worth knowing before anyone "generalises" it.
- A rider who wants both does the workout and the route as two sessions. That is a real cost and
  the honest one: there is no arrangement in which an ERG interval is also a climb.
- `rideTitle` keeps its branch for a ride carrying both a route and a workout, and `matchesType`
  keeps its deliberate ruling that such a ride counts as a route ride. Defensive handling for a
  shape this ADR says will not be created, kept because an imported archive from a future build
  could still carry one. It is not an invitation to build the feature.
- Nothing about this decision is about the format. A workout is still a plan with targets, and
  nothing in `src/workout/` assumes the absence of a route.
