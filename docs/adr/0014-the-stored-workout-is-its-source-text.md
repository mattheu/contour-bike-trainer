# 0014. The stored workout is its source text, not a parsed tree

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

ADR-0006 settled the format. What it did not settle is what goes in the repository when the rider
presses Save: the YAML they typed, or the `Workout` object it parsed to.

Storing the parsed tree is the obvious move. It is validated by construction, every consumer gets
a typed object without parsing anything, and the list can read `name` and `durationS` straight off
the record. It also means the editor has to render YAML back out of the tree, because the rider
edits YAML — there is no workout builder UI and will not be one in v1.

That round trip is where it falls apart. A serialiser writes its own idea of the file: comments
gone, flow-style one-liners expanded to block style, key order normalised, `1h30m` possibly
re-emitted as something equivalent but not what was typed. The starter workouts in `workouts/`
carry comments that explain the format to whoever opens them first — `# this one is written in
watts of its own; delete the line to ride it against your profile` — and a tree-based store
deletes them the first time the file is saved.

The second problem is worse. A stored tree is only as good as the parser that wrote it. Tighten a
validation rule, change the duration grammar, fix a bug in ramp handling, and every record written
by the old parser is now a tree that the new code's types describe but its rules would have
rejected. There is no migration to write because the original text is gone.

## Decision

The repository stores the YAML source text. `name` and `description` are denormalised onto the
record alongside it, filled by parsing on write.

Every consumer — the list, the sparkline, the TSS figure, the runner — parses that text through
the one pure function in `src/workout/parse.ts`. There is no second path and no cached tree.

The two denormalised fields exist for exactly one reason: a source that stops parsing still has a
name to appear in the list under. Nothing else reads them.

## Consequences

- A round trip through the editor returns the file the rider wrote. Comments, blank lines, key
  order and flow style all survive, because nothing ever re-emits the file.
- **A workout whose stored source no longer parses stays visible and fixable.** It keeps its row
  and its name, shows its parse error where its description would go, dashes its length and load,
  disables Ride, and opens in the editor. It is also exempt from the filters, so no filter can
  hide the one row the rider needs to reach. This behaviour is the whole point of the decision and
  is tested as such.
- A parser change re-reads every workout rather than migrating a store of trees. Workouts written
  before the change parse under the new rules, which is the behaviour we want and the reason there
  is no migration path to maintain.
- The cost is parsing on read. The list parses every workout on every render, and the runner
  parses once at `startWorkout`. For a library measured in tens of files of tens of lines this is
  not measurable; for thousands it would need a memo, and that memo would be a cache with an
  invalidation question attached. We are nowhere near that and should not pre-empt it.
- Validation is not free either: `parseWorkout` is called on write to fill the two fields, and on
  every read by every consumer. A slow or throwing parser is therefore a load-bearing dependency
  of the list screen rendering at all, which is why it never throws anything but
  `WorkoutParseError` and why the list renders the error rather than letting it escape.
- Nothing stops a record being written with a `name` that disagrees with the `name:` in its
  source — a direct repository write could do it. Only `saveWorkout` writes workouts, and it fills
  both from the same parse, so the two cannot drift in practice. A backend in phase 5 would need
  to hold the same rule.
