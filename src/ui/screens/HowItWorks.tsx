import { AppHeader } from '../components/AppHeader';
import { CONTROL_SIZE, LINK_TONE } from '../components/control';
import { LABEL, MONO, SERIF } from '../components/styles';
import { formatHash } from '../routing';
import { COLUMNS, PLATFORM_NOTE, type Column, type ColumnVisual } from './how-it-works';
import { ConnectPreview, PreviewFrame, RidePreview } from './ScreenPreview';

/**
 * design/mockups/tour.html and phone-tour.html.
 *
 * The one screen a rider can reach without signing in, and the one screen that scrolls —
 * on a phone, where three columns become three stacked sections and no useful amount of
 * them fits a viewport at once. DESIGN.md > Screen rules names both exceptions.
 *
 * Both of its exits are the login screen, so neither is a navigation this screen has to
 * own: they are anchors to `#/login`, which the signed-out gate in App.tsx reads back.
 */

export function HowItWorks() {
  const login = formatHash({ name: 'login' });

  return (
    <div className="text-ink flex min-h-screen flex-col gap-[24px] px-[24px] py-[20px] sm:h-screen sm:gap-[32px] sm:overflow-hidden sm:px-[64px] sm:py-[44px]">
      <AppHeader
        // The screen's name, so it is a heading rather than a caption on the logo. 11 px
        // on a phone, where the logo beside it leaves the label a third of the row.
        nav={<h1 className={`${LABEL} text-micro sm:text-label`}>How it works</h1>}
        action={<ControlLink href={login}>Back</ControlLink>}
      />

      {/* Three equal columns on desktop; on a phone they stack, each carrying the
          hairline that separates it from the one above. */}
      <div className="flex grow flex-col sm:grid sm:grid-cols-3 sm:gap-[40px] sm:pt-[8px]">
        {COLUMNS.map((column) => (
          <ColumnBlock key={column.number} column={column} />
        ))}
      </div>

      <div className="border-hairline flex items-center justify-between gap-[24px] border-t pt-[20px] sm:pt-[24px]">
        <div className="text-muted text-caption sm:text-label max-w-[220px] font-sans sm:max-w-none">
          {PLATFORM_NOTE}
        </div>
        {/* The one accent element on the screen: the action it exists to lead to. */}
        <ControlLink href={login} tone="accent">
          Start
        </ControlLink>
      </div>
    </div>
  );
}

function ColumnBlock({ column }: { column: Column }) {
  return (
    <div className="border-hairline flex flex-col gap-[18px] border-t py-[24px] sm:gap-[20px] sm:border-t-0 sm:py-0">
      <div className="flex items-baseline gap-[14px]">
        <div className={`${MONO} text-muted text-stat sm:text-figure`}>{column.number}</div>
        <h2 className={`${SERIF} text-title sm:text-stat`}>{column.title}</h2>
      </div>

      <Visual visual={column.visual} />

      {column.entries.map((entry) => (
        <div key={entry.label} className="flex flex-col gap-[4px]">
          <div className={`${LABEL} text-micro`}>{entry.label}</div>
          <div className="text-ink text-label sm:text-body font-sans leading-[1.5]">
            {entry.sentence}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Each column's picture: a line drawing, or a real screen drawn small. */
function Visual({ visual }: { visual: ColumnVisual }) {
  return (
    <PreviewFrame>
      {visual === 'trainer-drawing' && <TrainerDrawing />}
      {visual === 'connect-preview' && <ConnectPreview />}
      {visual === 'ride-preview' && <RidePreview />}
    </PreviewFrame>
  );
}

/**
 * A bike on a trainer, as a line drawing: the only thing on this screen that is not
 * either type or a real screen. Muted at the chart stroke weight, so it sits in the same
 * family as the profile in the frame beside it.
 */
function TrainerDrawing() {
  return (
    <svg
      className="h-auto w-[55%]"
      viewBox="0 0 200 100"
      fill="none"
      stroke="var(--color-muted)"
      strokeWidth="var(--stroke-chart)"
      strokeLinejoin="round"
      strokeLinecap="round"
      role="img"
      aria-label="A bike on a smart trainer"
    >
      <circle cx="150" cy="62" r="26" />
      <circle cx="150" cy="62" r="4" />
      {/* The trainer: its feet and the A-frame the rear hub clamps into. */}
      <path d="M110,88 L190,88 M124,88 L150,36 L176,88" />
      {/* The bike: triangle, fork, stays and bars. */}
      <path d="M150,62 L96,62 L72,22 L118,22 L150,62 M72,22 L58,22 M118,22 L110,8 M100,8 L120,8" />
      <circle cx="36" cy="62" r="26" />
      <path d="M36,62 L72,22 M36,62 L96,62" />
    </svg>
  );
}

/**
 * An anchor that looks like a button. Both controls on this screen are navigations to the
 * login screen rather than actions, so they are links — which also means Back behaves the
 * way the browser's own does, and the hash is a real address a rider can keep.
 */
function ControlLink({
  href,
  tone = 'grey',
  children,
}: {
  href: string;
  tone?: 'grey' | 'accent';
  children: string;
}) {
  return (
    <a
      href={href}
      className={`${LINK_TONE[tone]} ${CONTROL_SIZE} inline-flex items-center justify-center px-[20px] py-[12px] no-underline`}
    >
      {children}
    </a>
  );
}
