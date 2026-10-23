import type { RefObject } from 'react';
import type { Climb } from '../../route/climbs';
import type { ProfileWindow, RouteProfile } from '../../route/profile';
import type { Route } from '../../route/types';
import type {
  ElevationProfileHandle,
  MapZoom,
  PowerSample,
  PowerStripHandle,
  RouteMapHandle,
} from '../charts';
import type { RideSnapshot } from '../store';
import type { PhoneView } from './phone-ride';
import type { RideReadings } from './ride-readings';
import type { ProfileZoom } from './ride-view';

/**
 * What a ride arrangement is given.
 *
 * The ride screen draws one arrangement at a time — desktop today, a phone's portrait
 * beside it, landscape and tablet to come — chosen in JavaScript rather than by hiding
 * one with CSS. The charts are imperatively-updated SVGs held by refs, so a second
 * hidden set would cost a second set of handles and a second set of per-tick work to
 * draw nothing at all.
 *
 * Everything derived arrives here already derived: the readings formatted, the window
 * projected, the samples offset to the lap. An arrangement is a layout, and the moment
 * one of them computes a reading of its own the two start disagreeing about the ride.
 */
export interface RideArrangementProps {
  /** For what no arrangement formats: the ghosts, the difficulty, the alert. */
  snapshot: RideSnapshot;
  readings: RideReadings;

  route: Route;
  profile: RouteProfile;
  climbs: readonly Climb[];
  /** The projected zoom window, or null on the whole-route view. */
  window: ProfileWindow | null;
  /** The recorder's series, offset to the current lap. */
  samples: readonly PowerSample[];
  ftpW: number;

  /** The route name, or the workout's. */
  title: string;
  /** "Loop" or "Lap 2", on a route that comes back to its start. Null otherwise. */
  lapLabel: string | null;
  /** What the primary control reads now: Start, Pause or Resume. */
  pauseLabel: string;

  /**
   * Which chart the one-at-a-time arrangements are showing. Held by the ride screen
   * rather than by the phone layout so that switching re-renders the screen, and the
   * screen's own effect walks the chart that just mounted up to the current distance:
   * a chart seeded at zero and left until the next tick draws a ride that has not
   * started yet for up to a second.
   */
  view: PhoneView;
  onView: (view: PhoneView) => void;

  profileZoom: ProfileZoom;
  onProfileZoom: (zoom: ProfileZoom) => void;
  mapZoom: MapZoom;
  onMapZoom: (zoom: MapZoom) => void;

  /** The handles the ride screen's clock writes to. Shared, never duplicated. */
  profileRef: RefObject<ElevationProfileHandle | null>;
  mapRef: RefObject<RouteMapHandle | null>;
  stripRef: RefObject<PowerStripHandle | null>;

  onProfileHover: (distanceM: number | null) => void;
  onMapHover: (distanceM: number | null) => void;

  onPause: () => void;
  onEnd: () => void;
  onSettings: () => void;
  onDismissAlert: () => void;
  onRetryTrainer: () => void;
}
