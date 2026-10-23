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

## Amended 2026-10-23: the encoder argument has expired

The Context above says choosing FIT would mean writing and debugging a binary encoder, with
every bug presenting as "Strava rejected the file". That is no longer true, and the record
should not mislead whoever reads it next.

Garmin publishes `@garmin/fitsdk` on npm. It is ECMAScript modules, runs in a browser, has an
`Encoder` class, has no runtime dependencies, and its profile already defines the
`virtualActivity` sub-sport. There is no encoder to write.

Two costs replace it:

- **Weight.** The package is 1.4 MB unpacked, of which 1.0 MB is `profile.js` — the message and
  field schema for every FIT message type, where an export needs perhaps six. It is one large
  object export, so it does not tree-shake. Loading it only when a rider exports would contain
  this.
- **Licence.** It ships under Garmin's FIT Protocol License Agreement rather than an open source
  licence. This repository is public and MIT. Consuming the package as a dependency does not
  redistribute its source, which is the reading taken on 2026-10-23.

The decision stands, with a different reason behind it. TCX is adequate for the sync path, which
sets the activity type through the Strava API and so never needs the file to declare itself. The
case for FIT is the rider who downloads a file and uploads it by hand: that ride arrives as an
ordinary Ride and can land on real-world segment leaderboards.

**Revisit when the manual download path matters more than sync**, rather than when Strava rejects
something. Strava does not reject our file. It categorises it as a ride that happened outdoors.
