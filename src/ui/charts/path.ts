/** SVG path construction shared by every chart. Pure string building, no DOM. */

export interface Pt {
  x: number;
  y: number;
}

/**
 * Two decimals. At these chart sizes that is well under a device pixel even
 * after the map's zoom transform, and it keeps a 944-vertex path readable.
 */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function polylinePath(points: readonly Pt[]): string {
  if (points.length === 0) return '';
  const first = points[0] as Pt;
  let d = `M${n(first.x)},${n(first.y)}`;
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i] as Pt;
    d += ` L${n(point.x)},${n(point.y)}`;
  }
  return d;
}

/**
 * Catmull-Rom through every point, converted to cubic beziers with the standard
 * 1/6 tension. Interpolating rather than approximating: the curve passes through
 * the samples, so a summit tick drawn at the peak's own coordinate sits on the line.
 */
export function smoothPath(points: readonly Pt[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) return polylinePath(points);

  const at = (i: number): Pt => points[Math.min(Math.max(i, 0), points.length - 1)] as Pt;
  const first = points[0] as Pt;
  let d = `M${n(first.x)},${n(first.y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${n(c1x)},${n(c1y)} ${n(c2x)},${n(c2y)} ${n(p2.x)},${n(p2.y)}`;
  }
  return d;
}

/** A line closed down to a baseline and back, for the hatched areas and the bands. */
export function areaPath(points: readonly Pt[], baselineY: number, smooth = true): string {
  if (points.length < 2) return '';
  const first = points[0] as Pt;
  const last = points[points.length - 1] as Pt;
  const line = smooth ? smoothPath(points) : polylinePath(points);
  return `${line} L${n(last.x)},${n(baselineY)} L${n(first.x)},${n(baselineY)} Z`;
}
