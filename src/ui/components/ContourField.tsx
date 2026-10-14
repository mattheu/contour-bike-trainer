/**
 * The contour texture behind a screen.
 *
 * 640x520 of contour lines in ink at 10%, radially masked so they fade out from the
 * corner they sit in. Served from public/ as a background image rather than inlined:
 * it is 65 kB of path data, it never changes, and a bundle should not carry it.
 *
 * Decorative only — aria-hidden, and behind everything.
 *
 * Fixed rather than absolute, and rendered once at the root: it is a property of the app,
 * not of a screen, and it should not move when a list scrolls. Nothing above it may paint
 * a background — the ground colour belongs on `body`, which this sits in front of. A
 * screen root with its own `bg-ground` hides it completely, which is how it was missed.
 */
export function ContourField({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed top-0 left-0 -z-10 h-[520px] w-[640px] ${className}`}
      style={{
        backgroundImage: 'url(/contour-field.svg)',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
