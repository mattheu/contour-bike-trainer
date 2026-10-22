/**
 * Where a ghost's symbol and its gap label land on a chart.
 *
 * Pure over whatever projection it is handed, so the profile and the map share one set of
 * rules: the profile supplies a route-to-pixel mapping and a rider marker, the map
 * supplies a projection and no labels at all. Every number below is read off
 * design/mockups/ride.html rather than invented.
 *
 * Placement is here and not in the renderer because collision is a decision with a right
 * answer — which of two overlapping labels survives — and a decision taken inside a paint
 * routine is one nothing can assert against.
 */

import { SYMBOL_BOX, type GhostSlot, type GhostSymbol } from '../../ghost/slots';
import type { ActiveGhost } from '../../ghost/state';
import type { Pt } from './path';

/**
 * The gap plate, and how high above the symbol it floats.
 *
 * The rise is to the plate's centre, not to its edge, which is what makes every label sit
 * on one line no matter how tall its symbol is: the stem is measured from the symbol's
 * 14 px box rather than from the glyph inside it, so a star and a square hang their
 * figures at exactly the same height. DESIGN.md > Ghosts.
 */
export const LABEL_RISE_PX = 26;
export const LABEL_PLATE_W = 44;
export const LABEL_PLATE_H = 18;
/** Ground at 85 %, so the profile line reads through the plate rather than being cut. */
export const LABEL_PLATE_OPACITY = 0.85;
export const LABEL_STEM_PX = 11;
export const LABEL_FONT_PX = 12;
/** Where a 12 px figure's baseline sits against the plate's centre line, per the mockup. */
export const LABEL_BASELINE_PX = 4;

/** How far the plate stands off the stem when it swings to one side, and the text's
 * inset from the plate's near edge. Both taken off the flipped label in the mockup. */
const LABEL_CLEAR_PX = 4;
const LABEL_PAD_PX = 2;

/**
 * When two labels are treated as one collision: the plate's own width plus a hair, and
 * its full height. Measured between symbols rather than between plates because the plates
 * are all at the same height — two symbols this close have labels that overlap whatever
 * the ground does between them.
 */
export const LABEL_GAP_X = 46;
export const LABEL_GAP_Y = 18;

/**
 * A ghost's label beats a summit's gain figure within this much. Horizontal only, and
 * deliberately one number rather than a box: the summit label rides the terrain while the
 * ghost's sits on a fixed line, so the two are near each other in the only axis that is
 * stable. The tick survives — what is dropped is the `+188 m`, not the mark it names.
 */
export const SUMMIT_CLEAR_PX = 48;

/** Within this of the rider's marker the label swings clear of the gradient bubble. */
export const RIDER_CLEAR_PX = 44;

/** A ghost that has finished waits at the route end at this weight. DESIGN.md > Ghosts. */
export const DONE_OPACITY = 0.6;

export type LabelAnchor = 'middle' | 'start' | 'end';

/** A gap figure on its stem and plate, in chart pixels. */
export interface GhostLabel {
  text: string;
  anchor: LabelAnchor;
  /** The plate's top-left corner; its size is LABEL_PLATE_W x LABEL_PLATE_H. */
  plateX: number;
  plateY: number;
  textX: number;
  /** The text's baseline. */
  textY: number;
  /** The stem runs from the top edge of the symbol's box up to here. */
  stemY: number;
  stemTopY: number;
}

export interface GhostPlacement {
  slot: GhostSlot;
  symbol: GhostSymbol;
  /** The symbol's centre: paths are drawn on a 14 x 14 box centred here. */
  x: number;
  y: number;
  opacity: number;
  /** Null where the ghost has finished, or where a nearer ghost took the space. */
  label: GhostLabel | null;
}

export interface GhostLayer {
  placements: readonly GhostPlacement[];
  /** Summit ticks whose gain label a ghost's label has taken the space of, by index into
   * the ticks the caller gave. The tick stays; only its figure goes. */
  hiddenSummits: readonly number[];
}

/** Chart pixels for a distance into the lap, or null where that is off the chart. */
export type GhostProjection = (distanceM: number) => Pt | null;

export interface GhostLayerInput {
  ghosts: readonly ActiveGhost[];
  project: GhostProjection;
  /** The rider's own marker, for the anchor flip. Null on a chart that draws none. */
  rider?: Pt | null;
  /** Summit gain labels by their x, in the order the caller draws them. */
  summits?: readonly number[];
}

const HALF_BOX = SYMBOL_BOX / 2;

