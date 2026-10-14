import { useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { num } from '../format';
import { powerStripGeometry, type PowerSample } from './power';

export const POWER_STRIP_WIDTH = 944;
export const POWER_STRIP_HEIGHT = 74;

export interface PowerStripHandle {
  /** Called at 1 Hz. Moves and relabels the current reading; the washes come from props. */
  update(distanceM: number, currentW: number | null): void;
}

/**
 * 'live' draws the moving current-reading label; 'complete' leaves it out altogether,
 * because a finished ride has no current reading and a "— W" marker is a lie about a
 * trainer that is simply no longer being asked.
 */
export type PowerStripMode = 'live' | 'complete';

export interface PowerStripProps {
  samples: readonly PowerSample[];
  ftpW: number;
  /** The distance window, shared with the elevation profile above. */
  startM: number;
  endM: number;
  /** Where the marker label sits. Ignored in 'complete' mode. */
  distanceM?: number;
  currentW?: number | null;
  mode?: PowerStripMode;
  width?: number;
  height?: number;
  ref?: RefObject<PowerStripHandle | null>;
}

/**
 * The zone washes are props, not ref mutations: their element count changes as new
 * zones are entered, so there is no fixed set of nodes to write to. Only the current
 * reading — the one thing that moves every second — goes through the ref.
 */
export function PowerStrip({
  samples,
  ftpW,
  startM,
  endM,
  distanceM = 0,
  currentW = null,
  mode = 'live',
  width = POWER_STRIP_WIDTH,
  height = POWER_STRIP_HEIGHT,
  ref,
}: PowerStripProps) {
  const geometry = useMemo(
    () => powerStripGeometry({ samples, ftpW, startM, endM, width, height }),
    [samples, ftpW, startM, endM, width, height],
  );

  const current = useRef<SVGTextElement>(null);

  const paint = useMemo(() => {
    return (distance: number, watts: number | null): void => {
      const node = current.current;
      if (!node) return;
      node.setAttribute('x', String(geometry.xFor(distance) + 8));
      node.textContent = `${num(watts)} W`;
    };
  }, [geometry]);

  useImperativeHandle(ref, () => ({ update: paint }), [paint]);

  useEffect(() => {
    paint(distanceM, currentW);
  }, [paint, distanceM, currentW]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Power so far"
    >
      <line
        x1={0}
        y1={geometry.ftpY}
        x2={width}
        y2={geometry.ftpY}
        stroke="var(--color-hairline)"
        strokeWidth={1}
        strokeDasharray="2 5"
      />

      {geometry.fills.map((fill, i) => (
        <path key={i} d={fill.d} fill="var(--color-accent)" opacity={fill.opacity} />
      ))}

      <path
        d={geometry.linePath}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1}
        strokeLinejoin="round"
      />

      <line
        x1={0}
        y1={geometry.baselineY}
        x2={width}
        y2={geometry.baselineY}
        stroke="var(--color-muted)"
        strokeWidth={1}
      />

      <text
        x={0}
        y={height - 4}
        className="font-sans uppercase"
        fontSize={11}
        letterSpacing={1.2}
        fill="var(--color-muted)"
      >
        Power
      </text>
      <text
        x={width - 2}
        y={geometry.ftpY - 4}
        textAnchor="end"
        className="font-mono"
        fontSize={11}
        fill="var(--color-muted)"
      >
        {`FTP ${num(ftpW)}`}
      </text>
      {mode === 'live' && (
        <text
          ref={current}
          x={0}
          y={geometry.currentLabelY}
          className="font-mono"
          fontSize={11}
          fill="var(--color-ink)"
        />
      )}
      <text
        x={width}
        y={height - 4}
        textAnchor="end"
        className="font-mono"
        fontSize={11}
        fill="var(--color-muted)"
      >
        {`avg ${num(geometry.averageW)} W`}
      </text>
    </svg>
  );
}
