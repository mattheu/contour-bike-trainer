# 0012. Deliberate non-dependencies

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

A small dependency list is not an achievement in itself, and this ADR is not an argument for
purity. It exists because the default path of least resistance adds a package for every problem,
each addition is individually defensible, and the aggregate is a maintenance surface nobody chose.

The packages below are the ones most likely to arrive by habit rather than decision. Recording
why each is absent is cheaper than re-litigating it, and gives a reviewer something to point at
when one shows up in a diff.

The related decision — which packages _are_ here, and why each — is the dependency table in
SPEC.md. Two of those choices have non-obvious reasoning and are recorded below as well.

## Decision

Not used, deliberately:

- **No `uuid` package.** `crypto.randomUUID()` is built into browsers and Node, and
  client-generated ids (ADR-0002) are the only thing we need one for.
- **No date library.** `Intl.DateTimeFormat` for display and arithmetic on seconds for everything
  else covers this app completely. Rides are durations in seconds and ISO 8601 timestamps; there
  is no timezone maths, no recurrence, no parsing of user-entered dates.
- **No router.** Screens are a `useState` enum. There are six of them, no deep links, no back
  button semantics worth preserving, and nothing to bookmark. Phase 5's mirror view is one
  `location.pathname` check.
- **No state management library.** Ride state lives in a plain TypeScript store outside React
  (ADR-0009), which React reads through `useSyncExternalStore`. There is genuinely nothing for
  Redux or its descendants to do: one store, one writer, one subscription.
- **No React Testing Library.** Vitest covers the logic and Playwright covers the UI. A third
  layer in between would test the least valuable seam — components that are close to stateless
  renderers by design — and would do it against a simulated DOM rather than a real browser.
- **No chart or component library.** See ADR-0004: the profile, trace and workout chart are
  hand-written SVG because none of them is a general-purpose chart.

Two positive choices worth recording here, because the reasoning is not obvious from the package
name:

- **`fast-xml-parser` rather than the built-in `DOMParser` for GPX.** `DOMParser` is free and
  already in the browser, which makes its rejection look like a mistake. It is a DOM API. Using
  it would put `route/gpx.ts` on the wrong side of the rule that nothing outside `src/ui/` touches
  the DOM (ADR-0009), make the module untestable in plain Node, and force happy-dom into Vitest
  so that a unit test can parse a text file. A parser is the right tool for parsing; the DOM is
  incidental to the format.
- **`yaml` rather than `js-yaml` for workouts.** Phase 3 requires validation errors that name the
  offending line, and `yaml` reports line and column on parse failures. See ADR-0006.

## Consequences

- Some things are hand-written that a package would have given us: screen switching, date
  formatting, the charts. Each is small and each is now ours to maintain and to get subtly wrong.
- The `useState` enum for screens has no browser history integration, so the back button does
  nothing useful within the app. Accepted for a desktop-only app you open and ride; it becomes a
  real limitation the moment deep links matter, and that would be a new ADR rather than a quiet
  `npm install`.
- In-memory filtering and no router together mean this list assumes a single user with a personal
  amount of data. Several entries here are "not needed at this size" rather than "wrong", and
  they should be revisited on the evidence, not defended on principle.
- No React Testing Library leaves a real gap between the Vitest and Playwright layers: a
  component that renders the wrong value from a correct store is caught only by Playwright, or by
  eye. That gap is accepted because the components are thin; it widens if they stop being thin,
  which is a signal the boundary is slipping rather than a reason to add the library.
- This list is a decision, not a rule. Adding any of these is fine — it just needs an ADR
  superseding the relevant part of this one, which is a few minutes of writing and the point of
  the exercise.
