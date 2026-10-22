import { useCallback, useEffect, useState } from 'react';
import { ContourField } from './components/ContourField';
import { Button } from './components/Button';
import { SERIF } from './components/styles';
import type { Route as RouteGeometry } from '../route/types';
import type { Ride, RideSample, Session, Route as StoredRoute } from '../storage/types';
import { Experiment } from './screens/Experiment';
import { HowItWorks } from './screens/HowItWorks';
import { Login } from './screens/Login';
import type { ListScreen } from './screens/Nav';
import { Ride as RideScreen } from './screens/Ride';
import { Workout as WorkoutScreen } from './screens/Workout';
import { Rides } from './screens/Rides';
import { Routes } from './screens/Routes';
import { Summary } from './screens/Summary';
import { WorkoutEditor } from './screens/WorkoutEditor';
import { Workouts } from './screens/Workouts';
import { returnToAfterDelete, type DeleteOrigin, type DeleteResult } from './screens/ride-delete';
import type { Targets } from './screens/RideSettings';
import { RiderProfile } from './screens/RiderProfile';
import { useAsync } from './screens/use-async';
import { LEAVE_RIDE_PROMPT, rideAtRisk } from './ride-guard';
import {
  formatHash,
  parseHash,
  resolve,
  resolveSignedOut,
  rideLabel,
  type Location,
} from './routing';
import * as services from './services';
import { useRideStore } from './useRideStore';

interface History {
  routes: StoredRoute[];
  rides: Ride[];
}

/**
 * The screen comes from the hash (ADR-0018) and everything else is still an action the
 * rider took. The store subscription below is the only link to the engine, and the engine
 * remains the source of what is being ridden — the URL is a view of that, never a cause.
 */
export function App() {
  // ?experiment=1 replaces the ride flow outright. ADR-0000 is still Proposed and this
  // screen is the instrument that decides it; mixing it into the normal app would put a
  // second interval alongside the probe and stop the control being a control.
  return (
    <>
      <ContourField />
      {services.experimentEnabled ? <Experiment /> : <SessionGate />}
    </>
  );
}

/**
 * The two screens an install with no session can show, and the app after it has one.
 *
 * Its own component because the gate has to resolve before RideApp's hooks run: a screen
 * cannot be chosen conditionally inside a component that already called twenty hooks.
 * The experiment is outside it — ?experiment=1 is a diagnostic harness, not the app, and
 * ADR-0000 is decided by measuring it rather than by signing into it.
 *
 * 'none' rather than null for a fresh install: useAsync's null already means "still
 * loading", and showing the login screen for a frame before the read lands would be the
 * one flicker a rider sees every launch.
 *
 * It reads the hash as well, for the one screen reachable before signing in: How it
 * works. A second, much smaller router than RideApp's, and deliberately not the same one
 * — resolve() is a function of what the engine is riding, and nothing is being ridden
 * here. Both screens move between each other with plain anchors, so the listener below is
 * all the navigation there is.
 */
function SessionGate() {
  const [started, setStarted] = useState(0);
  const session = useAsync<Session | 'none'>(async () => {
    await services.ready;
    return services.currentSession() ?? 'none';
  }, [started]);
  const [hash, setHash] = useState(() => window.location.hash);

  const start = useCallback(() => {
    void services.startGuestSession().then(() => setStarted((n) => n + 1));
  }, []);

  useEffect(() => {
    const read = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('hashchange', read);
    };
  }, []);

  const signedOut = resolveSignedOut(parseHash(hash));

  /**
   * An install with no session belongs on one of those two screens, whatever it was
   * opened on. A deeper hash — a bookmark carried from somewhere else — would otherwise
   * sign in and land on a record it has never had, so the bar is put back to the screen
   * actually on it.
   */
  useEffect(() => {
    if (session !== 'none') return;
    const target = formatHash(signedOut);
    if (window.location.hash === target) return;
    // Replaced, not pushed, like every other correction here: back must not return to a
    // screen this install cannot show.
    window.location.replace(target);
  }, [session, signedOut]);

  if (session === null) return <Loading />;
  if (session === 'none') {
    return signedOut.name === 'how-it-works' ? <HowItWorks /> : <Login onStart={start} />;
  }
  return <RideApp />;
}

