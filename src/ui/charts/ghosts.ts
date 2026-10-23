/**
 * Where a ghost's symbol and its gap label land on a chart.
 *
 * Pure over whatever projection it is handed, so the profile and the map share one set of
 * rules: both supply a route-to-pixel mapping, and the map asks for no labels at all.
 * Every number below is read off design/mockups/ride.html rather than invented.
 *
 * Placement is here and not in the renderer because collision is a decision with a right
 * answer — which of two overlapping labels survives — and a decision taken inside a paint
 * routine is one nothing can assert against.
 */

import { SYMBOL_BOX, type GhostSlot, type GhostSymbol } from '../../ghost/slots';
import type { ActiveGhost, GhostEnd } from '../../ghost/state';
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
export const LABEL_CLEAR_PX = 4;
export const LABEL_PAD_PX = 2;

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

/** A ghost that has finished waits at the route end at this weight. DESIGN.md > Ghosts. */
export const DONE_OPACITY = 0.6;

/**
 * And a ghost whose ride stopped short fades out where it stopped, which is lighter than
 * a finished one on purpose: a ghost that won the race is still a figure on the chart,
 * and one that gave up is a mark saying how far that ride got. SPEC.md > Ghosts asks for
 * the mark rather than a dot that blinks away unexplained, so it is faded, not removed.
 */
export const STOPPED_OPACITY = 0.3;

/**
 * The sizes one chart draws a ghost layer at. Two sets, one shape: the rules below —
 * which label survives a collision, which side it swings to, what a summit loses — are
 * the same on a 944 px profile and a 390 px phone, and only the numbers differ.
 *
 * Read off design/mockups/ride.html and the three phone mockups respectively. Passed in
 * rather than switched on inside, so a third screen size is a constant and not a branch.
 */
export interface GhostMetrics {
  /** The box the symbol paths are drawn on, which every offset below is measured from. */
  symbolBox: number;
  /**
   * Where the gap sits. `above` hangs it on a stem over the symbol, the desktop charts'
   * arrangement; `beside` puts it alongside, which is the only way 11 px of figure fits
   * on a phone's profile without covering the line it is measuring.
   */
  side: 'above' | 'beside';
  plateW: number;
  plateH: number;
  fontPx: number;
  baselinePx: number;
  /** The rise to the plate's centre. Zero where the label sits beside the symbol. */
  risePx: number;
  /** The dashed stem's length. Zero beside, where there is nothing to hang from. */
  stemPx: number;
  clearPx: number;
  padPx: number;
  /** The collision box, measured between symbols. */
  gapX: number;
  gapY: number;
}

export const DESKTOP_METRICS: GhostMetrics = {
  symbolBox: SYMBOL_BOX,
  side: 'above',
  plateW: LABEL_PLATE_W,
  plateH: LABEL_PLATE_H,
  fontPx: LABEL_FONT_PX,
  baselinePx: LABEL_BASELINE_PX,
  risePx: LABEL_RISE_PX,
  stemPx: LABEL_STEM_PX,
  clearPx: LABEL_CLEAR_PX,
  padPx: LABEL_PAD_PX,
  gapX: LABEL_GAP_X,
  gapY: LABEL_GAP_Y,
};

/**
 * The phone symbol, at 0.8 of the paths' own scale — a 4 px radius on the profile line,
 * which is the square's half-width in design/mockups/phone-landscape.html. Expressed as a
 * scale rather than a second set of paths so a slot keeps one shape at every size.
 */
export const PHONE_SYMBOL_SCALE = 0.8;
export const PHONE_SYMBOL_BOX = SYMBOL_BOX * PHONE_SYMBOL_SCALE;

/**
 * The phone layer: the same figure beside the symbol instead of over it, with no stem.
 *
 * The collision box is wider and shorter than the desktop's — 60 x 16 against 46 x 18 —
 * because a label that has swung to one side reaches further sideways than one centred
 * over its symbol, and because the phone profile is half the height, so two ghosts a few
 * pixels apart vertically really are on top of each other.
 */
export const PHONE_METRICS: GhostMetrics = {
  symbolBox: PHONE_SYMBOL_BOX,
  side: 'beside',
  plateW: 38,
  plateH: 14,
  fontPx: 11,
  baselinePx: 4,
  risePx: 0,
  stemPx: 0,
  // From the symbol's centre to the plate's near edge, and from that edge to the figure.
  clearPx: 8,
  padPx: 1,
  gapX: 60,
  gapY: 16,
};

