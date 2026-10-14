# Contour — design system

Contour is an indoor cycling app for a smart trainer. The interface is a line drawing: thin strokes, open space, large monospace numbers, one accent colour on a near-black ground. Every reading must be legible from a metre away.

This file holds the rules. The mockups in `design/mockups/*.html` hold the layouts. Each mockup is a self-contained HTML file that opens in a browser.

## Palette

| token    | value     | use |
|----------|-----------|-----|
| ground   | `#0C0C0B` | page background |
| ink      | `#E8E4DA` | primary text, current values, marker tick |
| muted    | `#8A867C` | labels, secondary figures, the route or plan ahead |
| hairline | `#2E2D2A` | rules, dividers, button borders, slashes |
| accent   | `#FF5A1F` | distance ridden, targets, the one primary control |
| alert    | `#F2C14E` | alerts only: warning edge, fault fill |

Accent marks what the rider has done or is aiming at. Muted marks the route or plan ahead. Use accent for one element per screen. Use no other colours.

## Type

Three families:

- JetBrains Mono 300, tabular figures, for every number.
- IBM Plex Sans 400 and 500 for labels, prose and buttons.
- Instrument Serif italic for the wordmark and for route and workout names only.

Ten sizes. Do not use sizes between them.

| px  | name          | use |
|-----|---------------|-----|
| 108 | hero          | the three primary readings on desktop |
| 72  | hero · tablet | the three primary readings on tablet |
| 44  | figure        | target or reading beside a hero; phone hero |
| 32  | stat          | secondary row; panel titles |
| 24  | title         | wordmark; route and workout names |
| 20  | sub           | slash totals; unit beside a hero; phone stats |
| 16  | body          | form labels; list meta |
| 14  | label         | tracked caps labels (uppercase, 0.14em); buttons; prose |
| 12  | caption       | small labels; mono readouts |
| 11  | micro         | axis ticks; zone numbers; keys |

A figure beside a hero is two steps smaller (108 → 44, 72 → 32, 44 → 20). Where width is tight it may be three steps smaller (108 → 32), never more. Its unit is two steps smaller than the figure. The slash between hero and figure is hairline. The figure is either the target ("/ 239") or the meaning of the reading ("108 % FTP", "Z4").

## Logo

The wordmark is Instrument Serif italic with per-pair letter spacing (negative margins per letter pair, not uniform tracking) and a drawn C–o join. The CSS is in `mockups/logo.html` under `.wm`.

Two treatments, no others:

- **Primary** — accent rectangle, square corners, no border, mark in ground. Contour rings behind the mark in ground at 16 %.
- **Inverted** — ground rectangle with a 1 px hairline border, mark and rings in accent (rings at 22 %).

The box hugs the mark: 0.28 em at the sides, 0.12 em top and bottom. Omit the rings below 64 px tall. Keep clear space around the box equal to the height of the lowercase o.

- **App icon** — the C alone at about 78 % of the square, optically centred, with every other ring at double scale behind it. No rings below 64 px.
- **In app** — every header uses the primary lockup at the control height: 48 px tall with the mark at 32 px on desktop, 44 px tall with the mark at 24 px on phones, no rings. Use the bare wordmark only on the launch screen and in print.

Never set the logo in ink, outline it or rotate it.

## Zones

Power uses six zones from Functional Threshold Power (FTP), following Coggan: Z1 under 55 %, Z2 55–75, Z3 75–90, Z4 90–105, Z5 105–120, Z6 over 120. Heart rate uses five zones from maximum heart rate.

Zone ladders give every zone the same width. A value sits proportionally inside its zone. One zone module drives the ladder, the chart washes, the power strip and the "% FTP" and "Z4" readouts.

## Marks

Strokes: 1 px hairlines, 1.5 px chart lines, 2.5 px for the ridden line. Square corners everywhere.

Charts use one diagonal hatch (8 px repeat, 0.8 px lines, rotated 45°): accent behind the marker, muted ahead of it. Gradient bands and power zones are flat washes at fixed opacities. Gradient bands cover uphill only, in 250 m bins: 2–4, 4–7, 7–10 and over 10 %. Summits are marked with a tick and the climb's gain ("+188 m"), not a name.

No shadows, gradients, glows, blur or rounded chips.

## Controls

Anything with a 1 px box is pressable; nothing else has one. Buttons are 48 px tall on desktop and tablet, 44 px on phones, with square corners, tracked caps and a transparent background at rest.

### Tones

- **Accent** — the one action the screen exists for: Pause on a ride, Start on a route, New workout. One per screen.
- **Ink** — selected: the active tab in a segmented group, or the single committing action in a panel (End ride in settings, Save).
- **Grey** — everything else: secondary actions, unselected tabs, icon buttons (ink glyph, grey box), Dismiss.

### States

