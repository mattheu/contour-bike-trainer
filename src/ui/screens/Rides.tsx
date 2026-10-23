import { useCallback, useMemo, useRef, useState } from 'react';
import type { AlertState } from '../../ride/types';
import type { Ride, Route } from '../../storage/types';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import {
  ListHeader,
  ListHeaderFrame,
  ListRow,
  ListRowFrame,
  RIDES_COLUMNS,
} from '../components/ListRow';
import { Segmented } from '../components/Segmented';
import { LABEL, MONO } from '../components/styles';
import { distance, duration, num } from '../format';
import { AlertStrip } from './AlertStrip';
import { Nav, type ListScreen } from './Nav';
import {
  ALL_ROUTES,
  ALL_WORKOUTS,
  INITIAL_RIDE_FILTER,
  PERIODS,
  RIDE_TYPES,
  filterRides,
  periodSummary,
  raceableRouteId,
  rideDate,
  rideTitle,
  riddenRoutes,
  riddenWorkouts,
  selectType,
  type RideFilter,
} from './rides-list';
import {
  cancelDelete,
  deleteAlert,
  deleteWording,
  isArmed,
  pressDelete,
  retainArmed,
  type Armed,
  type DeleteResult,
} from './ride-delete';
import { importAlert, type ImportResult } from './rides-import';
import { Selectable } from './Selectable';

const LABELS = ['Date', 'Route', 'Distance', 'Time', 'Avg power'] as const;

interface RidesProps {
  rides: readonly Ride[];
  /** The routes still installed, which is what decides whether a ride can be raced. */
  routes: readonly Route[];
  onOpen: (rideId: string) => void;
  /** Starts that route with that ride in the picked slot: see services.startRide. */
  onRace: (routeId: string, rideId: string) => void;
  onExport: (rideId: string) => void;
  /** The whole history as one ZIP. */
  onExportAll: () => Promise<void>;
  onImport: (file: File) => Promise<ImportResult>;
  /** Takes the ride's samples with it: see services.deleteRide. */
  onDelete: (rideId: string) => Promise<DeleteResult>;
  onNavigate: (screen: ListScreen) => void;
  onOpenProfile: () => void;
}

/**
 * design/mockups/rides.html, with the type filter the mockup draws and the route or
 * workout filter that hangs off it.
 *
 * The header, filters and column labels are fixed rows and the list scrolls inside its
 * own region. DESIGN.md's no-scrolling rule is about page chrome; a history that grows
 * without bound is the one thing on the screen that cannot be made to fit.
 */
