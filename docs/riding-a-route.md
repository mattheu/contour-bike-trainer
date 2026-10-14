# Riding a route

## Choosing one

The **Routes** tab lists what you can ride. Each row shows a thumbnail of the route's profile, its
name, distance, elevation gain, and how many times you have ridden it.

Three real climbs ship with the app:

- **Greenhow Hill**, Yorkshire Dales. 67 km, 1,104 m — the long one, and the only route here where
  the climbing is spread rather than stacked.
- **Sa Calobra**, Mallorca. 13 km, 702 m — relentlessly consistent, which makes it the honest test
  of whether you can hold a number.
- **Alpe d'Huez**, Oisans. 16 km, 1,259 m — trimmed to finish at the top rather than running on
  through the village.

Two synthetic routes ship alongside them, named as what they are:

- **Test Route 1 — Rolling.** 20 km, about 250 m of climbing, continuous gentle undulation with
  nothing sustained.
- **Test Route 2 — Mixed.** 30 km, about 700 m of climbing: a flat start, a 5 km climb that ramps
  to 12 %, a fast descent, then rolling terrain to the finish. This is the one that makes the
  difficulty slider obvious.

Clicking a row starts the ride immediately. There is no confirmation step — the row _is_ the
button.

Each row has **Download**, which gives you that route's GPX file, and **Delete**, which removes it
from this install. Deleting takes two presses and the route stays gone — the bundled routes are
seeded once, on first run, not restored on every launch. The GPX is still in the project, so a
route you delete can be brought back by clearing the app's storage.

There is no route import yet. Adding one means dropping a GPX file into the project and adding an
entry to its manifest, which the project [README](../README.md) covers. Because routes are seeded
only on first run, a route added to the manifest later will not appear in an install that has
already been used.

## While you are riding

Three controls sit at the top right of the ride screen.

| Control            | What it does                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| **Pause / Resume** | Stops and restarts the clock. **Space** does the same thing without looking. |
| **End ride**       | Ends it where you are and saves it.                                          |
| The gear icon      | Opens the settings panel over the ride, without pausing it.                  |

Paused means properly paused: the clock stops, the distance stops, and nothing is recorded.
Resuming carries on from the same distance rather than catching up on the time you spent off the
bike.

The settings panel holds the trainer difficulty slider and three optional targets — power,
cadence and heart rate. All of it takes effect on the ride in progress; see
[reading the ride screen](the-ride-screen.md) for what each one does.

## Alerts

A single strip appears under the header when something needs saying, in one of three levels:

- **Info** — a passing note, such as the trainer reconnecting. It clears itself after five
  seconds.
- **Warning** — amber bar on the left, and it stays until you dismiss it or it resolves itself.
- **Fault** — a solid amber strip with a **Retry** button. The ride is stopped until it is dealt
  with.

The one you will meet is the trainer dropping out. The ride keeps going on the last power the
trainer reported for **ten seconds**, showing a warning, and then pauses itself and shows a
fault. That is deliberate: riding on a ten-minute-old power reading would record a ride you did
not do. Power the trainer back on and it reconnects; press **Resume** when you are ready.

While the trainer is away, power, cadence and speed go grey and show a dash. A greyed number is a
reading that is no longer live, not a reading of nought.

## Finishing

Reaching the end of the route ends the ride on its own — there is no lap two. Pressing **End
ride** stops it wherever you are; a ride ended that way is marked _ended early_ on its summary,
so a half-ridden route is never mistaken for a completed one.

Either way you land on the ride summary: time, distance, climbing, average power and average
heart rate, with the full profile and the ride's power laid under it. **Download TCX** is
covered in [exporting to Strava](exporting-to-strava.md). **Done** takes you to your history.

## Your history

The **Rides** tab lists every ride, newest first, with its date, route, distance, moving time and
average power. Three filters sit above it. **Type** is All, Routes or Workouts; choosing Routes
reveals a route filter and choosing Workouts reveals a workout filter, so the second filter is
always about what you have actually selected. **Period** sits on the right — month, three months,
year, or everything. The heading totals whatever is currently shown.

Clicking a row opens that ride's summary again. The download icon beside a row exports it
without opening it.