function RideApp() {
  const snapshot = useRideStore();
  /**
   * The hash, as a screen. Null is one the app has no screen for; resolve below decides
   * where that goes.
   *
   * hashchange keeps it in step, and the two writes that do not produce one — an
   * assignment to location.hash fires it a task later, pushState never does — set it
   * themselves. The gap matters: a render inside it would see the bar and this state
   * disagree, and the correction below would undo the navigation rather than follow it.
   */
  const [location, setLocation] = useState<Location | null>(() => parseHash(window.location.hash));
  /**
   * How the summary was reached, which is the difference between discarding the ride you
   * just abandoned and deleting one from months ago. Set where the rider makes the
   * choice — starting a ride, or opening a row in the history. 'history' is the default
   * because the only way to arrive without making either choice is to open /rides/:id
   * cold, and a ride that was in storage before this tab opened is history by definition.
   */
  const [summaryOrigin, setSummaryOrigin] = useState<DeleteOrigin>('history');
  const [profileOpen, setProfileOpen] = useState(false);
  // Bumped when an import or a delete lands, which are the two things that change the
  // history without leaving the screen that renders it.
  const [historyVersion, setHistoryVersion] = useState(0);
  // Bumped when the profile panel closes, which is the one thing that changes a setting
  // outside a ride. Without it the next ride would be built from the new FTP while the
  // ladders were still drawn from the old one.
  const [settingsVersion, setSettingsVersion] = useState(0);
  // The same idea for the library: a save, a create or a delete changes the list under a
  // screen already rendering it.
  const [workoutsVersion, setWorkoutsVersion] = useState(0);

  useEffect(() => {
    const read = (): void => setLocation(parseHash(window.location.hash));
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('hashchange', read);
    };
  }, []);

  /**
   * The label `/ride` carries, written from what the engine holds. Geometry rather than
   * the name decides whether a route is being ridden: the points are what the engine was
   * handed, and a record whose name has since gone is still a ride.
   */
  const label = rideLabel({
    workoutName: snapshot.workout?.name ?? null,
    routeName: snapshot.routeGeometry === null ? null : (snapshot.routeName ?? ''),
  });

  /**
   * A ride that runs out of route ends itself. Deriving the screen rather than pushing it
   * from an effect means the engine's state and what is on the glass cannot disagree.
   * The saved id is part of the condition: until the ride is actually in storage there is
   * no summary to show, and a save that failed leaves the fault strip where it can be read.
   */
  const finishedRideId =
    snapshot.state === 'finished' && snapshot.savedRideId !== null ? snapshot.savedRideId : null;

  const resolved = resolve(location, { label, finishedRideId });

  /**
   * A ride lives in memory until it is saved, so a reload or a closed tab destroys it.
   * The handler exists only while there is something to lose — see rideAtRisk — because
   * an always-on one would nag on the routes list and on the login screen, where nothing
   * is at stake and the rider learns to dismiss it. The browser owns the wording; the
   * handler cancels the event and nothing more.
   */
  const atRisk = rideAtRisk({
    state: snapshot.state,
    sampleCount: snapshot.samples.length,
    savedRideId: snapshot.savedRideId,
  });

  useEffect(() => {
    if (!atRisk) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [atRisk]);

  const settings = useAsync(() => services.ready.then(services.currentSettings), [settingsVersion]);

  // Read on entry to a list screen, which is also when a just-finished ride has landed.
  const history = useAsync<History>(async () => {
    await services.ready;
    const [routes, rides] = await Promise.all([
      services.storage.routes.list(),
      services.storage.rides.list(),
    ]);
    return { routes, rides };
  }, [resolved.name, historyVersion]);

  const workouts = useAsync(() => services.listWorkouts(), [resolved.name, workoutsVersion]);

  /**
   * A workout id that names nothing — deleted under an open editor, or typed into the
   * bar — leaves an editor with no record to edit. The list behind it is what remains, so
   * the bar says that rather than going on naming an editor that cannot open. Only once
   * the library has actually loaded: useAsync holds the previous list while it re-reads,
   * and null here means the first read is still in flight.
   */
  const screen: Location =
    resolved.name === 'workout' &&
    workouts !== null &&
    !workouts.some((workout) => workout.id === resolved.workoutId)
      ? { name: 'workouts' }
      : resolved;

  const hash = formatHash(screen);

  /**
   * The bar, corrected to the screen actually on the glass: an unknown hash, the login
   * on an install that has a session, a cold /ride, a ride that has just saved itself.
   *
   * location.replace rather than history.replaceState, which is the same replacement plus
   * the hashchange that the listener above is already waiting for — so the correction is
   * one write to one place and the state follows from it. A replacement rather than a
   * push because a correction is not somewhere the rider has been, and back must not
   * return to it. `resolve` is idempotent, so this settles in a single pass.
   */
  useEffect(() => {
    if (window.location.hash === hash) return;
    window.location.replace(hash);
  }, [hash, location]);

  // All three targets are stored and republished through the snapshot, so the panel is
  // reading what was actually saved rather than local state that only looked saved.
  const targets: Targets = {
    powerW: snapshot.targetPowerW,
    cadenceRpm: snapshot.targetCadenceRpm,
    heartRateBpm: snapshot.targetHeartRateBpm,
  };

  // Published by services.startRide rather than looked up here: a route's GPX is on its
  // record now, so loading geometry is async and a component cannot await in render. The
  // store already carries what is being ridden, and this is part of it.
  const geometry = snapshot.routeGeometry;

  /**
   * The one way the rider moves. An assignment to location.hash rather than pushState,
   * because it is the one that leaves an entry and fires hashchange; the state is set
   * alongside it so nothing renders in the task before that event arrives.
   */
  const go = useCallback((to: Location) => {
    window.location.hash = formatHash(to);
    setLocation(to);
  }, []);

  const navigate = useCallback(
    (next: ListScreen) => {
      go({ name: next });
    },
    [go],
  );

  /**
   * The second guard. `beforeunload` cannot see in-app navigation, so back out of a ride
   * asks here instead: the same question through different plumbing (ADR-0018), and
   * neither covers the other.
   *
   * popstate arrives after the browser has already moved, so staying put means putting
   * the ride's own entry back on top. Registered only while there is a ride on the glass
   * and something in it to lose, which is what keeps the question off the list screens.
   */
  const guardBack = atRisk && screen.name === 'ride';

  useEffect(() => {
    if (!guardBack) return;
    const ask = (): void => {
      // Back within the ride — there is only one such entry, but a forward press lands
      // here too — is not leaving it.
      if (parseHash(window.location.hash)?.name === 'ride') return;
      if (window.confirm(LEAVE_RIDE_PROMPT)) return;
      window.history.pushState(null, '', hash);
      setLocation(parseHash(hash));
    };
    window.addEventListener('popstate', ask);
    return () => {
      window.removeEventListener('popstate', ask);
    };
  }, [guardBack, hash]);

  const startRide = useCallback(
    async (routeId: string) => {
      await services.startRide(routeId);
      setSummaryOrigin('finished');
      // No label: the engine has just been handed the route, and the correction above
      // writes what it is actually riding.
      go({ name: 'ride', label: null });
    },
    [go],
  );

  const endRide = useCallback(async () => {
    // Read before the await: ending the ride tears the run down, so by the time the
    // outcome lands the snapshot no longer knows a workout was being ridden.
    const wasWorkout = snapshot.workout !== null;
    const outcome = await services.endRide();
    // A failed save said so in the alert strip; staying on the ride screen keeps that
    // message where the rider can see it. A discarded one never existed, so there is no
    // summary to show — back to the list it was started from. A saved one needs nothing
    // here: the engine publishes the id it saved under, and the derivation above turns
    // /ride into that ride's summary whether the rider ended it or the route ran out.
    if (outcome.status === 'failed') return;
    if (outcome.status === 'discarded') navigate(returnToAfterDelete('finished', wasWorkout));
  }, [navigate, snapshot.workout]);

  // One control, three jobs: a route is chosen but not yet started, a ride is running,
  // or a ride is paused. The label the rider reads comes from primaryControlLabel.
  const togglePause = useCallback(() => {
    if (snapshot.state === 'idle') services.beginRide();
    else if (snapshot.state === 'running') services.pauseRide();
    else if (snapshot.state === 'paused') services.resumeRide();
  }, [snapshot.state]);

  const closeProfile = useCallback(() => {
    setProfileOpen(false);
    setSettingsVersion((version) => version + 1);
  }, []);

  const importRides = useCallback(async (file: File) => {
    const result = await services.importRides(file);
    if (result.status === 'done' && result.restored > 0) setHistoryVersion((n) => n + 1);
    return result;
  }, []);

  /** Same version counter as a ride import: the routes list is rendering the history
   * that just changed under it. */
  const importRoutes = useCallback(async (file: File) => {
    const result = await services.importRoutes(file);
    if (result.status === 'done' && result.imported > 0) setHistoryVersion((n) => n + 1);
    return result;
  }, []);

  /**
   * Deleting is unrecoverable, so it goes through the cascade in storage/rides.ts rather
   * than touching the two repositories here. Same version counter as an import: both are
   * a history that changed under a screen already rendering it.
   */
  const deleteRide = useCallback(async (rideId: string): Promise<DeleteResult> => {
    const result = await services.deleteRide(rideId);
    if (result.status === 'done') setHistoryVersion((n) => n + 1);
    return result;
  }, []);

  /**
   * A new workout is written before the editor opens, so the editor only ever edits a
   * record that exists: there is no draft to lose and no question about what a reload
   * does. An abandoned one is a row with a Delete beside it.
   */
  const createWorkout = useCallback(async () => {
    const workoutId = await services.createWorkout();
    // A failure already raised its own fault; there is nothing to open.
    if (workoutId === null) return;
    setWorkoutsVersion((version) => version + 1);
    go({ name: 'workout', workoutId });
  }, [go]);

  /**
   * A copy of a starter, written the same way and then opened: it is the rider's own
   * workout from the moment it exists, so there is nothing special about the editor it
   * lands in. This is the only way a starter becomes something to change.
   */
  const duplicateWorkout = useCallback(
    async (workoutId: string) => {
      const copyId = await services.duplicateWorkout(workoutId);
      if (copyId === null) return;
      setWorkoutsVersion((version) => version + 1);
      go({ name: 'workout', workoutId: copyId });
    },
    [go],
  );

  const saveWorkout = useCallback(async (workoutId: string, source: string) => {
    const result = await services.saveWorkout(workoutId, source);
    if (result.status === 'saved') setWorkoutsVersion((version) => version + 1);
    return result;
  }, []);

  const deleteWorkout = useCallback(async (workoutId: string): Promise<DeleteResult> => {
    const result = await services.deleteWorkout(workoutId);
    if (result.status === 'done') setWorkoutsVersion((version) => version + 1);
    return result;
  }, []);

  const importWorkouts = useCallback(async (file: File) => {
    const result = await services.importWorkouts(file);
    if (result.status === 'done' && result.imported > 0) {
      setWorkoutsVersion((version) => version + 1);
    }
    return result;
  }, []);

  /**
   * Removing a route changes the same two lists a ride import does — the routes list it
   * leaves, and the ride counts beside the ones that remain — so it shares their counter.
   * Nothing cascades: see services.deleteRoute.
   */
  const deleteRoute = useCallback(async (routeId: string): Promise<DeleteResult> => {
    const result = await services.deleteRoute(routeId);
    if (result.status === 'done') setHistoryVersion((n) => n + 1);
    return result;
  }, []);

  const startWorkout = useCallback(
    async (workoutId: string) => {
      await services.startWorkout(workoutId);
      setSummaryOrigin('finished');
      go({ name: 'ride', label: null });
    },
    [go],
  );

  const changeTargets = useCallback((next: Targets) => {
    void services.setTargetPowerW(next.powerW);
    void services.setTargetCadenceRpm(next.cadenceRpm);
    void services.setTargetHeartRateBpm(next.heartRateBpm);
  }, []);

  // A workout is running exactly when the snapshot says so, which is what decides the
  // screen: the workout screen has no route under it, so it never waits for geometry.
  if (screen.name === 'ride' && settings !== null && snapshot.workout !== null) {
    return (
      <WorkoutScreen
        snapshot={snapshot}
        workout={snapshot.workout}
        hrMaxBpm={settings.hrMax}
        targetMarginPct={settings.targetMarginPct}
        targets={targets}
        source={services.source}
        onTargetsChange={changeTargets}
        onPauseToggle={togglePause}
        onEnd={() => void endRide()}
        onDifficultyChange={(percent) => void services.setTrainerDifficulty(percent)}
        onErgModeChange={services.setErgMode}
        onSkipStep={services.skipStep}
        onNudgeScale={services.nudgeWorkoutScale}
        onDismissAlert={services.dismissAlert}
        onRetryTrainer={() => void services.connectTrainer()}
        onConnectTrainer={() => void services.connectTrainer()}
        onDisconnectTrainer={() => void services.disconnectTrainer()}
        onConnectHrm={() => void services.connectHrm()}
        onDisconnectHrm={() => void services.disconnectHrm()}
      />
    );
  }

  if (screen.name === 'ride' && geometry !== null && settings !== null) {
    return (
      <RideScreen
        snapshot={snapshot}
        route={geometry}
        ftpW={settings.ftp}
        hrMaxBpm={settings.hrMax}
        targetMarginPct={settings.targetMarginPct}
        targets={targets}
        source={services.source}
        onTargetsChange={changeTargets}
        onPauseToggle={togglePause}
        onEnd={() => void endRide()}
        onDifficultyChange={(percent) => void services.setTrainerDifficulty(percent)}
        onDismissAlert={services.dismissAlert}
        onRetryTrainer={() => void services.connectTrainer()}
        onConnectTrainer={() => void services.connectTrainer()}
        onDisconnectTrainer={() => void services.disconnectTrainer()}
        onConnectHrm={() => void services.connectHrm()}
        onDisconnectHrm={() => void services.disconnectHrm()}
      />
    );
  }

  if (screen.name === 'summary') {
    // The URL names the ride, whichever path arrived here: the rider opened one from the
    // history, or the finish published the id it saved under and the bar was corrected to
    // it. Nothing is left to fall back to, which is why a reload lands on the same ride.
    const { rideId } = screen;
    return (
      <SummaryScreen
        rideId={rideId}
        origin={summaryOrigin}
        onExport={(id) => void services.exportRideTcx(id)}
        onDelete={async (wasWorkout) => {
          const result = await deleteRide(rideId);
          if (result.status === 'done') navigate(returnToAfterDelete(summaryOrigin, wasWorkout));
          return result;
        }}
        onDone={() => navigate('rides')}
      />
    );
  }

  /**
   * A panel over whichever list is open, not a screen of its own: the profile is a
   * settings affordance, so the collection behind it stays where the rider left it. It
   * is unreachable from the ride screen, which is what keeps a ride's frozen settings
   * frozen for its whole duration.
   */
  const profilePanel =
    profileOpen && settings !== null ? (
      <RiderProfile
        profile={settings}
        onChange={(patch) => void services.updateRiderProfile(patch)}
        onClose={closeProfile}
      />
    ) : null;

  if (screen.name === 'workouts' || screen.name === 'workout') {
    if (workouts === null || settings === null) return <Loading />;
    const editing =
      screen.name === 'workout'
        ? (workouts.find((workout) => workout.id === screen.workoutId) ?? null)
        : null;
    // The editor takes precedence over the list behind it, the way the profile panel does.
    // A workout deleted from under an open editor leaves nothing to edit, so the list is
    // what remains rather than an editor holding a record that is gone.
    if (editing !== null) {
      return (
        <WorkoutEditor
          workout={editing}
          onSave={saveWorkout}
          onClose={() => navigate('workouts')}
          builtIn={services.builtInWorkouts}
        />
      );
    }
    return (
      <>
        <Workouts
          workouts={workouts}
          ftpW={settings.ftp}
          onOpen={(workoutId) => go({ name: 'workout', workoutId })}
          onDuplicate={(workoutId) => void duplicateWorkout(workoutId)}
          onStart={(workoutId) => void startWorkout(workoutId)}
          onCreate={() => void createWorkout()}
          onDownload={(id) => void services.exportWorkoutYaml(id)}
          onExportAll={() => services.exportAllWorkouts()}
          onImport={importWorkouts}
          onDelete={deleteWorkout}
          builtIn={services.builtInWorkouts}
          onNavigate={navigate}
          onOpenProfile={() => setProfileOpen(true)}
        />
        {profilePanel}
      </>
    );
  }

  if (screen.name === 'rides') {
    return (
      <>
        <Rides
          rides={history?.rides ?? []}
          onOpen={(rideId) => {
            setSummaryOrigin('history');
            go({ name: 'summary', rideId });
          }}
          onExport={(id) => void services.exportRideTcx(id)}
          onExportAll={() => services.exportAllRides()}
          onImport={importRides}
          onDelete={deleteRide}
          onNavigate={navigate}
          onOpenProfile={() => setProfileOpen(true)}
        />
        {profilePanel}
      </>
    );
  }

  return (
    <>
      <Routes
        routes={history?.routes ?? []}
        rides={history?.rides ?? []}
        onSelect={(routeId) => void startRide(routeId)}
        onDownload={(id) => void services.exportRouteGpx(id)}
        onExportAll={services.exportAllRoutes}
        onImport={importRoutes}
        onLoadGeometry={services.loadRouteGeometry}
        onDelete={deleteRoute}
        builtIn={services.builtInRoutes}
        onNavigate={navigate}
        onOpenProfile={() => setProfileOpen(true)}
      />
      {profilePanel}
    </>
  );
}

