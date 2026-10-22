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

The temptation runs the other way at the boundary. A binary format is smaller and faster to
write, a custom container is easier than fitting a standard, and some of what we hold has no
standard to fit at all: TCX has nowhere to put an FTP, so the frozen settings that make a ride's
zones and load meaningful cannot be expressed in it.

## Decision

**Legibility is a property of the boundary, not of the store.** The two are separate decisions
and this ADR governs only the first.

**On the way out, nothing leaves in a format that needs this app to read it.** Three cases, in
order of preference:

- **Where a standard exists, use it.** Routes export as GPX. A ride for another service exports
  as TCX, as [ADR-0005](0005-tcx-rather-than-fit.md) settled. Portable by definition; we add
  nothing.
- **Where no standard exists but a human could read it, invent nothing.** Workouts export as
  YAML — [ADR-0006](0006-yaml-for-workouts.md) chose it for hand-editing, and the same property
  is what makes an exported workout portable.
- **Where the data is genuinely ours, write it plain.** A ride record with its frozen settings,
  its lap splits and its TSS has no standard that will hold it, so it goes out as JSON: open,
  self-describing, readable in any text editor. Ours is not the same as opaque.

**Inside, store whatever works best.** The shape in IndexedDB is an implementation detail and
carries no obligation from this ADR. Today it is plain objects, which is a sensible default and
should stay until something makes it worth changing — but that is convenience, not a value. A
binary sample encoding, a packed typed array or an opaque blob are all fair game, and picking
one is an ordinary engineering decision rather than an amendment to this ADR. The only
requirement is that the exporter can still produce the formats above from it.

## Consequences

- A full export is browsable. Unpacked it is a folder of real files — GPX you can open in any
  mapping tool, YAML you can read, JSON you can parse in four lines — rather than one artefact
  only this app understands.
- Export may have to convert rather than copy, and that cost is accepted. It is work a rider
  does rarely and deliberately.
- The store is free to change shape — for speed, for size, for a thousand-hour history — without
  touching this decision, so long as the exporter keeps up. If the two ever drift, the export is
  the one that is right.
- It does not mean every exported format is a standard. There is none for a workout, a rider
  profile or a ride's frozen settings, and inventing one for the sake of it would be worse than
  plain JSON that anyone can read.
- The rider profile is currently in **no** export at all, which this makes a gap rather than an
  oversight: FTP, maximum heart rate and the masses are the smallest data in the app and the
  only part with no way out.
