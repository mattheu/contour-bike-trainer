/**
 * The loop mark: `Loop` on a route that comes back to where it started, and `Lap 2` once
 * a lap of one is complete. One slot per screen — the ride header, a routes row, the
 * summary header — and one geometry check behind all of them (src/route/loop.ts).
 *
 * Inverted rather than set in prose: a solid muted box with the label dropping to ground.
 * design/DESIGN.md forbids *rounded* chips and gives square corners everywhere, and its
 * Controls table already defines this exact pairing — "fill and border solid ink, label
 * ground" — for a button under the cursor. This is that pairing held still, one step down
 * the palette to muted so it reads as a mark on the line rather than as the one thing on
 * the screen about to act.
 *
 * Nothing here may look pressable, which is the rule that set every other choice:
 * DESIGN.md says anything with a 1 px box is pressable and nothing else has one, so this
 * has no box, no border and no hover. It is 11 px against the 14 px beside it, and 6 px
 * of padding against a control's 48 px height — small and firm, closer to a stamp than to
 * a button.
 */
export function LoopTag({ label }: { label: string }) {
  return (
    // pr is a notch under pl on purpose: 0.14em of tracking hangs off the last letter,
    // and matched padding would leave the word visibly left of centre in the box.
    <span className="bg-muted text-ground text-micro py-[2px] pr-[4px] pl-[6px] font-sans tracking-[0.14em] uppercase">
      {label}
    </span>
  );
}
