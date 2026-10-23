import { memo, type RefObject } from 'react';
import type { Climb } from '../../route/climbs';
import type { ProfileWindow, RouteProfile } from '../../route/profile';
import type { Route } from '../../route/types';
import {
  ElevationProfile,
  RouteMap,
  type ElevationProfileHandle,
  type GhostMetrics,
  type MapZoom,
  type RouteMapHandle,
} from '../charts';

/**
 * The profile and the map are memoised on their geometry alone and seeded at zero: the
 * ride screen walks them forward by hand once a second through their handles, so neither
 * SVG tree is rebuilt on every snapshot. The power strip stays outside because its zone
 * washes are props by design — their element count changes as new zones are entered.
 *
 * Shared by every arrangement rather than written into each: a phone draws the same two
 * charts at different sizes, and a memo boundary written twice is one that eventually
 * only holds on one of the screens.
 */

export const ProfileChart = memo(function ProfileChart({
  route,
  profile,
  climbs,
  window,
  width,
  height,
  handleRef,
  onHover,
  ghostMetrics,
}: {
  route: Route;
  profile: RouteProfile;
  climbs: readonly Climb[];
  window: ProfileWindow | null;
  width: number;
  height: number;
  handleRef: RefObject<ElevationProfileHandle | null>;
  onHover: (hoveredM: number | null) => void;
  ghostMetrics?: GhostMetrics;
}) {
  return (
    <ElevationProfile
      ref={handleRef}
      route={route}
      profile={profile}
      climbs={climbs}
      window={window}
      width={width}
      height={height}
      distanceM={0}
      onHover={onHover}
      ghostMetrics={ghostMetrics}
    />
  );
});

export const MapChart = memo(function MapChart({
  route,
  zoom,
  width,
  height,
  handleRef,
  onHover,
  ghostMetrics,
}: {
  route: Route;
  zoom: MapZoom;
  width: number;
  height: number;
  handleRef: RefObject<RouteMapHandle | null>;
  onHover: (hoveredM: number | null) => void;
  ghostMetrics?: GhostMetrics;
}) {
  return (
    <RouteMap
      ref={handleRef}
      route={route}
      zoom={zoom}
      width={width}
      height={height}
      distanceM={0}
      onHover={onHover}
      ghostMetrics={ghostMetrics}
    />
  );
});
