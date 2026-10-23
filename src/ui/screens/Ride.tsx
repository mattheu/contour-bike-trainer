import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { HistorySlot } from '../../ghost/resolve';
import { detectClimbs } from '../../route/climbs';
import { lapLabel, lapStartM } from '../../route/loop';
import { WINDOW_WIDE_M, buildProfile, projectWindow } from '../../route/profile';
import type { Route } from '../../route/types';
import {
  type ElevationProfileHandle,
  type MapZoom,
  type PowerStripHandle,
  type RouteMapHandle,
} from '../charts';
import type { DevicesView } from '../components/Devices';
import type { RideSnapshot } from '../store';
import type { PhoneView } from './phone-ride';
import {
  rideArrangementFor,
  type RideArrangementName,
  type RideArrangementProps,
} from './ride-arrangement';
import { rideReadings } from './ride-readings';
import { primaryControlLabel, type ProfileZoom } from './ride-view';
import { RideDesktop } from './RideDesktop';
import { RidePhoneLandscape } from './RidePhoneLandscape';
import { RidePhonePortrait } from './RidePhonePortrait';
import { RideSettings, type Targets } from './RideSettings';
import { powerSamplesFrom } from './summary-view';
import { PHONE_LANDSCAPE_QUERY, PHONE_PORTRAIT_QUERY, useMediaQuery } from './use-media-query';

/** The component each arrangement name draws. One at a time — see rideArrangementFor. */
const ARRANGEMENTS: Record<RideArrangementName, (props: RideArrangementProps) => ReactElement> = {
  'phone-portrait': RidePhonePortrait,
  'phone-landscape': RidePhoneLandscape,
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
  const [view, setView] = useState<PhoneView>('profile');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const profileRef = useRef<ElevationProfileHandle>(null);
  const mapRef = useRef<RouteMapHandle>(null);
  const stripRef = useRef<PowerStripHandle>(null);

  /**
   * One arrangement is rendered, not two with one hidden: the charts below are
   * imperatively-updated SVGs held by these refs, and a hidden second set would be built,
   * handed every tick and given handles to keep straight, all to draw nothing.
   */
  const arrangementName = rideArrangementFor({
    phonePortrait: useMediaQuery(PHONE_PORTRAIT_QUERY),
    phoneLandscape: useMediaQuery(PHONE_LANDSCAPE_QUERY),
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
   * Which lap, and the distance that lap began at. One label does both jobs — `Loop`
   * until the first is complete, `Lap 2` after — so the tag and the counter never
   * compete for the same slot. Null on a route that does not come back to its start.
   */
  const lap =
    snapshot.routeLoops && snapshot.routeTotalDistanceM !== null
      ? {
          label: lapLabel(snapshot.distanceM, snapshot.routeTotalDistanceM),
          startM: lapStartM(snapshot.distanceM, snapshot.routeTotalDistanceM),
        }
      : null;

  // The window follows the rider, so it is rebuilt as the ride moves. Route zoom — the
  // default — keeps a null window and so a stable geometry for the whole ride.
  const window = useMemo(
    () =>
      profileZoom === 'route' ? null : projectWindow(route, profile, routePositionM, WINDOW_WIDE_M),
    [profileZoom, route, profile, routePositionM],
  );

  // The recorder's own 1 Hz series, published through the store. Mapped by the same
  // tested function the summary uses, so the strip reads the same shape either side of
  // the finish rather than one rebuilt from snapshots here.
  //
  // Offset to the current lap, because the strip shares the profile's x-axis and that
  // axis is the route rather than the ride: without it a second lap's samples would sit
  // past the right-hand edge and the strip would stop growing at the start line.
  const samples = useMemo(
    () => powerSamplesFrom(snapshot.samples, lap?.startM ?? 0),
    [snapshot.samples, lap?.startM],
  );

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
    pauseLabel: primaryControlLabel(snapshot.state, snapshot.elapsedS),
    view,
    onView: setView,
    profileZoom,
    onProfileZoom: setProfileZoom,
    mapZoom,
    onMapZoom: setMapZoom,
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
