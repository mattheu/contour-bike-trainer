import { useEffect, useId, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { ABSENT } from '../format';
import {
  DESKTOP_STRIP,
  STRIP_CAPTION,
  STRIP_ORDER,
  stripAxis,
  trendStripGeometry,
  type StripAxisKind,
  type StripMetrics,
  type TrendKind,
  type TrendSamples,
  type StripAxis,
  type TrendStripGeometry,
} from './strips';

/** Under the baseline, as every mockup draws the axis. */
const TICK_LONG = 8;
const TICK_SHORT = 4;
const AXIS_LABEL_Y = 22;

/**
 * The two trend strips under the primary chart: power, then heart rate.
 *
 * design/DESIGN.md > Marks > Trend strips. They are one component rather than two because
 * they are one block — the order is fixed, the axis under the second one rules the bottom
 * of all three charts, and the marker's drop line has to run through the lot. A screen that
 * composed them itself would be a screen that could get the order wrong.
 *
 * No readouts, units, averages or threshold rules: the hero figures carry every number on
 * this screen, and they carry them once. What is left is shape.
 *
 * Renders a bare pair of block-level SVGs, so whatever column holds them must carry no row
 * gap — each chart's baseline is the rule above the next, which is only true if nothing
 * sits between them.
 */

export interface TrendStripsHandle {
  /** Called at 1 Hz. Moves the drop lines; the traces come from props. */
  update(at: number): void;
}

/**
 * 'live' draws the drop line; 'complete' leaves it out, because a finished session has no
 * "here" to mark — the strips are the whole of what was ridden.
 */
export type TrendStripsMode = 'live' | 'complete';

export interface TrendStripsProps {
  /** Both series, already placed on this block's axis. See trendSamplesByDistance. */
  samples: TrendSamples;
  ftpW: number;
  /** The window, shared with the chart above: metres on a ride, seconds on a workout. */
  startAt: number;
  endAt: number;
  width: number;
  /** Desktop and tablet unless a phone says otherwise. See StripMetrics. */
  metrics?: StripMetrics;
  /** What the axis under the block counts. 'none' draws no axis at all. */
  axis?: StripAxisKind;
  /** Where the drop line sits. Ignored in 'complete' mode. */
  at?: number;
  mode?: TrendStripsMode;
  ref?: RefObject<TrendStripsHandle | null>;
}

/**
 * The traces are props rather than ref mutations: they grow every second, so there is no
 * fixed path to write to. Only the drop line — the one thing that merely moves — goes
 * through the handle, which is what keeps a tick off the React render path on the ride
 * screen where the charts outlive the renders around them.
 */
export function TrendStrips({
  samples,
  ftpW,
  startAt,
  endAt,
  width,
  metrics = DESKTOP_STRIP,
  axis = 'none',
  at = 0,
  mode = 'live',
  ref,
}: TrendStripsProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const geometries = useMemo(
    () =>
      STRIP_ORDER.map((kind) =>
        trendStripGeometry({
          samples: kind === 'power' ? samples.power : samples.heartRate,
          kind,
          ftpW,
          startAt,
          endAt,
          width,
          metrics,
        }),
      ),
    [samples, ftpW, startAt, endAt, width, metrics],
  );

  const resolvedAxis = useMemo(
    () => stripAxis({ kind: axis, startAt, endAt, width }),
    [axis, startAt, endAt, width],
  );

  const dropLines = useRef<(SVGLineElement | null)[]>([]);

  const paint = useMemo(() => {
    return (position: number): void => {
      dropLines.current.forEach((node, index) => {
        const geometry = geometries[index];
        if (!node || geometry === undefined) return;
        const x = String(geometry.xFor(position));
        node.setAttribute('x1', x);
        node.setAttribute('x2', x);
      });
    };
  }, [geometries]);

  useImperativeHandle(ref, () => ({ update: paint }), [paint]);

  // A new geometry leaves the mutated attributes describing the old one, so repaint after
  // every render that replaces it.
  useEffect(() => {
    paint(at);
  }, [paint, at]);

  return (
    <>
      {STRIP_ORDER.map((kind, index) => (
        <Strip
          key={kind}
          kind={kind}
          uid={`${uid}-${kind}`}
          geometry={geometries[index] as TrendStripGeometry}
          metrics={metrics}
          // The axis belongs to the last strip: it rules the bottom of the whole block.
          axis={index === STRIP_ORDER.length - 1 ? resolvedAxis : null}
          dropLineRef={(node) => {
            dropLines.current[index] = node;
          }}
          showDropLine={mode === 'live'}
        />
      ))}
    </>
  );
}

/**
 * Power is the accent, heart rate is ink — the line and the wash under it in the same
 * colour, which is what makes the pair read as two of one thing. The hatch is the chart
 * hatch and follows the mockups rather than the trace: accent on power, muted on heart
 * rate. design/mockups/ride.html.
 */
const TRACE_COLOUR: Record<TrendKind, string> = {
  power: 'var(--color-accent)',
  heartRate: 'var(--color-ink)',
};

/** Accent at 9 % and ink at 6 % read as the same weight. design/DESIGN.md. */
const WASH_OPACITY: Record<TrendKind, number> = { power: 0.09, heartRate: 0.06 };

const HATCH_COLOUR: Record<TrendKind, string> = {
  power: 'var(--color-accent)',
  heartRate: 'var(--color-muted)',
};

function Strip({
  kind,
  uid,
  geometry,
  metrics,
  axis,
  dropLineRef,
  showDropLine,
}: {
  kind: TrendKind;
  uid: string;
  geometry: TrendStripGeometry;
  metrics: StripMetrics;
  axis: StripAxis | null;
  dropLineRef: (node: SVGLineElement | null) => void;
  showDropLine: boolean;
}) {
  const { width, height } = geometry;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      // Visible, because the axis ticks and figures hang below the last strip's box. The
      // trace is confined by a clip of its own instead — see below.
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={STRIP_CAPTION[kind]}
    >
      <defs>
        {/* design/DESIGN.md: a single 45-degree hatch, 8 px pitch, 0.8 px lines. */}
        <pattern
          id={`strip-hatch-${uid}`}
          patternUnits="userSpaceOnUse"
          width={8}
          height={8}
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={8} stroke={HATCH_COLOUR[kind]} strokeWidth={0.8} />
        </pattern>
        {/* The strip's own box. A reading over the ceiling needles up through the caption
            band and is cut at the top rule, which is this edge: the geometry stops the
            coordinates there and this stops the half of the 1.25 px stroke that would
            otherwise paint over the chart above. */}
        <clipPath id={`strip-area-${uid}`}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>

      <g clipPath={`url(#strip-area-${uid})`}>
        {geometry.areaPaths.map((d) => (
          <path key={`wash-${d}`} d={d} fill={TRACE_COLOUR[kind]} opacity={WASH_OPACITY[kind]} />
        ))}
        {geometry.areaPaths.map((d) => (
          <path key={`hatch-${d}`} d={d} fill={`url(#strip-hatch-${uid})`} opacity={0.75} />
        ))}
        {geometry.linePaths.map((d) => (
          <path
            key={`line-${d}`}
            d={d}
            fill="none"
            stroke={TRACE_COLOUR[kind]}
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
        ))}
      </g>

      {showDropLine && (
        <line
          ref={dropLineRef}
          x1={0}
          y1={geometry.traceTopY}
          x2={0}
          y2={geometry.baselineY}
          stroke="var(--color-accent)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      )}

      <line
        x1={0}
        y1={geometry.baselineY}
        x2={width}
        y2={geometry.baselineY}
        stroke="var(--color-muted)"
        strokeWidth={1}
      />

      {/* Drawn last so a needle through the band passes behind the words rather than over
          them. 0.14em is the type scale's tracked-caps tracking. */}
      <text
        x={0}
        y={geometry.captionY}
        className="font-sans uppercase"
        fontSize={metrics.captionPx}
        letterSpacing="0.14em"
        fill="var(--color-muted)"
      >
        {STRIP_CAPTION[kind]}
      </text>
      {/* A sensor that reported nothing keeps its strip, its caption and a dash, so the
          layout never shifts when one is connected mid-ride. design/DESIGN.md. */}
      {!geometry.connected && (
        <text
          x={width}
          y={geometry.captionY}
          textAnchor="end"
          className="font-mono"
          fontSize={metrics.captionPx}
          fill="var(--color-muted)"
        >
          {ABSENT}
        </text>
      )}

      {axis?.ticks.map((tick) => (
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
      {axis !== null && axis.totalLabel !== null && (
        <text
          x={width}
          y={geometry.baselineY + AXIS_LABEL_Y}
          textAnchor="end"
          className="font-mono"
          fontSize={11}
          fill="var(--color-muted)"
        >
          {axis.totalLabel}
        </text>
      )}
    </svg>
  );
}
