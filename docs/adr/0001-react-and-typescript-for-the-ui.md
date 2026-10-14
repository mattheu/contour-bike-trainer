# 0001. React and TypeScript for the UI

- **Status:** Accepted. Supersedes the project's original, unrecorded choice of Alpine.js.
- **Date:** 2026-09-30

## Context

Contour needs a UI layer for screens, the ride HUD, controls and forms. Everything else —
physics, route maths, BLE, storage, export — is plain TypeScript with no framework in it, and the
spec forbids anything outside `src/ui/` from importing React. So the question is narrow: what
renders the views?

The reactive surface is small and known. One plain TypeScript store, written by the ride engine,
read by React through `useSyncExternalStore`, updating at 1 Hz. There is no server, no routing to
speak of, no data fetching, and no second source of truth.

Two things about how this code gets written shaped the answer more than any benchmark. It is
largely generated and only lightly reviewed, and it is maintained by one person. That makes
_being wrong in ways nobody notices_ the dominant risk.

Alternatives considered:

- **Alpine.js** (the original choice). Its logic lives in untyped HTML attributes that TypeScript
  cannot check. A typo in an expression is a runtime surprise, and no editor or CI step catches
  it. Against the light-review risk above, that is disqualifying.
- **Svelte 5** and **Solid**. Both have better reactivity models than React for this shape of
  problem. Both also have thin and version-confused training data — Svelte 5's runes in
  particular are recent enough that generated code routinely mixes idioms from two major
  versions. Subtly wrong code that still runs is the exact failure we are trying to avoid.
- **Next.js**. A server framework for an app that is client-only by necessity (Web Bluetooth)
  and possibly Electron-bound. It would add a server we do not want and a build model we would
  spend time fighting.
- **React + TypeScript.** Unremarkable, verbose, and the best-documented option by a wide margin.
  `eslint-plugin-react-hooks` catches missing dependency arrays and stale closures, which is the
  specific failure mode this project is exposed to.

## Decision

React 19 with TypeScript for everything under `src/ui/`, styled with Tailwind, built by Vite.
React does not appear anywhere else in the codebase.

The deciding argument is not reactivity ergonomics. At one store and 1 Hz, every candidate is
comfortably fast enough and the ergonomic differences never get exercised. What discriminates is
correctness under light review: types on the logic, a linter that understands the framework's
hazards, and a training corpus deep enough that generated code is idiomatic for the version we
actually have installed.

## Consequences

- React is the most verbose option on the list. The components are close to stateless renderers
  by design, which softens this, but it is real.
- The parts of React that are genuinely fiddly — effect dependency arrays, stale closures over
  timers, synchronising external sources — mostly do not arise, because there is exactly one
  subscription and `useSyncExternalStore` is the solved pattern for it. That only holds while the
  boundary holds: the moment a component starts computing ride state, we inherit all of it.
- The `ui/` boundary has to be actively defended. Nothing enforces it today beyond review and
  convention; a lint rule banning React imports outside `src/ui/` would be cheap insurance.
- We carry React and React DOM in the bundle for an app whose rendering needs are modest. For a
  desktop-only, locally-served app this is not a cost worth optimising.
- Choosing the boring option means we do not learn whether Svelte or Solid would have been
  nicer. Given the code is not closely reviewed, "nicer" was never the criterion.
