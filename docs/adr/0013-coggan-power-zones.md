# 0013. The six Coggan power zones, and five for heart rate

- **Status:** Accepted
- **Date:** 2026-10-13
- **Supersedes:** [0007](0007-five-equal-zones.md)

## Context

ADR-0007 chose five power zones at even 20 % splits of FTP, reasoning that the ladder was an
orientation aid — where am I now, where am I aiming — rather than a training prescription, and
that an even split made the marker travel at one rate across the whole ladder.

Phase 3 changes what the ladder is for. A workout states its targets as percentages of FTP
(`power: 95%`), and the screen shows the target against the ladder. The rider is no longer asking
"roughly where am I" but "is this threshold". An even split answers that wrongly: at FTP 265 the
two models put the zone 4 edge 26 W apart, which is a zone's difference at the effort that matters
most.

The zone boundaries also now reach the rider directly, through the zone previews under FTP in the
rider profile and the legend on the workout screen.

## Decision

**Power uses the six Coggan zones**, as fractions of FTP:

| Zone | Name            | Range     |
| ---- | --------------- | --------- |
| 1    | Active recovery | < 55 %    |
| 2    | Endurance       | 55–75 %   |
| 3    | Tempo           | 75–90 %   |
| 4    | Threshold       | 90–105 %  |
| 5    | VO2 max         | 105–120 % |
| 6    | Anaerobic       | > 120 %   |

Six rather than five with the top two merged: zone 5 and zone 6 are different physiological
systems, and a 5x3 at 115 % is not the session that 30-second efforts at 140 % are. Merging them is
a display simplification, not the science.

**Heart rate stays at five zones**, as percentages of `hrMax`: under 60 %, then 60–70, 70–80,
80–90, over 90.

Five against six is correct rather than inconsistent. Power is instantaneous and unbounded, so the
model can separate a thirty-second anaerobic effort from a three-minute VO2 one. Heart rate is
lagged and capped — it cannot exceed your maximum and takes minutes to respond — so those two
efforts land nowhere distinguishable on it. There is nothing a sixth heart-rate zone could mean.

## Consequences

The ladder gains a segment, so every component drawing it, and the power strip's zone-to-opacity
map, carries six entries. The strip keeps three washes across six zones: 1–2 easier than threshold,
3–4 around it, 5–6 above it. Six separable greys at those opacities would not be separable anyway.

**The marker no longer travels at a constant rate across the ladder.** Six equal segments over
uneven zones cannot do that, which was ADR-0007's main argument for even splits. The open ends are
pinned at 40 % and 150 % of FTP, chosen now to keep a plausible ride clear of both edges rather
than to equalise anything.

**Historic rides are unaffected.** A `Ride` freezes the FTP it was ridden with, and zones are
derived at render time from that frozen value, so changing the model re-reads old rides under the
new zones without rewriting what they recorded. That is the right behaviour: the ride's power is a
fact, its zone is an interpretation.

`design/mockups/Workout.dc.html` carried a five-segment ladder with the top two zones merged when
this was decided; the design is being revised to six.
