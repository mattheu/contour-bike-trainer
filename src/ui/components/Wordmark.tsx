/**
 * The Contour wordmark and its two box treatments.
 *
 * design/mockups/Logo.dc.html is the source. The lettering is Instrument Serif italic,
 * optically spaced per pair, with a drawn arc joining the C to the first o — a contour
 * line crossing the word, which is the mark itself rather than decoration.
 *
 * Two treatments only, per the logo guide: primary (accent box, ground mark) and
 * inverted (ground box, hairline border, accent mark).
 */

const LETTERS = [
  { char: 'C', kern: '' },
  { char: 'o', kern: 'k-o1' },
  { char: 'n', kern: 'k-n' },
  { char: 't', kern: 'k-t' },
  { char: 'o', kern: 'k-o2' },
  { char: 'u', kern: 'k-u' },
  { char: 'r', kern: 'k-r' },
] as const;

/** The lettering alone. Takes its colour and size from whatever contains it. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    // One label on the whole mark: the letters are spans so they can be kerned, and a
    // screen reader should hear "Contour", not seven letters.
    <span className={`wordmark ${className}`} role="img" aria-label="Contour">
      {LETTERS.map((letter, i) => (
        <span key={`${letter.char}${String(i)}`} className={letter.kern} aria-hidden="true">
          {letter.char}
        </span>
      ))}
    </span>
  );
}

/**
 * The same primary lockup at hero size, for the login screen and nothing else.
 *
 * The box hugs the mark rather than measuring it: 0.28 em at the sides and 0.12 em top
 * and bottom, per the logo guide, so one size token moves the whole lockup. 72 px on
 * phones, 108 on desktop.
 *
 * The rings are the contour field masked to ground: the only contour artwork in the
 * build is drawn in ink, and using it as a mask is what lets the rings take a colour
 * from the theme instead of a second 65 kB file with the colour baked in.
 */
export function Lockup() {
  return (
    <div className="bg-accent text-ground text-hero-tablet sm:text-hero relative overflow-hidden px-[0.28em] py-[0.12em]">
      <div
        aria-hidden="true"
        className="bg-ground absolute inset-0 opacity-[0.16] [mask-image:url(/contour-field.svg)] [mask-position:-80px_-60px] [mask-repeat:no-repeat]"
      />
      {/* The mark sits a touch high in its box without this: the serif's baseline. */}
      <span className="relative block pb-[0.06em] leading-none">
        <Wordmark />
      </span>
    </div>
  );
}

export type LogoVariant = 'primary' | 'inverted';

/** The logo guide: a header lockup is the control height, mark 32 px; 44 and 24 on a phone. */
export type LogoSize = 48 | 44 | 'header';

const BOXES: Record<LogoSize, string> = {
  48: 'h-[48px] w-[111px] text-[32px]',
  44: 'h-[44px] w-[83px] text-[24px]',
  // Sized in CSS, so a shared header follows the viewport without being told.
  header: 'logo-header',
};

/**
 * The boxed lockup used in a header: 111x48, the control height, so it lines up with
 * everything beside it. A phone's header is 44 tall, so its lockup is too.
 */
export function Logo({
  variant = 'primary',
  size = 48,
  className = '',
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
}) {
  const box =
    variant === 'primary'
      ? 'bg-accent text-ground'
      : 'bg-ground text-accent border border-hairline';

  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${BOXES[size]} ${box} ${className}`}
    >
      {/* The mark sits a touch high in its box without this: the serif's baseline, not a nudge. */}
      <span className="pb-[2px] leading-none">
        <Wordmark />
      </span>
    </div>
  );
}
