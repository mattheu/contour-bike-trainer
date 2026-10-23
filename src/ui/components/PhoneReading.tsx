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
