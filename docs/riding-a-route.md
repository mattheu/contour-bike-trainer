# Riding a route

## Choosing one

The **Routes** tab lists what you can ride. Each row shows a thumbnail of the route's profile, its
name, distance, elevation gain, and how many times you have ridden it.

Real routes ship with the app, and no synthetic ones, because an app about riding real roads
should not open on a test fixture. They run from a 1.5 km town-centre race circuit to Alpe
d'Huez, and most of them are loops.

`routes/manifest.json` is the list — name, region, distance, gain and a sentence each. This page
does not repeat it. A set that gains and loses a route most weeks would leave two lists to keep
in step, and the one here is the one that would quietly go wrong.

Clicking a row starts the ride immediately. There is no confirmation step — the row _is_ the
button.

Every row has **Download**, which gives you that route's GPX file.

**Import routes** below the list reads a GPX and adds it. A file holding several tracks becomes
one route per track, so the file you get from **Download all routes** reads back as the routes it
came from rather than as one enormous ride.

A route you imported also has **Remove**, which takes two presses. The five that ship with the app
do not: built-in routes stay, and they are refreshed from the project on every launch, so a route
corrected or added there reaches you. Removing an imported route destroys the only copy this app
holds — download it first if you want it back.

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

Reaching the end of a point-to-point route ends the ride on its own. **A loop does not stop you at
the start line**: it rolls through onto the next lap, and keeps going until you end it. Most of
the bundled routes start and finish in the same place, and the app works that out from the route
itself rather than being told, so a loop you import laps too.

A loop is marked **LOOP** beside its name, and once you come round it reads **LAP 2**. The profile
and the map show the lap you are on, filling again each time; the distance beside them is your
progress round this lap, and your total is the Distance reading. Pressing **End
ride** stops it wherever you are. The summary shows how far you got against the route's length —
`12.4 / 15.7 km` — so a half-ridden route is never mistaken for a completed one, and stopping a
hundred metres from the top does not read the same as abandoning after two minutes.

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
