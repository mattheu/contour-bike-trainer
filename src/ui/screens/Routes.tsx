import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AlertState } from '../../ride/types';
import { routeKind, type RouteKind } from '../../route/loop';
import type { Route as RouteGeometry } from '../../route/types';
import type { Ride, Route as StoredRoute } from '../../storage/types';
import { Sparkline } from '../charts';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import {
  ListHeader,
  ListHeaderFrame,
  ListRow,
  ListRowFrame,
  ROUTES_COLUMNS,
} from '../components/ListRow';
import { RouteKindMark } from '../components/RouteKindMark';
import { LABEL, MONO } from '../components/styles';
import { distance, elevation } from '../format';
import { AlertStrip } from './AlertStrip';
import { Nav, type ListScreen } from './Nav';
import {
  cancelDelete,
  deleteAlert,
  isArmed,
  pressDelete,
  retainArmed,
  ROUTE_SUBJECT,
  type Armed,
  type DeleteResult,
} from './ride-delete';
import { routeImportAlert, type RouteImportResult } from './routes-import';
import {
  ROUTE_DELETE_WORDING,
  canRemoveRoute,
  descriptionLine,
  labelRow,
  rideCounts,
  riddenLabel,
  sortRoutes,
} from './routes-list';
import { Selectable } from './Selectable';
import { useAsync } from './use-async';

const LABELS = ['Profile', 'Route', 'Distance', 'Gain', 'Ridden'] as const;

/**
 * What a row says instead of its region when this install has no GPX for it: a record
 * written by a build that kept routes in the bundle, whose file has since left it. It
 * keeps its name, its figures and its ride count, and it cannot be ridden.
 */
const NO_SOURCE = 'No GPX in this install';

interface RoutesProps {
  routes: readonly StoredRoute[];
  rides: readonly Ride[];
  onSelect: (routeId: string) => void;
  /** Emits the route's stored GPX: see services.exportRouteGpx. */
  onDownload: (routeId: string) => void;
  /** Every route as one GPX, each its own track. */
  onExportAll: () => Promise<void>;
  onImport: (file: File) => Promise<RouteImportResult>;
  /**
   * The points for one route's sparkline. A loader rather than geometry on the record,
   * because parsing a route is thousands of points and reading its GPX is async: see
   * services.loadRouteGeometry. Null means this install cannot read that route.
   */
  onLoadGeometry: (routeId: string) => Promise<RouteGeometry | null>;
  /** Takes nothing with it — a ride on this route keeps its own name and geometry. */
  onDelete: (routeId: string) => Promise<DeleteResult>;
  /** The ids this build supplies: see services.builtInRoutes. A row in here offers no
   * Remove control, because a route that came with the install is not the rider's to
   * remove and seeding would write it back anyway. */
  builtIn: ReadonlySet<string>;
  onNavigate: (screen: ListScreen) => void;
  onOpenProfile: () => void;
}

/**
 * design/mockups/routes.html, with the import the mockup draws — a route carries its own
 * GPX now, so importing one is just storing a file, and the footer is the same backup and
 * restore pair the rides and workouts lists already have.
 *
 * One departure from the mockup, which draws Import as the accent control: it is grey
 * here. DESIGN.md allows a list screen one accent, for the action that begins something,
 * and on this screen that is the row itself — pressing a route is what starts a ride.
 * The rides list made the same call on the same reasoning.
 */
