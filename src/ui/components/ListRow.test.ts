import { describe, expect, it } from 'vitest';
import {
  RIDES_ACTIONS,
  RIDES_ARMED_INSET,
  RIDES_COLUMNS,
  ROUTES_ACTIONS,
  ROUTES_ARMED_INSET,
  ROUTES_COLUMNS,
  actionsGutter,
  armedOverflow,
} from './ListRow';

/**
 * The gutters are cut for a resting row, so an armed one's confirm pair hangs back over
 * the figures. That is the deal; what it must never do is reach past them into the name,
 * because then the row no longer says which thing is about to go. These hold that line
 * against the one thing that would break it — somebody adding a control without
 * remeasuring.
 */

/** The grid's gap between columns, which an overflow crosses on its way back. */
const GAP = 32;

/** The three number columns, their gaps included: how far back an overlay can give. */
function figuresWidth(columns: readonly string[]): number {
  return columns.slice(2).reduce((total, width) => total + Number.parseInt(width, 10), 0) + GAP * 2;
}

describe('actionsGutter', () => {
  it('adds the gap to the measured group', () => {
    expect(actionsGutter(142)).toBe(166);
  });

  it('rounds a fractional measurement up, never down into a clip', () => {
    expect(actionsGutter(94.4)).toBe(119);
  });
});

describe('armedOverflow', () => {
  it('is zero where the resting group is the wider of the two', () => {
    expect(armedOverflow(actionsGutter(253), 177)).toBe(0);
  });

  it('is what the armed group reaches past the resting one', () => {
    expect(armedOverflow(actionsGutter(95), 183)).toBe(88);
  });
});

describe('the armed pair against the figures it covers', () => {
  it.each([
    ['routes', ROUTES_ARMED_INSET, ROUTES_COLUMNS],
    ['rides', RIDES_ARMED_INSET, RIDES_COLUMNS],
  ])('stays inside %s number columns', (_name, inset, columns) => {
    expect(inset).toBeLessThan(figuresWidth(columns));
  });

  it('gives each list a narrower gutter than the 280 px all three once shared', () => {
    expect(ROUTES_ACTIONS).toBeLessThan(280);
    expect(RIDES_ACTIONS).toBeLessThan(280);
  });
});
