import { useEffect, useRef } from 'react';
import { SYMBOL_BOX } from '../../ghost/slots';
import { GhostMark } from '../components/GhostKey';
import { MONO } from '../components/styles';
import type { TimeRow } from './ride-times';

/**
 * The times view: the ranked list that takes the map column's place, drawn with the
 * workout's step-list rows — rank, symbol, name, gap, time.
 *
 * design/mockups/ride-times.html. It borrows the rows rather than a component because the
 * two lists hold different things in different cells; what is shared is the row's grammar,
 * which is the four columns, the hairline between them and what the current one looks
 * like. The classes are written out here for the reason WorkoutPhoneSteps gives for its
 * own copy: Tailwind reads complete class names out of the source.
 *
 * It takes no more than the map's height, so switching views moves nothing else on the
 * screen.
 */
export function RideTimes({
  rows,
  note,
  height,
}: {
  rows: readonly TimeRow[];
  note: string;
  /** The most the panel may take, which is the height the map would have had. */
  height: number;
}) {
  return (
    // A ceiling rather than a height: five rows and the line under them sit together at
    // the top of the column, as the mockup draws them, and a session long enough to fill
    // the map's height scrolls inside it instead of pushing the line off the screen.
    <div className="flex flex-col" style={{ maxHeight: `${String(height)}px` }}>
      <TimesList rows={rows} />
      {/* The line explains a column of figures, so it goes with them: on a route nobody
          has ridden and nothing is racing, "gaps to best" would caption an empty panel. */}
      {rows.length > 0 && (
        <div className={`${MONO} text-micro text-muted mt-[4px] shrink-0`}>{note}</div>
      )}
    </div>
  );
}

/**
 * The rows, scrolling inside the panel with the lap in progress kept in view.
 *
 * Twenty-three rows is what a twenty-lap session on a short circuit comes to, and the
 * answer is the one the step list already gives a long workout: the panel scrolls and
 * carries the current row with it. No cap, because a ranking that holds some of your laps
 * is not a ranking of your session; and no control, because the view has none to spend —
 * the header carries the one icon that switches back to the map.
 *
 * Keyed on the lap's name rather than on its rank, so the scroll fires once a lap instead
 * of every time the projection shuffles the row past a neighbour. A cut, not a slide, for
 * the reason the step panel gives: the screen re-renders every second for its clocks, and
 * a smooth scroll never survives the next tick.
 */
function TimesList({ rows }: { rows: readonly TimeRow[] }) {
  const currentRow = useRef<HTMLDivElement>(null);
  const current = rows.find((row) => row.current)?.name ?? null;

  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [current]);

  return (
    // bg-ground/60 rather than solid ground, because the contour field runs behind it.
    <div className="bg-ground/60 min-h-0 overflow-y-auto" data-testid="ride-times">
      {rows.map((row) => (
        <Row key={row.key} row={row} ref={row.current ? currentRow : undefined} />
      ))}
      {/* The list's own bottom edge. Every row carries the rule above it, so without this
          the last one ends on nothing. */}
      <div className="border-hairline border-t" />
    </div>
  );
}

/**
 * One row. The lap being ridden takes the step panel's current treatment — solid ink,
 * ground text, a 2 px accent left edge out of the inset so the rank stays on the same
 * upright as every other row's — and says `· now` after its name, because a time still
 * running is not a time in the way the rows around it are.
 *
 * It carries no gap. There is nothing to compare a lap that has not finished with, and a
 * figure in that cell would be a claim about a lap that is still being ridden.
 */
function Row({ row, ref }: { row: TimeRow; ref?: React.Ref<HTMLDivElement> }) {
  const tone = row.current
    ? {
        frame: 'border-hairline border-l-accent bg-ink border-t border-l-2 pl-[12px]',
        rank: 'text-ground',
        name: 'text-ground font-medium',
        gap: 'text-ground',
        time: 'text-ground font-medium',
      }
    : {
        frame: 'border-hairline border-t pl-[14px]',
        rank: 'text-muted',
        name: 'text-ink',
        gap: 'text-muted',
        time: 'text-ink',
      };

  return (
    <div
      ref={ref}
      className={`flex items-center gap-[12px] py-[9px] pr-[10px] ${tone.frame}`}
      aria-current={row.current ? 'true' : undefined}
    >
      <div className={`${MONO} text-micro w-[16px] ${tone.rank}`}>{row.rank}</div>
      {/* A lap of this session has no symbol and keeps the width anyway, so the names line
          up down the column whatever each row is. */}
      {row.symbol === null ? (
        <div className="shrink-0" style={{ width: SYMBOL_BOX }} />
      ) : (
        <div className="shrink-0">
          <GhostMark symbol={row.symbol} />
        </div>
      )}
      <div className={`text-label grow truncate font-sans ${tone.name}`}>
        {row.name}
        {row.current && <span className={`${MONO} text-micro`}> · now</span>}
      </div>
      {row.gap !== null && <div className={`${MONO} text-micro ${tone.gap}`}>{row.gap}</div>}
      <div className={`${MONO} text-caption w-[58px] shrink-0 text-right ${tone.time}`}>
        {row.time}
      </div>
    </div>
  );
}
