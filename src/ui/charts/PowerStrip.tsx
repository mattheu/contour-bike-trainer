import { useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { num } from '../format';
import { powerStripGeometry, type PowerSample } from './power';

export const POWER_STRIP_WIDTH = 944;
export const POWER_STRIP_HEIGHT = 74;

export interface PowerStripHandle {
  /** Called at 1 Hz. Moves the rider's marker; the washes come from props. */
  update(distanceM: number): void;
}

/**
 * 'live' draws the rider's marker; 'complete' leaves it out, because a finished ride has
 * no "here" to mark — the strip is the whole of what was ridden.
 *
 * The distinction used to be about a moving current-reading label, which carried the
 * watts. That label is gone: with the hero reading a 3 s trailing mean, a second figure
 * on the same screen taken from the raw instant would show a different number for the
 * same thing, which is worse than the jitter it was fixing. The strip takes no power
 * reading at all now, so it has nothing to disagree with — what is left is position,
 * which is the one thing the two modes genuinely differ about.
 */
export type PowerStripMode = 'live' | 'complete';

export interface PowerStripProps {
  samples: readonly PowerSample[];
  ftpW: number;
  /** The distance window, shared with the elevation profile above. */
  startM: number;
  endM: number;
  /** Where the rider's marker sits. Ignored in 'complete' mode. */
  distanceM?: number;
  mode?: PowerStripMode;
  width?: number;
  height?: number;
  ref?: RefObject<PowerStripHandle | null>;
}

/**
 * The zone washes are props, not ref mutations: their element count changes as new
 * zones are entered, so there is no fixed set of nodes to write to. Only the rider's
 * marker — the one thing that moves every second — goes through the ref.
 */
export function PowerStrip({
  samples,
  ftpW,
  startM,
  endM,
  distanceM = 0,
  mode = 'live',
  width = POWER_STRIP_WIDTH,
  height = POWER_STRIP_HEIGHT,
  ref,
}: PowerStripProps) {
  const geometry = useMemo(
    () => powerStripGeometry({ samples, ftpW, startM, endM, width, height }),
    [samples, ftpW, startM, endM, width, height],
  );

  const marker = useRef<SVGLineElement>(null);

  const paint = useMemo(() => {
    return (distance: number): void => {
      const node = marker.current;
      if (!node) return;
      const x = String(geometry.xFor(distance));
      node.setAttribute('x1', x);
      node.setAttribute('x2', x);
    };
  }, [geometry]);

  useImperativeHandle(ref, () => ({ update: paint }), [paint]);

  useEffect(() => {
    paint(distanceM);
  }, [paint, distanceM]);

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
      {/* design/DESIGN.md > Palette gives ink to marker ticks. No number on it: the hero
          above holds the watts, and it holds them once. */}
      {mode === 'live' && (
        <line
          ref={marker}
          x1={0}
          y1={geometry.markerTopY}
          x2={0}
          y2={geometry.baselineY}
          stroke="var(--color-ink)"
          strokeWidth={1}
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
