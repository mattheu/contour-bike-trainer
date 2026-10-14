import { useMemo } from 'react';
import type { Route } from '../../route/types';
import { elevationGeometry } from './elevation';

export const SPARKLINE_WIDTH = 120;
export const SPARKLINE_HEIGHT = 28;

export interface SparklineProps {
  route: Route;
  width?: number;
  height?: number;
}

/**
 * The route's shape for a list row. Same scale rules as the profile, so a flat
 * route looks flat next to a hilly one down the list; no fills, axis or marker.
 */
export function Sparkline({
  route,
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT,
}: SparklineProps) {
  const geometry = useMemo(
    () => elevationGeometry({ route, width, height }),
    [route, width, height],
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      role="img"
      aria-label="Route shape"
    >
      <path
        d={geometry.linePath}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}
