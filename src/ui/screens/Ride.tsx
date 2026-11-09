import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { HistorySlot } from '../../ghost/resolve';
import { lapSplits } from '../../ride/metrics';
import { detectClimbs } from '../../route/climbs';
import { WINDOW_WIDE_M, buildProfile, projectWindow } from '../../route/profile';
import type { Route } from '../../route/types';
import {
  trendSamplesByDistance,
  type ElevationProfileHandle,
  type MapZoom,
  type RouteMapHandle,
  type TrendStripsHandle,
} from '../charts';
import type { DevicesView } from '../components/Devices';
import type { RideSnapshot } from '../store';
import type { PhoneView } from './phone-ride';
import { arrangementFor, type ArrangementName } from './arrangement';
import { type RideArrangementProps } from './ride-arrangement';
import { rideReadings } from './ride-readings';
import { timeRows, timesNote } from './ride-times';
import { lapProgress, primaryControlLabel, type MapPanel, type ProfileZoom } from './ride-view';
import { RideDesktop } from './RideDesktop';
import { RidePhoneLandscape } from './RidePhoneLandscape';
import { RidePhonePortrait } from './RidePhonePortrait';
import { RideTabletPortrait } from './RideTabletPortrait';
import { RideSettings, type Targets } from './RideSettings';
import {
  PHONE_LANDSCAPE_QUERY,
  PHONE_PORTRAIT_QUERY,
  TABLET_PORTRAIT_QUERY,
  useMediaQuery,
} from './use-media-query';

/** The component each arrangement name draws. One at a time — see arrangementFor. */
const ARRANGEMENTS: Record<ArrangementName, (props: RideArrangementProps) => ReactElement> = {
  'phone-portrait': RidePhonePortrait,
  'phone-landscape': RidePhoneLandscape,
  'tablet-portrait': RideTabletPortrait,
  desktop: RideDesktop,
};

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
  onGhostSlot: (slot: HistorySlot, on: boolean) => void;
  onClearGhostRide: () => void;
  onDismissAlert: () => void;
  onRetryTrainer: () => void;
  onConnectTrainer: () => void;
  onDisconnectTrainer: () => void;
  onConnectHrm: () => void;
  onDisconnectHrm: () => void;
}

