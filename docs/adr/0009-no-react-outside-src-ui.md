# 0009. The `src/ui/` boundary: no React import outside it

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

React is capable enough to absorb this entire application. The ride engine could be a hook, the
physics could run in a `useMemo`, the trainer connection could live in a `useEffect`, and every
one of those would work. That is the risk: nothing pushes back at the moment a piece of logic
moves into a component, and each move looks locally reasonable.

What it would cost is the testability everything else in this project depends on. A physics
solver inside a hook needs a renderer and a test library to exercise; the same function in plain
TypeScript needs neither, and a 40-minute ride runs headless in milliseconds. It would also make
ADR-0001's reasoning unsound: React was chosen partly because its genuinely fiddly parts —
effect dependency arrays, stale closures over timers, synchronising external sources — mostly do
not arise here. That is only true while there is exactly one subscription.

## Decision

**Everything outside `src/ui/` is plain TypeScript with no React import.**

`ble`, `route`, `physics`, `workout`, `ride`, `storage`, `zones` and `export` do not import React,
do not import from `src/ui/`, and — for all but `ble` and `ui` — do not touch the DOM either.

The boundary is crossed in exactly one direction and one way:

- The ride engine is a plain class with `subscribe(cb)` and a snapshot getter. It knows nothing
  about React and runs headless in Vitest.
- React attaches with `useSyncExternalStore`. No `useEffect` polling the engine, no interval
  inside a component.
- BLE connections, the engine and the storage layer are created once at startup and passed down
  through context. Never created inside a component.
- No hook computes anything a Vitest test should own. If a calculation is worth testing it lives
  in `physics`, `route`, `workout`, `zones` or `ride`, and the component displays its result.
- Local `useState` is for local interaction only: which screen is open, whether a panel is
  expanded, unsaved text in the workout editor.

## Consequences

- Components end up close to stateless renderers, which is dull to write and the reason the test
  suite can cover the interesting parts without a DOM.
- Some indirection is genuinely extra work. Displaying a new derived value means adding it to the
  store and the engine rather than computing it inline where it is rendered, and that will feel
  like ceremony on the days it is one line either way.
- If the phase 1 gate goes Electron, or phase 5 adds a server, the non-`ui` half of the codebase
  moves or runs in a different process without modification. That portability is a side effect of
  the boundary, not an argument that was made for it.
- **Nothing enforces this today.** It holds by convention and review, on a codebase that is
  largely generated and only lightly reviewed — the exact conditions under which conventions rot.
  The single import that breaks it will not fail any check.
- The cheap fix is a lint rule, and it should be added: `no-restricted-imports` on `react` and
  `react-dom` for everything outside `src/ui/`, with an override re-permitting them inside it.
  ESLint's flat config makes this a handful of lines. This ADR only recommends it — the config
  was out of scope for the change that wrote this file — and the recommendation should be closed
  out rather than left standing.
