import { useCallback, useMemo, useRef, useState } from 'react';
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
  actionsGutter,
  armedOverflow,
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
  WORKOUT_SUBJECT,
  type Armed,
  type DeleteResult,
} from './ride-delete';
import { Selectable } from './Selectable';
import { workoutImportAlert, type WorkoutImportResult } from './workouts-import';
import {
  DELETE_WORDING,
  LENGTHS,
  LOADS,
  canDeleteWorkout,
  filterWorkouts,
  lengthLabel,
  loadLabel,
  workoutControls,
  workoutFigures,
  workoutMeta,
  workoutRows,
  type LengthFilter,
  type LoadFilter,
  type WorkoutControls,
  type WorkoutRow,
} from './workouts-list';

/**
 * Four columns, not five: the mockup draws plan, workout, length and load, and the fifth
 * slot the other two lists use for a date or a ride count has nothing to put in it. Held
 * at zero rather than given a label, so a row still has three cells and the armed prompt
 * still has three to span.
 *
 * Length holds "120 min" (83 px) and load "188 TSS" (59 px, a size down from the other
 * lists' figures), both measured at the type in use rather than guessed at.
 */
const WORKOUTS_COLUMNS: ListColumns = ['160px', '1fr', '88px', '72px', '0px'];
const LABELS = ['Plan', 'Workout', 'Length', 'Load', ''] as const;

/**
 * This list is the outlier of the three: its rows rest on named buttons rather than
 * glyphs, and a starter's View, Duplicate and Download is 253 px of controls. So it keeps
 * roughly the gutter all three lists once shared, while the rides and routes lists — two
 * and three icons — cut theirs to the width they actually need.
 *
 * Converting Edit and Duplicate to icons would free about 100 px here, and is the single
 * largest win left on this screen. It is not taken because neither mockup draws row
 * actions on this list at all, so both glyphs would have to be invented.
 */
const WORKOUTS_ACTIONS = actionsGutter(253);
/** Zero: Delete and Keep are narrower than the resting group, so nothing overflows. */
const WORKOUTS_ARMED_INSET = armedOverflow(WORKOUTS_ACTIONS, 177);

interface WorkoutsProps {
  workouts: readonly StoredWorkout[];
  /** The rider's FTP, for any workout that does not declare one of its own. */
  ftpW: number;
  /** Selecting a row opens it in the editor — to change, or on a starter to read. */
  onOpen: (workoutId: string) => void;
  /** Copies a workout to one of the rider's own and opens the editor on the copy. */
  onDuplicate: (workoutId: string) => void;
  /** The row action: services.startWorkout, which rides it with no route. */
  onStart: (workoutId: string) => void;
  /** Mints a workout on the starting template and opens the editor on it. */
  onCreate: () => void;
  /** Emits the workout's stored YAML source: see services.exportWorkoutYaml. */
  onDownload: (workoutId: string) => void;
  /** The whole library as one multi-document YAML file. */
  onExportAll: () => Promise<void>;
  onImport: (file: File) => Promise<WorkoutImportResult>;
  onDelete: (workoutId: string) => Promise<DeleteResult>;
  /** The ids this build supplies: see services.builtInWorkouts. A row in here offers
   * neither Edit nor Delete: a starter is the build's record, not the rider's, and
   * seeding would write back any change to it anyway. It offers View and Duplicate. */
  builtIn: ReadonlySet<string>;
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
  onDuplicate,
  onStart,
  onCreate,
  onDownload,
  onExportAll,
  onImport,
  onDelete,
  builtIn,
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
  // rather than about rides. Narrowed to the rows that actually offer Delete, so changing
  // either filter takes the question with it rather than leaving a row silently armed
  // behind it — and a starter cannot be armed at all, however the press was reached.
  const [requested, setRequested] = useState<Armed>(null);
  const deletable = useMemo(
    () => shown.filter((row) => canDeleteWorkout(row.id, builtIn)).map((row) => row.id),
    [shown, builtIn],
  );
  const armed = useMemo(() => retainArmed(requested, deletable), [requested, deletable]);

  const press = useCallback(
    (row: WorkoutRow) => {
      const outcome = pressDelete(armed, row.id);
      setRequested(outcome.armed);
      if (outcome.deleted === null) return;
      void onDelete(outcome.deleted).then((result) =>
        setAlert(deleteAlert(result, row.name, WORKOUT_SUBJECT)),
      );
    },
    [armed, onDelete],
  );