export function Rides({
  rides,
  routes,
  onOpen,
  onRace,
  onExport,
  onExportAll,
  onImport,
  onDelete,
  onNavigate,
  onOpenProfile,
}: RidesProps) {
  // One value, because the filters are not independent: selectType drops the route or
  // workout that hangs off the type being left. What matches lives in rides-list.ts.
  const [filter, setFilter] = useState<RideFilter>(INITIAL_RIDE_FILTER);
  const [alert, setAlert] = useState<AlertState | null>(null);
  // Stable: AlertStrip's five-second info timer restarts whenever this identity changes.
  const clearAlert = useCallback(() => setAlert(null), []);

  const routeFilter = useMemo(() => riddenRoutes(rides), [rides]);
  /** Rebuilt only when a route is added or removed, so the per-row check is a lookup. */
  const installed = useMemo(() => new Set(routes.map((route) => route.id)), [routes]);
  const workouts = useMemo(() => riddenWorkouts(rides), [rides]);
  const shown = useMemo(() => filterRides(rides, filter), [rides, filter]);
  // Totals whatever is on screen, under every combination of the four.
  const summary = useMemo(() => periodSummary(shown, filter.period), [shown, filter.period]);

  // The confirm state machine is ride-delete.ts; this holds its one value and nothing
  // else. Narrowed to what is on screen, so a filter change takes the question with it.
  const [requested, setRequested] = useState<Armed>(null);
  const armed = useMemo(
    () =>
      retainArmed(
        requested,
        shown.map((ride) => ride.id),
      ),
    [requested, shown],
  );

  const press = useCallback(
    (ride: Ride) => {
      const outcome = pressDelete(armed, ride.id);
      setRequested(outcome.armed);
      if (outcome.deleted === null) return;
      const { title } = rideTitle(ride);
      void onDelete(outcome.deleted).then((result) => setAlert(deleteAlert(result, title)));
    },
    [armed, onDelete],
  );

  return (
    <div className="text-ink flex h-screen flex-col gap-[40px] overflow-hidden px-[64px] py-[44px]">
      <AppHeader
        nav={<Nav value="rides" onChange={onNavigate} />}
        action={<div className={`${MONO} text-label text-muted`}>{summary}</div>}
        onSettings={onOpenProfile}
      />

      {/* Cancels the column gap the strip would otherwise sit below, so an alert lands
          directly under the header as it does on the ride screen. */}
      {alert !== null && (
        <div className="-mt-[40px]">
          <AlertStrip alert={alert} onDismiss={clearAlert} onRetry={clearAlert} />
        </div>
      )}

      <div className="-mt-[8px] flex items-end gap-[40px]">
        <div className="flex flex-col gap-[8px]">
          <div className={`${LABEL} text-micro`}>Type</div>
          <Segmented
            options={RIDE_TYPES}
            value={filter.type}
            onChange={(type) => setFilter(selectType(filter, type))}
            label="Type"
          />
        </div>
        {filter.type === 'routes' && (
          <FilterSelect
            id="ride-route-filter"
            label="Route"
            allValue={ALL_ROUTES}
            allLabel="All routes"
            options={routeFilter}
            value={filter.routeId}
            onChange={(routeId) => setFilter({ ...filter, routeId })}
          />
        )}
        {filter.type === 'workouts' && (
          <FilterSelect
            id="ride-workout-filter"
            label="Workout"
            allValue={ALL_WORKOUTS}
            allLabel="All workouts"
            options={workouts}
            value={filter.workoutId}
            onChange={(workoutId) => setFilter({ ...filter, workoutId })}
          />
        )}
        {/* Period is pinned to the far end, so the dependent filter appearing and
            disappearing is absorbed by the gap rather than moving anything. */}
        <div className="grow" />
        <div className="flex flex-col gap-[8px]">
          <div className={`${LABEL} text-micro`}>Period</div>
          <Segmented
            options={PERIODS}
            value={filter.period}
            onChange={(period) => setFilter({ ...filter, period })}
            label="Period"
          />
        </div>
      </div>

      <div className="flex min-h-0 grow flex-col">
        <ListHeaderFrame>
          <ListHeader columns={RIDES_COLUMNS} labels={LABELS} />
        </ListHeaderFrame>
        <div className="min-h-0 overflow-y-auto">
          {shown.map((ride) => (
            <RideRow
              key={ride.id}
              ride={ride}
              armed={isArmed(armed, ride.id)}
              raceRouteId={raceableRouteId(ride, installed)}
              onOpen={onOpen}
              onRace={onRace}
              onExport={onExport}
              onPressDelete={() => press(ride)}
              onCancelDelete={() => setRequested(cancelDelete())}
            />
          ))}
          <div className="border-hairline border-t" />
          {shown.length === 0 && (
            <div className={`${LABEL} text-micro pt-[26px]`}>No rides match these filters</div>
          )}
        </div>
      </div>

      <Footer
        empty={rides.length === 0}
        onExportAll={() => void onExportAll()}
        onImport={(file) => void onImport(file).then((result) => setAlert(importAlert(result)))}
      />
    </div>
  );
}

/**
 * The route and workout filters, which differ only in their words, their options and the
 * sentinel that means "don't narrow". Passed in rather than inferred, so the component
 * never needs to know which of the two lists it is showing.
 */
function FilterSelect({
  id,
  label,
  allValue,
  allLabel,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  allValue: string;
  allLabel: string;
  options: readonly { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      <label htmlFor={id} className={`${LABEL} text-micro`}>
        {label}
      </label>
      {/* Chrome draws the native arrow against the border box, so padding cannot
          move it. Ours is a hairline mark that follows the tokens instead. */}
      <div className="text-muted relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${MONO} border-hairline text-ink text-label bg-ground/60 min-h-[44px] w-full min-w-[240px] appearance-none border py-[10px] pr-[36px] pl-[14px]`}
        >
          <option value={allValue}>{allLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute top-1/2 right-[14px] -translate-y-1/2"
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0.5,0.5 L5,5 L9.5,0.5" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Backup and restore, below the list and outside its scrolling region. The accent is on
 * import: DESIGN.md gives the list screens one accent control and that is the one that
 * brings data in. bg-ground/60 rather than solid ground, because the contour field runs
 * behind every surface and chrome that merely separates should not black it out.
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
        Download all rides
      </Button>
      <div className="grow" />
      {/* A real button rather than a bare file input: the input carries no box, and a box
          is the whole signal that something is pressable. */}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change event.
          event.target.value = '';
          if (file !== undefined) onImport(file);
        }}
      />
      {/* Grey. Restoring a backup is housekeeping, not the thing this screen is for —
          and the rides list has no action that begins a ride, so it carries no accent
          at all. DESIGN.md's Tones line still cites Import as an accent example. */}
      <Button onClick={() => input.current?.click()}>Import rides</Button>
    </div>
  );
}

