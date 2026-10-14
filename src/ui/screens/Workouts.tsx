import { useCallback, useMemo, useState } from 'react';
import type { AlertState } from '../../ride/types';
import type { Workout as StoredWorkout } from '../../storage/types';
import { PlanSparkline } from '../charts';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import {
  ListHeader,
  ListHeaderFrame,
  ListRow,
  ListRowFrame,
  type ListColumns,
} from '../components/ListRow';
import { Segmented } from '../components/Segmented';
import { LABEL, MONO } from '../components/styles';
import { ABSENT } from '../format';
import { AlertStrip } from './AlertStrip';
import { Nav, type ListScreen } from './Nav';
import {
  cancelDelete,
  deleteAlert,
  isArmed,
  pressDelete,
  retainArmed,
  type Armed,
  type DeleteResult,
} from './ride-delete';
import { Selectable } from './Selectable';
import {
  DELETE_WORDING,
  LENGTHS,
  LOADS,
  filterWorkouts,
  lengthLabel,
  loadLabel,
  workoutMeta,
  workoutRows,
  type LengthFilter,
  type LoadFilter,
  type WorkoutRow,
} from './workouts-list';

/**
 * Four columns, not five: the mockup draws plan, workout, length and load, and the fifth
 * slot the other two lists use for a date or a ride count has nothing to put in it. Held
 * at zero rather than given a label, so the grid and the actions gutter still line up
 * with the rides and routes lists above and below it in the nav.
 */
const WORKOUTS_COLUMNS: ListColumns = ['160px', '1fr', '140px', '140px', '0px'];
const LABELS = ['Plan', 'Workout', 'Length', 'Load', ''] as const;

interface WorkoutsProps {
  workouts: readonly StoredWorkout[];
  /** The rider's FTP, for any workout that does not declare one of its own. */
  ftpW: number;
  /** Selecting a row opens it for editing. */
  onOpen: (workoutId: string) => void;
  /** The row action: services.startWorkout, which rides it with no route. */
  onStart: (workoutId: string) => void;
  /** Mints a workout on the starting template and opens the editor on it. */
  onCreate: () => void;
  onDelete: (workoutId: string) => Promise<DeleteResult>;
  onNavigate: (screen: ListScreen) => void;
  onOpenProfile: () => void;
}

/**
 * design/mockups/workouts.html with the two departures SPEC.md records: no intensity
 * column and no intensity filter, because there is no standard mapping from a plan to
 * those words, and no Import .zwo — the accent slot is New workout instead.
 */
