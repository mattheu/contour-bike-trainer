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

export type LogoVariant = 'primary' | 'inverted';

/**
 * The boxed lockup used in a header: 111x48, the control height, so it lines up with
 * everything beside it.
 */
export function Logo({
  variant = 'primary',
  className = '',
}: {
  variant?: LogoVariant;
  className?: string;
}) {
  const box =
    variant === 'primary'
      ? 'bg-accent text-ground'
      : 'bg-ground text-accent border border-hairline';

  return (
    <div
      className={`flex h-[48px] w-[111px] items-center justify-center overflow-hidden ${box} ${className}`}
    >
      {/* The mark sits a touch high in its box without this: the serif's baseline, not a nudge. */}
      <span className="pb-[2px] text-[32px] leading-none">
        <Wordmark />
      </span>
    </div>
  );
}
