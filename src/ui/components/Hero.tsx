import type { ReactNode } from 'react';
import { LABEL, MONO } from './styles';

/** 108 desktop, 72 tablet, 44 phone. Nothing in between. */
export type HeroSize = 108 | 72 | 44;

/**
 * A target beside a hero is two steps down the scale and its unit two steps below that
 * (design/DESIGN.md Type). The unit beside the value sits at the target's unit size.
 *
 * The meaning figure — "108 % FTP", "Z4" — is a step below that again: at two steps it
 * did not fit on a smaller screen. A deliberate departure from the Type rule, asked for
 * after riding the real thing.
 */
const SIZES: Record<
  HeroSize,
  { value: string; target: string; figure: string; unit: string; figureUnit: string }
> = {
  108: {
    value: 'text-hero',
    target: 'text-figure',
    figure: 'text-stat',
    unit: 'text-sub',
    figureUnit: 'text-sub',
  },
  // The one size where the two units part company: design/DESIGN.md gives the tablet
  // "72, figure 24, units 12", and 12 beside a 72 px value would be a hairline.
  72: {
    value: 'text-hero-tablet',
    target: 'text-stat',
    figure: 'text-title',
    unit: 'text-body',
    figureUnit: 'text-caption',
  },
  44: {
    value: 'text-figure',
    target: 'text-sub',
    figure: 'text-body',
    unit: 'text-caption',
    figureUnit: 'text-caption',
  },
};

interface HeroProps {
  label: string;
  /** Already formatted — the hero renders, it does not convert. */
  value: string;
  unit?: string;
  /**
   * The figure slot, in its target form: drawn before the unit behind a hairline slash,
   * as in "246 / 239 W".
   */
  target?: string;
  /**
   * The figure slot, in its meaning form: drawn after the unit, as in "108 % FTP" or "Z4".
   */
  figure?: ReactNode;
  /** The meaning figure's own unit. Shares the size of the unit beside the value. */
  figureUnit?: string;
  /**
   * design/DESIGN.md > Palette: a stale reading drops to muted as well as showing a
   * dash, so the fault is visible in the data and not only in the alert strip.
   */
  tone?: 'ink' | 'muted';
  size?: HeroSize;
  /**
   * A line opposite the label saying what is being asked for — "target 90 % FTP",
   * "target 85–95 rpm". The workout screen's heroes carry one; a free ride's do not.
   */
  note?: string;
  /**
   * The colour classes the target and its note are on, for a caller that flashes them when
   * what is being asked for changes — design/mockups/animation-guide.html runs its `flash`
   * on both, and design/DESIGN.md > Motion calls it the first beat of an interval change.
   * See pulseTone, whose resting value is the muted written here.
   *
   * Passed in rather than decided here: the hero renders, and only the screen above it
   * knows what counts as a change worth marking. A hero given nothing never flashes.
   */
  pulse?: string;
  /** A handle for the integration tests. A Tailwind class is not a contract. */
  testId?: string;
}

export function Hero({
  label,
  value,
  unit,
  target,
  figure,
  figureUnit,
  note,
  pulse = 'text-muted',
  tone = 'ink',
  size = 108,
  testId,
}: HeroProps) {
  const s = SIZES[size];

  return (
    <div data-testid={testId} className="flex flex-col gap-[10px]">
      <div className="flex items-baseline justify-between gap-[12px]">
        <div className={LABEL}>{label}</div>
        {note !== undefined && (
          <div className={`${MONO} text-caption whitespace-nowrap ${pulse}`}>{note}</div>
        )}
      </div>
      <div className="flex items-baseline gap-[12px] whitespace-nowrap">
        <div
          className={`${MONO} ${s.value} ${
            tone === 'muted' ? 'text-muted' : 'text-ink'
          } leading-[0.95] tracking-[-0.03em]`}
        >
          {value}
        </div>
        {/* The slash keeps its hairline through the flash: it is punctuation between two
            figures, not one of them, and lighting it would widen the mark the eye is
            meant to land on. design/mockups/animation-guide.html draws it the same way. */}
        {target !== undefined && (
          <div className={`${MONO} ${s.target} tracking-[-0.02em] ${pulse}`}>
            <span className="text-hairline mx-[6px]">/</span>
            {target}
          </div>
        )}
        {unit !== undefined && <div className={`${MONO} ${s.unit} text-muted`}>{unit}</div>}
        {/* Pinned to the right of the column: tabular figures hold the digits still, but
            only an anchored right edge holds the block still as "98" becomes "108". */}
        {figure !== undefined && (
          <div className={`${MONO} ${s.figure} ml-auto text-right text-muted tracking-[-0.02em]`}>
            {figure}
            {figureUnit !== undefined && (
              <span className={`${s.figureUnit} ml-[6px]`}>{figureUnit}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
