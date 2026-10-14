import { useCallback, useEffect, useState } from 'react';
import { ContourField } from './components/ContourField';
import { Button } from './components/Button';
import { SERIF } from './components/styles';
import type { Route as RouteGeometry } from '../route/types';
import type { Ride, RideSample, Session, Route as StoredRoute } from '../storage/types';
import { Experiment } from './screens/Experiment';
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
import { rideAtRisk } from './ride-guard';
import * as services from './services';
import { useRideStore } from './useRideStore';

/**
 * One riding screen, not two: `ride` is whatever is being ridden, and the snapshot's
 * workout decides which of the two screens draws it. `workouts` is a list screen like the
 * other two; the editor is a panel over it rather than a screen of its own.
 */
type Screen = ListScreen | 'ride' | 'summary';

interface History {
  routes: StoredRoute[];
  rides: Ride[];
}

/**
 * Phase 2 has no router: the screen is one piece of state and every transition is an
 * action the rider took. The store subscription below is the only link to the engine.
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
 * The login screen until this install has a session, and the app after.
 *
 * Its own component because the gate has to resolve before RideApp's hooks run: a screen
 * cannot be chosen conditionally inside a component that already called twenty hooks.
 * The experiment is outside it — ?experiment=1 is a diagnostic harness, not the app, and
 * ADR-0000 is decided by measuring it rather than by signing into it.
 *
 * 'none' rather than null for a fresh install: useAsync's null already means "still
 * loading", and showing the login screen for a frame before the read lands would be the
 * one flicker a rider sees every launch.
 */
function SessionGate() {
  const [started, setStarted] = useState(0);
  const session = useAsync<Session | 'none'>(async () => {
    await services.ready;
    return services.currentSession() ?? 'none';
  }, [started]);

  const start = useCallback(() => {
    void services.startGuestSession().then(() => setStarted((n) => n + 1));
  }, []);

  if (session === null) return <Loading />;
  if (session === 'none') return <Login onStart={start} />;
  return <RideApp />;
}

function RideApp() {
  const snapshot = useRideStore();
  // Routes is the cold start: pairing moved into the ride settings panel, so there is
  // nothing to do before choosing something to ride.
  const [requested, setRequested] = useState<Screen>('routes');
  const [openRideId, setOpenRideId] = useState<string | null>(null);
  /** The workout open in the editor, which sits over the list rather than replacing it. */
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  /**
   * How the summary was reached, which is the difference between discarding the ride you
   * just abandoned and deleting one from months ago. Not derived from openRideId: ending
   * a ride by hand sets that too, so the two paths would be indistinguishable. Set where
   * the rider makes the choice — starting a ride, or opening a row in the history.
   */
  const [summaryOrigin, setSummaryOrigin] = useState<DeleteOrigin>('finished');
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

  /**
   * A ride that runs out of route ends itself. Deriving the screen rather than pushing it
   * from an effect means the engine's state and what is on the glass cannot disagree.
   * The saved id is part of the condition: until the ride is actually in storage there is
   * no summary to show, and a save that failed leaves the fault strip where it can be read.
   */
  const screen: Screen =
    requested === 'ride' && snapshot.state === 'finished' && snapshot.savedRideId !== null
      ? 'summary'
      : requested;

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
  }, [screen, historyVersion]);

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

  const workouts = useAsync(() => services.listWorkouts(), [screen, workoutsVersion]);

  const navigate = useCallback((next: ListScreen) => {
    setOpenRideId(null);
    setEditingWorkoutId(null);
    setRequested(next);
  }, []);

  const startRide = useCallback(async (routeId: string) => {
    await services.startRide(routeId);
    setSummaryOrigin('finished');
    setRequested('ride');
  }, []);

  const endRide = useCallback(async () => {
    // Read before the await: ending the ride tears the run down, so by the time the
    // outcome lands the snapshot no longer knows a workout was being ridden.
    const wasWorkout = snapshot.workout !== null;
    const outcome = await services.endRide();
    // A failed save said so in the alert strip; staying on the ride screen keeps that
    // message where the rider can see it. A discarded one never existed, so there is no
    // summary to show — back to the list it was started from.
    if (outcome.status === 'failed') return;
    if (outcome.status === 'discarded') {
      setRequested(returnToAfterDelete('finished', wasWorkout));
      return;
    }
    setOpenRideId(outcome.rideId);
    setRequested('summary');
  }, [snapshot.workout]);

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
    setEditingWorkoutId(workoutId);
  }, []);

  /**
   * A copy of a starter, written the same way and then opened: it is the rider's own
   * workout from the moment it exists, so there is nothing special about the editor it
   * lands in. This is the only way a starter becomes something to change.
   */
  const duplicateWorkout = useCallback(async (workoutId: string) => {
    const copyId = await services.duplicateWorkout(workoutId);
    if (copyId === null) return;
    setWorkoutsVersion((version) => version + 1);
    setEditingWorkoutId(copyId);
  }, []);

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

  const startWorkout = useCallback(async (workoutId: string) => {
    await services.startWorkout(workoutId);
    setSummaryOrigin('finished');
    setRequested('ride');
  }, []);

  const changeTargets = useCallback((next: Targets) => {
    void services.setTargetPowerW(next.powerW);
    void services.setTargetCadenceRpm(next.cadenceRpm);
    void services.setTargetHeartRateBpm(next.heartRateBpm);
  }, []);

  // A workout is running exactly when the snapshot says so, which is what decides the
  // screen: the workout screen has no route under it, so it never waits for geometry.
  if (screen === 'ride' && settings !== null && snapshot.workout !== null) {
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

  if (screen === 'ride' && geometry !== null && settings !== null) {
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

  if (screen === 'summary') {
    // Whichever path arrived here named its ride: the rider opened one from the history,
    // or the finish published the id it saved under.
    const rideId = openRideId ?? snapshot.savedRideId;
    return rideId === null ? (
      <Loading />
    ) : (
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

  if (screen === 'workouts') {
    if (workouts === null || settings === null) return <Loading />;
    const editing = workouts.find((workout) => workout.id === editingWorkoutId) ?? null;
    // The editor takes precedence over the list behind it, the way the profile panel does.
    // A workout deleted from under an open editor leaves nothing to edit, so the list is
    // what remains rather than an editor holding a record that is gone.
    if (editing !== null) {
      return (
        <WorkoutEditor
          workout={editing}
          onSave={saveWorkout}
          onClose={() => setEditingWorkoutId(null)}
          builtIn={services.builtInWorkouts}
        />
      );
    }
    return (
      <>
        <Workouts
          workouts={workouts}
          ftpW={settings.ftp}
          onOpen={setEditingWorkoutId}
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

  if (screen === 'rides') {
    return (
      <>
        <Rides
          rides={history?.rides ?? []}
          onOpen={(id) => {
            setOpenRideId(id);
            setSummaryOrigin('history');
            setRequested('summary');
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
