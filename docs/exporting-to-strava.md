# Exporting to Strava

Contour does not talk to Strava directly yet. You export a file and upload it, which takes about
twenty seconds.

## Getting the file

Two places, and they produce exactly the same file:

- **Download TCX** on a ride's summary, which is the screen you land on when a ride ends.
- The **download icon** beside any row in the **Rides** list.

It saves as `contour-2026-09-30-1842.tcx` — the date and time you started, on your own clock,
because that is the clock you rode by and the one you will look for the file under.

TCX is plain XML. You can open it in a text editor and read it, which is most of why it was
chosen over the binary FIT format.

## What is in it

One activity, of sport Biking, with one lap and a trackpoint for every second you were moving.
Each trackpoint carries:

- the time;
- latitude and longitude from the route;
- altitude and distance;
- heart rate, if a strap was connected;
- cadence;
- power, as a Garmin activity extension — which is the form Strava reads watts from.

Anything that was not measured is left out rather than written as nought. A second with no heart
rate has no heart rate element, because nought beats per minute is a different claim from a strap
that was not on.

## Uploading it

1. Go to [strava.com/upload](https://www.strava.com/upload) and drop the file in, or use the
   Strava mobile app's manual upload.
2. Strava processes it and opens the activity.
3. **Keep it off the segment leaderboards.** See below — this needs doing, and it is not what
   you would expect.

## Why the ride needs a second step

The positions in the file are real route coordinates that you rode indoors, which is what every
virtual cycling platform uploads. Strava matches segments on any file carrying real GPS and time,
so an indoor ride filed as an outdoor one lands on leaderboards against people who were actually
outside. A lap of a famous descent will take a KOM you did not earn.

**You cannot fix this by setting the type to Virtual Ride.** Strava does not let an athlete
classify an activity as virtual: that category is reserved for activities a supported virtual
trainer recorded as virtual, which means the uploading application declared it. A file you upload
by hand arrives as an ordinary Ride and stays one.

What you can do, in the order we would pick:

1. **Flag your own activity.** It leaves public leaderboards, stays public on your profile, and
   keeps its map. The closest thing to what Virtual Ride would have done.
2. **Tag it as Indoor.** It leaves the leaderboards, but the map goes too.
3. **Change the type to Workout.** Off cycling segments entirely, and it stops reading as a ride.
4. **Make it private.**

This is the strongest argument for a FIT export, which would declare itself virtual in the file
and need none of this — see the amendment on
[ADR-0005](adr/0005-tcx-rather-than-fit.md).

## What you should see

A map that follows the route, a power curve, cadence, and heart rate if you wore a strap.
Distance and elevation gain should match what the app showed, within rounding.

If you have the Strava iOS app installed and connected to Apple Health, the ride reaches Health
from there. Contour does not write to Health itself and is not going to.

## If Strava rejects it

- **"Unable to process"** usually means the file is truncated. Export it again.
- **No power** means the activity was filed as something other than a ride, or the upload lost
  the extension block. Check the activity type first.
- **No map** means the ride was recorded without a route — there is nothing to draw.

A later release adds an upload button and does this for you. Until then the file is the interface,
and it is a perfectly good one.

## Getting a ride into Apple Health

There is no direct route and there cannot be one: Apple Health has no network API at all — no
HealthKit in Safari, no REST endpoint, nothing a browser can address. It is a local store on a
phone with a native-only SDK. Routing through Strava does not work either; Strava stopped
forwarding third-party activities to Apple Health in 2022, and an activity uploaded by hand or
through the API is exactly what it stopped forwarding.

What does work is the same TCX, opened on the phone by an app that holds the HealthKit
permission. [HealthFit](https://apps.apple.com/app/healthfit/id1202650514) is the one we use;
RunGap and Health Auto Export do the same job. Download the ride, open it in the app, and it
writes a workout into Health.

Nothing in Contour needs to change for this, which is why it is documented rather than built.
