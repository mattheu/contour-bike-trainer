import { COLOUR_SHIFT } from './motion';
import { LABEL, MONO } from './styles';

/**
 * The three readings a phone draws, at the three sizes design/DESIGN.md gives them:
 * 44 px for a primary, 32 for speed and gradient, 16 for the clocks. Numbers read off
 * design/mockups/phone-portrait-profile.html.
 *
 * Separate from Hero and Stat rather than sizes of them. A phone's primary puts its
 * meaning on a line below the figure and keeps the slot when there is nothing to say, so
 * three columns share a baseline; Hero puts it inline and right-aligned. Two different
 * arrangements of the same reading, and a prop that switched between them would make
 * both harder to read than either.
 */

type Tone = 'ink' | 'muted' | 'accent';

const TONES: Record<Tone, string> = {
  ink: 'text-ink',
  muted: 'text-muted',
  accent: 'text-accent',
};

/** The hairline between columns, which every reading but the first in a row carries. */
function divider(divided: boolean, pad: string): string {
  return divided ? `border-hairline border-l ${pad}` : '';
}

/** The tracked caps above every phone reading: micro, and a touch tighter on a primary. */
function Label({ children, tight = false }: { children: string; tight?: boolean }) {
  return (
    <div className={`${LABEL} text-micro ${tight ? 'tracking-[0.12em]' : ''}`}>{children}</div>
  );
}

interface PrimaryProps {
  label: string;
  value: string;
  unit?: string;
  /** The meaning, drawn beneath: "108" of "108 % FTP", or "Z4". */
  figure?: string;
  figureUnit?: string;
  tone?: 'ink' | 'muted';
  divided?: boolean;
  testId?: string;
}

/** Power, cadence or heart rate at 44 px, with the readout on its own line beneath. */
export function PhonePrimary({
  label,
  value,
  unit,
  figure,
  figureUnit,
  tone = 'ink',
  divided = false,
  testId,
}: PrimaryProps) {
  const readout = [figure, figureUnit].filter((part) => part !== undefined).join(' ');
  return (
    <div
      data-testid={testId}
      className={`flex flex-col gap-[6px] ${divider(divided, 'pl-[14px]')}`}
    >
      <Label tight>{label}</Label>
      <div className="flex items-baseline gap-[5px]">
        <div
          className={`${MONO} text-figure leading-[0.95] tracking-[-0.03em] ${TONES[tone]} ${COLOUR_SHIFT}`}
        >
          {value}
        </div>
        {unit !== undefined && <div className={`${MONO} text-micro text-muted`}>{unit}</div>}
      </div>
      {/* The slot is kept whether or not there is a readout: cadence has no zone to name,
          and a column that closed up would pull the row's three figures off one line. */}
      <div className={`${MONO} text-caption text-muted h-[13px] leading-[13px]`}>{readout}</div>
    </div>
  );
}

interface FigureProps {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  divided?: boolean;
  testId?: string;
}

/**
 * Speed or gradient at 32 px, unit inline. design/DESIGN.md gives the gradient the
 * accent on a phone: it is the one thing on the screen the rider is about to feel.
 */
export function PhoneFigure({
  label,
  value,
  unit,
  tone = 'ink',
  divided = false,
  testId,
}: FigureProps) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col gap-[4px] ${divider(divided, 'pl-[16px]')}`}
    >
      <Label>{label}</Label>
      <div
        className={`${MONO} text-stat leading-none tracking-[-0.02em] ${TONES[tone]} ${COLOUR_SHIFT}`}
      >
        {value}
        {unit !== undefined && (
          <span className="text-caption text-muted tracking-normal"> {unit}</span>
        )}
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  /** The "/ 38.2" half of a distance or climbed reading. */
  total?: string;
  unit?: string;
  tone?: 'ink' | 'muted';
  divided?: boolean;
  testId?: string;
}

/** Elapsed, distance or climbed at 16 px, with the total and unit at 11. */
export function PhoneStat({
  label,
  value,
  total,
  unit,
  tone = 'ink',
  divided = false,
  testId,
}: StatProps) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col gap-[2px] ${divider(divided, 'pl-[16px]')}`}
    >
      <Label>{label}</Label>
      <div className={`${MONO} text-body ${TONES[tone]} ${COLOUR_SHIFT}`}>
        {value}
        <span className="text-muted text-micro">
          {total !== undefined && ` / ${total}`}
          {unit !== undefined && ` ${unit}`}
        </span>
      </div>
    </div>
  );
}

/**
 * The same three readings as a phone draws them on its side, after
 * design/mockups/phone-landscape.html. The sizes are unchanged — 44 px for a primary,
 * 11 px for a clock — and what moves is where the second number sits: landscape has
 * height to protect and width to spare, so the readout goes beside the figure rather
 * than under it, and a label sits in front of its value rather than above it.
 */

