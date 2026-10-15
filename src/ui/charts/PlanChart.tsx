import { useId, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import type { ExpandedStep } from '../../workout/expand';
import { blockForStep, planChartGeometry, type PlanChartSample } from './plan-chart';

export const PLAN_CHART_WIDTH = 912;
export const PLAN_CHART_HEIGHT = 220;

/** The rider dot and the tick figures under the axis, from design/mockups/workout.html. */
const DOT_R = 3;
const DROP_GAP = 4;
const TICK_LONG = 8;
const TICK_SHORT = 4;
const AXIS_LABEL_Y = 22;
/** The zone figures sit in the gutter the screen keeps clear to the right of the chart. */
const ZONE_LABEL_X = 10;

export interface PlanChartProps {
  steps: readonly ExpandedStep[];
  samples: readonly PlanChartSample[];
  ftpW: number;
  scalePct: number;
  elapsedS: number;
  width?: number;
  height?: number;
  /**
   * The expanded step under the pointer, or null when there is none. Supplying it is
   * what makes the blocks hoverable; without it the chart keeps no hit layer.
   *
   * Fires on crossing a block, not on every pixel: the hit areas are the block shapes
   * themselves, so this is a handful of calls across a whole session rather than one per
   * mousemove, and the screen above can hold it in state without the usual cost.
   */
  onHoverStep?: (stepIndex: number | null) => void;
  /**
   * The expanded step to outline, or null for none — the same index `onHoverStep` reports,
   * handed back. One value travels both ways, so a block and its row in the Steps panel
   * cannot disagree about what the pointer is on, whichever end it is actually over.
   *
   * Independent of `onHoverStep`: a chart given only this one outlines without being
   * hoverable itself, which is what a row driving it from the panel needs.
   */
  hoveredStep?: number | null;
}

/**
 * The session as one picture: the plan as grey steps, actual power as the accent line over
 * it, and a marker at now. A renderer over plan-chart.ts and nothing else, the way
 * ElevationProfile is a renderer over elevation.ts.
 *
 * No ref handle. The workout screen re-renders every second anyway — both clocks count —
 * so there is nothing for mutation to save here, unlike the ride screen where the charts
 * outlive the renders around them.
 */
/**
 * The ink laid over the block under the pointer, on top of its zone fill rather than
 * instead of it. Well clear of the 4 points that separate one zone from the next, so the
 * lift cannot be mistaken for the step having moved a zone, and still short of hiding the
 * shade underneath.
 */
const HOVER_VEIL_OPACITY = 0.12;

export function PlanChart({
  steps,
  samples,
  ftpW,
  scalePct,
  elapsedS,
  width = PLAN_CHART_WIDTH,
  height = PLAN_CHART_HEIGHT,
  onHoverStep,
  hoveredStep = null,
}: PlanChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const geometry = useMemo(
    () => planChartGeometry({ steps, samples, ftpW, scalePct, elapsedS, width, height }),
    [steps, samples, ftpW, scalePct, elapsedS, width, height],
  );

  const marker = geometry.marker;
  const aheadX = marker?.x ?? 0;
  const hoveredBlock = blockForStep(geometry.blocks, hoveredStep);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Workout plan"
    >
      <defs>
        {/* design/DESIGN.md: a single 45-degree hatch, 8 px pitch, 0.8 px lines. */}
        <pattern
          id={`plan-hatch-${uid}`}
          patternUnits="userSpaceOnUse"
          width={8}
          height={8}
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={8} stroke="var(--color-muted)" strokeWidth={0.8} />
        </pattern>
        <pattern
          id={`ridden-hatch-${uid}`}
          patternUnits="userSpaceOnUse"
          width={8}
          height={8}
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={8} stroke="var(--color-accent)" strokeWidth={0.8} />
        </pattern>
        {/* Muted is the plan ahead, so the blocks stop at the marker and the accent takes
            over behind it — the same rule the elevation profile's hatch follows. */}
        <clipPath id={`plan-ahead-${uid}`}>
          <rect x={aheadX} y={0} width={Math.max(0, width - aheadX)} height={height} />
        </clipPath>
      </defs>

      {geometry.zoneLines.map((line) => (
        <g key={line.zone}>
          <line
            x1={0}
            y1={line.y}
            x2={width}
            y2={line.y}
            stroke="var(--color-hairline)"
            strokeWidth={1}
          />
          <text
            x={width + ZONE_LABEL_X}
            y={line.labelY}
            className="font-mono"
            fontSize={11}
            fill="var(--color-muted)"
          >
            {line.label}
          </text>
        </g>
      ))}

      <g clipPath={`url(#plan-ahead-${uid})`}>
        {geometry.blocks.map((block) => (
          <g key={block.stepIndex}>
            <path d={block.d} fill="var(--color-ink)" opacity={block.opacity} />
            <path d={block.d} fill={`url(#plan-hatch-${uid})`} opacity={0.45} />
          </g>
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
        <g key={tick.x}>
          <line
            x1={tick.x}
            y1={geometry.baselineY}
            x2={tick.x}
            y2={geometry.baselineY + (tick.long ? TICK_LONG : TICK_SHORT)}
            stroke="var(--color-muted)"
            strokeWidth={1}
          />
          {tick.label !== null && (
            <text
              x={tick.x}
              y={geometry.baselineY + AXIS_LABEL_Y}
              textAnchor="middle"
              className="font-mono"
              fontSize={11}
              fill="var(--color-muted)"
            >
              {tick.label}
            </text>
          )}
        </g>
      ))}

      {/* The plan as it was written, behind the plan as it is being ridden: only drawn
          once the rider has taken the difficulty off 100 %, which is the only time the
          two differ and so the only time there is a deviation to see. */}
      {geometry.historyPaths.map((d) => (
        <path
          key={`history-${d}`}
          d={d}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={1}
          strokeLinejoin="round"
          opacity={0.35}
        />
      ))}

      {geometry.planPaths.map((d) => (
        <path
          key={`plan-${d}`}
          d={d}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="var(--stroke-chart)"
          strokeLinejoin="round"
        />
      ))}

      {/* The block under the pointer, outlined. The same answer the ink crosshair gives on
          the ride screen's profile: this is the thing you are pointing at.

          An ink veil inside the perimeter as well as the line around it. The veil alone was
          rejected and the objection still stands — the wash ramp is 4 points a zone, so a
          fill change big enough to see is two zones wide and could be read as the step
          having changed intensity. The outline is what answers it: a block that is both
          brighter and ringed is plainly the one under the pointer, where a block that is
          merely brighter is ambiguous. It is a layer over the zone fill rather than a
          change to it, so the shade underneath is still the shade the scale painted.

          Unclipped, like the hit layer it answers and unlike the blocks it traces: the
          painted blocks stop at the marker, but a step already ridden is still a step you
          can point at, and an outline that vanished behind the marker would be the dead
          pointer this exists to fix.

          Drawn over the plan's own grey line, which runs along this same top edge, so the
          edge reads as ink rather than as muted laid on top of it — and under the actual
          power line and the marker, which keep the accent and the foreground.

          Every block outlines, the current one included. The Steps row is exempt from its
          own hover because it is already solid ink with nothing left to raise; a block is
          drawn no differently for being the one the marker sits on, so it has everything
          left to say. Exempting it too would make the current step the one place where
          pointing at the plan answers nothing at all. */}
      {hoveredBlock !== null && (
        <path
          data-testid="plan-hovered-block"
          d={hoveredBlock.d}
          fill="var(--color-ink)"
          fillOpacity={HOVER_VEIL_OPACITY}
          stroke="var(--color-ink)"
          strokeWidth="var(--stroke-chart)"
          strokeLinejoin="round"
        />
      )}

      {geometry.actualAreaPaths.map((d) => (
        <path key={`area-${d}`} d={d} fill={`url(#ridden-hatch-${uid})`} opacity={0.75} />
      ))}
      {geometry.actualPaths.map((d) => (
        <path
          key={`actual-${d}`}
          d={d}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="var(--stroke-ridden)"
          strokeLinejoin="round"
        />
      ))}

      {marker !== null && (
        <>
          <line
            x1={marker.x}
            y1={marker.y + DROP_GAP}
            x2={marker.x}
            y2={geometry.baselineY}
            stroke="var(--color-accent)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <circle
            data-testid="plan-marker"
            cx={marker.x}
            cy={marker.y}
            r={DOT_R}
            fill="var(--color-accent)"
          />
        </>
      )}

      <text
        x={width}
        y={geometry.baselineY + AXIS_LABEL_Y}
        textAnchor="end"
        className="font-mono"
        fontSize={11}
        fill="var(--color-muted)"
      >
        {geometry.totalLabel}
      </text>

      {/* The hit layer: the block shapes again, unpainted and unclipped.
          Unpainted, because the chart already says everything it has to say — the answer
          goes to the Steps panel beside it.
          Unclipped, because the blocks above stop at the marker and a step already ridden
          is still a step you can point at.
          The shapes, not a band across the chart, because a free step has no block: there
          is no hit area over its gap, so hovering one highlights nothing by construction
          rather than by a test for freeness. Above the plan and the marker, which are not
          pointable and so have nothing to lose by it. */}
      {onHoverStep !== undefined && (
        <g fill="none" pointerEvents="all">
          {geometry.blocks.map((block) => (
            <path
              key={block.stepIndex}
              d={block.d}
              onPointerEnter={(event: ReactPointerEvent<SVGPathElement>) => {
                // A tap must not leave a row lit with no pointer to explain it.
                if (event.pointerType === 'mouse') onHoverStep(block.stepIndex);
              }}
              onPointerLeave={(event: ReactPointerEvent<SVGPathElement>) => {
                if (event.pointerType === 'mouse') onHoverStep(null);
              }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