export function Routes({
  routes,
  rides,
  onSelect,
  onDownload,
  onExportAll,
  onImport,
  onLoadGeometry,
  onDelete,
  builtIn,
  onNavigate,
  onOpenProfile,
}: RoutesProps) {
  const ordered = useMemo(() => sortRoutes(routes), [routes]);
  const counts = useMemo(() => rideCounts(rides), [rides]);
  const [alert, setAlert] = useState<AlertState | null>(null);
  // Stable: AlertStrip's five-second info timer restarts whenever this identity changes.
  const clearAlert = useCallback(() => setAlert(null), []);

  // The confirm state machine is ride-delete.ts, which is about an id and two presses
  // rather than about rides. Narrowed to the rows that actually offer Remove, so a route
  // that leaves the list takes its question with it rather than staying armed behind it —
  // and a built-in route cannot be armed at all, however the press was reached.
  const [requested, setRequested] = useState<Armed>(null);
  const removable = useMemo(
    () => ordered.filter((route) => canRemoveRoute(route.id, builtIn)).map((route) => route.id),
    [ordered, builtIn],
  );
  const armed = useMemo(() => retainArmed(requested, removable), [requested, removable]);

  const press = useCallback(
    (route: StoredRoute) => {
      const outcome = pressDelete(armed, route.id);
      setRequested(outcome.armed);
      if (outcome.deleted === null) return;
      void onDelete(outcome.deleted).then((result) =>
        setAlert(deleteAlert(result, route.name, ROUTE_SUBJECT)),
      );
    },
    [armed, onDelete],
  );

  return (
    <div className="text-ink flex h-screen flex-col gap-[40px] overflow-hidden px-[64px] py-[44px]">
      <AppHeader nav={<Nav value="routes" onChange={onNavigate} />} onSettings={onOpenProfile} />

      {/* Cancels the column gap the strip would otherwise sit below, so an alert lands
          directly under the header as it does on the other list screens. */}
      {alert !== null && (
        <div className="-mt-[40px]">
          <AlertStrip alert={alert} onDismiss={clearAlert} onRetry={clearAlert} />
        </div>
      )}

      <div className="flex min-h-0 grow flex-col">
        <ListHeaderFrame>
          <ListHeader columns={ROUTES_COLUMNS} labels={LABELS} />
        </ListHeaderFrame>
        <div className="min-h-0 overflow-y-auto">
          {ordered.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              ridden={riddenLabel(counts.get(route.id) ?? 0)}
              removable={canRemoveRoute(route.id, builtIn)}
              armed={isArmed(armed, route.id)}
              onSelect={onSelect}
              onDownload={onDownload}
              onLoadGeometry={onLoadGeometry}
              onPressDelete={() => press(route)}
              onCancelDelete={() => setRequested(cancelDelete())}
            />
          ))}
          <div className="border-hairline border-t" />
          {ordered.length === 0 && (
            <div className={`${LABEL} text-micro pt-[26px]`}>No routes in this install</div>
          )}
        </div>
      </div>

      <Footer
        empty={ordered.length === 0}
        onExportAll={() => void onExportAll()}
        onImport={(file) =>
          void onImport(file).then((result) => setAlert(routeImportAlert(result)))
        }
      />
    </div>
  );
}

/**
 * Backup and restore, below the list and outside its scrolling region — the same footer
 * in the same place as the rides and workouts lists, because it does the same job.
 *
 * Nothing here is accent, which is this screen's one departure from the mockup: a list
 * screen gets one accent control and the row already is it.
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
        Download all routes
      </Button>
      <div className="grow" />
      {/* A real button rather than a bare file input: the input carries no box, and a box
          is the whole signal that something is pressable. */}
      <input
        ref={input}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change event.
          event.target.value = '';
          if (file !== undefined) onImport(file);
        }}
      />
      <Button onClick={() => input.current?.click()}>Import routes</Button>
    </div>
  );
}

