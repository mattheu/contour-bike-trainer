# Reading the ride screen

Everything on the ride screen is either a reading or the route. There is nothing to earn and
nothing to unlock, so every pixel is one or the other.

## The three big numbers

Across the top: **Power** in watts, **Cadence** in revolutions per minute, **Heart rate** in
beats per minute.

Beside power is your share of FTP — `108 % FTP` means you are at 108 % of your threshold power.
Beside heart rate is the zone you are in, as `Z3`.

The watts are smoothed over about three seconds. A trainer reports a genuinely spiky number once
a second and the raw figure is unreadable; the smoothing is in the value, not in a fade on the
screen. The trainer is always sent, and the ride always records, the raw figure.

**A dash and a grey number mean the reading is not live** — the trainer or the strap has dropped.
It does not mean nought. A rider freewheeling at 0 W and a trainer that has stopped talking are
different things and the screen never conflates them.

## The five smaller numbers

| Reading      | What it is                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| **Elapsed**  | Moving time. The clock stops while you are paused.                           |
| **Distance** | How far you have ridden, against the route's total.                          |
| **Climbed**  | Metres ascended so far, against the route's total. Descents do not subtract. |
| **Speed**    | Solved from your power against the road, not read off the trainer's wheel.   |
| **Gradient** | The gradient of the road you are on right now, in accent colour.             |

Speed is calculated rather than measured. Contour takes the power you are producing, the real
gradient of the route, your weight and the bike's, and solves the standard cycling power equation
for how fast that would actually move you. 200 W on the flat gives about 34 km/h. On a descent
with no power at all you still roll, at whatever gravity and air resistance settle on, capped at
80 km/h.

The gradient shown is always **the real gradient of the route**, never the one the trainer has
been asked to reproduce. See _Trainer difficulty_ below.

## The zone ladders

Under power and heart rate sits a row of five segments. The lit one is the zone you are in, and
the tick shows how far through it you are. There is no axis, because the ladder is not a scale —
it is five equal steps, and zones 1 and 5 are open-ended so the tick parks at the edge.

**Power zones** are 20 % splits of FTP:

| Zone | Power          | At the default FTP of 200 W |
| ---- | -------------- | --------------------------- |
| 1    | under 60 % FTP | under 120 W                 |
| 2    | 60–80 %        | 120–160 W                   |
| 3    | 80–100 %       | 160–200 W                   |
| 4    | 100–120 %      | 200–240 W                   |
| 5    | over 120 %     | over 240 W                  |

**Heart rate zones** split the working range between 50 % and 100 % of your maximum, which lands
on the familiar model:

| Zone | Heart rate     | At the default maximum of 190 bpm |
| ---- | -------------- | --------------------------------- |
| 1    | under 60 % max | under 114 bpm                     |
| 2    | 60–70 %        | 114–133 bpm                       |
| 3    | 70–80 %        | 133–152 bpm                       |
| 4    | 80–90 %        | 152–171 bpm                       |
| 5    | over 90 %      | over 171 bpm                      |

Splitting the whole nought-to-maximum range into fifths would put zone 1 at nought to 38 bpm,
which nobody occupies. The usable range is the top half, so the fifths go there.

The ladders are an orientation aid — where am I now, roughly — not a training prescription.

**Targets.** If you set a power or heart rate target in the settings panel, an accent band
appears across the ladder at the target, plus or minus 5 %. Five per cent is roughly the
breath-to-breath variation of someone genuinely holding steady, which is what makes leaving the
band mean something. At ten it would never fire, and a signal that never fires is worse than
none.

Cadence has a ladder-shaped gap under it so the three columns line up. It has no zones.

## The elevation profile

The big chart is the route's elevation, start to finish, with the ground drawn as a hatched block
underneath.

- **Grey hatch is the road ahead. Accent hatch is the road behind you.** The boundary is where
  you are.
- **The dot on the line is you**, and the bubble above it is the gradient at that exact point.
- **Darker shading marks the uphill.** Four steps, at 2 %, 4 %, 7 % and 10 %, the darkest being
  anything over 10. The key at the bottom left of the screen is that scale. Descents and anything
  under 2 % are left unshaded — the chart shades effort, not slope.
- **`+188 m` on a stalk marks a summit**, and the number is the **gain of the climb below it**,
  not the height above sea level.
- **The vertical scale is exaggerated ten times.** A route that climbs 500 m in 30 km would be a
  flat line at true scale. The exaggeration is fixed rather than fitted to each route, so a flat
  route genuinely looks flatter than a hilly one instead of every route looking like the Alps.

**Route / 5 km** switches between the whole route and a window that travels with you. The shading
bands stay 250 m wide and simply render wider when you zoom.

Below the profile is the **power strip**: the watts you have actually produced, plotted against
distance rather than time, washed in by zone. It lines up with the profile above it, so you can
see what the climb cost you.

## The map

Not a map in the tile sense — there is no basemap, no attribution and no network request, and it
works with the internet unplugged. It is the route's own shape:

- the whole route as a muted line, with the part you have ridden picked out in accent;
- a marker at the start and a dot for you;
- a north arrow and a scale bar, so the shape has a size.

**Route / 500 m** zooms in and pans with you, for when the shape of the next corner matters more
than the shape of the whole ride.

## Trainer difficulty

The slider in the settings panel, nought to 100, default 50.

It scales the gradient Contour asks the trainer to reproduce. At **100** the trainer gives you
the road exactly. At **50** a 10 % climb feels like 5 %. At **0** the trainer stays flat whatever
the route does. It applies to descents too: at 50, a −8 % descent is sent as −4 %.

It exists because a 12 % ramp at full resistance is unrideable on a normal cassette with a
trainer that has no virtual gearing, not because the road is negotiable.

**Difficulty changes how the hill feels. It never changes how fast you move.**

This is worth being exact about. Your speed, your distance, your time and everything recorded in
the ride are solved from the **real** gradient of the route, always. Riding Mixed at difficulty 0
takes exactly as long as riding it at 100 for the same power, and produces the same track and the
same file. The only difference is what your legs were asked for. That is the difference between a
difficulty setting and a cheat, and it is why the slider is safe to drag mid-climb — which you
can, without pausing. The reasoning is recorded in
[ADR-0008](adr/0008-speed-uses-the-real-route-grade.md).

The current value is shown at the bottom right of the ride screen, and it is frozen into the
ride's record, so a ride at 20 and a ride at 80 are never silently compared as though they were
the same effort.

## Settings not on this screen

FTP and maximum heart rate set where the zone boundaries fall. This release uses 200 W and
190 bpm and has no screen to change them — that arrives with the settings screen in a later
phase. If those defaults are wrong for you, the ladders will read one zone out; the recorded
ride is unaffected, because nothing about the zones reaches the recording.