| state    | treatment |
|----------|-----------|
| rest     | 1 px border, transparent fill |
| hover    | fill and border solid ink `#E8E4DA`, label ground; the accent button fills solid accent |
| selected | ink border, 10 % ink fill (`rgba(232,228,218,0.10)`), no hover, `cursor: default` |
| pressed  | same as hover, no movement |
| focus    | 2 px ink ring outside the box (`outline-offset: 2px`) |
| disabled | 40 % opacity, no hover |

A solid fill means "about to act". A faint fill means "current". The only motion is the 0.3 s colour change.

### Spacing

Spacing between buttons is either none or a clear gap. Buttons that act together form a group: they sit flush, each after the first pulls left 1 px to share a border, and the coloured member stacks on top (selected `z-index: 2`, hovered `z-index: 3`). All other buttons are 16 px apart on desktop and 12 px on phones. A group is either a row of actions (Pause | End ride) or one segmented choice (Route | 5 km), never both. A segmented group has exactly one ink member.

### Settings panel

Settings open in a right-hand panel over a 55 % scrim. The ride panel holds trainer difficulty (0–100, default 50), the ghost rider on or off and which ride it replays, targets and FTP. The profile panel holds FTP, maximum heart rate, weight, units and devices.

## Alerts

Alerts are one full-width strip under the header, 48 px tall, sliding down over 0.3 s. See `mockups/alerts.html`. Three levels:

- **Info** — hairline box, grey hatch fill, muted text, circled-i icon. For passing news such as "Heart rate connected". Clears itself after 5 s.
- **Warning** — hairline box, 2 px alert-amber left edge, amber triangle icon, ink text, Dismiss button. Stays until dismissed or resolved, for example "Heart rate signal lost".
- **Fault** — amber fill, ground text and icon, Retry button. The ride cannot continue, for example "Trainer disconnected". The affected reading turns muted and shows a dash.

Amber never appears in ride data. Never use red.

## Motion

Motion highlights change and confirms interaction. The app is flat, so motion is flat: slide, swipe and colour pulse. Never pop, lift, blur, scale or cast a shadow.

- Duration about 0.3 s, never more than 0.5 s.
- One ease-out curve everywhere: `cubic-bezier(.2,.7,.2,1)`. No springs or overshoot.
- A colour pulse (ink, settling to muted over 0.6 s) marks a change without moving the element.
- Live readings carry no effect. Displayed power is smoothed over about 3 s.
- Under `prefers-reduced-motion`, slides become cuts.

The reference sequence is the interval change in `mockups/animation-guide.html`: the target figure cuts and pulses; the accent band slides to the new window over 0.3 s; the live number and tick follow after 0.5 s, over 0.5 s; the lit zone crossfades as the tick crosses a boundary; the plan chart's wash and drop line step at the boundary.

## Screen rules

- Every screen fits one viewport with no scrolling. Header, stats and bottom band are fixed rows; the chart row flexes.
- Ride: three primary readings (power, cadence, heart rate) with zone ladders on power and heart rate; five secondary readings (elapsed, distance of total, climbed of total, speed, gradient); profile beside the map, each with a zoom toggle (Route | 5 km, Route | 500 m); power-so-far strip under the profile, zone-shaded in accent.
- Workout: no route in version 1. The same primaries with targets ("246 / 239 W", label row "target 90 % FTP", accent target window over the zone ladder). Secondary readings are interval, workout, distance and speed. The plan chart shows actual power as an accent line, the plan as grey steps and the historic plan behind the actual. The step list beside it shows number, name, target and duration; completed steps are muted; the current step has an accent edge and its remaining time.
- Workouts library: no import in version 1. Columns are plan thumbnail, name, length and load (Training Stress Score, computed from the plan and FTP). Filters are length and load. There is no intensity column.
- Phones: portrait shows the three primaries in one row, three secondaries, then Profile | Map (one at a time) over the power strip. Landscape shows primaries and secondaries on top, profile and strip below.
- Lists: Rides, Routes and Workouts share one header with the segmented nav and one accent import button.

## Map basemap (future phase)

The concept is in `mockups/map-concept.html`. Three layers sit under the route, all drawn as lines with no fills:

- Contours in ink at about 20 %.
- Water as hatched polygons (the chart hatch at 6 px, muted) with a 0.75 px hairline bank. Rivers are polygons, never a centre stroke.
- Roads as bands: hairline edges with a faint shade (`#191917`) between them, weighted by class (6, 4.5 and 3.5 px). The route always runs along a road band drawn slightly wider than the route line.

No buildings or green areas. Towns are labelled in 11 px tracked caps with a hollow 2 px dot; water names in 13 px serif italic; nothing else is named. Railways are a 1 px line with short cross ticks. The route stays the only accent.

Intended stack: OpenStreetMap vector tiles (Protomaps PMTiles or Mapbox) styled with MapLibre, contours from elevation tiles, cached per route for offline use.
