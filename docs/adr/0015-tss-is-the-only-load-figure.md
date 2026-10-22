# 0015. TSS is the only load figure shown

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

A workout row needs one figure that answers "how hard is this". Four candidates were on the table,
and the design mockup at one point drew three of them side by side.

**Intensity as a word** — _Endurance_, _Threshold_, _VO2_. Zwift and TrainerRoad both label
workouts this way. There is no standard mapping from a plan to those words, every app draws the
boundaries somewhere different, and a session with a long warmup and three hard minutes would be
labelled by whichever rule we invented. It also duplicates what the author already wrote in the
name and description, for an audience of one person who wrote the file.

**Intensity factor** — `NP / FTP`. Honest and standard, but it says nothing about duration. A
twenty-minute opener and a three-hour session can share an IF, which makes it the wrong single
number for a list whose other column is already length.

**Normalised power in watts** — the input to the other two. Meaningful to someone who already
thinks in NP, meaningless beside a length and a name, and it changes with FTP in a way that reads
as noise on a list.

**TSS** — `hours × IF² × 100`, anchored so an hour at FTP scores 100. Linear in duration and
quadratic in intensity, which is the trade-off the figure is supposed to express.

## Decision

One load column, in TSS. No intensity word, no intensity filter, no IF or NP anywhere in the UI.

It is computed, never stored: from the plan's target series at the relevant FTP for a workout, and
from recorded power for a completed ride. One function in `src/workout/load.ts` does both, which is
what makes "was that harder than last Tuesday" a single comparable number across a plan and a ride.

The workout's own `ftp:` key is used when it has one; the rider profile's FTP otherwise.

## Amended 2026-10-22: where a ride's TSS lives

The decision above stands. What it did not say is where the ride half of it is kept, and the answer turns out to matter: **a ride stores its TSS, computed at save.**

TSS needs the full sample series, and samples are deliberately split out of the records the rides list loads. So a figure not stored at save can only be recovered by walking the samples of every ride, which is the cost this separation exists to avoid. The rule, which the ghost's lap splits follow for the same reason: _store the expensive derivation, derive the cheap one from it._

This is the thing that redeems the justification above. "Was that harder than last Tuesday" was named as why TSS earns its place, and the ride side of it had never been built — so the claim sat unredeemed for a time. Storing it is what makes it available; displaying it is a separate decision, and the honest place is beside the planned figure a workout already shows, because a lone number on one ride is only meaningful in an aggregate this app has deliberately declined to build.

## Consequences

- A percentage-based workout's TSS changes when the rider's FTP changes. That is correct — the
  plan asks for a share of their threshold, and the load of that share is relative to it — but it
  does surprise people who expect a figure on a row to be a property of the file.
- A ride freezes the FTP it was ridden with, so updating the profile never rewrites training
  history even though every score is relative to an FTP. ADR-0013's zones carry the same rule for
  the same reason.
- **A `free` block contributes nothing to planned TSS** while still occupying its time, because
  there is no target to score. A workout built mostly of free blocks shows a figure lower than the
  work it asks for. That is the honest answer rather than a guess at what the rider might do, and
  the ride's actual TSS from recorded power is unaffected and correct.
- NP's 30-second rolling average barely moves a steady block but does smooth ramps and short
  intervals, so a 30/30 session scores a little below the arithmetic its targets suggest. This is
  the standard behaviour of the metric, not an artefact of ours.
- Dropping the intensity word means the only prose about what a session is for is the name and
  the `description:` the author wrote. For a library of one person's own files that is enough; a
  shared library would want the label back, and would then have to decide what it means.
- TSS is Coggan's, as the zones are. It is a well-known model rather than a correct one, and the
  usual criticisms of it apply here too. It earns its place by being comparable with every other
  tool the rider already uses, not by being right.
