import type { CSSProperties, ReactNode } from 'react';
import { ButtonGroup } from './ButtonGroup';
import { SELECTED, TONE } from './control';
import { COLOUR_SHIFT } from './motion';
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
 * The grid, three ways round. Above the fold it is the screen's five columns; below it the
 * number columns are gone and the row is a thumbnail and a text block — the widths and the
 * 24 px gap are design/mockups/routes-tablet.html. On a phone the thumbnail goes too and
 * the row is one column of text (design/mockups/routes-phone.html), which is a third
 * layout rather than a narrower fold.
 *
 * Phone ends where the page gutter and the header lockup already change, at Tailwind's
 * `sm`: below it .page-gutter and .logo-header are both on their phone rule, so the whole
 * screen steps at one width instead of the rows stepping at a second.
 *
 * Written as `max-sm:` rather than `sm:` throughout, which is not a style preference.
 * `--breakpoint-wide` is declared in px and the built-in breakpoints in rem, so Tailwind
 * cannot order the two and emits every `wide:` rule ahead of every `sm:` one — an `sm:`
 * width then quietly beats the `wide:` width it is meant to yield to. `max-sm:` and
 * `wide:` cover ranges that cannot both match, so their order never decides anything.
 *
 * The five-column template arrives as a custom property because a media query cannot reach
 * an inline style, and the widths vary per screen.
 */
const GRID =
  'grid grid-cols-[120px_1fr] gap-[24px] max-sm:grid-cols-1 max-sm:gap-0 wide:grid-cols-[var(--list-columns)] wide:gap-[32px]';

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
    // On a phone a group too wide to sit beside the row drops under it instead of
    // squeezing the name to nothing: the workouts list rests on three named buttons, and
    // 358 px will not hold those and a readable row on one line. 220 px is what a name,
    // its label row and its figure line need before the row stops being worth reading.
    <div className="border-hairline flex items-center border-t max-sm:flex-wrap max-sm:gap-y-[12px]">
      <div className="min-w-0 grow max-sm:min-w-[220px]">{children}</div>
      {actions !== undefined && (
        /* The fixed gutter is what keeps the column labels over their figures, and below
           1100 px there are no column labels: the group takes the width it needs instead,
           which is the difference between a readable name and 80 px of it on a phone. */
        <div
          className="flex shrink-0 justify-end wide:w-[var(--list-actions)]"
          style={
            {
              '--list-actions': `${String(actionsWidth)}px`,
              paddingLeft: `${String(ACTIONS_GAP)}px`,
            } as CSSProperties
          }
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
    <div className="hidden items-center wide:flex">
      <div className="min-w-0 grow">{children}</div>
      <div className="shrink-0" style={{ width: `${String(actionsWidth)}px` }} />
    </div>
  );
}

/**
 * One column header. The label already carries its arrow — what a header says when it is
 * the column being sorted on is a question about the sort, not about the grid, and it is
 * answered once in screens/list-sort.ts for both this and the segmented control below.
 */
export interface ListHeaderCell {
  label: string;
  /** Absent where the column does not sort: a thumbnail, or a slot with no word. */
  onPress?: () => void;
  ariaSort?: 'ascending' | 'descending' | 'none';
  /** The column being sorted on is ink; every other is muted. */
  active?: boolean;
}

/** The tracked caps of LABEL without its colour, which the state decides here. */
const HEADER_WORD = 'font-sans tracking-[0.14em] uppercase';

/**
 * The column labels, desktop only. Below 1100 px the header is gone entirely — there is
 * nothing left under it to label — and ListSort takes over the sorting.
 */
