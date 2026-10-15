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
3. **Set the activity type to Virtual Ride.**

That last step matters. The positions in the file are real route coordinates that you rode
indoors, which is what every virtual cycling platform uploads — but an indoor ride filed as an
outdoor one lands on segment leaderboards against people who were actually outside. Virtual Ride
is exactly the category Strava provides for this, and it keeps the ride honest without hiding it.

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