type LoadedRide = { ride: Ride; samples: RideSample[]; route: RouteGeometry | null } | 'missing';

/**
 * The summary reads two records and a route, so it loads rather than being handed its
 * data: the rides list carries aggregates only, and a ride's samples are fetched when
 * the ride is actually opened. It is always given an id — a finished ride publishes the
 * one it saved under — so it never has to fall back to "the newest ride in storage".
 */
function SummaryScreen({
  rideId,
  origin,
  onExport,
  onDelete,
  onDone,
}: {
  rideId: string;
  origin: DeleteOrigin;
  onExport: (rideId: string) => void;
  /** Told whether this was a workout, which decides the list it goes back to. */
  onDelete: (wasWorkout: boolean) => Promise<DeleteResult>;
  onDone: () => void;
}) {
  // The route loads with the ride rather than after it. Reading its geometry is async
  // now — the GPX is on the record — and this screen was already a one-shot load, so it
  // costs nothing to ask for the third thing in the same pass. Null where the route has
  // since been removed or has no readable source: the aggregates still read.
  const loaded = useAsync<LoadedRide>(async () => {
    await services.ready;
    const ride = await services.storage.rides.get(rideId);
    if (ride === undefined) return 'missing';
    const stored = await services.storage.rideSamples.get(ride.id);
    const route = ride.routeId === null ? null : await services.loadRouteGeometry(ride.routeId);
    return { ride, samples: (stored?.samples ?? []) as RideSample[], route };
  }, [rideId]);

  if (loaded === null) return <Loading />;
  if (loaded === 'missing') return <Missing onDone={onDone} />;

  return (
    <Summary
      ride={loaded.ride}
      samples={loaded.samples}
      route={loaded.route}
      origin={origin}
      onExport={() => onExport(loaded.ride.id)}
      onDelete={() => onDelete(loaded.ride.workoutId !== null)}
      onDone={onDone}
    />
  );
}

/** Said plainly rather than shown as the nearest ride, which is how the old fallback
 * could put someone else's numbers under this ride's heading. */
function Missing({ onDone }: { onDone: () => void }) {
  return (
    <div className="text-ink flex h-screen flex-col justify-center gap-[24px] px-[64px]">
      <div className={`${SERIF} text-stat`}>That ride is not in the history.</div>
      <div className="self-start">
        <Button onClick={onDone}>Back to rides</Button>
      </div>
    </div>
  );
}

function Loading() {
  return <div className="h-screen" />;
}
