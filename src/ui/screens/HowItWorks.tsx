import { AppHeader } from '../components/AppHeader';
import { CONTROL_SIZE, LINK_TONE } from '../components/control';
import { LABEL, MONO, SERIF } from '../components/styles';
import { formatHash } from '../routing';
import { COLUMNS, FOOT_NOTES, type Column } from './how-it-works';

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
      <div className="flex grow flex-col sm:grid sm:grid-cols-3 sm:gap-[56px] sm:pt-[8px]">
        {COLUMNS.map((column) => (
          <ColumnBlock key={column.number} column={column} />
        ))}
      </div>

      <div className="border-hairline flex items-center justify-between gap-[24px] border-t pt-[20px] sm:pt-[24px]">
        {/* Capped so the lines break somewhere readable rather than running the width of
            the screen, and so Start keeps its corner. */}
        <div className="text-muted text-caption sm:text-label flex max-w-[220px] flex-col gap-[4px] font-sans sm:max-w-[760px]">
          {FOOT_NOTES.map((note) => (
            <div key={note}>{note}</div>
          ))}
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

      <Visual column={column} />

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

/**
 * The column's picture: 16:10, the full width of the column, and no frame around it.
 * The pictures carry their own edges — a light ground on one, a lit screen on the other
 * two — so a hairline box around them would be a second border drawn on a first.
 *
 * The sources are cropped to 16:10 already, so `object-cover` has nothing to trim at this
 * ratio and is here only to hold it if a column is ever a different shape.
 */
function Visual({ column }: { column: Column }) {
  return (
    <img
      src={column.image.src}
      alt={column.image.alt}
      width={720}
      height={450}
      className="aspect-[16/10] w-full object-cover"
    />
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
