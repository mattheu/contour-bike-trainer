import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Climb } from '../../route/climbs';
import { detectClimbs } from '../../route/climbs';
import { WINDOW_WIDE_M, buildProfile, projectWindow } from '../../route/profile';
import type { Route } from '../../route/types';
import { ZONE_COUNT as HR_ZONE_COUNT } from '../../zones/hr';
import { ZONE_COUNT as POWER_ZONE_COUNT } from '../../zones/power';
import {
  CHART_ROW_GAP_PX,
  ElevationProfile,
  PowerStrip,
  RouteMap,
  chartRowLayout,
  type ElevationProfileHandle,
  type MapZoom,
  type PowerStripHandle,
  type RouteMapHandle,
  chartStackHeights,
} from '../charts';
import { GradientKey } from '../components/GradientKey';
import { Hero } from '../components/Hero';
import { RideHeader } from '../components/RideHeader';
import { Segmented } from '../components/Segmented';
import { Stat } from '../components/Stat';
import { LABEL, MONO } from '../components/styles';
import { ZoneLadder } from '../components/ZoneLadder';
import { distance, duration, elevation, num, percent } from '../format';
import type { RideSnapshot } from '../store';
import { AlertStrip } from './AlertStrip';
import {
  ftpSharePercent,
  heartRateLadder,
  kilometres,
  powerLadder,
  primaryControlLabel,
  readingTone,
} from './ride-view';
import { powerSamplesFrom } from './summary-view';
import { RideSettings, type DevicesView, type Targets } from './RideSettings';
import { useElementHeight, useElementWidth } from './use-element-width';

type ProfileZoom = 'route' | 'window';

const PROFILE_ZOOMS = [
  { value: 'route', label: 'Route' },
  { value: 'window', label: '5 km' },
] as const;

/** 5 km of ground, not of route: see NEAR_WINDOW_M in charts/map.ts. */
const MAP_ZOOMS = [
  { value: 'route', label: 'Route' },
  { value: 'near', label: '5 km' },
] as const;

export interface RideProps {
  snapshot: RideSnapshot;
  route: Route;
  ftpW: number;
  hrMaxBpm: number;
  targetMarginPct: number;
  targets: Targets;
  /** What produced the data: a real device, or the named fake script. */
  source: string;
  onTargetsChange: (targets: Targets) => void;
  onPauseToggle: () => void;
  onEnd: () => void;
  onDifficultyChange: (percent: number) => void;
  onDismissAlert: () => void;
  onRetryTrainer: () => void;
  onConnectTrainer: () => void;
  onDisconnectTrainer: () => void;
  onConnectHrm: () => void;
  onDisconnectHrm: () => void;
}

