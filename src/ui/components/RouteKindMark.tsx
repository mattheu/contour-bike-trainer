import type { RouteKind } from '../../route/loop';

/**
 * The route kind drawn rather than written: a closed ring for a loop, an open line with a
 * start dot and an end tick for point to point. design/mockups/routes.html, at the 14 px
 * the Routes rule in design/DESIGN.md gives it.
 *
 * Both kinds get a mark, which is the point of drawing them at all. A mark on loops alone
 * is a badge, and a badge says "this one is special" about a fact that is simply true of
 * half the list; two marks say the same thing about both — here is the shape of this ride.
 *
 * Nothing here is filled or boxed, unlike the LoopTag it replaced on this row. DESIGN.md's
 * Routes rule says no filled chips, and a label row is a line of type, not a slot for
 * something stamped into it. currentColor throughout, so the glyph is muted with the words
 * beside it and never has a tone of its own to keep in step.
 */
export function RouteKindMark({ kind }: { kind: RouteKind }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className="shrink-0"
      aria-hidden="true"
    >
      {kind === 'loop' ? (
        <circle cx="7" cy="7" r="5" />
      ) : (
        <>
          <path d="M2,11 C5,3 9,12 12,4" />
          <circle cx="2" cy="11" r="1.5" fill="currentColor" stroke="none" />
          <path d="M10.5,2.5 L13.5,5.5" />
        </>
      )}
    </svg>
  );
}
