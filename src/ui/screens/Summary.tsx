import { useCallback, useMemo, useState } from 'react';
import { detectClimbs } from '../../route/climbs';
import { buildProfile } from '../../route/profile';
import type { Route } from '../../route/types';
import type { AlertState } from '../../ride/types';
import type { Ride, RideSample } from '../../storage/types';
import { ElevationProfile, PowerStrip } from '../charts';
import { Button } from '../components/Button';
import { ButtonGroup } from '../components/ButtonGroup';
import { CONTROL_GAP } from '../components/control';
import { GradientKey } from '../components/GradientKey';
import { Stat } from '../components/Stat';
import { LABEL } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { distance, duration, elevation, num } from '../format';
import { AlertStrip } from './AlertStrip';
import {
  cancelDelete,
  deleteAlert,
  deleteWording,
  isArmed,
  pressDelete,
  type Armed,
  type DeleteOrigin,
  type DeleteResult,
} from './ride-delete';
import { rideDate, rideTitle } from './rides-list';
import { ergModeNote, powerSamplesFrom } from './summary-view';

/** The 1440 design width less its 64 px gutters: with no map beside it the profile
 * takes the whole row. */
const CHART_WIDTH = 1312;

interface SummaryProps {
  ride: Ride;
  samples: readonly RideSample[];
  /** Absent for a free ride, and for a ride whose route has since been removed. */
  route: Route | null;
  /** How the screen was reached, which decides the wording: see ride-delete.ts. */
  origin: DeleteOrigin;
  onExport: () => void;
  /** Resolves once the ride and its samples are gone; the caller navigates away. */
  onDelete: () => Promise<DeleteResult>;
  onDone: () => void;
}

/**
 * No mockup: the ride screen's own rows, read back. The five secondaries become the
 * aggregate row, the profile is drawn complete, and the strip shows the whole ride
 * rather than a window. Download TCX is the screen's one accent control.
 */
export function Summary({
  ride,
  samples,
  route,
  origin,
  onExport,
  onDelete,
  onDone,
}: SummaryProps) {
  const profile = useMemo(() => (route === null ? null : buildProfile(route)), [route]);
  const climbs = useMemo(() => (route === null ? [] : detectClimbs(route)), [route]);
  const power = useMemo(() => powerSamplesFrom(samples), [samples]);

  const [armed, setArmed] = useState<Armed>(null);
  // Only a failure is reported here. A delete that worked takes the rider off this screen,
  // because a summary of a ride that no longer exists is nonsense; a delete that failed
  // leaves a ride they believe is gone, and that has to be said where they are standing.
  const [alert, setAlert] = useState<AlertState | null>(null);
  const clearAlert = useCallback(() => setAlert(null), []);
  const words = deleteWording(origin);
  const mode = ergModeNote(ride);
  const { title } = rideTitle(ride);

  const press = () => {
    const outcome = pressDelete(armed, ride.id);
    setArmed(outcome.armed);
    if (outcome.deleted === null) return;
    void onDelete().then((result) => {
      if (result.status === 'failed') setAlert(deleteAlert(result, title));
    });
  };

  return (
    <div className="text-ink flex h-screen flex-col overflow-hidden px-[64px] py-[44px]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-[18px]">
          <Logo />
          {/* Same treatment as RideHeader's: what the session was called should not change
              typeface between riding it and reading it back. */}
          <div className={LABEL}>{title}</div>
          <div className={`${LABEL} whitespace-nowrap`}>{rideDate(ride.startedAt)}</div>
          {!ride.finished && (
            <div className={`${LABEL} text-micro whitespace-nowrap`}>· ended early</div>
          )}
        </div>
        <div className={`flex items-center ${CONTROL_GAP}`}>
          {/* What to do with this ride — keep it, bin it — is one group. Done leaves the
              screen, which is a different kind of thing, so it keeps its gap. */}
          {isArmed(armed, ride.id) ? (
            <div className="flex items-center">
              <div className={`${LABEL} text-micro pr-[12px] whitespace-nowrap`}>
                {words.prompt}
              </div>
              {/* Ink, not accent: Download TCX is this screen's one accent control, and
                  ink is what the spec gives the single committing action. */}
              <ButtonGroup label={`${words.action}?`}>
                <Button tone="ink" onClick={press}>
                  {words.confirm}
                </Button>
                <Button onClick={() => setArmed(cancelDelete())}>{words.cancel}</Button>
              </ButtonGroup>
            </div>
          ) : (
            <ButtonGroup label="This ride">
              <Button tone="accent" onClick={onExport}>
                Download TCX
              </Button>
              <Button onClick={press}>{words.action}</Button>
            </ButtonGroup>
          )}
          <Button onClick={onDone}>Done</Button>
        </div>
      </header>

      {alert !== null && (
        <div className="mt-[8px] shrink-0">
          <AlertStrip alert={alert} onDismiss={clearAlert} onRetry={clearAlert} />
        </div>
      )}

      <div className="mt-[40px] grid grid-cols-5 gap-[32px]">
        <Stat testId="summary-time" label="Time" value={duration(ride.elapsedS)} />
        <Cell>
          <Stat
            testId="summary-distance"
            label="Distance"
            value={distance(ride.distanceM / 1000)}
            unit="km"
          />
        </Cell>
        <Cell>
          <Stat testId="summary-climbed" label="Climbed" value={elevation(ride.ascentM)} unit="m" />
        </Cell>
        <Cell>
          <Stat testId="summary-avg-power" label="Avg power" value={num(ride.avgPowerW)} unit="W" />
        </Cell>
        <Cell>
          <Stat
            testId="summary-avg-heart-rate"
            label="Avg heart rate"
            value={num(ride.avgHeartRateBpm)}
            unit="bpm"
          />
        </Cell>
      </div>

      <div className="mt-[16px] flex grow flex-col justify-center gap-[6px]">
        {route !== null && profile !== null && (
          <>
            <div className={`${LABEL} text-micro`}>Profile</div>
            <ElevationProfile
              route={route}
              profile={profile}
              climbs={climbs}
              distanceM={ride.distanceM}
              width={CHART_WIDTH}
            />
          </>
        )}
        <div className="mt-[26px]">
          {/* A finished ride has no current reading, so the marker label is left off
              rather than drawn as a dash against a trainer nobody is asking. */}
          <PowerStrip
            samples={power}
            ftpW={ride.settings.ftp}
            startM={0}
            endM={Math.max(ride.distanceM, route?.totalDistanceM ?? ride.distanceM)}
            mode="complete"
            width={CHART_WIDTH}
          />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <GradientKey />
        {/* What the session was ridden under, read back: the mode a workout was held in,
            and the difficulty every ride freezes. */}
        <div className="flex items-end gap-[18px]">
          {mode !== null && <div className={`${LABEL} text-micro`}>{mode}</div>}
          <div className={`${LABEL} text-micro`}>Difficulty {ride.settings.trainerDifficulty}</div>
        </div>
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="border-hairline border-l pl-[32px]">{children}</div>;
}
