import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Route } from '../../route/types';
import type { PlanePoint } from '../projection';
import { HOVER_SNAP_PX, routeMapGeometry, type MapZoom } from './map';

export const MAP_WIDTH = 320;
export const MAP_HEIGHT = 302;

const RIDER_R = 4;
const HALO_R = 9;
const START_R = 4;

/** Half the hover cross, matching the profile's: one marker, drawn twice. */
const HOVER_ARM = 5;

export interface RouteMapHandle {
  /** Called at 1 Hz. Pans the trace, extends the ridden prefix and moves the dot. */
  update(distanceM: number): void;
  /**
   * Puts the hover marker at a distance along the route, or clears it. Driven by the
   * elevation profile, which is where the pointer actually is; the map only draws it.
   *
   * Drawing only, exactly as the profile's handle is: it cannot call onHover, so being
   * told to show a marker can never emit one back and the two charts have no loop to
   * fall into.
   */
  hover(distanceM: number | null): void;
}

export interface RouteMapProps {
  route: Route;
  distanceM: number;
  zoom?: MapZoom;
  width?: number;
  height?: number;
  /**
   * Where on the route *this chart's own pointer* is, in metres, or null when it is
   * not near the route at all. Supplying it is what gives the map a hit surface, the
   * same bargain the profile strikes.
   *
   * Called straight out of the pointer handler, so like the profile's it must not set
   * state on a screen that would re-render under the mouse.
   */
  onHover?: (distanceM: number | null) => void;
  ref?: RefObject<RouteMapHandle | null>;
}

