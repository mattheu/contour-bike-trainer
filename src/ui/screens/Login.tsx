import { Button } from '../components/Button';
import { CONTROL_SIZE } from '../components/control';
import { COLOUR_SHIFT } from '../components/motion';
import { LABEL, MONO } from '../components/styles';
import { Lockup } from '../components/Wordmark';
import { formatHash } from '../routing';

/**
 * design/mockups/login.html, with one control and no fields.
 *
 * The mockup draws username and password. They are deliberately not built: there is no
 * server to authenticate against until phase 5, and a password field that accepts
 * anything is not a mirror of signing in — it is the opposite of one. The column below
 * keeps the width and the position the fields will take, so they drop in rather than
 * rearrange the screen.
 *
 * Start is the screen's one accent control, which it earns under DESIGN.md: an action
 * that begins something. The link under it is a borderless button — a control's height
 * and padding, so it is as easy to hit as Start, but no box: a box is the signal that
 * something is pressable, and this is a way out of the screen rather than a way through
 * it. The two sit flush for that reason as well; a gap would read as two boxes with a
 * border missing.
 */
export function Login({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-ink relative flex h-screen flex-col items-center justify-center gap-[40px] overflow-hidden px-[24px] sm:gap-[56px] sm:px-[56px]">
      {/* The column takes the lockup's own width rather than a number of its own, so the
          control lines up with the mark above it and keeps doing so if the type scale
          moves. On a phone both go full width, where there is nothing to line up with. */}
      <div className="flex w-full max-w-[360px] flex-col items-stretch sm:w-auto sm:max-w-none">
        <Lockup />

        {/* Stretched by the column, so the control is as wide as the fields will be. */}
        <div className="mt-[40px] flex flex-col sm:mt-[56px]">
          <Button tone="accent" onClick={onStart}>
            Start
          </Button>
          <a
            href={formatHash({ name: 'how-it-works' })}
            className={`${LABEL} ${CONTROL_SIZE} text-caption hover:text-ink ${COLOUR_SHIFT} flex items-center justify-center px-[20px] no-underline`}
          >
            How it works
          </a>
        </div>
      </div>

      <div className={`${MONO} text-micro text-muted absolute bottom-[20px] sm:bottom-[28px]`}>
        Contour 0.1 · trainer connects after sign in
      </div>
    </div>
  );
}
