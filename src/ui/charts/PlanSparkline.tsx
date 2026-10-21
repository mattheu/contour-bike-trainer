import { useMemo } from 'react';
import type { ExpandedStep } from '../../workout/expand';
import { PLAN_SPARKLINE_HEIGHT, PLAN_SPARKLINE_WIDTH, planSparklineGeometry } from './plan';

export interface PlanSparklineProps {
  steps: readonly ExpandedStep[];
  ftpW: number;
  width?: number;
  height?: number;
}

/**
 * The plan's shape for a list row. A renderer over plan.ts and nothing else, the way
 * Sparkline is a renderer over elevation.ts: no fill, no axis, no marker.
 */
export function PlanSparkline({
  steps,
  ftpW,
  width = PLAN_SPARKLINE_WIDTH,
  height = PLAN_SPARKLINE_HEIGHT,
}: PlanSparklineProps) {
  const geometry = useMemo(
    () => planSparklineGeometry({ steps, ftpW, width, height }),
    [steps, ftpW, width, height],
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      style={{ display: 'block' }}
      role="img"
      aria-label="Workout shape"
    >
      {geometry.paths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
