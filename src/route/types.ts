/** A GPX track point with its cumulative distance along the route. */
export interface RoutePoint {
  lat: number;
  lon: number;
  eleM: number;
  /** Cumulative horizontal distance from the route start, metres. */
  distM: number;
}

export interface Route {
  points: RoutePoint[];
  totalDistanceM: number;
  totalAscentM: number;
}
