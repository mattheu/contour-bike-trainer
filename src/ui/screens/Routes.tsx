import { useCallback, useMemo, useState } from 'react';
import { loadRouteGeometry } from '../../ride/routes';
import type { AlertState } from '../../ride/types';
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
import { ROUTE_DELETE_WORDING, rideCounts, riddenLabel, sortRoutes } from './routes-list';
import { Selectable } from './Selectable';

const LABELS = ['Profile', 'Route', 'Distance', 'Gain', 'Ridden'] as const;

interface RoutesProps {
  routes: readonly StoredRoute[];
  rides: readonly Ride[];
  onSelect: (routeId: string) => void;
  /** Emits the route's bundled GPX: see services.exportRouteGpx. */
  onDownload: (routeId: string) => void;
  /** Takes nothing with it — a ride on this route keeps its own name and geometry. */
  onDelete: (routeId: string) => Promise<DeleteResult>;
  onNavigate: (screen: ListScreen) => void;
  onOpenProfile: () => void;
}

/**
 * design/mockups/routes.html, without the accent Import GPX button the mockup draws.
 *
 * There is nothing to import: a stored route is metadata over a GPX that lives in the
 * build, so an import would have to make routes own their own file, which is a different
 * feature and a later phase. Download exists anyway, per row — the file is already there
 * and handing it back costs nothing. There is no Download all for the same reason there
 * is no import: every one of them is in the repository already.
 *
 * So no accent control here. DESIGN.md gives a list screen one, for the action that begins
 * something, and on this screen that is the row itself.
 */
export function Routes({
  routes,
  rides,
  onSelect,
  onDownload,
  onDelete,
  onNavigate,
  onOpenProfile,
}: RoutesProps) {
  const ordered = useMemo(() => sortRoutes(routes), [routes]);
  const counts = useMemo(() => rideCounts(rides), [rides]);
  const [alert, setAlert] = useState<AlertState | null>(null);
  // Stable: AlertStrip's five-second info timer restarts whenever this identity changes.
  const clearAlert = useCallback(() => setAlert(null), []);

  // The confirm state machine is ride-delete.ts, which is about an id and two presses
  // rather than about rides. Narrowed to what is on screen, so a route that leaves the
  // list takes its question with it rather than staying armed behind it.
  const [requested, setRequested] = useState<Armed>(null);
  const armed = useMemo(
    () =>
      retainArmed(
        requested,
        ordered.map((route) => route.id),
      ),
    [requested, ordered],
  );

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

      <div className="flex min-h-0 flex-col">
        <ListHeaderFrame>
          <ListHeader columns={ROUTES_COLUMNS} labels={LABELS} />
        </ListHeaderFrame>
        <div className="min-h-0 overflow-y-auto">
          {ordered.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              ridden={riddenLabel(counts.get(route.id) ?? 0)}
              armed={isArmed(armed, route.id)}
              onSelect={onSelect}
              onDownload={onDownload}
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
    </div>
  );
}

function RouteRow({
  route,
  ridden,
  armed,
  onSelect,
  onDownload,
  onPressDelete,
  onCancelDelete,
}: {
  route: StoredRoute;
  ridden: string;
  armed: boolean;
  onSelect: (routeId: string) => void;
  onDownload: (routeId: string) => void;
  onPressDelete: () => void;
  onCancelDelete: () => void;
}) {
  // Parsing a route's GPX is thousands of points; the sparkline is the one thing on this
  // screen that needs them, so it is parsed once per route and held by the memo.
  const geometry = useMemo(() => loadRouteGeometry(route.id), [route.id]);

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
            <IconButton
              label={`Download ${route.name} as GPX`}
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
          </ButtonGroup>
        )
      }
    >
      <Selectable onSelect={() => onSelect(route.id)}>
        <ListRow
          columns={ROUTES_COLUMNS}
          href={`#route-${route.id}`}
          lead={<Sparkline route={geometry} />}
          leadVariant="sparkline"
          title={route.name}
          meta={route.region}
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

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <span className={`${MONO} text-title`}>
      {value} <span className="text-label text-muted">{unit}</span>
    </span>
  );
}