  return (
    <div className="text-ink flex h-screen flex-col gap-[40px] overflow-hidden px-[16px] sm:px-[40px] wide:px-[64px] py-[24px] sm:py-[44px]">
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
        <ListHeaderFrame actionsWidth={WORKOUTS_ACTIONS}>
          <ListHeader columns={WORKOUTS_COLUMNS} labels={LABELS} />
        </ListHeaderFrame>
        <div className="min-h-0 overflow-y-auto">
          {shown.map((row) => (
            <WorkoutRowView
              key={row.id}
              row={row}
              controls={workoutControls(row.id, builtIn)}
              armed={isArmed(armed, row.id)}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onStart={onStart}
              onDownload={onDownload}
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

      <Footer
        empty={workouts.length === 0}
        onExportAll={() => void onExportAll()}
        onImport={(file) =>
          void onImport(file).then((result) => setAlert(workoutImportAlert(result)))
        }
      />
    </div>
  );
}

/**
 * Backup and restore, below the list and outside its scrolling region — the rides list's
 * footer, in the same place and with the same shape, because it does the same job.
 *
 * One departure: nothing here is accent. The rides list puts its one accent on Import,
 * because that screen has no other control that begins something; this screen's is New
 * workout in the header, and DESIGN.md allows one per screen.
 */
function Footer({
  empty,
  onExportAll,
  onImport,
}: {
  empty: boolean;
  onExportAll: () => void;
  onImport: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="border-hairline bg-ground/60 flex shrink-0 items-center gap-[16px] border-t pt-[24px]">
      <Button onClick={onExportAll} disabled={empty}>
        Download all workouts
      </Button>
      <div className="grow" />
      {/* A real button rather than a bare file input: the input carries no box, and a box
          is the whole signal that something is pressable. */}
      <input
        ref={input}
        type="file"
        accept=".yaml,.yml,application/yaml,text/yaml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change event.
          event.target.value = '';
          if (file !== undefined) onImport(file);
        }}
      />
      <Button onClick={() => input.current?.click()}>Import workouts</Button>
    </div>
  );
}

function WorkoutRowView({
  row,
  controls,
  armed,
  onOpen,
  onDuplicate,
  onStart,
  onDownload,
  onPressDelete,
  onCancelDelete,
}: {
  row: WorkoutRow;
  controls: WorkoutControls;
  armed: boolean;
  onOpen: (workoutId: string) => void;
  onDuplicate: (workoutId: string) => void;
  onStart: (workoutId: string) => void;
  onDownload: (workoutId: string) => void;
  onPressDelete: () => void;
  onCancelDelete: () => void;
}) {
  const readable = row.status === 'ok';

  return (
    <ListRowFrame
      actionsWidth={WORKOUTS_ACTIONS}
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
            {/* No Ride control: the row is the button, as it is on the routes list. The
                named actions are the ones the row itself cannot be — and this one is how
                a workout that will not parse is reached, since such a row is deliberately
                not selectable. It says what pressing it does: a starter opens to read. */}
            <Button onClick={() => onOpen(row.id)}>{controls.open}</Button>
            {/* Grey, like everything else here: the screen's one accent is New workout.
                On a starter only — the rider's own workout is changed in place, and a
                fourth control on every row would be the real cost. */}
            {controls.duplicate && <Button onClick={() => onDuplicate(row.id)}>Duplicate</Button>}
            {/* The rides list's glyph, in its position. A workout that will not parse is
                still downloadable: the source is exactly what the rider needs in order to
                fix it somewhere with a better editor than a textarea. */}
            <IconButton label={`Download ${row.name} as YAML`} onClick={() => onDownload(row.id)}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                aria-hidden="true"
              >
                <path d="M8,1.5 V10.5 M4.5,7.5 L8,11 L11.5,7.5 M2,13.5 H14" />
              </svg>
            </IconButton>
            {/* Absent on a starter rather than disabled: a disabled control says this
                could happen and currently cannot, and deleting one never can. View,
                Duplicate and Download stay, which is what a starter is actually for. */}
            {controls.delete && (
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
            )}
          </ButtonGroup>
        )
      }
    >
      {/* A workout that will not parse has nothing to ride, so its row is inert rather
          than a link that fails once the rider is on the bike. Edit is how it is reached. */}
      <Selectable onSelect={readable ? () => onStart(row.id) : null}>
        <ListRow
          columns={WORKOUTS_COLUMNS}
          href={readable ? `#workout-${row.id}` : undefined}
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
          // Below 1100 px length and load fold into one mono line under the name — the
          // routes list's rule, with the two figures this row has.
          folded={workoutFigures(row)}
          cellsOverlay={
            armed ? (
              <span className={`${LABEL} text-caption text-ink whitespace-nowrap`}>
                {DELETE_WORDING.prompt}
              </span>
            ) : undefined
          }
          overlayInset={WORKOUTS_ARMED_INSET}
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
