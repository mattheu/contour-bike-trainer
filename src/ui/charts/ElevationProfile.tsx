import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { SLOT_ORDER, SLOT_SYMBOL, SYMBOL_STROKE_WIDTH, type GhostSlot } from '../../ghost/slots';
import type { ActiveGhost } from '../../ghost/state';
import type { Climb } from '../../route/climbs';
import type { ProfileWindow, RouteProfile } from '../../route/profile';
import type { Route } from '../../route/types';
import { AHEAD_BAND_OPACITY, RIDDEN_BAND_OPACITY, elevationGeometry } from './elevation';
import {
  DESKTOP_METRICS,
  LABEL_PLATE_OPACITY,
  ghostLayer,
  symbolTransform,
  type GhostMetrics,
} from './ghosts';
import { FADE } from '../components/motion';
import type { Pt } from './path';

export const PROFILE_WIDTH = 944;
export const PROFILE_HEIGHT = 220;

/**
 * The rider's ring, sized to span the 10 px a ghost's square does inside its 14 px box:
 * same weight and footprint as a ghost, a circle instead of a polygon, and accent where
 * they are muted. The family carries the "who", so position needs no second ornament.
 */
const RIDER_RING_R = 5;
const DROP_GAP = 4;
const SUMMIT_STALK = 10;

/** Half the hover cross, so the arms run 2 x this: a cross that spans the rider's ring
 * reads as the same kind of mark rather than as something larger passing over it. */
const HOVER_ARM = 5;

/** The four nodes a ghost's drawing moves between ticks; the rest of it never moves. */
interface GhostNodes {
  group: SVGGElement | null;
  label: SVGGElement | null;
  plate: SVGRectElement | null;
  text: SVGTextElement | null;
}

function emptyGhostNodes(): Record<GhostSlot, GhostNodes> {
  return Object.fromEntries(
    SLOT_ORDER.map((slot) => [slot, { group: null, label: null, plate: null, text: null }]),
  ) as Record<GhostSlot, GhostNodes>;
}

export interface ElevationProfileHandle {
  /**
   * Called at 1 Hz. Mutates the ridden paths, the marker and the ghosts; never re-renders.
   *
   * Ghosts arrive here rather than as a prop for the reason the rider's distance does:
   * they move every tick, and a prop would rebuild the whole chart — bands, ticks, line
   * and all — once a second to move four symbols.
   */
  update(distanceM: number, ghosts?: readonly ActiveGhost[]): void;
  /**
   * Moves or clears the hover marker. Mutates one node; never re-renders either.
   *
   * Drawing only. It cannot call onHover — the emit lives in the pointer handlers and
   * nowhere else — so the map driving this marker cannot drive a hover back out, and
   * the two charts cannot push each other around a loop.
   */
  hover(distanceM: number | null): void;
}

export interface ElevationProfileProps {
  route: Route;
  profile: RouteProfile;
  climbs?: readonly Climb[];
  /** Zoom window from profile.projectWindow; omit or null for the whole route. */
  window?: ProfileWindow | null;
  distanceM: number;
  width?: number;
  height?: number;
  /**
   * Where on the route *this chart's own pointer* is, in metres, or null when it
   * leaves. Supplying it is what makes the chart hoverable at all: a profile nobody is
   * listening to — the summary's — keeps no hit surface and grows no marker.
   *
   * Only a pointer on this chart's hit surface produces one. A marker put here through
   * the handle is drawn and nothing more, which is what keeps the map and the profile
   * from driving each other.
   *
   * Called straight out of the pointer handler, so it must not set state on a screen
   * that would re-render under the mouse. The ride screen forwards it to the map's
   * handle, which is the whole reason this is a callback rather than internal.
   */
  onHover?: (distanceM: number | null) => void;
  /**
   * The sizes a ghost is drawn at. Desktop unless a phone says otherwise: on a 390 px
   * screen the gap goes beside the symbol rather than on a stem above it, and the symbol
   * itself comes down to 4 px. See GhostMetrics.
   */
  ghostMetrics?: GhostMetrics;
  ref?: RefObject<ElevationProfileHandle | null>;
}

