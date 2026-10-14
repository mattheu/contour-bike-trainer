import { useCallback, useMemo, useState } from 'react';
import { ContourField } from './components/ContourField';
import { Button } from './components/Button';
import { SERIF } from './components/styles';
import type { Ride, RideSample, Route as StoredRoute } from '../storage/types';
import { Experiment } from './screens/Experiment';
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
      {services.experimentEnabled ? <Experiment /> : <RideApp />}
    </>
  );
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

  const geometry = useMemo(
    () => (snapshot.routeId === null ? null : services.loadRouteGeometry(snapshot.routeId)),
    [snapshot.routeId],
  );

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
        ftpW={settings.ftp}
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
        />
      );
    }
    return (
      <>
        <Workouts
          workouts={workouts}
          ftpW={settings.ftp}
          onOpen={setEditingWorkoutId}
          onStart={(workoutId) => void startWorkout(workoutId)}
          onCreate={() => void createWorkout()}
          onDelete={deleteWorkout}
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
        onNavigate={navigate}
        onOpenProfile={() => setProfileOpen(true)}
      />
      {profilePanel}
    </>
  );
}

type LoadedRide = { ride: Ride; samples: RideSample[] } | 'missing';

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
  const loaded = useAsync<LoadedRide>(async () => {
    await services.ready;
    const ride = await services.storage.rides.get(rideId);
    if (ride === undefined) return 'missing';
    const stored = await services.storage.rideSamples.get(ride.id);
    return { ride, samples: (stored?.samples ?? []) as RideSample[] };
  }, [rideId]);

  const route = useMemo(() => {
    const routeId = loaded === null || loaded === 'missing' ? null : loaded.ride.routeId;
    if (routeId === null) return null;
    try {
      return services.loadRouteGeometry(routeId);
    } catch {
      // The route was removed from the manifest since this ride: the aggregates still read.
      return null;
    }
  }, [loaded]);

  if (loaded === null) return <Loading />;
  if (loaded === 'missing') return <Missing onDone={onDone} />;

  return (
    <Summary
      ride={loaded.ride}
      samples={loaded.samples}
      route={route}
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