function RouteRow({
  route,
  ridden,
  removable,
  armed,
  onSelect,
  onDownload,
  onLoadGeometry,
  onPressDelete,
  onCancelDelete,
}: {
  route: StoredRoute;
  ridden: string;
  removable: boolean;
  armed: boolean;
  onSelect: (routeId: string) => void;
  onDownload: (routeId: string) => void;
  onLoadGeometry: (routeId: string) => Promise<RouteGeometry | null>;
  onPressDelete: () => void;
  onCancelDelete: () => void;
}) {
  // Reading a route's GPX is async and parsing it is thousands of points; the sparkline
  // is the one thing on this screen that needs either, so each row loads its own and the
  // list renders without waiting on any of them. Wrapped rather than held bare, because
  // useAsync returns null until it resolves and null is also a real answer here.
  const loaded = useAsync(async () => ({ geometry: await onLoadGeometry(route.id) }), [route.id]);
  const geometry = loaded?.geometry ?? null;
  // Still loading counts as rideable: the row is not dead while it waits, and a route
  // that turns out to have no geometry says so from services.startRide instead.
  const rideable = loaded === null || loaded.geometry !== null;
  // Free: the row already parses its own geometry for the sparkline, and what shape the
  // track is is a question about those same points. Null while it loads — the row is
  // honest about not knowing yet rather than calling everything a point to point.
  const kind = geometry === null ? null : routeKind(geometry);
  const description = descriptionLine(route);
  // Decided here rather than inside the row, because an empty label row is not an empty
  // element: ListRow's slots are a flex column, so one that rendered nothing would still
  // cost its 4 px of gap under the name. A route with neither a known kind nor a region
  // gets no slot at all.
  const labels = labelRow(kind, route.region);

  return (
    <ListRowFrame
      actions={
        armed ? (
          <ButtonGroup label={`${ROUTE_DELETE_WORDING.action} ${route.name}?`}>
            {/* Ink, not accent: this screen's accent belongs to starting a ride, which
                is the row itself. */}
            <Button tone="ink" onClick={onPressDelete}>
              {ROUTE_DELETE_WORDING.confirm}
            </Button>
            <Button onClick={onCancelDelete}>{ROUTE_DELETE_WORDING.cancel}</Button>
          </ButtonGroup>
        ) : (
          <ButtonGroup label={`${route.name} actions`}>
            {/* The same two glyphs as the rides list, in the same order: a list row's
                actions should not have to be relearned per screen. */}
            {/* Disabled where there is nothing to hand back: a route with no GPX in
                this install has no file to download. */}
            <IconButton
              label={`Download ${route.name} as GPX`}
              disabled={!rideable}
              onClick={() => onDownload(route.id)}
            >
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
            {/* Absent on a built-in route rather than disabled: a disabled control says
                this could happen and currently cannot, and removing one never can. */}
            {removable && (
              <IconButton
                label={`${ROUTE_DELETE_WORDING.action} ${route.name}`}
                onClick={onPressDelete}
              >
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
      {/* A route this install has no GPX for cannot be ridden, so its row is inert rather
          than a link that fails once the rider is on the bike — the same treatment the
          workouts list gives a plan that will not parse, down to saying why in the line
          its region would use. Remove is the way out where the row offers it, which is
          any route the build does not supply. */}
      <Selectable onSelect={rideable ? () => onSelect(route.id) : null}>
        <ListRow
          columns={ROUTES_COLUMNS}
          href={rideable ? `#route-${route.id}` : undefined}
          lead={geometry === null ? undefined : <Sparkline route={geometry} />}
          leadVariant="sparkline"
          title={route.name}
          meta={rideable ? meta(kind, labels) : NO_SOURCE}
          metaVariant="label"
          // The mockup's row, which is three lines deep. Set for every row rather than
          // only the described ones, so a route with no description is the same height as
          // the one above it.
          paddingY={22}
          // Absent rather than blank where a route has none, which is most imported ones:
          // the row closes up instead of holding an empty line open under the name.
          description={description ?? undefined}
          cells={[
            <Figure key="distance" value={distance(route.totalDistanceM / 1000)} unit="km" />,
            <Figure key="gain" value={elevation(route.totalAscentM)} unit="m" />,
            <span key="ridden" className="text-label text-muted font-sans">
              {ridden}
            </span>,
          ]}
          cellsOverlay={
            armed ? (
              <span className={`${LABEL} text-caption text-ink whitespace-nowrap`}>
                {ROUTE_DELETE_WORDING.prompt}
              </span>
            ) : undefined
          }
        />
      </Selectable>
    </ListRowFrame>
  );
}

/**
 * The micro label row: the route's kind as a glyph and a word, then where it is, parted by
 * a hairline middot — design/mockups/routes.html.
 *
 * Both halves can be missing. The kind is unknown until the row's geometry resolves, and
 * an imported GPX need not name a region; a route with neither gets no label row at all,
 * because an empty line under the name is a worse answer than no line.
 */
function meta(kind: RouteKind | null, words: readonly string[]): ReactNode {
  if (words.length === 0) return undefined;

  return (
    <span className="flex items-center gap-[6px]">
      {kind !== null && <RouteKindMark kind={kind} />}
      {words.map((word, index) => (
        <Fragment key={word}>
          {index > 0 && <span className="text-hairline">·</span>}
          <span>{word}</span>
        </Fragment>
      ))}
    </span>
  );
}

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <span className={`${MONO} text-title`}>
      {value} <span className="text-label text-muted">{unit}</span>
    </span>
  );
}
