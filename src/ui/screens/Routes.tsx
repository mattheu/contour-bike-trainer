import { useMemo } from 'react';
import { loadRouteGeometry } from '../../ride/routes';
import type { Ride, Route as StoredRoute } from '../../storage/types';
import { Sparkline } from '../charts';
import { AppHeader } from '../components/AppHeader';
import { ListHeader, ListRow, ListRowFrame, ROUTES_COLUMNS } from '../components/ListRow';
import { MONO } from '../components/styles';
import { distance, elevation } from '../format';
import { Nav, type ListScreen } from './Nav';
import { Selectable } from './Selectable';
import { rideCounts, riddenLabel, sortRoutes } from './routes-list';

const LABELS = ['Profile', 'Route', 'Distance', 'Gain', 'Ridden'] as const;

interface RoutesProps {
  routes: readonly StoredRoute[];
  rides: readonly Ride[];
  onSelect: (routeId: string) => void;
  onNavigate: (screen: ListScreen) => void;
  onOpenProfile: () => void;
}

/**
 * design/mockups/routes.html, without the accent Import GPX button: phase 2 rides the
 * bundled set, so there is nothing to import and therefore no accent control here.
 */
export function Routes({ routes, rides, onSelect, onNavigate, onOpenProfile }: RoutesProps) {
  const ordered = useMemo(() => sortRoutes(routes), [routes]);
  const counts = useMemo(() => rideCounts(rides), [rides]);

  return (
    <div className="text-ink flex h-screen flex-col gap-[40px] overflow-hidden px-[64px] py-[44px]">
      <AppHeader nav={<Nav value="routes" onChange={onNavigate} />} onSettings={onOpenProfile} />

      <div className="flex min-h-0 flex-col">
        <ListHeader columns={ROUTES_COLUMNS} labels={LABELS} />
        <div className="min-h-0 overflow-y-auto">
          {ordered.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              ridden={riddenLabel(counts.get(route.id) ?? 0)}
              onSelect={onSelect}
            />
          ))}
          <div className="border-hairline border-t" />
        </div>
      </div>
    </div>
  );
}

function RouteRow({
  route,
  ridden,
  onSelect,
}: {
  route: StoredRoute;
  ridden: string;
  onSelect: (routeId: string) => void;
}) {
  // Parsing a route's GPX is thousands of points; the sparkline is the one thing on this
  // screen that needs them, so it is parsed once per route and held by the memo.
  const geometry = useMemo(() => loadRouteGeometry(route.id), [route.id]);

  return (
    // No actions on a route row, so the frame holds the rule and nothing else.
    <ListRowFrame>
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
