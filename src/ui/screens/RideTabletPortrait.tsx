import { useMemo, useRef, type ReactNode } from 'react';
import { ZONE_COUNT as HR_ZONE_COUNT } from '../../zones/hr';
import { ZONE_COUNT as POWER_ZONE_COUNT } from '../../zones/power';
import {
  PowerStrip,
  TABLET_CHART_GAP_PX,
  TABLET_STACK_GAP_PX,
  tabletChartStack,
} from '../charts';
import { GhostKey } from '../components/GhostKey';
import { GradientKey } from '../components/GradientKey';
import { Hero } from '../components/Hero';
import { LoopTag } from '../components/LoopTag';
import { RideHeader } from '../components/RideHeader';
import { Segmented } from '../components/Segmented';
import { Stat } from '../components/Stat';
import { LABEL, MONO } from '../components/styles';
import { ZoneLadder } from '../components/ZoneLadder';
import { AlertStrip } from './AlertStrip';
import type { RideArrangementProps } from './ride-arrangement';
import type { Reading } from './ride-readings';
import { MAP_ZOOMS, type LadderView } from './ride-view';
import { MapChart, ProfileChart } from './RideCharts';
import { useElementHeight, useElementWidth } from './use-element-width';

/**
 * The ride screen on a tablet held upright, after design/mockups/tablet-portrait.html.
 *
 * Not a wide phone: every chart is drawn at once and the desktop's controls stay as
 * words. What changes is the proportions — the heroes at 72 rather than 108, five
 * secondaries at 20, and the profile stacked over the map instead of beside it, because
 * 754 px is wide enough for one good chart and not for two.
 *
 * The mockup draws no zoom toggle over the profile, only over the map, so the window
 * view has no control here. Reported rather than invented: see the task notes.
 */