export function ElevationProfile({
  route,
  profile,
  climbs = [],
  window: win = null,
  distanceM,
  width = PROFILE_WIDTH,
  height = PROFILE_HEIGHT,
  onHover,
  ghostMetrics = DESKTOP_METRICS,
  ref,
}: ElevationProfileProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const geometry = useMemo(
    () => elevationGeometry({ route, profile, climbs, window: win, width, height }),
    [route, profile, climbs, win, width, height],
  );

  const knockout = useRef<SVGPathElement>(null);
  const riddenHatch = useRef<SVGPathElement>(null);
  const riddenLine = useRef<SVGPathElement>(null);
  const riddenClip = useRef<SVGRectElement>(null);
  const aheadClip = useRef<SVGRectElement>(null);
  const riderRing = useRef<SVGCircleElement>(null);
  const dropLine = useRef<SVGLineElement>(null);
  const hoverGroup = useRef<SVGGElement>(null);
  const ghostNodes = useRef<Record<GhostSlot, GhostNodes>>(emptyGhostNodes());
  const summitLabels = useRef<(SVGTextElement | null)[]>([]);
  /** The last set drawn, so a repaint after a resize or a zoom redraws them too. */
  const ghosts = useRef<readonly ActiveGhost[]>([]);
  /** The marked distance, kept out of React: a mousemove must not render anything. */
  const hoveredM = useRef<number | null>(null);
  /**
   * The same distance, but only while this chart's own pointer is the one putting it
   * there. Written by the pointer handlers and by nothing else, so it is the chart's
   * answer to "is the mouse on me" — which is the only thing that entitles it to speak.
   */
  const pointerM = useRef<number | null>(null);

  /**
   * A ghost's lap distance to a point on the chart, or null where the window has scrolled
   * past it. Clamping instead would pin an off-screen ghost to the edge of the chart,
   * which reads as one riding the frame rather than one that is simply not in view.
   */
  const project = useMemo(() => {
    return (distanceM: number): Pt | null => {
      if (distanceM < geometry.startM || distanceM > geometry.endM) return null;
      const at = geometry.marker(distanceM);
      return { x: at.x, y: at.y };
    };
  }, [geometry]);

  const paintGhosts = useMemo(() => {
    return (): void => {
      const layer = ghostLayer({
        ghosts: ghosts.current,
        project,
        summits: geometry.summits.map((summit) => summit.x),
        metrics: ghostMetrics,
      });

      const drawn = new Set<GhostSlot>();
      for (const placement of layer.placements) {
        const nodes = ghostNodes.current[placement.slot];
        drawn.add(placement.slot);
        nodes.group?.setAttribute(
          'transform',
          `translate(${String(placement.x)},${String(placement.y)})`,
        );
        nodes.group?.setAttribute('opacity', String(placement.opacity));
        nodes.group?.setAttribute('visibility', 'visible');

        const label = placement.label;
        if (label === null) {
          nodes.label?.setAttribute('visibility', 'hidden');
          continue;
        }
        // Everything inside the group is relative to the symbol's centre, so only the
        // two the anchor positions are written here.
        nodes.plate?.setAttribute('x', String(label.plateX - placement.x));
        nodes.text?.setAttribute('x', String(label.textX - placement.x));
        nodes.text?.setAttribute('text-anchor', label.anchor);
        if (nodes.text !== null) nodes.text.textContent = label.text;
        nodes.label?.setAttribute('visibility', 'visible');
      }

      for (const slot of SLOT_ORDER) {
        if (drawn.has(slot)) continue;
        ghostNodes.current[slot].group?.setAttribute('visibility', 'hidden');
      }

      // A summit keeps its tick and loses its figure: the mark is terrain, the figure is
      // a label, and a ghost's gap is the one a rider is reading right now.
      const hidden = new Set(layer.hiddenSummits);
      summitLabels.current.forEach((node, index) => {
        node?.setAttribute('visibility', hidden.has(index) ? 'hidden' : 'visible');
      });
    };
  }, [geometry, project, ghostMetrics]);

  const paint = useMemo(() => {
    return (distance: number, next?: readonly ActiveGhost[]): void => {
      if (next !== undefined) ghosts.current = next;
      const marker = geometry.marker(distance);
      const area = geometry.riddenAreaPath(distance);
      knockout.current?.setAttribute('d', area);
      riddenHatch.current?.setAttribute('d', area);
      riddenLine.current?.setAttribute('d', geometry.riddenLinePath(distance));
      riddenClip.current?.setAttribute('width', String(marker.x));
      aheadClip.current?.setAttribute('x', String(marker.x));
      aheadClip.current?.setAttribute('width', String(Math.max(0, geometry.width - marker.x)));
      riderRing.current?.setAttribute('cx', String(marker.x));
      riderRing.current?.setAttribute('cy', String(marker.y));
      dropLine.current?.setAttribute('x1', String(marker.x));
      dropLine.current?.setAttribute('x2', String(marker.x));
      dropLine.current?.setAttribute('y1', String(marker.y + DROP_GAP));
      paintGhosts();
    };
  }, [geometry, paintGhosts]);

  const paintHover = useMemo(() => {
    return (distance: number | null): void => {
      hoveredM.current = distance;
      const node = hoverGroup.current;
      if (node === null) return;
      // Outside the window there is no x to draw it at: marker() clamps, so the cross
      // would sit on the edge of the chart naming a distance the pointer is nowhere
      // near. The map can ask for one — it hovers the whole route however this chart
      // happens to be zoomed — so this is the case, not an impossible one.
      if (distance === null || distance < geometry.startM || distance > geometry.endM) {
        node.setAttribute('visibility', 'hidden');
        return;
      }
      const at = geometry.marker(distance);
      node.setAttribute('transform', `translate(${String(at.x)},${String(at.y)})`);
      node.setAttribute('visibility', 'visible');
    };
  }, [geometry]);

  useImperativeHandle(ref, () => ({ update: paint, hover: paintHover }), [paint, paintHover]);

  // A new geometry (resize, zoom change, new route) leaves the mutated attributes
  // describing the old one, so repaint once after every render that replaces it.
  useEffect(() => {
    paint(distanceM);
  }, [paint, distanceM]);

  // The hover marker has the same problem, with one extra case: on the 5 km view the
  // window scrolls under a stationary pointer, so a point that was inside it can fall
  // out. Still inside, it is re-placed; past the edge the pointer is no longer over it,
  // and the map has to hear that or its marker is left behind on the route.
  useEffect(() => {
    const at = hoveredM.current;
    if (at === null) return;
    if (pointerM.current !== null && (at < geometry.startM || at > geometry.endM)) {
      pointerM.current = null;
      paintHover(null);
      onHover?.(null);
      return;
    }
    // A marker the map put here has a pointer of its own somewhere else on the screen,
    // so it is kept rather than dropped: hidden while the window is past it, drawn
    // again if the window scrolls back over it. Telling the map its hover had ended
    // would wipe the crosshair out from under a mouse that has not moved.
    paintHover(at);
  }, [geometry, paintHover, onHover]);

  const hoverable = onHover !== undefined;

  function moveHover(event: ReactPointerEvent<SVGRectElement>): void {
    // Hover is a pointing-device affordance. A tap would leave a marker stranded on the
    // chart with no pointer to explain it, so touch and pen are left alone entirely.
    if (event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    const at = geometry.distFor(event.clientX - box.left);
    pointerM.current = at;
    paintHover(at);
    onHover?.(at);
  }

  function endHover(): void {
    if (pointerM.current === null) return;
    pointerM.current = null;
    paintHover(null);
    onHover?.(null);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Elevation profile"
    >
      <defs>
        <Hatch id={`hatch-muted-${uid}`} stroke="var(--color-muted)" />
        <Hatch id={`hatch-accent-${uid}`} stroke="var(--color-accent)" />
        <clipPath id={`ridden-${uid}`}>
          <rect ref={riddenClip} x={0} y={0} width={0} height={height} />
        </clipPath>
        <clipPath id={`ahead-${uid}`}>
          <rect ref={aheadClip} x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>

      <path d={geometry.areaPath} fill={`url(#hatch-muted-${uid})`} opacity={0.45} />
      <path ref={knockout} d="" fill="var(--color-ground)" />
      <path ref={riddenHatch} d="" fill={`url(#hatch-accent-${uid})`} opacity={0.75} />

      <g clipPath={`url(#ahead-${uid})`}>
        {geometry.bands.map((band) => (
          <path
            key={`ahead-${band.startM}`}
            d={band.d}
            fill="var(--color-ink)"
            opacity={AHEAD_BAND_OPACITY[band.band]}
          />
        ))}
      </g>
      <g clipPath={`url(#ridden-${uid})`}>
        {geometry.bands.map((band) => (
          <path
            key={`ridden-${band.startM}`}
            d={band.d}
            fill="var(--color-accent)"
            opacity={RIDDEN_BAND_OPACITY[band.band]}
          />
        ))}
      </g>

      <line
        x1={0}
        y1={geometry.baselineY}
        x2={width}
        y2={geometry.baselineY}
        stroke="var(--color-muted)"
        strokeWidth={1}
      />
      {geometry.ticks.map((tick) => (
        <line
          key={tick.distM}
          x1={tick.x}
          y1={geometry.baselineY}
          x2={tick.x}
          y2={geometry.baselineY + (tick.long ? 8 : 4)}
          stroke="var(--color-muted)"
          strokeWidth={1}
        />
      ))}

      <path
        d={geometry.linePath}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth="var(--stroke-chart)"
        strokeLinejoin="round"
      />
      <path
        ref={riddenLine}
        d=""
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="var(--stroke-ridden)"
        strokeLinejoin="round"
      />

      {geometry.showEndCircles && (
        <>
          <circle
            cx={0}
            cy={geometry.baselineY}
            r={3.5}
            fill="var(--color-ground)"
            stroke="var(--color-muted)"
            strokeWidth={1.25}
          />
          <circle
            cx={width}
            cy={geometry.baselineY}
            r={3.5}
            fill="var(--color-ground)"
            stroke="var(--color-muted)"
            strokeWidth={1.25}
          />
        </>
      )}

      {geometry.summits.map((summit, index) => (
        <g key={summit.x}>
          <line
            x1={summit.x}
            y1={summit.y}
            x2={summit.x}
            y2={summit.y - SUMMIT_STALK}
            stroke="var(--color-hairline)"
            strokeWidth={1}
          />
          <text
            ref={(node) => {
              summitLabels.current[index] = node;
            }}
            x={summit.x}
            y={summit.y - SUMMIT_STALK - 7}
            textAnchor="middle"
            className="font-mono"
            fontSize={11}
            fill="var(--color-muted)"
          >
            {summit.label}
          </text>
        </g>
      ))}

      {/* One group per slot, drawn once and then moved. The shapes never change — a slot
          owns its symbol for the life of the app — so the only things a tick writes are
          the group's transform and the label's own x attributes.

          Symbols are muted and hollow whatever the gap says, here as everywhere: the
          rider's marker is the screen's one accent, and a ghost that coloured itself when
          it went ahead would take that away. DESIGN.md > Ghosts.

          The weight is written per tick and eased, so a ghost reaching its end fades
          rather than cutting: SPEC.md asks a ride that stopped short to be marked where
          it stopped and then faded out, not to blink away unexplained. */}
      {SLOT_ORDER.map((slot) => (
        <g
          key={slot}
          ref={(node) => {
            ghostNodes.current[slot].group = node;
          }}
          data-testid={`profile-ghost-${slot}`}
          className={FADE}
          visibility="hidden"
        >
          <path
            d={SLOT_SYMBOL[slot].d}
            transform={symbolTransform(ghostMetrics)}
            fill="var(--color-ground)"
            stroke="var(--color-muted)"
            strokeWidth={SYMBOL_STROKE_WIDTH}
            strokeLinejoin="round"
          />
          <g
            ref={(node) => {
              ghostNodes.current[slot].label = node;
            }}
            visibility="hidden"
          >
            {/* Nothing to hang from where the gap sits beside the symbol, so the stem
                is left out rather than drawn at zero length. */}
            {ghostMetrics.stemPx > 0 && (
              <line
                x1={0}
                y1={-ghostMetrics.symbolBox / 2}
                x2={0}
                y2={-ghostMetrics.symbolBox / 2 - ghostMetrics.stemPx}
                stroke="var(--color-muted)"
                strokeWidth="var(--stroke-hairline)"
                strokeDasharray="2 3"
              />
            )}
            <rect
              ref={(node) => {
                ghostNodes.current[slot].plate = node;
              }}
              x={-ghostMetrics.plateW / 2}
              y={-ghostMetrics.risePx - ghostMetrics.plateH / 2}
              width={ghostMetrics.plateW}
              height={ghostMetrics.plateH}
              fill="var(--color-ground)"
              opacity={LABEL_PLATE_OPACITY}
            />
            <text
              ref={(node) => {
                ghostNodes.current[slot].text = node;
              }}
              x={0}
              y={-ghostMetrics.risePx + ghostMetrics.baselinePx}
              textAnchor="middle"
              className="font-mono"
              fontSize={ghostMetrics.fontPx}
              fill="var(--color-ink)"
            />
          </g>
        </g>
      ))}

      {geometry.startLabel !== null && (
        <text x={8} y={height - 6} className="font-mono" fontSize={12} fill="var(--color-muted)">
          {geometry.startLabel}
        </text>
      )}
      <text
        x={width - 8}
        y={height - 6}
        textAnchor="end"
        className="font-mono"
        fontSize={12}
        fill="var(--color-muted)"
      >
        {geometry.endLabel}
      </text>

      {/* The hover marker. Ink and an open cross, where the rider is an accent ring:
          design/DESIGN.md gives ink to marker ticks and accent to where the rider is, so
          the colour already separates them, and the cross with no drop line finishes the
          job. Drawn before the rider's marker so that on the one pixel they share, the
          rider is the one on top. */}
      {hoverable && (
        <g
          ref={hoverGroup}
          data-testid="profile-hover"
          visibility="hidden"
          stroke="var(--color-ink)"
          strokeWidth="var(--stroke-hairline)"
        >
          <line x1={-HOVER_ARM} y1={0} x2={HOVER_ARM} y2={0} />
          <line x1={0} y1={-HOVER_ARM} x2={0} y2={HOVER_ARM} />
        </g>
      )}

      <line
        ref={dropLine}
        x1={0}
        y1={0}
        x2={0}
        y2={geometry.baselineY}
        stroke="var(--color-accent)"
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      {/* The rider, in the ghosts' treatment and the one accent among them. Also the one
          handle the integration tests need: its cx is where the rider is. */}
      <circle
        ref={riderRing}
        data-testid="profile-rider"
        cx={0}
        cy={0}
        r={RIDER_RING_R}
        fill="var(--color-ground)"
        stroke="var(--color-accent)"
        strokeWidth={SYMBOL_STROKE_WIDTH}
      />

      {/* One surface for the whole chart rather than handlers on the shapes: the pointer
          is asking "what is at this distance", which every pixel of the frame answers.
          Last, so nothing drawn over it can swallow a move; fill none with pointerEvents
          all, so it is hit-testable without painting anything. */}
      {hoverable && (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="none"
          pointerEvents="all"
          onPointerMove={moveHover}
          onPointerLeave={endHover}
          onPointerCancel={endHover}
        />
      )}
    </svg>
  );
}

/** DESIGN.md: a single 45-degree hatch, 8 px pitch, 0.8 px lines. */
function Hatch({ id, stroke }: { id: string; stroke: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={8}
      height={8}
      patternTransform="rotate(45)"
    >
      <line x1={0} y1={0} x2={0} y2={8} stroke={stroke} strokeWidth={0.8} />
    </pattern>
  );
}
