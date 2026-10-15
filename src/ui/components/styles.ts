/**
 * The three type treatments from design/DESIGN.md, shared so a size or tracking change
 * happens once. Sizes stay at the call site: they vary per component.
 */

/** Every number. Tabular figures so a live readout does not jitter as digits change. */
export const MONO = 'font-mono font-light tabular-nums';

/** Tracked caps label, 14 px unless a component steps it down to 12 or 11. */
export const LABEL = 'font-sans text-label tracking-[0.14em] uppercase text-muted';

/** Wordmark and route or workout names only. */
export const SERIF = 'font-serif italic font-normal tracking-[-0.01em]';