export function ListHeader({
  columns,
  cells,
}: {
  columns: ListColumns;
  cells: readonly ListHeaderCell[];
}) {
  return (
    <div
      className="text-caption hidden pb-[12px] wide:grid wide:grid-cols-[var(--list-columns)] wide:gap-[32px]"
      style={columnsVar(columns)}
    >
      {cells.map((cell, index) => {
        // The number columns are right-aligned on their figures; the first two are not.
        const align = index >= 2 ? 'text-right' : 'text-left';
        if (cell.onPress === undefined) {
          return (
            <div key={index} className={`${HEADER_WORD} text-muted ${align}`}>
              {cell.label}
            </div>
          );
        }
        return (
          <button
            key={index}
            type="button"
            aria-sort={cell.ariaSort}
            onClick={cell.onPress}
            className={`${HEADER_WORD} ${COLOUR_SHIFT} ${align} w-full cursor-pointer hover:text-ink focus-visible:outline-ink focus-visible:outline-2 focus-visible:outline-offset-2 ${
              cell.active === true ? 'text-ink' : 'text-muted'
            }`}
          >
            {cell.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sorting where there is no header row to press — design/mockups/routes-tablet.html and
 * routes-phone.html put it under the nav, a "Sort" label and one flush group.
 *
 * Its own buttons rather than Segmented, which takes a single size: this is the one
 * control that has to fit four words and a label across 390 px, so it steps down with the
 * viewport rather than overflowing the gutter.
 */
export function ListSort<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: K; label: string }[];
  value: K;
  onChange: (value: K) => void;
}) {
  return (
    <div className="flex items-center gap-[16px] wide:hidden">
      <div className={`${LABEL} text-micro`}>Sort</div>
      <ButtonGroup label="Sort">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange(option.value);
              }}
              // The selected segment stays pressable, unlike every other Segmented in the
              // app: pressing it is the only way to reverse a sort once the column
              // headers are gone, so it overrides SELECTED's resting cursor.
              className={`${selected ? `${SELECTED} cursor-pointer!` : TONE.grey} text-caption min-h-[44px] px-[18px] py-[10px] whitespace-nowrap max-sm:text-micro max-sm:px-[8px] max-sm:py-0`}
            >
              {option.label}
            </button>
          );
        })}
      </ButtonGroup>
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
      className={`${GRID} text-ink py-[20px] no-underline max-sm:py-[18px] wide:py-[var(--list-pad-y)] ${
        sparkline ? 'items-start wide:items-center' : 'items-baseline'
      }`}
      style={{ ...columnsVar(columns), '--list-pad-y': `${String(padY)}px` } as CSSProperties}
    >
      {/* Gone on a phone, where the row is name, labels and figures and the thumbnail
          would take a third of the width to say what the name already does. */}
      <div className={`max-sm:hidden ${sparkline ? 'mt-[8px] h-[28px] w-[120px] wide:mt-0' : ''}`}>
        {lead}
      </div>
      {/* min-w-0 is what lets anything in this column clip: a 1fr grid track will not let
          a nowrap child shrink without it. Harmless where nothing clips — the two lists
          with no description measure the same with it as without. */}
      <div className="flex min-w-0 flex-col gap-[4px]">
        <div className={`${SERIF} text-title max-sm:text-sub`}>{title}</div>
        {meta !== undefined && (
          <div className={metaLabel ? `${LABEL} text-micro` : 'text-label text-muted font-sans'}>
            {meta}
          </div>
        )}
        {description !== undefined && (
          /* No description on a phone: it belongs to the start sheet, which has room for
             all of it — design/DESIGN.md > Screen rules, Phone lists. */
          <div className="text-label text-muted mt-[3px] font-sans leading-[1.45] line-clamp-2 max-sm:hidden wide:max-w-[560px]">
            {description}
          </div>
        )}
        {cellsOverlay === undefined && folded !== undefined && folded.length > 0 && (
          <div
            className={`${MONO} text-label mt-[6px] flex gap-[18px] max-sm:mt-[4px] max-sm:gap-[16px] wide:hidden`}
          >
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
          className="col-start-2 mt-[6px] max-sm:col-start-1 wide:col-span-3 wide:col-start-3 wide:row-start-1 wide:mt-0 wide:text-right"
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