/** The weight a ghost is drawn at, per end state. Shared by the profile and the map so
 * the two cannot disagree about how far gone a ghost is. */
export const END_OPACITY: Record<GhostEnd, number> = {
  racing: 1,
  finished: DONE_OPACITY,
  stopped: STOPPED_OPACITY,
};

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
  /** Null where the ghost has ended, or where a nearer ghost took the space. */
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
  /** Summit gain labels by their x, in the order the caller draws them. */
  summits?: readonly number[];
  /** Desktop unless a phone chart says otherwise. */
  metrics?: GhostMetrics;
}

function label(
  m: GhostMetrics,
  x: number,
  y: number,
  text: string,
  anchor: LabelAnchor,
): GhostLabel {
  const halfBox = m.symbolBox / 2;
  const centreY = y - m.risePx;
  return {
    text,
    anchor,
    plateX:
      anchor === 'middle'
        ? x - m.plateW / 2
        : anchor === 'end'
          ? x - m.clearPx - m.plateW
          : x + m.clearPx,
    plateY: centreY - m.plateH / 2,
    textX:
      anchor === 'middle'
        ? x
        : anchor === 'end'
          ? x - m.clearPx - m.padPx
          : x + m.clearPx + m.padPx,
    textY: centreY + m.baselinePx,
    // Equal where there is no stem, so a renderer that draws one draws nothing rather
    // than needing to know which arrangement it is in.
    stemY: y - halfBox,
    stemTopY: y - halfBox - m.stemPx,
  };
}

/**
 * Which side of the symbol a phone's gap sits: left once you have overtaken the ghost,
 * right while it is still up the road.
 *
 * The sign already says which it is, so the figure repeats it in position — the gap you
 * have pulled out trails behind you and the one you are chasing is ahead. Level pegging
 * goes right with the ghosts still to be caught, because the one thing +0:00 is not is
 * a ghost you have beaten.
 */
function besideAnchor(gapS: number | null): LabelAnchor {
  return gapS !== null && gapS < 0 ? 'end' : 'start';
}

/**
 * Everything a ghost layer draws, with the labels already fought over.
 *
 * Two rules, in this order because the second reads the result of the first: overlapping
 * labels are settled between symbols, and whatever survives takes a summit's figure out
 * of its way.
 */
export function ghostLayer(input: GhostLayerInput): GhostLayer {
  const { ghosts, project, summits = [], metrics = DESKTOP_METRICS } = input;
  const beside = metrics.side === 'beside';

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
        opacity: END_OPACITY[ghost.end],
        label:
          ghost.gapLabel === null
            ? null
            : label(
                metrics,
                at.x,
                at.y,
                ghost.gapLabel,
                beside ? besideAnchor(ghost.gapS) : 'middle',
              ),
      },
      // An ended ghost carries no gap, and holds no label to lose, so it never enters the
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
        Math.abs(a.placement.x - b.placement.x) < metrics.gapX &&
        Math.abs(a.placement.y - b.placement.y) < metrics.gapY,
    );
    if (beaten) a.placement.label = null;
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

/** A symbol on the map: no gap, and nothing for a finished ghost. */
export interface GhostMark {
  slot: GhostSlot;
  symbol: GhostSymbol;
  x: number;
  y: number;
  opacity: number;
}

/**
 * The map's ghosts. DESIGN.md > Ghosts: the map carries symbols only, and a ghost that
 * has finished leaves it — a symbol parked on the start line of a map would read as a
 * rider sitting there rather than as a race that is over.
 *
 * A stopped ghost stays, faded. Its mark is in the middle of the route rather than on the
 * line, so it reads as what it is — how far that ride got — and taking it away would
 * leave the rider with a symbol that vanished somewhere up a climb for no stated reason.
 */
export function ghostMarks(ghosts: readonly ActiveGhost[], project: GhostProjection): GhostMark[] {
  const marks: GhostMark[] = [];
  for (const ghost of ghosts) {
    if (ghost.end === 'finished') continue;
    const at = project(ghost.distanceM);
    if (at === null) continue;
    marks.push({
      slot: ghost.slot,
      symbol: ghost.symbol,
      x: at.x,
      y: at.y,
      opacity: END_OPACITY[ghost.end],
    });
  }
  return marks;
}
