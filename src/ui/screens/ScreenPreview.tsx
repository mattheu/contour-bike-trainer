import { useRef, type ReactNode } from 'react';
import { Ride } from './Ride';
import { RideSettings } from './RideSettings';
import { useElementWidth } from './use-element-width';
import {
  DEMO_DEVICES,
  DEMO_FTP_W,
  DEMO_HR_MAX_BPM,
  DEMO_RIDE_HANDLERS,
  DEMO_ROUTE,
  DEMO_SNAPSHOT,
  DEMO_TARGETS,
  DEMO_TARGET_MARGIN_PCT,
  DEMO_UNPAIRED_SNAPSHOT,
} from './preview-data';

/** The artboard every screen in design/mockups is drawn at, and what a preview shows. */
const ARTBOARD_WIDTH = 1440;
const ARTBOARD_HEIGHT = 900;

/**
 * The 16:10 hairline frame each column's picture sits in. The same box whether it holds a
 * line drawing or a whole screen, so the three columns carry the same weight.
 */
export function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="border-hairline relative flex aspect-[16/10] w-full max-w-[360px] items-center justify-center overflow-hidden border">
      {children}
    </div>
  );
}

/**
 * A real screen, drawn small inside that frame.
 *
 * The screens are rendered rather than screenshotted, for one reason: a screenshot of the
 * ride screen is out of date the first time anything on the ride screen moves, and the
 * only person who would notice is someone deciding whether to use the app. These draw
 * themselves from the same components the app runs, so they cannot say anything the app
 * does not.
 *
 * It is a picture, not a screen: `inert` takes the whole subtree out of focus order and
 * off the pointer, and `aria-hidden` keeps a second copy of the ride screen's headings out
 * of the accessibility tree. The sentences beside the frame are what a screen reader gets.
 *
 * The artboard is laid out at its full 1440x900 and scaled to the frame, so type and
 * strokes keep the proportions the design gives them — the charts re-project to the width
 * they are handed, which at a quarter scale would put 11 px axis ticks on a 236 px chart.
 * See `.screen-preview` in src/index.css for the one length a transform cannot reach.
 */
function ScreenPreview({ children }: { children: ReactNode }) {
  // The frame carries a border and the hook measures a content box, so the measured
  // element is this one: inset inside the border, with nothing of its own.
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);

  return (
    <div ref={ref} aria-hidden="true" inert className="bg-ground absolute inset-0">
      {width !== null && (
        <div
          className="screen-preview absolute top-0 left-0"
          style={{
            width: ARTBOARD_WIDTH,
            height: ARTBOARD_HEIGHT,
            transform: `scale(${String(width / ARTBOARD_WIDTH)})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** The ride screen mid-climb, which is the whole of column 3. */
export function RidePreview() {
  return (
    <ScreenPreview>
      <DemoRide snapshot="riding" />
    </ScreenPreview>
  );
}

/**
 * The same screen with the settings panel open on Devices, which is where pairing happens
 * — there is no connect screen of its own. The panel is a sibling of the ride rather than
 * the one the ride opens itself: whether it is open is the ride screen's own state, and a
 * preview has no way to press the button that sets it.
 */
export function ConnectPreview() {
  return (
    <ScreenPreview>
      <DemoRide snapshot="unpaired" />
      <RideSettings
        devices={DEMO_DEVICES}
        difficulty={DEMO_UNPAIRED_SNAPSHOT.trainerDifficulty}
        targets={DEMO_TARGETS}
        onDifficultyChange={DEMO_RIDE_HANDLERS.onDifficultyChange}
        onTargetsChange={DEMO_RIDE_HANDLERS.onTargetsChange}
        onEnd={DEMO_RIDE_HANDLERS.onEnd}
        onClose={DEMO_RIDE_HANDLERS.onEnd}
        animateIn={false}
      />
    </ScreenPreview>
  );
}

function DemoRide({ snapshot }: { snapshot: 'riding' | 'unpaired' }) {
  return (
    <Ride
      snapshot={snapshot === 'riding' ? DEMO_SNAPSHOT : DEMO_UNPAIRED_SNAPSHOT}
      route={DEMO_ROUTE}
      ftpW={DEMO_FTP_W}
      hrMaxBpm={DEMO_HR_MAX_BPM}
      targetMarginPct={DEMO_TARGET_MARGIN_PCT}
      targets={DEMO_TARGETS}
      source="Trainer"
      {...DEMO_RIDE_HANDLERS}
    />
  );
}
