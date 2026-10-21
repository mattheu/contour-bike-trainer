# 0004. Hand-written SVG rather than a chart library or canvas

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Contour renders three charts: the elevation profile with a rider dot and an accent-coloured
ridden portion, the route trace with the same dot, and (from phase 3) the workout bar chart.

None of them is a general-purpose chart. The profile has gradient-binned fills classified
2–4 / 4–7 / 7–10 / >10 %, climb summit ticks labelled with the climb's gain, vertical
exaggeration tuned so a rolling route does not collapse into a flat line, and two zoom windows.
The trace is a smoothed cubic-bezier polyline in the route's own projected space, with a muted
full trace under an accent ridden prefix, a start marker, a haloed rider dot, a north arrow, a
metric scale bar, and a pan/zoom transform with clipping. A chart library would be configured
into submission to produce either of them, and we would still be writing the custom parts.

The update rate is 1 Hz and the moving parts are one dot and one path. Performance does not
discriminate between the options here.

## Decision

Hand-written inline SVG. No chart library, no canvas, no WebGL.

React renders the container and the static parts. `src/ui/profile.ts` and `src/ui/trace.ts` own
the rider dot and the ridden-portion path and mutate them directly through a ref. That split is
about ownership clarity rather than performance: one module owns each moving element, and React
is not re-rendering a chart every second to move a circle.

The trace is a second chart, not a reuse of the profile. Their coordinate systems and
interactions have nothing in common.

Revisit only if SVG measurably struggles — not on suspicion that it might.

## Consequences

- We write and maintain the axis, scaling and path-generation code ourselves, including the
  fiddly parts: vertical exaggeration, bin merging, bezier smoothing, the scale bar's rounding to
  sensible metric steps.
- There is no free upgrade path. Wanting a new chart type in phase 4 means writing it, whereas a
  library would have had one.
- Two modules mutate DOM outside React's control. That is deliberate and documented, but it is a
  seam where a future contributor can reasonably get confused about who owns what — and React
  will happily overwrite those attributes if the container re-renders.
- SVG in the DOM is inspectable, styleable with the same Tailwind tokens as everything else,
  accessible to text and screen readers in a way canvas is not, and trivially screenshot-testable
  by Playwright. Canvas would have given up all of that.
- No network, no API key, no attribution, no basemap tiles. The map view works offline, which is
  a stated virtue elsewhere in the spec. If a real basemap is ever wanted, that is a phase 4
  decision with its own ADR, not an incremental change to this one.
- At thousands of points, path data is the thing that will bite before rendering does. Simplify
  the polyline before assuming SVG is the problem.