function label(x: number, y: number, text: string, anchor: LabelAnchor): GhostLabel {
  const centreY = y - LABEL_RISE_PX;
  const plateY = centreY - LABEL_PLATE_H / 2;
  return {
    text,
    anchor,
    plateX:
      anchor === 'middle'
        ? x - LABEL_PLATE_W / 2
        : anchor === 'end'
          ? x - LABEL_CLEAR_PX - LABEL_PLATE_W
          : x + LABEL_CLEAR_PX,
    plateY,
    textX:
      anchor === 'middle'
        ? x
        : anchor === 'end'
          ? x - LABEL_CLEAR_PX - LABEL_PAD_PX
          : x + LABEL_CLEAR_PX + LABEL_PAD_PX,
    textY: centreY + LABEL_BASELINE_PX,
    stemY: y - HALF_BOX,
    stemTopY: y - HALF_BOX - LABEL_STEM_PX,
  };
}

/**
 * Everything a ghost layer draws, with the labels already fought over.
 *
 * Three rules, applied in this order because each reads the result of the one before:
 * overlapping labels are settled between symbols, the survivors swing clear of the rider,
 * and whatever is left takes a summit's figure out of its way.
 */
export function ghostLayer(input: GhostLayerInput): GhostLayer {
  const { ghosts, project, rider = null, summits = [] } = input;

  const placed: { placement: GhostPlacement; gapS: number }[] = [];
  for (const ghost of ghosts) {
    const at = project(ghost.distanceM);
    if (at === null) continue;
    placed.push({
      placement: {
        slot: ghost.slot,
        symbol: ghost.symbol,
        x: at.x,
        y: at.y,
        opacity: ghost.done ? DONE_OPACITY : 1,
        label:
          ghost.done || ghost.gapLabel === null
            ? null
            : label(at.x, at.y, ghost.gapLabel, 'middle'),
      },
      // A done ghost carries no gap, and holds no label to lose, so it never enters the
      // comparison below; the value here only has to sort it out of the way.
      gapS: ghost.gapS === null ? Infinity : Math.abs(ghost.gapS),
    });
  }

  // Nearest in time keeps its label and the other shows its symbol alone — the ghost you
  // are racing is the one whose figure you need, and two plates on top of each other are
  // worth neither. Ties go to the earlier slot, which is the order the key band reads.
  //
  // Judged against who held a label coming in rather than against what this loop has
  // already dropped, so three ghosts in a huddle settle the same way whatever order they
  // arrive in: a label loses to a nearer one even if that nearer one is itself losing.
  const contenders = placed.filter((entry) => entry.placement.label !== null);
  for (const a of contenders) {
    const beaten = contenders.some(
      (b) =>
        b !== a &&
        b.gapS < a.gapS &&
        Math.abs(a.placement.x - b.placement.x) < LABEL_GAP_X &&
        Math.abs(a.placement.y - b.placement.y) < LABEL_GAP_Y,
    );
    if (beaten) a.placement.label = null;
  }

  if (rider !== null) {
    for (const { placement } of placed) {
      if (placement.label === null) continue;
      const dx = placement.x - rider.x;
      const dy = placement.y - rider.y;
      if (Math.hypot(dx, dy) >= RIDER_CLEAR_PX) continue;
      // Away from the rider, so the plate leaves the gradient bubble alone. A ghost
      // exactly on the rider's x goes left, which is the mockup's case.
      placement.label = label(
        placement.x,
        placement.y,
        placement.label.text,
        dx > 0 ? 'start' : 'end',
      );
    }
  }

  const hiddenSummits: number[] = [];
  summits.forEach((summitX, index) => {
    const taken = placed.some(
      ({ placement }) =>
        placement.label !== null && Math.abs(placement.x - summitX) < SUMMIT_CLEAR_PX,
    );
    if (taken) hiddenSummits.push(index);
  });

  return { placements: placed.map((entry) => entry.placement), hiddenSummits };
}

/** A symbol on the map: no gap, no fade, and nothing for a finished ghost. */
export interface GhostMark {
  slot: GhostSlot;
  symbol: GhostSymbol;
  x: number;
  y: number;
}

/**
 * The map's ghosts. DESIGN.md > Ghosts: the map carries symbols only, and a ghost that
 * has finished leaves it — a symbol parked on the start line of a map would read as a
 * rider sitting there rather than as a race that is over.
 */
export function ghostMarks(ghosts: readonly ActiveGhost[], project: GhostProjection): GhostMark[] {
  const marks: GhostMark[] = [];
  for (const ghost of ghosts) {
    if (ghost.done) continue;
    const at = project(ghost.distanceM);
    if (at === null) continue;
    marks.push({ slot: ghost.slot, symbol: ghost.symbol, x: at.x, y: at.y });
  }
  return marks;
}
