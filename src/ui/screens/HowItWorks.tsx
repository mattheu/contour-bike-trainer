import { AppHeader } from '../components/AppHeader';
import { CONTROL_SIZE, LINK_TONE } from '../components/control';
import { LABEL, MONO, SERIF } from '../components/styles';
import { formatHash, type Location } from '../routing';
import { COLUMNS, type Column } from './how-it-works';

/**
 * design/mockups/tour.html and phone-tour.html.
 *
 * The one screen a rider can reach without signing in, and the one screen that scrolls.
 * DESIGN.md > Screen rules names both exceptions.
 *
 * On a desktop it is the rest of the app's shape: a fixed header, a fixed bottom band,
 * and one row between them that takes what is left. Here that row is the three columns,
 * and what it does with an overflow is scroll. Prose is the one thing on this screen
 * that grows when someone edits it, and a laptop viewport is nearer 780 px than the
 * design's 900 — so the columns have to be able to run long, and Back and Start have to
 * stay on the glass while they do. A screen whose whole job is to lead to Start cannot
 * put Start below the fold.
 *
 * On a phone the columns stack and the whole page scrolls, which is the exception
 * DESIGN.md > Screen rules already names.
 *
 * Where it goes next is the caller's to say, because it has two audiences. Signed out
 * it is the first thing a stranger reads and every road out leads to Start, so Back and
 * the accent control both point at the login screen. Signed in it is reference, reached
 * from the profile panel: Back returns to the app and there is nothing left to start, so
 * the foot has no control and does not draw. Both are anchors either way — a hash is a
 * real address, and the browser's own Back then agrees with the one on the screen.
 */

interface HowItWorksProps {
  /** Where Back returns to. */
  backTo: Location;
  /** The accent control in the foot, for a reader who has not signed in yet. */
  start?: Location;
}

export function HowItWorks({ backTo, start }: HowItWorksProps) {
  return (
    <div className="text-ink flex min-h-screen flex-col gap-[24px] px-[16px] py-[20px] sm:h-screen sm:gap-[28px] sm:overflow-hidden sm:px-[64px] sm:py-[36px]">
      <AppHeader
        // The screen's name, so it is a heading rather than a caption on the logo. 11 px
        // on a phone, where the logo beside it leaves the label a third of the row.
        nav={<h1 className={`${LABEL} text-micro sm:text-label`}>How it works</h1>}
        action={<ControlLink href={formatHash(backTo)}>Back</ControlLink>}
      />

      {/* Three equal columns on desktop; on a phone they stack, each carrying the
          hairline that separates it from the one above.

          min-h-0 is what lets this row scroll rather than push the foot off the bottom:
          a flex child will not shrink below its content without it, so the row would
          measure the columns it holds instead of the space they have. */}
      <div className="flex grow flex-col sm:grid sm:min-h-0 sm:grid-cols-3 sm:gap-[56px] sm:overflow-y-auto">
        {COLUMNS.map((column, i) => (
          <ColumnBlock key={column.title} column={column} position={i + 1} />
        ))}
      </div>

      {/* The one accent element on the screen: the action it exists to lead to. Absent
          for a rider who has already taken it — a foot rule with nothing under it is a
          band that says the page ended, which it does not need saying twice. */}
      {start !== undefined && (
        <div className="border-hairline flex items-center justify-end border-t pt-[20px] sm:pt-[24px]">
          <ControlLink href={formatHash(start)} tone="accent">
            Start
          </ControlLink>
        </div>
      )}
    </div>
  );
}

/** The number is the column's place in the row, not a step: see COLUMNS. */
function ColumnBlock({ column, position }: { column: Column; position: number }) {
  return (
    <div className="border-hairline flex flex-col gap-[18px] border-t py-[24px] sm:gap-[20px] sm:border-t-0 sm:py-0">
      <div className="flex items-baseline gap-[14px]">
        <div className={`${MONO} text-muted text-stat sm:text-figure`}>{position}</div>
        <h2 className={`${SERIF} text-title sm:text-stat`}>{column.title}</h2>
      </div>

      <Visual column={column} />

      {column.entries.map((entry) => (
        <div key={entry.label} className="flex flex-col gap-[4px]">
          <div className={`${LABEL} text-micro`}>{entry.label}</div>
          {'steps' in entry ? <Steps steps={entry.steps} /> : <Prose>{entry.sentence}</Prose>}
        </div>
      ))}
    </div>
  );
}

/** A sentence under its label. 14 px on a phone, 16 on everything else. */
function Prose({ children }: { children: string }) {
  return <div className="text-ink text-label sm:text-body font-sans leading-[1.5]">{children}</div>;
}

/**
 * Numbered steps, where the order is the instruction rather than a way of counting.
 *
 * A real `<ol>`, so a screen reader announces it as a list of three and a rider reading
 * it as prose still gets the sequence. The markers are drawn rather than left to the
 * list-style, because DESIGN.md puts every number in JetBrains Mono and a UA marker
 * would be the body face — and because they have to hang in their own column so the
 * second line of a step lines up under the first rather than under its number.
 */
function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-[8px]">
      {steps.map((step, i) => (
        <li key={step} className="grid grid-cols-[18px_1fr] gap-[8px]">
          <span className={`${MONO} text-muted text-label sm:text-body leading-[1.5]`}>
            {i + 1}
          </span>
          <Prose>{step}</Prose>
        </li>
      ))}
    </ol>
  );
}

/**
 * The column's picture: the full width of the column, and no frame around it. The
 * pictures are drawn on their own light ground, so a hairline box around one would be a
 * second border over a first.
 *
 * 2:1 because that is what the artwork is. Two of the three are 1774x887 on the nose, so
 * the ratio is theirs rather than one picked here and cropped to — a pictogram loses the
 * edge of a dashboard it is meant to show. Only the bike is a different shape, and it is
 * cropped to the band it draws in. Every file is already 2:1 by the time it ships, so
 * `object-cover` never actually trims: it is here to hold the shape if one ever is not.
 */
function Visual({ column }: { column: Column }) {
  return (
    <img
      src={column.image.src}
      alt={column.image.alt}
      width={800}
      height={400}
      className="aspect-[2/1] w-full object-cover"
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
