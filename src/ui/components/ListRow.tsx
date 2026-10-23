import type { CSSProperties, ReactNode } from 'react';
import { LABEL, MONO, SERIF } from './styles';

/** One five-column grid, its own widths per screen: each list's figures are different. */
export type ListColumns = readonly [string, string, string, string, string];

/**
 * The number columns, sized to the widest figure each actually holds at text-title in
 * JetBrains Mono, plus a little air — measured, not estimated. Distance tops out at
 * "999.9 km" (104 px), elapsed time at "12:34:56" (116 px), gain at "4812 m" (81 px),
 * average power at "1024 W" (81 px), and Ridden at "Not ridden" (67 px, sans). Each is
 * wider than its column label, which is the other thing that has to fit.
 *
 * They used to be 140/140/120 on every list, which left the figures adrift in their
 * cells and the description with less width than the actions gutter beside it.
 */
export const RIDES_COLUMNS: ListColumns = ['160px', '1fr', '112px', '120px', '88px'];
export const ROUTES_COLUMNS: ListColumns = ['160px', '1fr', '112px', '88px', '72px'];

/**
 * The grid, both ways round. Above the fold it is the screen's five columns; below it the
 * number columns are gone and the row is a thumbnail and a text block — the widths and the
 * 24 px gap are design/mockups/routes-tablet.html.
 *
 * The five-column template arrives as a custom property because a media query cannot reach
 * an inline style, and the widths vary per screen.
 */
const GRID =
  'grid grid-cols-[120px_1fr] gap-[24px] wide:grid-cols-[var(--list-columns)] wide:gap-[32px]';

function columnsVar(columns: ListColumns): CSSProperties {
  return { '--list-columns': columns.join(' ') } as CSSProperties;
}

/**
 * One figure on the folded number line: a value, the unit it is in, and whether the whole
 * thing is muted (a count rather than a measurement — "7 rides").
 *
 * Data rather than markup, so the line can be assembled and tested per list without a
 * renderer, and so each screen keeps its own typography for the unfolded cells.
 */
export interface FoldedFigure {
  value: string;
  unit?: string;
  /** The whole figure in muted, for a cell the lists already set quieter than the rest. */
  muted?: boolean;
}

/** Between the last figure and the first control. */
const ACTIONS_GAP = 24;

/**
 * The width a list reserves for a row's actions, from the measured width of the group
 * that row shows at rest — three 48 px icons sharing their edges is 142 px, two is 95.
 *
 * At rest, not armed. One width for all three lists sized to the armed confirm pair used
 * to cost every row of every list the space for a state one row briefly enters, and on
 * the routes list that left the description narrower than the gutter beside it. The
 * no-jump property that bought still holds where it matters: nothing moves while the
 * rider reads a list, because a resting row is the only row the gutter is cut for.
 *
 * The gutter is fixed and right-aligned, so the armed pair simply overflows leftwards
 * over the figures — see armedOverflow, which is what keeps it off the question it is
 * answering. Add a control to a row and both numbers need measuring again.
 */
export function actionsGutter(restingGroupPx: number): number {
  return Math.ceil(restingGroupPx) + ACTIONS_GAP;
}

/** Delete, Download, Race: three icons. */
export const RIDES_ACTIONS = actionsGutter(142);
/** Download and, where the route is the rider's to remove, Remove: two icons. */
export const ROUTES_ACTIONS = actionsGutter(95);

/**
 * How far an armed row's confirm pair reaches back over the figures, which is how much
 * room the prompt in their place has to give up on its right.
 *
 * Both are right-aligned to the row's right edge, so without this the buttons would land
 * on the last words of the question. Zero where the resting group is the wider of the two
 * — the workouts list, whose rows rest on text buttons.
 */
export function armedOverflow(gutter: number, armedGroupPx: number): number {
  return Math.max(0, Math.ceil(armedGroupPx) - (gutter - ACTIONS_GAP));
}

/** Delete and Keep, 177 px as a pair. The routes list's Remove and Keep is 183. */
export const RIDES_ARMED_INSET = armedOverflow(RIDES_ACTIONS, 177);
export const ROUTES_ARMED_INSET = armedOverflow(ROUTES_ACTIONS, 183);

interface ListRowFrameProps {
  /** The row itself — a ListRow, usually inside a Selectable. */
  children: ReactNode;
  /**
   * What you can do to this row. Deliberately a sibling of the anchor rather than a cell
   * inside it: a button inside an <a> is invalid markup, and its click would also reach
   * the row's own navigation on the way up.
   */
  actions?: ReactNode;
  /** This list's gutter: see actionsGutter. The header above it reserves the same. */
  actionsWidth: number;
}

/**
 * A row's boundary. The hairline rule lives here rather than on the anchor, so the box
 * contains a ride's figures and the things you can do to it alike — one object, not a row
 * with controls parked beside it.
 */
