import { Button } from '../components/Button';
import { MONO } from '../components/styles';
import { Lockup } from '../components/Wordmark';

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
 * that begins something.
 */
export function Login({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-ink relative flex h-screen flex-col items-center justify-center gap-[40px] overflow-hidden px-[24px] sm:gap-[56px] sm:px-[56px]">
      <Lockup />

      {/* Stretched by the column, so the control is as wide as the fields will be. */}
      <div className="flex w-full max-w-[360px] flex-col">
        <Button tone="accent" onClick={onStart}>
          Start
        </Button>
      </div>

      <div className={`${MONO} text-micro text-muted absolute bottom-[20px] sm:bottom-[28px]`}>
        Contour 0.1 · trainer connects after sign in
      </div>
    </div>
  );
}
