import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Route } from '../../route/types';
import { routeMapGeometry, type MapZoom } from './map';

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
   */
  hover(distanceM: number | null): void;
}

export interface RouteMapProps {
  route: Route;
  distanceM: number;
  zoom?: MapZoom;
  width?: number;
  height?: number;
  ref?: RefObject<RouteMapHandle | null>;
}

export function RouteMap({
  route,
  distanceM,
  zoom = 'route',
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
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
  /** The hovered distance and the distance the frame is panned to. Both out of React:
   *  neither a mousemove nor a tick may render this component. */
  const hoveredM = useRef<number | null>(null);
  const pannedM = useRef(distanceM);

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
      // re-placed every time the rider moves or it drifts off the point it names.
      paintHover();
    };
  }, [geometry, paintHover]);

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
    </svg>
  );
}
