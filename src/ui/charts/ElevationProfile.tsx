import { useEffect, useId, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import type { Climb } from '../../route/climbs';
import type { ProfileWindow, RouteProfile } from '../../route/profile';
import type { Route } from '../../route/types';
import { percent } from '../format';
import { AHEAD_BAND_OPACITY, RIDDEN_BAND_OPACITY, elevationGeometry } from './elevation';

export const PROFILE_WIDTH = 944;
export const PROFILE_HEIGHT = 220;

/** The rider dot, stem, bubble and drop line, from design/mockups/ride.html. */
const DOT_R = 3;
const STEM_TOP = -10.2;
const BUBBLE_CY = -28.9;
const BUBBLE_R = 18.7;
const DROP_GAP = 4;
const SUMMIT_STALK = 10;

export interface ElevationProfileHandle {
  /** Called at 1 Hz. Mutates the ridden paths and the marker; never re-renders. */
  update(distanceM: number): void;
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
  const dot = useRef<SVGCircleElement>(null);
  const markerGroup = useRef<SVGGElement>(null);
  const dropLine = useRef<SVGLineElement>(null);
  const gradeText = useRef<SVGTSpanElement>(null);

  const paint = useMemo(() => {
    return (distance: number): void => {
      const marker = geometry.marker(distance);
      const area = geometry.riddenAreaPath(distance);
      knockout.current?.setAttribute('d', area);
      riddenHatch.current?.setAttribute('d', area);
      riddenLine.current?.setAttribute('d', geometry.riddenLinePath(distance));
      riddenClip.current?.setAttribute('width', String(marker.x));
      aheadClip.current?.setAttribute('x', String(marker.x));
      aheadClip.current?.setAttribute('width', String(Math.max(0, geometry.width - marker.x)));
      dot.current?.setAttribute('cx', String(marker.x));
      dot.current?.setAttribute('cy', String(marker.y));
      markerGroup.current?.setAttribute('transform', `translate(${marker.x},${marker.y})`);
      dropLine.current?.setAttribute('x1', String(marker.x));
      dropLine.current?.setAttribute('x2', String(marker.x));
      dropLine.current?.setAttribute('y1', String(marker.y + DROP_GAP));
      if (gradeText.current) gradeText.current.textContent = percent(marker.gradePercent);
    };
  }, [geometry]);

  useImperativeHandle(ref, () => ({ update: paint }), [paint]);

  // A new geometry (resize, zoom change, new route) leaves the mutated attributes
  // describing the old one, so repaint once after every render that replaces it.
  useEffect(() => {
    paint(distanceM);
  }, [paint, distanceM]);

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

      {geometry.summits.map((summit) => (
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
      {/* The one handle the integration tests need: its cx is where the rider is. */}
      <circle
        ref={dot}
        data-testid="profile-rider"
        cx={0}
        cy={0}
        r={DOT_R}
        fill="var(--color-accent)"
      />
      <g ref={markerGroup}>
        <line
          x1={0}
          y1={-2}
          x2={0}
          y2={STEM_TOP}
          stroke="var(--color-accent)"
          strokeWidth="var(--stroke-chart)"
        />
        <g transform={`translate(0,${BUBBLE_CY})`}>
          <circle
            cx={0}
            cy={0}
            r={BUBBLE_R}
            fill="var(--color-ground)"
            stroke="var(--color-accent)"
            strokeWidth={1.75}
          />
          <text
            x={0}
            y={3.8}
            textAnchor="middle"
            className="font-mono"
            fontSize={11}
            fill="var(--color-ink)"
          >
            <tspan ref={gradeText} />
            <tspan fill="var(--color-muted)" fontSize={7.6}>
              %
            </tspan>
          </text>
        </g>
      </g>
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
