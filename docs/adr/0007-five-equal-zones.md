# 0007. Five equal zones rather than a physiological model

- **Status:** Superseded by [0013](0013-coggan-power-zones.md)
- **Date:** 2026-09-30

## Context

The ride screen shows a power ladder and a heart rate ladder: a row of segments where the lit one
says which zone you are in now, and a separate accent band says what you are aiming at.

The question is what the segments mean. The obvious answer is the standard training model —
Coggan's six power zones, with their deliberately uneven boundaries reflecting different
physiological systems. That is what an earlier draft of this project specified, rendered on an
absolute axis of 100–400 W for power and 90–190 bpm for heart rate.

Both parts of that draft were wrong.

The axis numbers were never real. They were recovered by measuring pixels in the design mockups,
which is to say they were an artefact of how wide someone drew a rectangle. Neither ladder's
scale had ever been written down.

The six-zone model was wrong for a different and more interesting reason. Uneven zones on a fixed
ladder mean the marker crawls through the wide ones and jumps across the narrow ones, so its
position stops corresponding to anything you can read at a glance while riding. And a ladder you
glance at every thirty seconds is not the thing that prescribes your training — the workout is.
Encoding a training model into an orientation aid gives it a precision it does not have and
cannot act on.

## Decision

Five zones, equal splits, numbered 1–5. The ladder is an orientation aid, not a training
prescription.

**Power** — 20 % splits of FTP: zone 1 under 60 %, then 60–80, 80–100, 100–120, over 120.

**Heart rate** — 20 % splits of the working range between 50 % and 100 % of `hrMax`, which lands
on the classic model: zone 1 under 60 % of max, then 60–70, 70–80, 80–90, over 90. Splitting the
whole 0–100 % into fifths would put zone 1 at nought to 20 % of max, which nobody occupies; the
usable range is the top half, so the fifths go there.

**The ladder has no absolute axis.** It is five equal segments, and a value's position is its zone
plus how far through that zone it sits. Zones 1 and 5 are open-ended, so their fractions clamp at
the edges.

**Targets** render as an accent band across the same ladder: the target ± `targetMarginPct`
(default 5), as a percentage of the target rather than of FTP. ± 5 % is roughly the
breath-to-breath variation of someone genuinely holding steady, which is what makes leaving the
band mean something; at ± 10 % you would never leave it, and a signal that never fires is worse
than none. The band is nearly pointless in ERG, where the trainer holds the target for you — it
earns its place in simulation and free riding.

All of it lives in `src/zones/` as pure, tested functions.

## Consequences

- The marker moves at one speed across the whole ladder, so its position is readable at a glance
  at 1 Hz from a bike. That is the entire point.
- Zone numbers here do **not** mean what they mean in TrainingPeaks, Zwift or a coaching plan.
  Someone who knows their Coggan zones will read "zone 3" and expect tempo, and they will be
  roughly but not exactly right. The UI must not imply otherwise, and the two ladders must never
  be labelled with borrowed names like "sweet spot" or "threshold".
- Equal splits have no physiological meaning. If Contour ever grows real training analysis —
  time in zone, training load, a plan — that analysis needs a proper model and this ladder is not
  it. That would be a new ADR, not a widening of this one.
- No absolute axis means no tick labels and no numeric scale on the ladder itself. The actual
  watts and bpm are shown as large numbers beside it, which is where you read a value anyway.
- Both ladders are derived from settings (`ftp`, `hrMax`), so a wrong setting silently mislabels
  every zone. Rides freeze the settings that produced them (ADR-0002), so at least historic rides
  do not re-zone when the setting is corrected.
- Recording the mockup-pixel mistake here is deliberate. The numbers were plausible enough to
  survive into a spec once; without this note they could be re-derived the same way.

---

**Superseded by [0013](0013-coggan-power-zones.md) on 2026-10-13.** The reasoning below held
while the ladder was only an orientation aid. Phase 3 states workout targets as percentages of
FTP, so the ladder has to show whether 90 % is threshold, and an even split puts that boundary in
the wrong place.
