import { useMemo, useRef, type ReactNode } from 'react';
import { ZONE_COUNT as HR_ZONE_COUNT } from '../../zones/hr';
import { ZONE_COUNT as POWER_ZONE_COUNT } from '../../zones/power';
import { CHART_ROW_GAP_PX, TrendStrips, chartRowLayout, chartStackHeights } from '../charts';
import { ButtonGroup } from '../components/ButtonGroup';
import { GhostKey } from '../components/GhostKey';
import { GradientKey } from '../components/GradientKey';
import { Hero } from '../components/Hero';
import { IconButton } from '../components/IconButton';
import { MapIcon, StepsIcon } from '../components/icons';
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
import { RideTimes } from './RideTimes';
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
  times,
  timesNote,
  pauseLabel,
  profileZoom,
  onProfileZoom,
  mapZoom,
  onMapZoom,
  mapPanel,
  onMapPanel,
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
            {/* No row gap: the profile's baseline is the power strip's top rule, the power
                strip's is the heart-rate strip's, and the km ticks rule the bottom of all
                three. design/DESIGN.md > Trend strips. */}
            <div className="flex flex-col">
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
              {/* The strips share the profile's x-axis, so they share its width exactly. */}
              <TrendStrips
                ref={stripRef}
                samples={samples}
                ftpW={ftpW}
                startAt={startM}
                endAt={endM}
                width={layout.profileWidth}
                axis="distance"
              />
            </div>
          </div>

          {layout.showMap &&
            (mapPanel === 'times' ? (
              <div className="flex flex-col gap-[6px]">
                {/* The map icon alone: there is no zoom on a list, and the glyph shows the
                    view you would switch to rather than the one you are on. */}
                <ChartHeading label="Times">
                  <IconButton
                    size={32}
                    label="Show map"
                    title="Show map"
                    onClick={() => {
                      onMapPanel('map');
                    }}
                  >
                    <MapIcon />
                  </IconButton>
                </ChartHeading>
                <RideTimes rows={times} note={timesNote} height={stack.mapHeight} />
              </div>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {/* The list icon sits flush against the zoom, so the two read as one
                    object: both are things you do to this column. The zoom keeps its own
                    group inside it, because it is a choice and the icon is an action —
                    see ButtonGroup on why the two semantics stay apart. */}
                <ChartHeading label="Map">
                  <ButtonGroup label="Map view and zoom">
                    <IconButton
                      size={32}
                      label="Show times"
                      title="Show times"
                      onClick={() => {
                        onMapPanel('times');
                      }}
                    >
                      <StepsIcon />
                    </IconButton>
                    <Segmented
                      size={32}
                      label="Map zoom"
                      options={MAP_ZOOMS}
                      value={mapZoom}
                      onChange={onMapZoom}
                    />
                  </ButtonGroup>
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
            ))}
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