export function RouteMap({
  route,
  distanceM,
  zoom = 'route',
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
  onHover,
  ref,
}: RouteMapProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const geometry = useMemo(
    () => routeMapGeometry({ route, width, height, zoom }),
    [route, width, height, zoom],
  );

  const traceGroup = useRef<SVGGElement>(null);
  const ridden = useRef<SVGPathElement>(null);
  const rider = useRef<SVGCircleElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const hoverGroup = useRef<SVGGElement>(null);
  /** The marked distance and the distance the frame is panned to. Both out of React:
   *  neither a mousemove nor a tick may render this component. */
  const hoveredM = useRef<number | null>(null);
  const pannedM = useRef(distanceM);
  /**
   * Where this chart's own pointer sits in the frame, in screen pixels, or null when it
   * is off the map. Written by the pointer handlers and by nothing else, so it is what
   * entitles the map to speak — and it is kept as a pixel rather than a distance
   * because on the 5 km view the frame slides out from under a stationary mouse, and
   * the pixel is then the only part of the hover that has not changed.
   */
  const pointerPx = useRef<PlanePoint | null>(null);

  const paintHover = useMemo(() => {
    return (): void => {
      const node = hoverGroup.current;
      if (node === null) return;
      const at = hoveredM.current;
      if (at === null) {
        node.setAttribute('visibility', 'hidden');
        return;
      }
      // Placed in the frame the rider is holding, not in one centred on the hover: on
      // the 5 km view the pan is the rider, and riderScreen would put every marker in
      // the middle of the map.
      const screen = geometry.screenFor(at, pannedM.current);
      node.setAttribute('transform', `translate(${String(screen.x)},${String(screen.y)})`);
      node.setAttribute('visibility', 'visible');
    };
  }, [geometry]);

  /**
   * Reads the route under this chart's own pointer and reports it.
   *
   * Beyond HOVER_SNAP_PX of the trace there is no answer worth giving: a map is mostly
   * empty space, and snapping from anywhere would mark an arbitrary distance every time
   * the mouse crossed the panel.
   */
  const trackPointer = useMemo(() => {
    return (): void => {
      const at = pointerPx.current;
      if (at === null) return;
      const hit = geometry.routeAt(at, pannedM.current);
      const next = hit.offsetPx <= HOVER_SNAP_PX ? hit.distM : null;
      // Empty space over empty space is not news, and the profile is not told again.
      if (next === null && hoveredM.current === null) return;
      hoveredM.current = next;
      paintHover();
      onHover?.(next);
    };
  }, [geometry, paintHover, onHover]);

  const paint = useMemo(() => {
    return (distance: number): void => {
      pannedM.current = distance;
      traceGroup.current?.setAttribute('transform', geometry.transform(distance));
      ridden.current?.setAttribute('d', geometry.riddenPath(distance));
      const screen = geometry.riderScreen(distance);
      for (const node of [rider.current, halo.current]) {
        node?.setAttribute('cx', String(screen.x));
        node?.setAttribute('cy', String(screen.y));
      }
      // The 5 km frame pans under a stationary pointer, so the hover marker has to be
      // re-placed every time the rider moves or it drifts off the point it names — and
      // where the pointer is this chart's own, the road under it has changed too, so
      // the question is asked again rather than the old answer moved.
      trackPointer();
      paintHover();
    };
  }, [geometry, paintHover, trackPointer]);

  const hover = useMemo(() => {
    return (distance: number | null): void => {
      hoveredM.current = distance;
      paintHover();
    };
  }, [paintHover]);

  useImperativeHandle(ref, () => ({ update: paint, hover }), [paint, hover]);

  useEffect(() => {
    paint(distanceM);
  }, [paint, distanceM]);

  const hoverable = onHover !== undefined;

  function moveHover(event: ReactPointerEvent<SVGRectElement>): void {
    // A pointing-device affordance, for the reason the profile gives: a tap would leave
    // a marker stranded on two charts with no pointer to explain either.
    if (event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    pointerPx.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    trackPointer();
  }

  function endHover(): void {
    pointerPx.current = null;
    if (hoveredM.current === null) return;
    hoveredM.current = null;
    paintHover();
    onHover?.(null);
  }

  const start = route.points[0];
  const body = (
    <>
      <g
        ref={traceGroup}
        transform={geometry.transform(distanceM)}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      >
        <path
          d={geometry.tracePath}
          stroke="var(--color-muted)"
          strokeWidth={geometry.strokeWidth(1.25)}
        />
        <path
          ref={ridden}
          d=""
          stroke="var(--color-accent)"
          strokeWidth={geometry.strokeWidth(2)}
        />
        {start && (
          <circle
            cx={geometry.projection.project(start).x}
            cy={geometry.projection.project(start).y}
            r={geometry.strokeWidth(START_R)}
            fill="var(--color-ground)"
            stroke="var(--color-muted)"
            strokeWidth={geometry.strokeWidth(1.25)}
          />
        )}
      </g>
      {/* The same ink cross the profile draws, at the same place on the route. Under the
          rider's dot and halo, which are accent and solid: the rider's position is the
          one that matters and a hover must never be taken for it. Inside `body`, so on
          the 5 km view a point outside the frame is clipped rather than drawn over it. */}
      <g
        ref={hoverGroup}
        data-testid="map-hover"
        visibility="hidden"
        stroke="var(--color-ink)"
        strokeWidth="var(--stroke-hairline)"
      >
        <line x1={-HOVER_ARM} y1={0} x2={HOVER_ARM} y2={0} />
        <line x1={0} y1={-HOVER_ARM} x2={0} y2={HOVER_ARM} />
      </g>
      <circle
        ref={rider}
        data-testid="map-rider"
        cx={0}
        cy={0}
        r={RIDER_R}
        fill="var(--color-accent)"
      />
      <circle
        ref={halo}
        cx={0}
        cy={0}
        r={HALO_R}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1}
        opacity={0.6}
      />
    </>
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      aria-label={geometry.clipped ? 'Map, zoomed to current position' : 'Map, whole route'}
    >
      {geometry.clipped && (
        <defs>
          <clipPath id={`mapclip-${uid}`}>
            <rect x={0.5} y={0.5} width={width - 1} height={height - 1} />
          </clipPath>
        </defs>
      )}

      <rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={1}
      />

      {geometry.clipped ? <g clipPath={`url(#mapclip-${uid})`}>{body}</g> : (body as ReactNode)}

      <g
        transform={`translate(${width - 18},12)`}
        stroke="var(--color-muted)"
        strokeWidth={1}
        fill="none"
      >
        <line x1={0} y1={14} x2={0} y2={0} />
        <path d="M-3,4 L0,0 L3,4" />
      </g>
      <text
        x={width - 18}
        y={38}
        textAnchor="middle"
        className="font-sans"
        fontSize={11}
        fill="var(--color-muted)"
      >
        N
      </text>

      <g stroke="var(--color-muted)" strokeWidth={1}>
        <line x1={12} y1={height - 14} x2={12 + geometry.scaleBar.lengthPx} y2={height - 14} />
        <line x1={12} y1={height - 17} x2={12} y2={height - 11} />
        <line
          x1={12 + geometry.scaleBar.lengthPx}
          y1={height - 17}
          x2={12 + geometry.scaleBar.lengthPx}
          y2={height - 11}
        />
      </g>
      <text
        x={20 + geometry.scaleBar.lengthPx}
        y={height - 10}
        className="font-mono"
        fontSize={11}
        fill="var(--color-muted)"
      >
        {geometry.scaleBar.label}
      </text>

      {/* One surface for the whole frame rather than a fatter trace to aim at: the
          pointer is asking "what part of the route is this", which the empty ground
          answers as honestly as the line does — with nothing. Last, so the compass and
          the scale bar cannot swallow a move; fill none with pointerEvents all, so it
          is hit-testable without painting anything. Outside the clip group, because a
          frame is the one thing the 5 km view does not pan. */}
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