/**
 * The ride screen: everything the arrangements share, and the choice between them.
 *
 * The readings, the projected window, the chart handles and the clock that drives them
 * all live here, because they are the ride rather than any one layout of it. What a
 * screen size changes is where those land — see ride-arrangement.
 */
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
  onGhostSlot,
  onClearGhostRide,
  onDismissAlert,
  onRetryTrainer,
  onConnectTrainer,
  onDisconnectTrainer,
  onConnectHrm,
  onDisconnectHrm,
}: RideProps) {
  const [profileZoom, setProfileZoom] = useState<ProfileZoom>('route');
  const [mapZoom, setMapZoom] = useState<MapZoom>('route');
  const [mapPanel, setMapPanel] = useState<MapPanel>('map');
  const [view, setView] = useState<PhoneView>('profile');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const profileRef = useRef<ElevationProfileHandle>(null);
  const mapRef = useRef<RouteMapHandle>(null);
  const stripRef = useRef<TrendStripsHandle>(null);

  /**
   * One arrangement is rendered, not two with one hidden: the charts below are
   * imperatively-updated SVGs held by these refs, and a hidden second set would be built,
   * handed every tick and given handles to keep straight, all to draw nothing.
   */
  const arrangementName = arrangementFor({
    phonePortrait: useMediaQuery(PHONE_PORTRAIT_QUERY),
    phoneLandscape: useMediaQuery(PHONE_LANDSCAPE_QUERY),
    tabletPortrait: useMediaQuery(TABLET_PORTRAIT_QUERY),
  });

  const profile = useMemo(() => buildProfile(route), [route]);
  const climbs = useMemo(() => detectClimbs(route), [route]);

  /**
   * Where the rider is on the route, which is what every chart on this screen draws and
   * what the distance reading now counts: on a loop it wraps at the route's length, so
   * the ridden fill reaches the end and starts again rather than the chart running out.
   * The same number as distanceM on a point-to-point route.
   */
  const { routePositionM } = snapshot;
  /**
   * The lap being ridden — its word, its start and how far through it the rider is in all
   * three of the strip's units. Null on a route that does not come back to its start.
   *
   * One derivation for the four things that ask: the strips offset to its start, the
   * secondary strip reads lap against ride, the times list names it, and the header tags
   * it. See lapProgress.
   */
  const lap = lapProgress(snapshot, profile.ascent);

  // The window follows the rider, so it is rebuilt as the ride moves. Route zoom — the
  // default — keeps a null window and so a stable geometry for the whole ride.
  const window = useMemo(
    () =>
      profileZoom === 'route' ? null : projectWindow(route, profile, routePositionM, WINDOW_WIDE_M),
    [profileZoom, route, profile, routePositionM],
  );

  // The recorder's own 1 Hz series, published through the store. Mapped by the same tested
  // function the summary uses, so the strips read the same shape either side of the finish
  // rather than one rebuilt from snapshots here.
  //
  // Offset to the current lap, because the strips share the profile's x-axis and that axis
  // is the route rather than the ride: without it a second lap's samples would sit past the
  // right-hand edge and the strips would stop growing at the start line.
  const samples = useMemo(
    () => trendSamplesByDistance(snapshot.samples, lap?.startM ?? 0),
    [snapshot.samples, lap?.startM],
  );

  /**
   * The ranking the times view draws: this session's completed laps against the ghosts.
   *
   * The splits come from the recorder's own series by the one function that cuts them —
   * the same one the ghost model asks for the pool — so a lap in this list and the same
   * lap as a ghost are the same number of seconds rather than two measurements of one
   * crossing. Memoised on the series, which grows once a second, rather than recut on
   * every render of a screen that re-renders for its clocks.
   *
   * The length is withheld on a point-to-point route, which has no laps to cut: reaching
   * the finish there is one completed length, and counting it would put the ride itself in
   * the ranking as "Lap 1" on the one screen where the list is meant to hold ghosts alone.
   */
  const lapLengthM = snapshot.routeLoops ? snapshot.routeTotalDistanceM : null;
  const splits = useMemo(
    () => lapSplits(snapshot.samples, lapLengthM),
    [snapshot.samples, lapLengthM],
  );
  const times = timeRows({
    laps: splits,
    ghosts: snapshot.ghosts,
    current:
      lap === null
        ? null
        : {
            number: lap.number,
            elapsedS: lap.elapsedS,
            distanceM: lap.distanceM,
            lengthM: lap.lengthM,
          },
  });

  // The one place the charts are told the time has moved. They mutate their own SVG
  // through these handles; nothing here puts a chart's geometry into React state.
  //
  // No dependency list, so it also runs on the render that swapped the view or the
  // arrangement: a chart that has just mounted is seeded at zero, and this is what walks
  // it up to where the rider actually is.
  useEffect(() => {
    profileRef.current?.update(routePositionM, snapshot.ghosts);
    mapRef.current?.update(routePositionM, snapshot.ghosts);
    stripRef.current?.update(routePositionM);
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

  const readings = rideReadings({
    snapshot,
    lap,
    ftpW,
    hrMaxBpm,
    targetPowerW: targets.powerW,
    targetHeartRateBpm: targets.heartRateBpm,
    targetMarginPct,
  });

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

  const arrangement: RideArrangementProps = {
    snapshot,
    readings,
    route,
    profile,
    climbs,
    window,
    samples,
    ftpW,
    title: snapshot.routeName ?? 'Free ride',
    lapLabel: lap?.label ?? null,
    times,
    timesNote: timesNote(lap),
    pauseLabel: primaryControlLabel(snapshot.state, snapshot.elapsedS),
    view,
    onView: setView,
    profileZoom,
    onProfileZoom: setProfileZoom,
    mapZoom,
    onMapZoom: setMapZoom,
    mapPanel,
    onMapPanel: setMapPanel,
    profileRef,
    mapRef,
    stripRef,
    onProfileHover,
    onMapHover,
    onPause: onPauseToggle,
    onEnd,
    onSettings: () => {
      setSettingsOpen(true);
    },
    onDismissAlert,
    onRetryTrainer,
  };

  const Arrangement = ARRANGEMENTS[arrangementName];

  return (
    // h-dvh rather than h-screen: on a phone the viewport is whatever the browser's
    // toolbars have left, and design/DESIGN.md asks every screen to fit one without
    // scrolling. The same height as h-screen anywhere the toolbars do not move.
    <div className="text-ink relative flex h-dvh flex-col overflow-hidden">
      <Arrangement {...arrangement} />

      {settingsOpen && (
        <RideSettings
          devices={devices}
          difficulty={snapshot.trainerDifficulty}
          targets={targets}
          ghosts={{
            slots: snapshot.ghostSlots,
            onSlot: onGhostSlot,
            onClearPicked: onClearGhostRide,
          }}
          onDifficultyChange={onDifficultyChange}
          onTargetsChange={onTargetsChange}
          onEnd={onEnd}
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
