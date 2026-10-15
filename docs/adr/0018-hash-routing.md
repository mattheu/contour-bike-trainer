# 0018. Hash routing, reversing "no router"

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Phase 2 deliberately had no router. `App.tsx` said so in as many words: _"Phase 2 has no router: the
screen is one piece of state and every transition is an action the rider took."_ That was right at
the time. The screen set is flat — three lists, a ride, a summary, an editor, two panels — with no
hierarchy for a URL to express, and a router would mostly have re-encoded one piece of state as a
string.

The argument against went further than "not worth it", and that part turned out to be wrong. It
held that the browser's back button was a hazard rather than a feature: a ride in progress is not
addressable, its state lives in the engine, and pressing back mid-interval would look like leaving
the ride. So the headline benefit of routing had to be switched off precisely where someone would
reach for it.

The author's answer: that is the same problem as closing an unsaved document, it is solved
everywhere, and the solution is a confirmation rather than the absence of navigation. Which is
correct. The objection was never about routing being wrong; it was about one screen needing a guard.

That guard turned out to be overdue for an unrelated reason. Nothing in the app registered a
`beforeunload` handler, so a reload or a closed tab mid-ride destroyed the ride outright — the
recorder holds its samples in memory until the ride is saved. The hazard existed with no router
anywhere near it.

## Decision

Hash routing, hand-written, no library.

| Path                           | Screen                                     |
| ------------------------------ | ------------------------------------------ |
| `/login`                       | The login screen; `/` is an alias for it   |
| `/routes` `/workouts` `/rides` | The three lists                            |
| `/workouts/:id`                | The workout editor                         |
| `/ride`                        | Whatever is being ridden, route or workout |
| `/rides/:id`                   | A ride's summary                           |

**Hash, not the History API.** A static build needs no server rewrite rules, and it keeps working
under `file://` when Electron arrives at phase 5 (ADR-0000). The History API would need both of
those solved for no visible gain.

**No library.** ADR-0012 records deliberate non-dependencies. This is a hash listener and a parse
function, both pure and testable, in the order of thirty lines.

**One path for a ride, and a ride is not deep-linkable below that.** `/ride` covers a route ride
and a workout alike. There is deliberately no path to a step or an interval: a step is engine
state, not a location, and a URL naming one would be wrong the moment the rider skipped it.

**`/login` is where a session-less install goes**, whatever hash it was opened on, and it is
not a screen a signed-in rider can sit on — reaching it with a session resolves straight to the
routes list. `/` is an alias rather than a root of its own, so there is one address for the
screen and phase 5's expired session already has somewhere to send people.

**`/ride` is only valid while a ride exists.** Reached cold — a bookmark, a reload after the ride
ended — it redirects to the routes list rather than rendering a ride screen with no ride behind it.
This is the rule that stops a URL claiming state the engine does not have.

## Consequences

- Back works, and mid-ride it asks first. The confirmation is the thing that makes routing safe
  here, so it is part of this decision rather than a detail of it.
- **Two guards, not one.** `beforeunload` catches reload and tab close; in-app back needs its own
  `popstate` guard. They ask the rider the same question through different plumbing and neither
  covers the other. Removing one because the other exists is the mistake this bullet is here to
  prevent.
- The URL is a view of the screen state, not the source of it. The engine still owns what is being
  ridden, and `/ride` describes that rather than causing it — which is why the cold-entry redirect
  exists and why no deeper path does.
- Electron has no address bar, so the rider-facing half of this — bookmarking, a visible back
  button — is worth less after phase 5 than before it. The testing and deep-link half survives
  intact, and hash routing costs nothing there.
- Tests can open a screen directly. That is a genuine benefit and a mild hazard: a spec can now
  start in a state no rider can reach, and a suite built entirely that way would pass over a broken
  path to the screen. Navigation by clicking stays the default in the e2e suite.
- This reverses a decision stated in the code and in `SPEC.md`. Both are updated; this ADR is the
  record of why, because "we decided not to, then we did" is exactly what an ADR is for.
