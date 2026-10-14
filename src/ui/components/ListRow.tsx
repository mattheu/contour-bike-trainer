import type { ReactNode } from 'react';
import { LABEL, SERIF } from './styles';

/** One five-column grid, two sets of widths: the lead and last columns differ per screen. */
export type ListColumns = readonly [string, string, string, string, string];

export const RIDES_COLUMNS: ListColumns = ['160px', '1fr', '140px', '140px', '140px'];
export const ROUTES_COLUMNS: ListColumns = ['160px', '1fr', '140px', '140px', '120px'];

const GRID = 'grid gap-[32px]';

/**
 * The width reserved for a row's actions, gap included, on every row and on the column
 * labels above them. Sized for the armed delete confirm rather than the resting icons: a
 * row that changed width or height when you armed it would make the list jump under the
 * cursor at exactly the moment someone is about to confirm something they cannot undo.
 */
export const ACTIONS_WIDTH = 224;

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
  /**
   * The line under the title. Tracked caps beside a text lead (the workout behind a ride),
   * plain muted beside a sparkline (the region a route is in) — the two list screens.
   */
  meta?: ReactNode;
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
  cells,
  cellsOverlay,
}: ListRowProps) {
  const sparkline = leadVariant === 'sparkline';

  return (
    <a
      href={href}
      // The rule is ListRowFrame's: it has to span the actions as well as the figures.
      className={`${GRID} text-ink no-underline ${
        sparkline ? 'items-center py-[26px]' : 'items-baseline py-[22px]'
      }`}
      style={{ gridTemplateColumns: columns.join(' ') }}
    >
      <div className={sparkline ? 'h-[28px] w-[120px]' : undefined}>{lead}</div>
      <div className="flex flex-col gap-[4px]">
        <div className={`${SERIF} text-title`}>{title}</div>
        {meta !== undefined && (
          <div className={sparkline ? 'text-label text-muted font-sans' : `${LABEL} text-micro`}>
            {meta}
          </div>
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
