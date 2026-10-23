import { useMemo, useRef, type ReactNode } from 'react';
import { ZONE_COUNT as HR_ZONE_COUNT } from '../../zones/hr';
import { ZONE_COUNT as POWER_ZONE_COUNT } from '../../zones/power';
import { CHART_ROW_GAP_PX, PowerStrip, chartRowLayout, chartStackHeights } from '../charts';
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
import { MAP_ZOOMS, PROFILE_ZOOMS, type LadderView } from './ride-view';
import { MapChart, ProfileChart } from './RideCharts';
import { useElementHeight, useElementWidth } from './use-element-width';

/**
 * The ride screen as design/mockups/ride.html draws it: three heroes, five secondary
 * readings, the profile beside the map, and the key band at the foot. Everything it
 * shows arrives formatted — see ride-arrangement.
 */
export function RideDesktop({
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
  profileZoom,
  onProfileZoom,
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
  // The charts are re-projected to the row they are actually given rather than scaled
  // into it, so strokes and tick type stay at their token sizes at every width. Below
  // the layout's minimum the map is dropped instead of drawn uselessly narrow.
  const rowRef = useRef<HTMLDivElement>(null);
  const rowWidth = useElementWidth(rowRef);
  // The growing flex child, so its height IS the space the charts have left after the
  // fixed rows have taken theirs. Measured rather than assumed: the design's 900 px
  // artboard is taller than a MacBook's Chrome viewport, so there is never a figure to
  // hard-code.
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const chartAreaHeight = useElementHeight(chartAreaRef);
  const layout = useMemo(() => chartRowLayout(rowWidth), [rowWidth]);
  const stack = useMemo(() => chartStackHeights(chartAreaHeight), [chartAreaHeight]);

  const startM = window?.startM ?? 0;
  const endM = window?.endM ?? route.totalDistanceM;

  return (
    <>
      <div className="px-[64px] pt-[36px]">
        <RideHeader
          title={title}
          tag={lapLabel === null ? undefined : <LoopTag label={lapLabel} />}
          pauseLabel={pauseLabel}
          onPause={onPause}
          onEnd={onEnd}
          onSettings={onSettings}
        />
      </div>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="grid grid-cols-3 gap-[48px] px-[64px] pt-[28px]">
        <Primary>
          <DesktopHero reading={readings.power} />
          <Ladder view={readings.powerLadder} label="Power zone" count={POWER_ZONE_COUNT} />
        </Primary>
        <Primary divided>
          <DesktopHero reading={readings.cadence} />
          {/* Cadence has no zones, so it gets the rule alone rather than a count it
              would have to invent. */}
          <Rule />
        </Primary>
        <Primary divided>
          <DesktopHero reading={readings.heartRate} />
          <Ladder view={readings.heartRateLadder} label="Heart rate zone" count={HR_ZONE_COUNT} />
        </Primary>
      </div>

      <div className="grid grid-cols-5 gap-[32px] px-[64px] pt-[28px]">
        <Secondary>
          <DesktopStat reading={readings.elapsed} />
        </Secondary>
        <Secondary divided>
          <DesktopStat reading={readings.distance} />
        </Secondary>
        <Secondary divided>
          <DesktopStat reading={readings.climbed} />
        </Secondary>
        <Secondary divided>
          <DesktopStat reading={readings.speed} />
        </Secondary>
        <Secondary divided>
          <DesktopStat reading={readings.gradient} />
        </Secondary>
      </div>

      {/* The page padding is on the wrapper so the measured element carries none of its
          own: the columns are explicit pixels handed to the geometry, and a border box
          measured against a content box would put the charts a padding out. */}
      {/* min-h-0: a grow child will not shrink below its content without it, so the area
          would measure the charts it contains rather than the space they have. */}
      <div
        ref={chartAreaRef}
        className="mt-[64px] flex min-h-0 grow flex-col justify-center px-[64px]"
      >
        <div
          ref={rowRef}
          className="grid items-start"
          style={{
            gridTemplateColumns: layout.showMap
              ? `${String(layout.profileWidth)}px ${String(layout.mapWidth)}px`
              : `${String(layout.profileWidth)}px`,
            columnGap: `${String(CHART_ROW_GAP_PX)}px`,
          }}
        >
          <div className="flex flex-col gap-[6px]">
            <ChartHeading label="Profile">
              <Segmented
                size={32}
                label="Profile zoom"
                options={PROFILE_ZOOMS}
                value={profileZoom}
                onChange={onProfileZoom}
              />
            </ChartHeading>
            <ProfileChart
              route={route}
              profile={profile}
              climbs={climbs}
              window={window}
              width={layout.profileWidth}
              height={stack.profileHeight}
              handleRef={profileRef}
              onHover={onProfileHover}
            />
            <div className="mt-[26px]">
              {/* The strip shares the profile's x-axis, so it shares its width exactly. */}
              <PowerStrip
                ref={stripRef}
                samples={samples}
                ftpW={ftpW}
                startM={startM}
                endM={endM}
                distanceM={0}
                width={layout.profileWidth}
                height={stack.stripHeight}
              />
            </div>
          </div>

          {layout.showMap && (
            <div className="flex flex-col gap-[6px]">
              <ChartHeading label="Map">
                <Segmented
                  size={32}
                  label="Map zoom"
                  options={MAP_ZOOMS}
                  value={mapZoom}
                  onChange={onMapZoom}
                />
              </ChartHeading>
              <MapChart
                route={route}
                zoom={mapZoom}
                width={layout.mapWidth}
                height={stack.mapHeight}
                handleRef={mapRef}
                onHover={onMapHover}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-[24px] flex items-end justify-between px-[64px] pb-[36px]">
        <div className="flex items-center gap-[14px]">
          <GradientKey />
          <div className={`${LABEL} text-micro ml-[26px]`}>Difficulty</div>
          <div className={`${MONO} text-micro text-ink`}>{snapshot.trainerDifficulty}</div>
        </div>
        <GhostKey ghosts={snapshot.ghosts} />
      </div>
    </>
  );
}

function DesktopHero({ reading }: { reading: Reading }) {
  return (
    <Hero
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

function DesktopStat({ reading }: { reading: Reading }) {
  return (
    <Stat
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
      className={`flex flex-col gap-[10px] ${divided ? 'border-hairline border-l pl-[36px]' : ''}`}
    >
      {children}
    </div>
  );
}

function Secondary({ children, divided = false }: { children: ReactNode; divided?: boolean }) {
  return <div className={divided ? 'border-hairline border-l pl-[32px]' : ''}>{children}</div>;
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

function ChartHeading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className={`${LABEL} text-micro`}>{label}</div>
      {children}
    </div>
  );
}
