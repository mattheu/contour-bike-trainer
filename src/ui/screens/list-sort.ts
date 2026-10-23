import type { ListHeaderCell } from '../components/ListRow';

/**
 * Column sorting for the three list screens — design/DESIGN.md > Screen rules, Lists.
 *
 * One module because the pattern does not change between them. The desktop column
 * headers and the segmented control that replaces them below 1100 px are two renderings
 * of the same declaration, so what the two offer can never drift apart, and the
 * comparators can be held to account without a renderer.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/** What a row is worth in one column. Null where the row has no figure there at all. */
export type SortValue = string | number | null;

export interface SortColumn<K extends string, R> {
  key: K;
  /** The desktop column header. */
  label: string;
  /** The segmented control's word, where the header's is too long for a phone. */
  short?: string;
  /** Which way the first press sorts. Ascending unless stated. */
  initial?: SortDirection;
  value: (row: R) => SortValue;
}

/**
 * A grid slot, left to right. A bare string is a column that does not sort — a thumbnail,
 * or the workouts list's empty fifth — and is here so one declaration describes the whole
 * header rather than two arrays that have to be kept in step.
 */
export type SortSlot<K extends string, R> = string | SortColumn<K, R>;

export interface SortSpec<K extends string, R> {
  slots: readonly SortSlot<K, R>[];
  /** Breaks every tie, so two equal figures never swap places between renders. */
  tiebreak: (row: R) => string;
}

const ARROW: Record<SortDirection, string> = { asc: '↑', desc: '↓' };

export function sortColumns<K extends string, R>(spec: SortSpec<K, R>): SortColumn<K, R>[] {
  return spec.slots.filter((slot): slot is SortColumn<K, R> => typeof slot !== 'string');
}

function columnFor<K extends string, R>(
  spec: SortSpec<K, R>,
  key: K,
): SortColumn<K, R> | undefined {
  return sortColumns(spec).find((column) => column.key === key);
}

/**
 * Pressing a column. The one the list is already on flips rather than re-sorting — a
 * second press on the same word has nothing else it could mean — and any other starts on
 * its own first direction.
 */
export function pressSort<K extends string, R>(
  spec: SortSpec<K, R>,
  state: SortState<K>,
  key: K,
): SortState<K> {
  if (key === state.key) {
    return { key, direction: state.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: columnFor(spec, key)?.initial ?? 'asc' };
}

/** "Route ↑" on the column being sorted on, "Route" on every other. */
export function sortLabel(word: string, active: boolean, direction: SortDirection): string {
  return active ? `${word} ${ARROW[direction]}` : word;
}

export function ariaSort<K extends string>(
  state: SortState<K>,
  key: K,
): 'ascending' | 'descending' | 'none' {
  if (state.key !== key) return 'none';
  return state.direction === 'asc' ? 'ascending' : 'descending';
}

function compare(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

/**
 * The rows in order, the input untouched.
 *
 * A row with no figure in the column being sorted on — a workout whose plan will not
 * parse, a ride that recorded no power — sorts last whichever way the arrow points. It is
 * not the answer to "the most" or "the least", so it never leads the list; nor is it
 * hidden, because the thing that fixes it is finding it.
 *
 * Every tie falls through to the list's own tiebreak, so two equal figures hold the same
 * order on every render rather than depending on how they arrived.
 */
export function sortRows<K extends string, R>(
  spec: SortSpec<K, R>,
  rows: readonly R[],
  state: SortState<K>,
): R[] {
  const column = columnFor(spec, state.key);
  if (column === undefined) return [...rows];
  const sign = state.direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1;
    } else {
      const order = compare(left, right) * sign;
      if (order !== 0) return order;
    }
    return spec.tiebreak(a).localeCompare(spec.tiebreak(b));
  });
}

/** The five header slots, each already carrying its arrow and its state. */
export function listHeaders<K extends string, R>(
  spec: SortSpec<K, R>,
  state: SortState<K>,
  press: (key: K) => void,
): ListHeaderCell[] {
  return spec.slots.map((slot) => {
    if (typeof slot === 'string') return { label: slot };
    const active = slot.key === state.key;
    return {
      label: sortLabel(slot.label, active, state.direction),
      onPress: () => {
        press(slot.key);
      },
      ariaSort: ariaSort(state, slot.key),
      active,
    };
  });
}

/** The segmented control's options, in the columns' own order. */
export function sortOptions<K extends string, R>(
  spec: SortSpec<K, R>,
  state: SortState<K>,
): { value: K; label: string }[] {
  return sortColumns(spec).map((column) => ({
    value: column.key,
    label: sortLabel(column.short ?? column.label, column.key === state.key, state.direction),
  }));
}
