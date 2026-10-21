# 0006. YAML for workouts

- **Status:** Accepted — phase 3 built on it; see _What contact with phase 3 changed_ below.
- **Date:** 2026-09-30, accepted 2026-10-14

## Context

Phase 3 needs a format for structured workouts. They are hand-edited in a textarea inside the
app, by one person, and validated on save. There is no workout builder UI and no import in v1.

A workout is a name, an optional FTP override, and an ordered list of steps with a duration and
either a constant power or a ramp between two values. That is a shallow list of small records —
the shape most formats handle, so the format question is really about the editing experience.

The candidates were JSON, a bespoke line-based mini-format, and YAML. JSON in a textarea is
hostile to hand-editing: quoted keys, no comments, and a trailing comma is a parse error with
nothing useful to say about it. A bespoke format means writing a parser and a validator with good
error messages from nothing.

## Decision

YAML, parsed with the `yaml` package.

```yaml
name: 2x20 threshold
ftp: 250 # optional; falls back to the setting
steps:
  - { duration: 10m, power: 55% }
  - { duration: 20m, power: 95% }
  - { duration: 5m, power: 50% }
  - { duration: 20m, power: 95% }
  - { duration: 10m, ramp: [60%, 40%] }
```

Power is a percentage of FTP or absolute watts (`250W`); `ramp` interpolates linearly over the
step; durations accept `90s`, `10m`, `1h30m`.

Specifically `yaml` and not `js-yaml`: phase 3 requires validation errors that name the offending
line, and `yaml` reports line and column on parse failures. `js-yaml` does not, reliably enough
to build the requirement on.

Parsing lives in `src/workout/parse.ts` as a pure function from string to `Workout` or a list of
errors. Nothing about it touches the DOM.

## Consequences

- Comments, flow-style one-liners and no quoting make a workout readable and diffable, and a
  parse failure can point at a line number in the textarea.
- YAML is a large specification with well-known sharp edges. The Norway problem (`no` parsing as
  `false`) and sexagesimal-looking values are the relevant ones here; our own validation layer
  has to catch type surprises rather than trusting the parsed structure.
- The domain syntax inside the YAML — `10m`, `95%`, `250W`, `ramp: [a, b]` — is ours and needs
  its own parser, validator and error messages regardless of the container format. YAML saves us
  the tokenizer, not the semantics.
- It is a dependency where JSON would have been free. One small package, chosen for its error
  reporting, is a fair trade for the requirement it satisfies.
- Sharing workouts with other platforms is not addressed. Zwift's `.zwo` and TrainingPeaks'
  formats are unrelated, and an importer would be a phase 4 decision with its own ADR.

## What contact with phase 3 changed

The gate this ADR was written against — does the grammar survive a real runner — has been passed.
The duration grammar (`90s`, `10m`, `1h30m`) and the ramp form are unchanged. Four things were
added that this ADR did not anticipate, none of which disturbed the decision:

- `repeat:` blocks, which may nest. Expansion to the ridden list happens once, in
  `src/workout/expand.ts`, so the runner and the Steps panel cannot disagree about what step 4 of
  8 is.
- `power: free`, a step with a duration and no target. It is a control-mode change rather than a
  step type: ERG releases for the step's length and the trainer goes back to simulating a
  gradient. Deliberately not a ramp end — there is nothing to ramp to or from.
- `warmup:` and `cooldown:`, which are ordinary steps given their own keys so they come first and
  last whatever the file does, and are labelled without the author naming them.
- `cadence:` and `name:` on a step, and `description:` on the workout. Cadence is shown to the
  rider and never written to the trainer.

The YAML sharp edges the original consequences warned about were handled by not trusting the
parsed structure: `src/workout/parse.ts` walks the AST, rejects unknown keys outright rather than
ignoring them, and reads every scalar through its own validator. An unknown key is an error
because `powre: 95%` would otherwise be a step with no target that rode as something else.

Where the stored record keeps the text rather than the parsed tree, and why, is
[ADR-0014](0014-the-stored-workout-is-its-source-text.md).
