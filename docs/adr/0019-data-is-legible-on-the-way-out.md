# 0019. Data is legible on the way out

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Everything this app records lives in one browser, in one origin, on one machine. That is a
deliberate property — browser-only is a feature, not a stage to grow out of — and it puts a
corresponding obligation on the export: it is the only way a rider's riding leaves the device it
was recorded on.

"Exportable" is not a strong enough test for that. A zip of opaque blobs is exportable and
useless. What a rider actually needs is to open the thing in five years, on a machine that has
never heard of this app, and still have their riding.

The temptation runs the other way at every turn. A binary format is smaller and faster to write.
A custom container is easier than fitting a standard. And some of what we store genuinely has no
standard to fit: TCX has nowhere to put an FTP, so the frozen settings that make a ride's zones
and load meaningful cannot be expressed in it at all.

## Decision

**Nothing leaves this app in a format that needs this app to read it.** Three cases, in order of
preference:

**Where a standard exists, use it.** Routes export as GPX. A ride for another service exports as
TCX, as [ADR-0005](0005-tcx-rather-than-fit.md) settled. These are portable by definition and we
add nothing.

**Where no standard exists but a human could read it, invent nothing.** Workouts are YAML —
[ADR-0006](0006-yaml-for-workouts.md) chose it for hand-editing, and the same property is what
makes an exported workout portable. Not a standard for workouts; legible, which is the half that
matters when there is no standard to be had.

**Where the data is genuinely ours, keep it plain.** The ride record with its frozen settings,
its lap splits and its TSS has no standard that will hold it. It is JSON: open, self-describing,
and readable in any text editor. Ours is not the same as opaque.

**The corollary, which is the part worth keeping:** if something we want to store cannot be
expressed legibly, that is a reason to question the feature rather than to invent a binary format.

## Consequences

- A full export is browsable. Unpacked it is a folder of real files — GPX you can open in any
  mapping tool, YAML you can read, JSON you can parse in four lines — rather than one artefact
  only this app understands.
- It costs size. JSON samples at 1 Hz are repetitive and verbose, and a binary encoding would be
  a fraction of it. Compression recovers most of that without costing legibility, which is why
  the container compresses and the files inside do not.
- It costs some speed on import, which is parsing text rather than mapping a buffer. An import is
  a thing a rider does rarely and deliberately, so the trade is one-sided.
- **It constrains future features**, deliberately. Anything that would want an opaque store — a
  binary sample encoding for a thousand-hour history, a proprietary model file — has to justify
  itself against this first.
- It does not mean every format is a standard. There is no standard for a workout, a rider
  profile or a ride's frozen settings, and inventing one for the sake of it would be worse than
  plain JSON that anyone can read.
- The rider profile is currently in **no** export at all, which this makes a gap rather than an
  oversight: FTP, maximum heart rate and the masses are the smallest data in the app and the only
  part with no way out.