function RideRow({
  ride,
  armed,
  raceRouteId,
  onOpen,
  onRace,
  onExport,
  onPressDelete,
  onCancelDelete,
}: {
  ride: Ride;
  armed: boolean;
  /** The route to race this ride over, or null where there is none to race it over. */
  raceRouteId: string | null;
  onOpen: (rideId: string) => void;
  onRace: (routeId: string, rideId: string) => void;
  onExport: (rideId: string) => void;
  onPressDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { title, meta } = rideTitle(ride);

  return (
    <ListRowFrame
      actions={
        armed ? (
          <DeleteButtons title={title} onConfirm={onPressDelete} onCancel={onCancelDelete} />
        ) : (
          <ButtonGroup label={`${title} actions`}>
            {/* Two riders: a filled dot for you beside a hollow one for the ghost, which
                is the hollow-muted treatment every ghost symbol carries. First in the
                group because it is the only one of the three that starts something.
                DESIGN.md > Ghosts; the glyph is design/mockups/rides.html's. */}
            {raceRouteId !== null && (
              <IconButton
                label="Race this ride"
                title="Race this ride"
                onClick={() => onRace(raceRouteId, ride.id)}
              >
                <svg
                  width="22"
                  height="14"
                  viewBox="0 0 22 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="4" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="7" r="4" />
                </svg>
              </IconButton>
            )}
            <IconButton label={`Download ${title} as TCX`} onClick={() => onExport(ride.id)}>
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
            <IconButton label={`Delete ${title}`} onClick={onPressDelete}>
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
      <Selectable onSelect={() => onOpen(ride.id)}>
        <ListRow
          columns={RIDES_COLUMNS}
          href={`#ride-${ride.id}`}
          lead={<span className={`${MONO} text-label text-muted`}>{rideDate(ride.startedAt)}</span>}
          title={title}
          meta={meta ?? undefined}
          cells={[
            <Figure key="distance" value={distance(ride.distanceM / 1000)} unit="km" />,
            <span key="time" className={`${MONO} text-title`}>
              {duration(ride.elapsedS)}
            </span>,
            <Figure key="power" value={num(ride.avgPowerW)} unit="W" />,
          ]}
          cellsOverlay={
            armed ? (
              <span className={`${LABEL} text-caption text-ink whitespace-nowrap`}>
                {deleteWording('history').prompt}
              </span>
            ) : undefined
          }
        />
      </Selectable>
    </ListRowFrame>
  );
}

/**
 * The armed state of one row. The wording is deleteWording('history'): a row in the
 * history is a ride the rider no longer holds in mind, so it says plainly that this is
 * permanent — once, briefly, with the export control a hand's width away.
 *
 * The pair shares its middle edge, as DESIGN.md asks of any pair, and the confirm is
 * boxed in ink rather than accent: the screen's one accent control is Import.
 */
/**
 * The armed pair. The question itself sits in the row, where the figures were: the row
 * becomes the question rather than growing a second line beside it, so nothing moves and
 * you can still see which ride's date and name you are about to lose.
 *
 * Boxed in ink rather than accent — the screen's one accent control is Import.
 */
function DeleteButtons({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const words = deleteWording('history');

  return (
    <ButtonGroup label={`Delete ${title}?`}>
      <Button tone="ink" onClick={onConfirm}>
        {words.confirm}
      </Button>
      <Button onClick={onCancel}>{words.cancel}</Button>
    </ButtonGroup>
  );
}

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <span className={`${MONO} text-title`}>
      {value} <span className="text-label text-muted">{unit}</span>
    </span>
  );
}
