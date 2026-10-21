# 0017. Changing FTP never rewrites history

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Almost every figure this app shows is relative to a functional threshold power. Power zones are
fractions of it (ADR-0013), TSS is anchored to an hour at it (ADR-0015), and a workout written in
percentages means nothing without one.

So far FTP has been a number the rider types into their profile and rarely changes. That is about
to stop being true. An FTP test, and a detection that watches recorded power and offers a higher
number, are both planned. Once FTP moves on its own, the question of what happens to everything
already recorded stops being theoretical.

There are only two possible answers and they cannot both be held:

**Recompute.** Every ride's zones, intensity and TSS are derived from the current FTP, so the
history is always expressed in today's terms. It is internally consistent, and it is what you get
by accident if nothing says otherwise — storing one FTP and dividing by it is the obvious
implementation.

**Freeze.** Each ride keeps the FTP it was ridden with, and a new FTP changes only what is ahead.

Recompute is wrong, and wrong in a way that is hard to see until it has happened. A ride that was
genuinely hard at the FTP you had in March becomes a soft ride in October, not because the ride
changed but because you got fitter. The record of having done something difficult is destroyed by
the evidence that it worked. Worse, the destruction is silent and retrospective: nothing on screen
says the number used to be different, and a rider comparing this Tuesday to last Tuesday is
comparing two things measured with a ruler that has since been rescaled.

## Decision

**A ride freezes the settings it was ridden with, and nothing ever rewrites them.** That was your
FTP at that time.

`RideSettings` on a stored `Ride` carries `ftp`, `hrMax`, the two masses, the trainer difficulty
and the workout scale, captured at save. Everything a completed ride displays — its zone ladder,
its TSS, its intensity — is computed from that frozen record and never from the profile.

The profile's FTP governs only what has not happened yet: the zones on the ride you are on now,
and the TSS shown against a workout in the library, which is a plan rather than a record.

**This binds the planned FTP features.** A test may propose a number and a detection may offer
one; neither may touch a stored ride. Nothing in the app recomputes a past ride under a new FTP,
and a feature that would is to be rejected on sight rather than discussed.

## Consequences

- Your history means what it said at the time, and a hard ride stays a hard ride.
- The workouts list behaves the opposite way, deliberately: raise your FTP and every
  percentage-based workout's TSS moves, because a plan is a statement about what you will be asked
  to do, not a record of what you did. Riders find this surprising the first time. It is correct.
- Two rides months apart are compared through two different FTPs, so a TSS from March and one from
  October are not strictly the same unit. This is the honest version of the problem — the
  alternative is not comparability but the illusion of it.
- `Ride` carries settings it will never use again, which looks like redundancy to anyone reading
  the type cold. The comment on `RideSettings` says why; this ADR is the long form.
- An archive exported from an older build and imported later keeps its frozen settings. Import
  must never fill a missing FTP from the current profile — absent means unknown, and a figure
  computed from the wrong FTP is worse than one that is absent.
- Nothing stops a rider correcting an FTP they typed in wrongly at the time, because nothing
  offers that. If it is ever wanted it is an explicit edit of one ride, visibly, and not a side
  effect of changing the profile.