export function Workouts({
  workouts,
  ftpW,
  onOpen,
  onStart,
  onCreate,
  onDelete,
  onNavigate,
  onOpenProfile,
}: WorkoutsProps) {
  const [length, setLength] = useState<LengthFilter>('any');
  const [load, setLoad] = useState<LoadFilter>('any');
  const [alert, setAlert] = useState<AlertState | null>(null);
  // Stable: AlertStrip's five-second info timer restarts whenever this identity changes.
  const clearAlert = useCallback(() => setAlert(null), []);

  // One parse per workout per render of the list, which is where the sparkline, the
  // length and the load all come from. Memoised because the plan is parsed from YAML.
  const rows = useMemo(() => workoutRows(workouts, ftpW), [workouts, ftpW]);
  const shown = useMemo(() => filterWorkouts(rows, { length, load }), [rows, length, load]);

  // The confirm state machine is ride-delete.ts, which is about an id and two presses
  // rather than about rides. Narrowed to what is on screen, so changing either filter
  // takes the question with it rather than leaving a row silently armed behind it.
  const [requested, setRequested] = useState<Armed>(null);
  const armed = useMemo(
    () =>
      retainArmed(
        requested,
        shown.map((row) => row.id),
      ),
    [requested, shown],
  );

  const press = useCallback(
    (row: WorkoutRow) => {
      const outcome = pressDelete(armed, row.id);
      setRequested(outcome.armed);
      if (outcome.deleted === null) return;
      void onDelete(outcome.deleted).then((result) => setAlert(deleteAlert(result, row.name)));
    },
    [armed, onDelete],
  );

  return (
    <div className="text-ink flex h-screen flex-col gap-[40px] overflow-hidden px-[64px] py-[44px]">
      <AppHeader
        nav={<Nav value="workouts" onChange={onNavigate} />}
        action={
          <Button tone="accent" onClick={onCreate}>
            New workout
          </Button>
        }
        onSettings={onOpenProfile}
      />

      {/* Cancels the column gap the strip would otherwise sit below, so an alert lands
          directly under the header as it does on the other list screens. */}
      {alert !== null && (
        <div className="-mt-[40px]">
          <AlertStrip alert={alert} onDismiss={clearAlert} onRetry={clearAlert} />
        </div>
      )}

      <div className="-mt-[8px] flex items-end gap-[40px]">
        <div className="flex flex-col gap-[8px]">
          <div className={`${LABEL} text-micro`}>Length</div>
          <Segmented options={LENGTHS} value={length} onChange={setLength} label="Length" />
        </div>
        <div className="flex flex-col gap-[8px]">
          <div className={`${LABEL} text-micro`}>Load</div>
          <Segmented options={LOADS} value={load} onChange={setLoad} label="Load" />
        </div>
      </div>

      <div className="flex min-h-0 grow flex-col">
        <ListHeaderFrame>
          <ListHeader columns={WORKOUTS_COLUMNS} labels={LABELS} />
        </ListHeaderFrame>
        <div className="min-h-0 overflow-y-auto">
          {shown.map((row) => (
            <WorkoutRowView
              key={row.id}
              row={row}
              armed={isArmed(armed, row.id)}
              onOpen={onOpen}
              onStart={onStart}
              onPressDelete={() => press(row)}
              onCancelDelete={() => setRequested(cancelDelete())}
            />
          ))}
          <div className="border-hairline border-t" />
          {shown.length === 0 && (
            <div className={`${LABEL} text-micro pt-[26px]`}>
              {workouts.length === 0 ? 'No workouts yet' : 'No workouts match these filters'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkoutRowView({
  row,
  armed,
  onOpen,
  onStart,
  onPressDelete,
  onCancelDelete,
}: {
  row: WorkoutRow;
  armed: boolean;
  onOpen: (workoutId: string) => void;
  onStart: (workoutId: string) => void;
  onPressDelete: () => void;
  onCancelDelete: () => void;
}) {
  const readable = row.status === 'ok';

  return (
    <ListRowFrame
      actions={
        armed ? (
          <ButtonGroup label={`Delete ${row.name}?`}>
            {/* Ink, not accent: the screen's one accent control is New workout. */}
            <Button tone="ink" onClick={onPressDelete}>
              {DELETE_WORDING.confirm}
            </Button>
            <Button onClick={onCancelDelete}>{DELETE_WORDING.cancel}</Button>
          </ButtonGroup>
        ) : (
          <ButtonGroup label={`${row.name} actions`}>
            {/* A workout that will not parse cannot be ridden, and the control says so
                rather than failing once the rider is on the bike. Editing it still works,
                which is the way out — and is a named control rather than only the row,
                so a broken workout is reachable by the thing that fixes it. */}
            <Button onClick={() => onStart(row.id)} disabled={!readable}>
              Ride
            </Button>
            <Button onClick={() => onOpen(row.id)}>Edit</Button>
            <IconButton label={`Delete ${row.name}`} onClick={onPressDelete}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                aria-hidden="true"
              >
                <path d="M2.5,4 H13.5 M6,4 V2.5 H10 V4 M4,4 V13.5 H12 V4 M6.5,6.5 V11 M9.5,6.5 V11" />
              </svg>
            </IconButton>
          </ButtonGroup>
        )
      }
    >
      <Selectable onSelect={() => onOpen(row.id)}>
        <ListRow
          columns={WORKOUTS_COLUMNS}
          href={`#workout-${row.id}`}
          lead={
            row.status === 'ok' ? <PlanSparkline steps={row.steps} ftpW={row.ftpW} /> : undefined
          }
          leadVariant="sparkline"
          title={row.name}
          meta={workoutMeta(row) ?? undefined}
          cells={[
            row.status === 'ok' ? (
              <Figure key="length" value={lengthLabel(row.totalDurationS)} unit="min" />
            ) : (
              <Absent key="length" />
            ),
            // Mono because DESIGN.md gives every number the mono family; the size and the
            // muted tone are the mockup's, which sets load quieter than length.
            <span key="load" className={`${MONO} text-label text-muted`}>
              {row.status === 'ok' ? loadLabel(row.tss) : ABSENT}
            </span>,
            <span key="spacer" />,
          ]}
          cellsOverlay={
            armed ? (
              <span className={`${LABEL} text-caption text-ink whitespace-nowrap`}>
                {DELETE_WORDING.prompt}
              </span>
            ) : undefined
          }
        />
      </Selectable>
    </ListRowFrame>
  );
}

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <span className={`${MONO} text-title`}>
      {value} <span className="text-label text-muted">{unit}</span>
    </span>
  );
}

/** A figure that cannot be computed because the plan will not parse. */
function Absent() {
  return <span className={`${MONO} text-title text-muted`}>{ABSENT}</span>;
}
