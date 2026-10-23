import type { ReactNode } from 'react';
import { LABEL, SERIF } from './styles';

/** One five-column grid, two sets of widths: the lead and last columns differ per screen. */
export type ListColumns = readonly [string, string, string, string, string];

export const RIDES_COLUMNS: ListColumns = ['160px', '1fr', '140px', '140px', '140px'];
export const ROUTES_COLUMNS: ListColumns = ['160px', '1fr', '140px', '140px', '120px'];

const GRID = 'grid gap-[32px]';

/**
 * The width reserved for a row's actions, gap included, on every row and on the column
 * labels above them. One number for all three lists, so their columns line up as the rider
 * moves between tabs.
 *
 * Sized for the widest row rather than the common one, on two counts. A row that changed
 * width when you armed its delete would make the list jump under the cursor at exactly the
 * moment someone is about to confirm something they cannot undo. And the gutter is a fixed
 * width with its contents right-aligned, so a group too wide for it does not clip or wrap —
 * it overflows leftwards into the figures, which is how three controls on a workouts row
 * came to sit 4 px from the load figure.
 *
 * The widest today is a workouts row's three controls at 252 px, measured rather than
 * estimated. Adding a control to any row means measuring again — the rides list's Race
 * button took its group to three 48 px icons, 142 px with their shared edges, which this
 * already holds.
 */
export const ACTIONS_WIDTH = 280;

interface ListRowFrameProps {
  /** The row itself — a ListRow, usually inside a Selectable. */
  children: ReactNode;
  /**
   * What you can do to this row. Deliberately a sibling of the anchor rather than a cell
   * inside it: a button inside an <a> is invalid markup, and its click would also reach
   * the row's own navigation on the way up.
   */
  actions?: ReactNode;
}

/**
 * A row's boundary. The hairline rule lives here rather than on the anchor, so the box
 * contains a ride's figures and the things you can do to it alike — one object, not a row
 * with controls parked beside it.
 */
export function ListRowFrame({ children, actions }: ListRowFrameProps) {
  return (
    <div className="border-hairline flex items-center border-t">
      <div className="min-w-0 grow">{children}</div>
      {actions !== undefined && (
        <div
          className="flex shrink-0 justify-end pl-[24px]"
          style={{ width: `${String(ACTIONS_WIDTH)}px` }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** Holds the actions gutter open above the rows, which is the only thing keeping the
 * column labels over their figures. */
export function ListHeaderFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center">
      <div className="min-w-0 grow">{children}</div>
      <div className="shrink-0" style={{ width: `${String(ACTIONS_WIDTH)}px` }} />
    </div>
  );
}

interface ListHeaderProps {
  columns: ListColumns;
  labels: readonly [string, string, string, string, string];
}

export function ListHeader({ columns, labels }: ListHeaderProps) {
  return (
    <div
      className={`${LABEL} text-caption ${GRID} pb-[12px]`}
      style={{ gridTemplateColumns: columns.join(' ') }}
    >
      {labels.map((text, index) => (
        <div key={text} className={index >= 2 ? 'text-right' : undefined}>
          {text}
        </div>
      ))}
    </div>
  );
}

interface ListRowProps {
  columns: ListColumns;
  /**
   * Absent for a row that cannot be selected — a workout whose plan will not parse. An
   * anchor with no href is not a link and not focusable, which is the honest rendering of
   * a row that goes nowhere; its actions are still reachable beside it.
   */
  href?: string;
  /**
   * Text on the rides list (the date), a sparkline on the routes list. The chart itself
   * belongs to src/ui/charts; this only holds the 120 × 28 slot open for it.
   */
  lead: ReactNode;
  leadVariant?: 'text' | 'sparkline';
  /** The route or workout name. */
  title: ReactNode;
  /** The line under the title: the workout behind a ride, a route's kind and region. */
  meta?: ReactNode;
  /**
   * How that line is set. Tracked caps by default beside a text lead (the rides list),
   * plain muted beside a sparkline (a workout's own second line), with the routes list
   * asking for caps explicitly — its label row is a row of labels, and the description
   * underneath is the prose.
   */
  metaVariant?: 'label' | 'plain';
  /**
   * Prose under the meta, in muted body text, wrapped to as many lines as it takes. It is
   * deliberately not clipped: a description cut off at a third of itself is a worse answer
   * than a taller row, and the column is only about fifty characters wide. The routes list
   * puts a route's own description here.
   *
   * Its own slot rather than more meta, because the two lines are different kinds of
   * thing — the meta is a row of labels, this is prose — and because either can be absent
   * on its own. Absent means absent: no element, no reserved space, so a row without one
   * is exactly as tall as a row that never had the slot.
   *
   * Deliberately ignorant of what it is showing. Nothing here knows it is a description,
   * which is what lets another list take the same line later.
   */
  description?: ReactNode;
  /**
   * The row's vertical padding, in pixels. Per screen rather than per row: a list where
   * some rows carried a description and some did not would otherwise sit at two heights,
   * and the slot being optional is exactly the case that happens.
   *
   * The default is what the three lists rendered at before the slot existed. The routes
   * list asks for the mockup's 22 px, because its rows are three lines deep.
   */
  paddingY?: number;
  /** The three right-aligned cells. */
  cells: readonly [ReactNode, ReactNode, ReactNode];
  /**
   * Replaces all three cells with one node spanning their columns. The delete confirm
   * uses it: the row becomes the question where its figures were, rather than growing a
   * second line, so nothing on screen moves while someone is deciding.
   */
  cellsOverlay?: ReactNode;
}

export function ListRow({
  columns,
  href,
  lead,
  leadVariant = 'text',
  title,
  meta,
  metaVariant,
  description,
  paddingY,
  cells,
  cellsOverlay,
}: ListRowProps) {
  const sparkline = leadVariant === 'sparkline';
  const metaLabel = (metaVariant ?? (sparkline ? 'plain' : 'label')) === 'label';
  const padY = paddingY ?? (sparkline ? 26 : 22);

  return (
    <a
      href={href}
      // The rule is ListRowFrame's: it has to span the actions as well as the figures.
      className={`${GRID} text-ink no-underline ${sparkline ? 'items-center' : 'items-baseline'}`}
      style={{
        gridTemplateColumns: columns.join(' '),
        paddingTop: `${String(padY)}px`,
        paddingBottom: `${String(padY)}px`,
      }}
    >
      <div className={sparkline ? 'h-[28px] w-[120px]' : undefined}>{lead}</div>
      {/* min-w-0 is what lets anything in this column clip: a 1fr grid track will not let
          a nowrap child shrink without it. Harmless where nothing clips — the two lists
          with no description measure the same with it as without. */}
      <div className="flex min-w-0 flex-col gap-[4px]">
        <div className={`${SERIF} text-title`}>{title}</div>
        {meta !== undefined && (
          <div className={metaLabel ? `${LABEL} text-micro` : 'text-label text-muted font-sans'}>
            {meta}
          </div>
        )}
        {description !== undefined && (
          <div className="text-label text-muted mt-[3px] font-sans">{description}</div>
        )}
      </div>
      {cellsOverlay === undefined ? (
        cells.map((cell, index) => (
          <div key={index} className="text-right">
            {cell}
          </div>
        ))
      ) : (
        <div className="col-span-3 text-right">{cellsOverlay}</div>
      )}
    </a>
  );
}