/** Power, cadence or heart rate at 44 px, readout inline after the unit: "287 W 108 % FTP". */
export function PhoneInlinePrimary({
  label,
  value,
  unit,
  figure,
  figureUnit,
  tone = 'ink',
  divided = false,
  testId,
}: PrimaryProps) {
  const readout = [figure, figureUnit].filter((part) => part !== undefined).join(' ');
  return (
    <div
      data-testid={testId}
      className={`flex flex-col gap-[6px] ${divider(divided, 'pl-[14px]')}`}
    >
      <Label tight>{label}</Label>
      <div className="flex items-baseline gap-[5px] whitespace-nowrap">
        <div
          className={`${MONO} text-figure leading-[0.95] tracking-[-0.03em] ${TONES[tone]} ${COLOUR_SHIFT}`}
        >
          {value}
        </div>
        {unit !== undefined && <div className={`${MONO} text-micro text-muted`}>{unit}</div>}
        {readout !== '' && (
          <div className={`${MONO} text-micro text-muted ml-[8px]`}>{readout}</div>
        )}
      </div>
    </div>
  );
}

interface RowReadingProps {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  testId?: string;
}

/** Speed or gradient as one row of the fourth slot: label left, 20 px figure right. */
export function PhoneRowReading({ label, value, unit, tone = 'ink', testId }: RowReadingProps) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-[10px] whitespace-nowrap"
    >
      <Label>{label}</Label>
      <div className={`${MONO} text-sub leading-none ${TONES[tone]} ${COLOUR_SHIFT}`}>
        {value}
        {unit !== undefined && <span className="text-micro text-muted font-normal"> {unit}</span>}
      </div>
    </div>
  );
}

/** Elapsed, distance or climbed as an 11 px pair on one line, label in front of value. */
export function PhoneInlineStat({
  label,
  value,
  total,
  unit,
  tone = 'ink',
  divided = false,
  testId,
}: StatProps) {
  return (
    <div
      data-testid={testId}
      className={`flex items-baseline gap-[8px] whitespace-nowrap ${divider(divided, 'pl-[14px]')}`}
    >
      <Label>{label}</Label>
      <div className={`${MONO} text-micro ${TONES[tone]} ${COLOUR_SHIFT}`}>
        {value}
        <span className="text-muted">
          {total !== undefined && ` / ${total}`}
          {unit !== undefined && ` ${unit}`}
        </span>
      </div>
    </div>
  );
}

/**
 * The interval, which a phone riding a workout draws where a ride draws its clocks.
 *
 * Two shapes rather than one with a prop, for the reason the primaries above give: the
 * portrait band is a row of the page with the next step opposite it, the landscape one is
 * the fourth slot of a row of four. What they genuinely share is the track underneath,
 * and that is the part that is a component.
 */

interface IntervalProps {
  label: string;
  /** The step counting down. */
  value: string;
  /** What it is counting down from. */
  total: string;
  /** How much of the step is behind the rider, 0 through 1. */
  progress: number;
  /** design/DESIGN.md: accent through a step's last ten seconds — see intervalTone. */
  tone?: 'ink' | 'accent';
  testId?: string;
}

/**
 * The 3 px progress track: accent over hairline, the width of whatever it sits under.
 *
 * aria-hidden, because the countdown above it already says the same thing in words — and
 * says it better, since "six minutes left" is what a rider acts on and a third of a bar
 * is not. No transition either: it steps once a second with the clock, and easing a
 * figure that is already counting is the smear design/DESIGN.md keeps off live readings.
 */
function ProgressTrack({ progress }: { progress: number }) {
  return (
    <div aria-hidden="true" className="bg-hairline relative h-[3px] w-full">
      <div
        className="bg-accent absolute top-0 left-0 h-[3px]"
        style={{ width: `${(progress * 100).toFixed(2)}%` }}
      />
    </div>
  );
}

/**
 * The portrait band: the countdown at 32 px with its total inline, the next step opposite,
 * and the track across the full width beneath both.
 */
export function PhoneIntervalBand({
  label,
  value,
  total,
  progress,
  next,
  tone = 'ink',
  testId,
}: IntervalProps & { next: string }) {
  return (
    <div data-testid={testId}>
      <div className="flex items-end justify-between gap-[12px]">
        <div className="flex shrink-0 flex-col gap-[6px]">
          <Label>{label}</Label>
          <div
            className={`${MONO} text-stat leading-none tracking-[-0.02em] ${TONES[tone]} ${COLOUR_SHIFT}`}
          >
            {value}
            <span className="text-caption text-muted tracking-normal"> / {total}</span>
          </div>
        </div>
        {/* truncate, because a step's name is whatever its author wrote: without it a long
            one wraps the band and the chart below loses the height to it. */}
        <div className={`${MONO} text-micro text-muted min-w-0 truncate pb-[4px]`}>{next}</div>
      </div>
      <div className="mt-[12px]">
        <ProgressTrack progress={progress} />
      </div>
    </div>
  );
}

/** The landscape slot: a 44 px countdown beside its total, over the same track. */
export function PhoneIntervalPrimary({
  label,
  value,
  total,
  progress,
  tone = 'ink',
  divided = false,
  testId,
}: IntervalProps & { divided?: boolean }) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col gap-[6px] ${divider(divided, 'pl-[14px]')}`}
    >
      <Label tight>{label}</Label>
      <div className="flex items-baseline gap-[5px] whitespace-nowrap">
        <div
          className={`${MONO} text-figure leading-[0.95] tracking-[-0.03em] ${TONES[tone]} ${COLOUR_SHIFT}`}
        >
          {value}
        </div>
        <div className={`${MONO} text-micro text-muted`}>/ {total}</div>
      </div>
      <ProgressTrack progress={progress} />
    </div>
  );
}