export function Ride({
  snapshot,
  route,
  ftpW,
  hrMaxBpm,
  targetMarginPct,
  targets,
  source,
  onTargetsChange,
  onPauseToggle,
  onEnd,
  onDifficultyChange,
  onDismissAlert,
  onRetryTrainer,
  onConnectTrainer,
  onDisconnectTrainer,
  onConnectHrm,
  onDisconnectHrm,
}: RideProps) {
  const [profileZoom, setProfileZoom] = useState<ProfileZoom>('route');
  const [mapZoom, setMapZoom] = useState<MapZoom>('route');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const profileRef = useRef<ElevationProfileHandle>(null);
  const mapRef = useRef<RouteMapHandle>(null);
  const stripRef = useRef<PowerStripHandle>(null);

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

  const profile = useMemo(() => buildProfile(route), [route]);
  const climbs = useMemo(() => detectClimbs(route), [route]);

  const { distanceM, displayPowerW } = snapshot;

  // design/DESIGN.md: a fault shows in the data too. The trainer's readings go stale
  // when it drops; heart rate follows the strap, which can fail on its own.
  const trainerTone = readingTone(snapshot.trainerState);
  const heartRateTone = readingTone(snapshot.hrmState);

  // The window follows the rider, so it is rebuilt as the ride moves. Route zoom — the
  // default — keeps a null window and so a stable geometry for the whole ride.
  const window = useMemo(
    () =>
      profileZoom === 'route' ? null : projectWindow(route, profile, distanceM, WINDOW_WIDE_M),
    [profileZoom, route, profile, distanceM],
  );

  // The recorder's own 1 Hz series, published through the store. Mapped by the same
  // tested function the summary uses, so the strip reads the same shape either side of
  // the finish rather than one rebuilt from snapshots here.
  const samples = useMemo(() => powerSamplesFrom(snapshot.samples), [snapshot.samples]);

  // The one place the charts are told the time has moved. They mutate their own SVG
  // through these handles; nothing here puts a chart's geometry into React state.
  useEffect(() => {
    profileRef.current?.update(distanceM);
    mapRef.current?.update(distanceM);
    stripRef.current?.update(distanceM, displayPowerW);
  });

  /**
   * Hovering either chart marks the same place on the other, through the same handles
   * the clock already drives. Deliberately not React state: mousemove fires far faster
   * than this screen renders, and this screen re-renders every second for its clocks —
   * hover held at this level would rebuild both charts, the stats and the steps on every
   * pixel the mouse moves. Stable, so the memoised charts below are not defeated by it.
   *
   * The pair cannot drive each other round in circles, and not because anything here
   * watches for it. A chart only ever emits from its own pointer handlers; the hover()
   * it is given is a painting routine with no path back to the callback. So each of
   * these ends the moment it has drawn, one hop from the mouse that started it.
   */
  const onProfileHover = useCallback((hoveredM: number | null) => {
    mapRef.current?.hover(hoveredM);
  }, []);

  const onMapHover = useCallback((hoveredM: number | null) => {
    profileRef.current?.hover(hoveredM);
  }, []);

  // Space is the one keyboard shortcut: hands are on the bars, not the keyboard.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button, [contenteditable]')) return;
      event.preventDefault();
      onPauseToggle();
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [onPauseToggle]);

  const power = powerLadder(snapshot.powerW, ftpW, targets.powerW, targetMarginPct);
  const heart = heartRateLadder(
    snapshot.heartRateBpm,
    hrMaxBpm,
    targets.heartRateBpm,
    targetMarginPct,
  );
  const share = ftpSharePercent(snapshot.powerW, ftpW);

  const startM = window?.startM ?? 0;
  const endM = window?.endM ?? route.totalDistanceM;

  // Pairing lives in the settings panel now: there is no connect screen, and a fault
  // reaches the rider through the alert strip above rather than a screen of its own.
  const devices: DevicesView = {
    source,
    trainerState: snapshot.trainerState,
    trainerDeviceName: snapshot.trainerDeviceName,
    trainerServices: snapshot.trainerServices,
    powerW: snapshot.powerW,
    hrmState: snapshot.hrmState,
    heartRateBpm: snapshot.heartRateBpm,
    onConnectTrainer,
    onDisconnectTrainer,
    onConnectHrm,
    onDisconnectHrm,
  };

  return (
    <div className="text-ink relative flex h-screen flex-col overflow-hidden">
      <div className="px-[64px] pt-[36px]">
        <RideHeader
          title={snapshot.routeName ?? 'Free ride'}
          pauseLabel={primaryControlLabel(snapshot.state, snapshot.elapsedS)}
          onPause={onPauseToggle}
          onEnd={onEnd}
          onSettings={() => setSettingsOpen(true)}
        />
      </div>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="grid grid-cols-3 gap-[48px] px-[64px] pt-[28px]">
        <Primary>
          <Hero
            testId="ride-power"
            label="Power"
            value={num(snapshot.displayPowerW)}
            unit="W"
            tone={trainerTone}
            figure={share === null ? undefined : percent(share, 0)}
            figureUnit={share === null ? undefined : '% FTP'}
          />
          <Ladder view={power} label="Power zone" count={POWER_ZONE_COUNT} />
        </Primary>
        <Primary divided>
          <Hero
            testId="ride-cadence"
            label="Cadence"
            value={num(snapshot.cadenceRpm)}
            unit="rpm"
            tone={trainerTone}
          />
          {/* Cadence has no zones, so it gets the rule alone rather than a count it
              would have to invent. */}
          <Rule />
        </Primary>
        <Primary divided>
          <Hero
            testId="ride-heart-rate"
            label="Heart rate"
            value={num(snapshot.heartRateBpm)}
            unit="bpm"
            tone={heartRateTone}
            figure={heart === null ? undefined : `Z${heart.zone}`}
          />
          <Ladder view={heart} label="Heart rate zone" count={HR_ZONE_COUNT} />
        </Primary>
      </div>

      <div className="grid grid-cols-5 gap-[32px] px-[64px] pt-[28px]">
        <Secondary>
          <Stat testId="ride-elapsed" label="Elapsed" value={duration(snapshot.elapsedS)} />
        </Secondary>
        <Secondary divided>
          <Stat
            testId="ride-distance"
            label="Distance"
            value={distance(kilometres(snapshot.distanceM))}
            total={distance(kilometres(snapshot.routeTotalDistanceM))}
            unit="km"
          />
        </Secondary>
        <Secondary divided>
          <Stat
            testId="ride-climbed"
            label="Climbed"
            value={elevation(snapshot.ascentM)}
            total={elevation(snapshot.routeTotalAscentM)}
            unit="m"
          />
        </Secondary>
        <Secondary divided>
          {/* Speed is solved from the trainer's power, so it is only as live as the trainer. */}
          <Stat
            testId="ride-speed"
            label="Speed"
            value={distance(snapshot.speedKmh)}
            unit="km/h"
            tone={trainerTone}
          />
        </Secondary>
        <Secondary divided>
          <Stat
            testId="ride-gradient"
            label="Gradient"
            value={percent(snapshot.gradePercent)}
            unit="%"
          />
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
              ? `${layout.profileWidth}px ${layout.mapWidth}px`
              : `${layout.profileWidth}px`,
            columnGap: `${CHART_ROW_GAP_PX}px`,
          }}
        >
          <div className="flex flex-col gap-[6px]">
            <ChartHeading label="Profile">
              <Segmented
                size={32}
                label="Profile zoom"
                options={PROFILE_ZOOMS}
                value={profileZoom}
                onChange={setProfileZoom}
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
                currentW={null}
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
                  onChange={setMapZoom}
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
      </div>

      {settingsOpen && (
        <RideSettings
          devices={devices}
          difficulty={snapshot.trainerDifficulty}
          targets={targets}
          onDifficultyChange={onDifficultyChange}
          onTargetsChange={onTargetsChange}
          onEnd={onEnd}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The profile and the map are memoised on their geometry alone and seeded at zero: the
 * effect above walks them forward by hand once a second, so neither SVG tree is rebuilt
 * on every snapshot. The power strip stays outside because its zone washes are props by
 * design — their element count changes as new zones are entered.
 */
const ProfileChart = memo(function ProfileChart({
  route,
  profile,
  climbs,
  window,
  width,
  height,
  handleRef,
  onHover,
}: {
  route: Route;
  profile: ReturnType<typeof buildProfile>;
  climbs: readonly Climb[];
  window: ReturnType<typeof projectWindow> | null;
  width: number;
  height: number;
  handleRef: RefObject<ElevationProfileHandle | null>;
  onHover: (hoveredM: number | null) => void;
}) {
  return (
    <ElevationProfile
      ref={handleRef}
      route={route}
      profile={profile}
      climbs={climbs}
      window={window}
      width={width}
      height={height}
      distanceM={0}
      onHover={onHover}
    />
  );
});

const MapChart = memo(function MapChart({
  route,
  zoom,
  width,
  height,
  handleRef,
  onHover,
}: {
  route: Route;
  zoom: MapZoom;
  width: number;
  height: number;
  handleRef: RefObject<RouteMapHandle | null>;
  onHover: (hoveredM: number | null) => void;
}) {
  return (
    <RouteMap
      ref={handleRef}
      route={route}
      zoom={zoom}
      width={width}
      height={height}
      distanceM={0}
      onHover={onHover}
    />
  );
});

function Primary({ children, divided = false }: { children: React.ReactNode; divided?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-[10px] ${divided ? 'border-hairline border-l pl-[36px]' : ''}`}
    >
      {children}
    </div>
  );
}

function Secondary({
  children,
  divided = false,
}: {
  children: React.ReactNode;
  divided?: boolean;
}) {
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
function Ladder({
  view,
  label,
  count,
}: {
  view: ReturnType<typeof powerLadder>;
  label: string;
  count: number;
}) {
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

function ChartHeading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className={`${LABEL} text-micro`}>{label}</div>
      {children}
    </div>
  );
}