export function RideTabletPortrait({
  snapshot,
  readings,
  route,
  profile,
  climbs,
  window,
  samples,
  ftpW,
  title,
  lapLabel,
  pauseLabel,
  mapZoom,
  onMapZoom,
  profileRef,
  mapRef,
  stripRef,
  onProfileHover,
  onMapHover,
  onPause,
  onEnd,
  onSettings,
  onDismissAlert,
  onRetryTrainer,
}: RideArrangementProps) {
  // Measured rather than taken from the mockup's 834 x 1194: a tablet is whatever it is,
  // and the charts are re-projected to the box they are given rather than scaled into it.
  // Neither measured element carries padding on the axis it is measured on — see
  // use-element-width.
  const rowRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rowRef);
  const areaHeight = useElementHeight(chartAreaRef);
  const stack = useMemo(() => tabletChartStack(areaHeight), [areaHeight]);
  const chartWidth = width ?? 754;

  return (
    <>
      <div className="px-[40px] pt-[40px]">
        {/* The 44 px lockup, not the desktop's 48: the mockup spends the width it saves
            on the controls, which stay as words rather than becoming a phone's glyphs. */}
        <RideHeader
          size={44}
          title={title}
          tag={lapLabel === null ? undefined : <LoopTag label={lapLabel} />}
          pauseLabel={pauseLabel}
          onPause={onPause}
          onEnd={onEnd}
          onSettings={onSettings}
        />
      </div>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="grid shrink-0 grid-cols-3 gap-[24px] px-[40px] pt-[36px]">
        <Primary>
          <TabletHero reading={readings.power} />
          <Ladder view={readings.powerLadder} label="Power zone" count={POWER_ZONE_COUNT} />
        </Primary>
        <Primary divided>
          <TabletHero reading={readings.cadence} />
          {/* Cadence has no zones, so it gets the rule alone rather than a count it
              would have to invent. */}
          <Rule />
        </Primary>
        <Primary divided>
          <TabletHero reading={readings.heartRate} />
          <Ladder view={readings.heartRateLadder} label="Heart rate zone" count={HR_ZONE_COUNT} />
        </Primary>
      </div>

      {/* nowrap on the row rather than on each reading: at 143 px a column "16.1 / 38.2
          km" would break after the slash and drop the row's baseline by a line. */}
      <div className="grid shrink-0 grid-cols-5 gap-[20px] px-[40px] pt-[32px] whitespace-nowrap">
        <Secondary>
          <TabletStat reading={readings.elapsed} />
        </Secondary>
        <Secondary divided>
          <TabletStat reading={readings.distance} />
        </Secondary>
        <Secondary divided>
          <TabletStat reading={readings.climbed} />
        </Secondary>
        <Secondary divided>
          <TabletStat reading={readings.speed} />
        </Secondary>
        <Secondary divided>
          <TabletStat reading={readings.gradient} />
        </Secondary>
      </div>

      {/* min-h-0 so the area measures the space the charts have rather than the charts it
          contains; justify-center because the mockup spends a tall tablet's slack above
          and below the three charts rather than on them — see tabletChartStack. The top
          gap is a margin, so the measured box carries no vertical padding. */}
      <div
        ref={chartAreaRef}
        className="mt-[24px] flex min-h-0 grow flex-col justify-center px-[40px]"
        style={{ rowGap: `${String(TABLET_STACK_GAP_PX)}px` }}
      >
        <div
          ref={rowRef}
          className="flex flex-col"
          style={{ rowGap: `${String(TABLET_CHART_GAP_PX)}px` }}
        >
          <ProfileChart
            route={route}
            profile={profile}
            climbs={climbs}
            window={window}
            width={chartWidth}
            height={stack.profileHeight}
            handleRef={profileRef}
            onHover={onProfileHover}
          />
          {/* The strip shares the profile's x-axis, so it shares its width exactly. */}
          <PowerStrip
            ref={stripRef}
            samples={samples}
            ftpW={ftpW}
            startM={window?.startM ?? 0}
            endM={window?.endM ?? route.totalDistanceM}
            distanceM={0}
            width={chartWidth}
            height={stack.stripHeight}
          />
        </div>

        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center justify-between">
            <div className={`${LABEL} text-micro`}>Map</div>
            <Segmented
              size={32}
              label="Map zoom"
              options={MAP_ZOOMS}
              value={mapZoom}
              onChange={onMapZoom}
            />
          </div>
          <MapChart
            route={route}
            zoom={mapZoom}
            width={chartWidth}
            height={stack.mapHeight}
            handleRef={mapRef}
            onHover={onMapHover}
          />
        </div>
      </div>

      {/* Two lines, not the desktop's one: 754 px will not hold five ghosts, the gradient
          scale and the difficulty on a single row without the ghosts eating the scale. */}
      <div className="flex shrink-0 flex-col gap-[12px] px-[40px] pb-[36px] whitespace-nowrap">
        <GhostKey ghosts={snapshot.ghosts} />
        <div className="flex items-center gap-[24px]">
          <GradientKey />
          <div className="flex items-center gap-[10px]">
            <div className={`${LABEL} text-micro`}>Difficulty</div>
            <div className={`${MONO} text-micro text-ink`}>{snapshot.trainerDifficulty}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function TabletHero({ reading }: { reading: Reading }) {
  return (
    <Hero
      size={72}
      testId={reading.testId}
      label={reading.label}
      value={reading.value}
      unit={reading.unit}
      tone={reading.tone}
      figure={reading.figure}
      figureUnit={reading.figureUnit}
    />
  );
}

function TabletStat({ reading }: { reading: Reading }) {
  return (
    <Stat
      size={20}
      testId={reading.testId}
      label={reading.label}
      value={reading.value}
      total={reading.total}
      unit={reading.unit}
      tone={reading.tone}
    />
  );
}

function Primary({ children, divided = false }: { children: ReactNode; divided?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-[10px] ${divided ? 'border-hairline border-l pl-[20px]' : ''}`}
    >
      {children}
    </div>
  );
}

function Secondary({ children, divided = false }: { children: ReactNode; divided?: boolean }) {
  return <div className={divided ? 'border-hairline border-l pl-[20px]' : ''}>{children}</div>;
}

/** A reading with no zones to measure it against still keeps the row's baseline. */
function Rule() {
  return (
    <div className="mt-[14px]">
      <div className="relative h-[30px]">
        <div className="bg-hairline absolute top-[5px] right-0 left-0 h-px" />
      </div>
    </div>
  );
}

/** The count is the caller's: power has six zones and heart rate five. */
function Ladder({ view, label, count }: { view: LadderView | null; label: string; count: number }) {
  if (view === null) return <Rule />;
  return (
    <div className="mt-[14px]">
      <ZoneLadder
        count={count}
        zone={view.zone}
        marker={view.marker}
        target={view.target}
        label={label}
      />
    </div>
  );
}
