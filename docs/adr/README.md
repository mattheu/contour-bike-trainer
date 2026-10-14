# Architecture decision records

One file per decision, `NNNN-kebab-title.md`, in the standard form: Status, Context, Decision,
Consequences. They are written for someone joining in a year who wants to know _why_, not _what_.

| #                                                          | Decision                                                      | Status             |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| [0000](0000-shell-and-tick-source.md)                      | Shell and tick source — browser tab or Electron               | Proposed           |
| [0001](0001-react-and-typescript-for-the-ui.md)            | React and TypeScript for the UI                               | Accepted           |
| [0002](0002-async-repository-with-client-generated-ids.md) | Async repository interface with client-generated ids          | Accepted           |
| [0003](0003-bluetooth-behind-an-interface-with-a-fake.md)  | Bluetooth behind an interface, with a fake implementation     | Accepted           |
| [0004](0004-hand-written-svg-for-charts.md)                | Hand-written SVG rather than a chart library or canvas        | Accepted           |
| [0005](0005-tcx-rather-than-fit.md)                        | TCX rather than FIT for v1                                    | Accepted           |
| [0006](0006-yaml-for-workouts.md)                          | YAML for workouts                                             | Accepted           |
| [0007](0007-five-equal-zones.md)                           | Five equal zones rather than a physiological model            | Superseded by 0013 |
| [0008](0008-speed-uses-the-real-route-grade.md)            | Speed uses the real route grade, never the trainer-scaled one | Accepted           |
| [0009](0009-no-react-outside-src-ui.md)                    | The `src/ui/` boundary: no React import outside it            | Accepted           |
| [0010](0010-tailwind-rather-than-plain-css.md)             | Tailwind rather than plain CSS                                | Accepted           |
| [0011](0011-test-fixtures-are-not-routes.md)               | Test fixtures are not routes                                  | Accepted           |
| [0012](0012-deliberate-non-dependencies.md)                | Deliberate non-dependencies                                   | Accepted           |
| [0013](0013-coggan-power-zones.md)                         | The six Coggan power zones, and five for heart rate           | Accepted           |
| [0014](0014-the-stored-workout-is-its-source-text.md)      | The stored workout is its source text, not a parsed tree      | Accepted           |
| [0015](0015-tss-is-the-only-load-figure.md)                | TSS is the only load figure shown                             | Accepted           |

## Process

- Number sequentially; never reuse a number.
- Status is `Proposed`, `Accepted`, `Superseded by NNNN` or `Deprecated`. A `Proposed` ADR is a
  decision whose gate has not been passed — 0000 is written _before_ the experiment that settles
  it, so the criteria are on record rather than reconstructed afterwards.
- **A superseded ADR is marked, never edited to say something else.** The old reasoning is the
  record of what we believed at the time; rewriting it destroys the only thing an ADR is for. The
  replacement says what it supersedes, and the original's status points forward to it.
- Fixing a typo or a broken link is fine. Changing a decision is a new file.
- Consequences must include the genuine downsides. An ADR that only lists upsides is worthless.
