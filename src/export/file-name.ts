/**
 * What a downloaded file is called.
 *
 * Every file the app hands the browser is named here, in one place, because the rider
 * sees these side by side in a downloads folder and the only thing that makes them
 * recognisable as a set is that they agree. The existing two — contour-2026-10-14-0930.tcx
 * and contour-rides-2026-10-14.zip — set the pattern these follow: the contour- prefix,
 * then what it is, lowercase and hyphenated.
 *
 * Ride exports are named from their start time because a ride has no name. A route or a
 * workout has one, and it is what the rider will look for.
 */

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A record's name as a file name: lowercase, runs of anything else collapsed to a single
 * hyphen. Named after what the rider sees in the list rather than after the id, which is
 * a UUID or a manifest key and means nothing outside the app.
 *
 * The fallback is not decoration. A name made entirely of punctuation, or written in a
 * script this slug cannot carry, leaves nothing behind — and an extension on its own is
 * not a file name.
 */
export function contourFileName(name: string, extension: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `contour-${slug === '' ? fallback : slug}${extension}`;
}

/** One route's stored GPX. */
export function routeGpxFileName(name: string): string {
  return contourFileName(name, '.gpx', 'route');
}

/** contour-routes-YYYY-MM-DD.gpx, dated in local time like the workout bundle. */
export function routeBundleFileName(at: Date = new Date()): string {
  return `contour-routes-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.gpx`;
}

/** One workout's stored YAML source. */
export function workoutFileName(name: string): string {
  return contourFileName(name, '.yaml', 'workout');
}

/** contour-workouts-YYYY-MM-DD.yaml, dated in local time like the rides archive. */
export function workoutBundleFileName(at: Date = new Date()): string {
  return `contour-workouts-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.yaml`;
}
