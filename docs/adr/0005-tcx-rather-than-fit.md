# 0005. TCX rather than FIT for v1

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Every ride has to leave the app and land in Strava, which is the only export destination v1
cares about. Strava accepts GPX, TCX and FIT.

GPX is out: it has no standard place for power, which is the number the ride is mostly about.

That leaves TCX and FIT. FIT is the native format of the cycling ecosystem, more compact, and the
one head units produce. It is also a binary format with a message-and-field schema, a CRC, and
developer fields — meaning we would write and debug a binary encoder, and every bug in it would
present as "Strava rejected the file" with nothing readable to inspect.

TCX is XML. It carries everything the recording holds: `TrainingCenterDatabase` with one Activity
of sport Biking, one Lap, and Trackpoints with Position, AltitudeMeters, DistanceMeters,
HeartRateBpm, Cadence and power as `ns3:TPX/Watts`.

## Decision

TCX for v1. `src/export/tcx.ts` turns a sample series into a TCX string, unit tested against a
scripted `FakeTrainer` series so the output is byte-identical on every run. The file downloads as
`contour-YYYY-MM-DD-HHmm.tcx`.

Revisit only if Strava rejects something we actually need.

## Consequences

- The exporter is string generation with no binary encoding, no CRC and no schema library, and
  its output can be read in a text editor when something is wrong. Diffing two exports is a
  meaningful debugging step.
- Files are several times larger than the FIT equivalent: XML at 1 Hz for two hours is a few
  megabytes. For a manual download-and-upload this does not matter.
- The power namespace (`ns3:TPX`) is a Garmin extension rather than part of the base schema. It
  is universally supported in practice, but it is a convention we are relying on, not a
  guarantee.
- Anything FIT can express and TCX cannot — left/right balance, per-lap structure beyond a single
  lap, workout step metadata — is simply not exported. Nothing in v1 needs it.
- Phase 6's Strava upload inherits this format. If a later phase does need FIT, the change is
  confined to `export/`, because nothing above it knows the file's shape.