export function ListRowFrame({ children, actions, actionsWidth }: ListRowFrameProps) {
  return (
    <div className="border-hairline flex items-center border-t">
      <div className="min-w-0 grow">{children}</div>
      {actions !== undefined && (
        <div
          className="flex shrink-0 justify-end"
          style={{ width: `${String(actionsWidth)}px`, paddingLeft: `${String(ACTIONS_GAP)}px` }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** Holds the actions gutter open above the rows, which is the only thing keeping the
 * column labels over their figures. Takes the width rather than reading it, because each
 * list cuts its own and a header a few pixels out is a column of labels off its figures. */
export function ListHeaderFrame({
  children,
  actionsWidth,
}: {
  children: ReactNode;
  actionsWidth: number;
}) {
  return (
    <div className="flex items-center">
      <div className="min-w-0 grow">{children}</div>
      <div className="shrink-0" style={{ width: `${String(actionsWidth)}px` }} />
    </div>
  );
}

interface ListHeaderProps {
  columns: ListColumns;
  labels: readonly [string, string, string, string, string];
}

export function ListHeader({ columns, labels }: ListHeaderProps) {
  return (
    <div className={`${LABEL} text-caption ${GRID} pb-[12px]`} style={columnsVar(columns)}>
      {labels.map((text, index) => (
        // The number columns go with their figures: below the fold the header is Profile
        // and Route alone, as the tablet mockup has it.
        <div key={text} className={index >= 2 ? 'hidden text-right wide:block' : undefined}>
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
   * Prose under the meta, in muted body text, clamped to two lines with an ellipsis. The
   * routes list puts a route's own description here.
   *
   * Clamped at every width, which both mockups draw and design/DESIGN.md now states: the
   * full text belongs to the route's start sheet, where there is room for it, and a row
   * that grows to four lines because one route's author wrote an essay sets the whole
   * list at that height. This reverses an earlier call to let it wrap freely.
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
  /** The three right-aligned cells. Hidden below the fold, where `folded` replaces them. */
  cells: readonly [ReactNode, ReactNode, ReactNode];
  /**
   * The same figures as `cells`, as data, for the one mono line they fold into under the
   * description below the fold — "38.2 km  512 m  7 rides".
   *
   * A list that leaves it out keeps its figures only above the fold, which is the honest
   * rendering of a column set this line cannot carry. Empty means the row has no figures
   * worth folding — a workout whose plan will not parse — and the line is left out.
   */
  folded?: readonly FoldedFigure[];
  /**
   * Replaces all three cells with one node spanning their columns. The delete confirm
   * uses it: the row becomes the question where its figures were, rather than growing a
   * second line, so nothing on screen moves while someone is deciding.
   */
  cellsOverlay?: ReactNode;
  /**
   * Pixels of room the overlay gives up on its right, for a confirm pair too wide for
   * its gutter that reaches back over these columns — see armedOverflow. The folded line
   * below the fold never needs it: there is no gutter beside it down there.
   */
  overlayInset?: number;
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
  overlayInset,
  folded,
}: ListRowProps) {
  const sparkline = leadVariant === 'sparkline';
  const metaLabel = (metaVariant ?? (sparkline ? 'plain' : 'label')) === 'label';
  const padY = paddingY ?? (sparkline ? 26 : 22);

  return (
    <a
      href={href}
      // The rule is ListRowFrame's: it has to span the actions as well as the figures.
      // Below the fold a thumbnail sits at the top of its text block rather than centred
      // on it, because the block is now four lines deep.
      className={`${GRID} text-ink py-[20px] no-underline wide:py-[var(--list-pad-y)] ${
        sparkline ? 'items-start wide:items-center' : 'items-baseline'
      }`}
      style={{ ...columnsVar(columns), '--list-pad-y': `${String(padY)}px` } as CSSProperties}
    >
      <div className={sparkline ? 'mt-[8px] h-[28px] w-[120px] wide:mt-0' : undefined}>{lead}</div>
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
          <div className="text-label text-muted mt-[3px] font-sans leading-[1.45] line-clamp-2 wide:max-w-[560px]">
            {description}
          </div>
        )}
        {cellsOverlay === undefined && folded !== undefined && folded.length > 0 && (
          <div className={`${MONO} text-label mt-[6px] flex gap-[18px] wide:hidden`}>
            {folded.map((figure, index) => (
              <span key={index} className={figure.muted === true ? 'text-muted' : undefined}>
                {figure.value}
                {figure.unit !== undefined && (
                  <>
                    {' '}
                    <span className="text-muted">{figure.unit}</span>
                  </>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      {cellsOverlay === undefined ? (
        cells.map((cell, index) => (
          <div key={index} className="hidden text-right wide:block">
            {cell}
          </div>
        ))
      ) : (
        /* One node, placed rather than duplicated. Below the fold it falls under the text
           block where the folded figures sit; above it, onto the first row across the
           three figure columns. Rendering it twice and hiding one put the question in the
           document twice, which a locator sees even when a reader cannot. */
        <div
          className="col-start-2 mt-[6px] wide:col-span-3 wide:col-start-3 wide:row-start-1 wide:mt-0 wide:text-right"
          style={
            overlayInset === undefined ? undefined : { paddingRight: `${String(overlayInset)}px` }
          }
        >
          {cellsOverlay}
        </div>
      )}
    </a>
  );
}
