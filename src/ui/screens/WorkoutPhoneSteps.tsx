import { useEffect, useRef } from 'react';
import { MONO } from '../components/styles';
import { currentRowNumber, ruleColour, washColour, type StepRow } from './workout-view';

/**
 * The plan as a list, for the phone arrangements that show it in place of the plan chart,
 * after design/mockups/phone-portrait-workout-steps.html and the landscape beside it.
 *
 * The desktop panel's row, re-proportioned to those two: the same four cells in the same
 * order, the same per-zone wash, the same three states. What the phone changes is the
 * spacing, the name — which clips rather than wraps, because at 390 px a step called
 * whatever its author wrote would otherwise take the row's other three cells with it —
 * and how loud a step still to come is. See ROW_TONE.
 *
 * What it drops is everything that answers a pointer. There is no hover on a phone, so no
 * hover tone and no hover handlers; the chart it swaps with is not on screen beside it, so
 * there is no block for a row to point at either. The step-change flash goes with them —
 * the list is only up because the rider asked for it, and the interval band above the
 * view has already announced the change on whichever of the two they were looking at.
 *
 * Shared by both phone arrangements rather than written into each, for the same reason
 * use-view-swipe is: portrait and landscape differ by a row's padding and nothing else.
 */
export function WorkoutPhoneSteps({
  rows,
  dense = false,
}: {
  rows: readonly StepRow[];
  /** Landscape, where 390 px of height holds the list and the readings above it. */
  dense?: boolean;
}) {
  const current = currentRowNumber(rows);
  const currentRow = useRef<HTMLDivElement>(null);

  // The desktop panel's scroll, keyed and centred for the reasons given there: a step is
  // minutes long, so the list moves once when the plan advances and then sits still.
  //
  // `instant`, and the container carries no scroll-behavior to be smooth with. The screen
  // re-renders every second for its clocks, and a smooth scroll does not survive it: the
  // animation is cancelled by the next tick long before it arrives, so the row the rider
  // is riding simply stays off screen. Measured on a 24-step session at 390 x 844, where
  // six consecutive skips moved the list by nothing at all. A cut that lands beats a
  // slide that is interrupted — and at one move per step there is no travel to smooth.
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [current]);

  return (
    /* overscroll-contain so a flick that runs off the end of the list stops there rather
       than carrying on into the page behind it, which on a phone is the whole screen.
       overflow-x-hidden says the axis out loud: overflow-y alone leaves x at auto, which
       on a row that clips its own name draws a scrollbar along the foot of the list for
       an overflow nothing can reach. */
    <div
      className="min-h-0 grow overflow-x-hidden overflow-y-auto overscroll-contain"
      data-testid="workout-phone-steps"
    >
      {rows.map((row) => (
        <PhoneStep
          key={row.number}
          row={row}
          dense={dense}
          ref={row.number === current ? currentRow : undefined}
        />
      ))}
      {/* The rule under the last row, which no row owns: every rule here is a top border,
          so without it the list ends on a wash that simply stops. Inside the scroller, so
          it travels with the final step rather than sitting across the bottom edge. */}
      <div className="border-hairline border-t" />
    </div>
  );
}

/**
 * design/DESIGN.md > Screen rules, as the two steps mockups draw them for a phone.
 *
 * Two of the three states are the desktop panel's exactly: a finished step is muted and
 * the whole row drops to 45 %, and the current step is solid ink with ground text and an
 * accent left edge, which is the only accent in the list.
 *
 * A step still to come is not. The desktop mutes all four of its cells; here the name and
 * the target come up to ink and only the number and the duration stay muted. That is the
 * mockups' call and it is the right one for the view: on a desktop the plan ahead is read
 * beside the chart, which is carrying the shape of the session, so the list can afford to
 * recede. Here the list *is* the view — the rider switched to it to read what is coming —
 * and the two cells that say what is coming are the name and the target.
 *
 * No border-hairline on the quiet frame: its rule is translucent and set in the style, so
 * it stacks over whatever wash the row is carrying.
 */
const AHEAD = {
  frame: 'border-t pl-[12px]',
  number: 'text-muted',
  name: 'text-ink',
  target: 'text-ink',
  duration: 'text-muted',
};

const ROW_TONE: Record<StepRow['state'], typeof AHEAD> = {
  done: {
    ...AHEAD,
    frame: `${AHEAD.frame} opacity-45`,
    name: 'text-muted',
    target: 'text-muted',
  },
  // The 2 px accent edge comes out of the inset, so the number stays on the same upright
  // as every other row's and the list has one left margin rather than two.
  current: {
    frame: 'border-hairline border-l-accent bg-ink border-t border-l-2 pl-[10px]',
    number: 'text-ground',
    name: 'text-ground font-medium',
    target: 'text-ground',
    duration: 'text-ground font-medium',
  },
  ahead: AHEAD,
};

/** Written out rather than interpolated: Tailwind reads these class names as source. */
const BOX = {
  roomy: 'py-[8px] pr-[10px]',
  dense: 'py-[6px] pr-[8px]',
};

function PhoneStep({
  row,
  dense,
  ref,
}: {
  row: StepRow;
  dense: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const tone = ROW_TONE[row.state];
  return (
    <div
      ref={ref}
      className={`flex items-baseline gap-[10px] ${dense ? BOX.dense : BOX.roomy} ${tone.frame}`}
      /* The wash and the rule are the desktop panel's, not the mockups' flat hairline: a
         rule has two sides, and one fixed at the hairline's own value reads crisp against
         an unwashed row and blurred against a brighter one. See ruleColour. */
      style={
        row.state === 'current'
          ? undefined
          : { backgroundColor: washColour(row.wash), borderTopColor: ruleColour(row.rule) }
      }
      aria-current={row.state === 'current' ? 'step' : undefined}
    >
      <div className={`${MONO} text-micro w-[14px] ${tone.number}`}>{row.number}</div>
      <div className={`text-label grow truncate font-sans ${tone.name}`}>{row.name}</div>
      <div className={`${MONO} text-caption ${tone.target}`}>{row.target}</div>
      <div className={`${MONO} text-caption w-[40px] text-right ${tone.duration}`}>
        {row.duration}
      </div>
    </div>
  );
}
