/**
 * Generates the two bundled test routes in routes/ plus routes/manifest.json.
 *
 * Run with:  node scripts/generate-routes.ts
 * (Node >= 22.18 strips TypeScript natively; no build step and no extra dev
 * dependency. There is no npm script for it because package.json is not this
 * change's to edit — add `"routes": "node scripts/generate-routes.ts"` if it
 * gets run often.)
 *
 * The output is committed. Re-running it must reproduce the same files
 * byte for byte: everything here is deterministic, with no RNG and no clock.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGpx } from '../src/route/gpx.ts';

const OUT_DIR = new URL('../routes/', import.meta.url);

/** GPS point spacing. Realistic for a 1 Hz recording at road speeds. */
const POINT_SPACING_M = 15;

/** Elevation smoothing window: rounds the joins between sections into something rideable. */
const SMOOTHING_WINDOW_M = 150;

const DEG_PER_M_LAT = 1 / 111320;

interface Point {
  lat: number;
  lon: number;
  eleM: number;
}

interface RouteSpec {
  id: string;
  name: string;
  region: string;
  file: string;
  description: string;
  targetDistanceM: number;
  targetAscentM: number;
}

// --- helpers ---------------------------------------------------------------

/** Local east/north metres to lat/lon. Flat-earth is fine over 30 km. */
function toLatLon(lat0: number, lon0: number, eastM: number, northM: number): [number, number] {
  return [
    lat0 + northM * DEG_PER_M_LAT,
    lon0 + (eastM * DEG_PER_M_LAT) / Math.cos(lat0 * (Math.PI / 180)),
  ];
}

/** Moving average over a distance window; wraps for loops so the seam is smooth. */
function smooth(values: number[], stepM: number, windowM: number, wrap: boolean): number[] {
  const half = Math.max(1, Math.round(windowM / stepM / 2));
  const n = values.length;
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -half; k <= half; k += 1) {
      const j = wrap ? (((i + k) % n) + n) % n : Math.min(n - 1, Math.max(0, i + k));
      sum += values[j] as number;
      count += 1;
    }
    return sum / count;
  });
}

function totalAscent(elevations: number[]): number {
  let ascent = 0;
  for (let i = 1; i < elevations.length; i += 1) {
    const rise = (elevations[i] as number) - (elevations[i - 1] as number);
    if (rise > 0) ascent += rise;
  }
  return ascent;
}

/**
 * Bisect an amplitude scale so the finished profile hits its target ascent.
 * Smoothing eats a variable amount of gain, so the scale cannot be worked out
 * in closed form — and a generator that silently drifts off its stated numbers
 * would poison every test downstream of it.
 */
function tuneToAscent(build: (scale: number) => number[], targetAscentM: number): number[] {
  let low = 0.05;
  let high = 20;
  let best = build(1);
  for (let i = 0; i < 50; i += 1) {
    const mid = (low + high) / 2;
    best = build(mid);
    if (totalAscent(best) < targetAscentM) low = mid;
    else high = mid;
  }
  return best;
}

function toGpx(name: string, description: string, points: Point[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="contour scripts/generate-routes.ts" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${name}</name>`,
    `    <desc>${description}</desc>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${name}</name>`,
    '    <trkseg>',
  ];
  for (const p of points) {
    lines.push(
      `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${p.eleM.toFixed(1)}</ele></trkpt>`,
    );
  }
  lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
  return lines.join('\n');
}

// --- Rolling: a ~20 km loop of continuous small undulations -----------------

/**
 * A closed polar curve walked at constant arc length, so the loop shuts exactly
 * and the point spacing is even. Wavelengths divide the loop length, which
 * keeps the elevation periodic and stops the start/finish seam from being a step.
 */
function buildRolling(spec: RouteSpec): Point[] {
  const LAT0 = 54.02;
  const LON0 = -2.51;

  const shape = (phi: number): number =>
    1 + 0.16 * Math.sin(3 * phi) + 0.07 * Math.cos(5 * phi + 0.8);

  // Pass one: perimeter at unit radius, so radius can be set from the target distance.
  const dPhi = 1e-5;
  let perimeter = 0;
  const arc: number[] = [0];
  for (let k = 1; k <= Math.round((2 * Math.PI) / dPhi); k += 1) {
    const a = (k - 1) * dPhi;
    const b = k * dPhi;
    const ra = shape(a);
    const rb = shape(b);
    perimeter += Math.hypot(
      rb * Math.cos(b) - ra * Math.cos(a),
      rb * Math.sin(b) - ra * Math.sin(a),
    );
    arc.push(perimeter);
  }
  const radius = spec.targetDistanceM / perimeter;

  const stepCount = Math.round(spec.targetDistanceM / POINT_SPACING_M);
  const stepM = spec.targetDistanceM / stepCount;

  // Pass two: emit a point every stepM of arc length by walking the arc table.
  const points: Point[] = [];
  let k = 0;
  for (let i = 0; i < stepCount; i += 1) {
    const targetArc = (i * stepM) / radius;
    while (k < arc.length - 1 && (arc[k + 1] as number) < targetArc) k += 1;
    const phi = k * dPhi;
    const r = radius * shape(phi);
    const [lat, lon] = toLatLon(LAT0, LON0, r * Math.cos(phi), r * Math.sin(phi));
    points.push({ lat, lon, eleM: 0 });
  }
  points.push({ ...(points[0] as Point) }); // close the loop

  // Three harmonics whose wavelengths divide the loop: ~800 m, ~500 m, ~1250 m.
  // Summed, the grade changes at every single point, which is the whole reason
  // this route exists — it is what stresses the trainer write thresholds.
  const cycles = [25, 40, 16];
  const weights = [1, 0.5, 0.45];
  const phases = [0, 1.9, 0.6];
  // Smoothed over the distinct samples only, then the duplicated closing point
  // takes the first point's elevation, so the seam is continuous in both.
  const elevations = tuneToAscent((scale) => {
    const raw = Array.from({ length: stepCount }, (_, i) => {
      const t = i / stepCount;
      let ele = 180;
      for (let c = 0; c < cycles.length; c += 1) {
        ele +=
          scale *
          (weights[c] as number) *
          Math.sin(2 * Math.PI * (cycles[c] as number) * t + (phases[c] as number));
      }
      return ele;
    });
    const smoothed = smooth(raw, stepM, SMOOTHING_WINDOW_M, true);
    smoothed.push(smoothed[0] as number);
    return smoothed;
  }, spec.targetAscentM);

  return points.map((p, i) => ({ ...p, eleM: elevations[i] as number }));
}

// --- Mixed: flat, one sustained climb, a fast descent, then rolling ---------

/** Grade in percent as a function of distance, before smoothing. */
function mixedGrade(s: number, tailScale: number): number {
  if (s < 4500) return 0.6 * Math.sin((2 * Math.PI * s) / 900); // near-flat approach
  if (s < 7700) return 6; // the sustained body of the climb
  if (s < 9500) return 6 + (6 * (s - 7700)) / 1800; // ramps to 12 % at the summit
  if (s < 11000) return -8;
  // Steeper than the ~12.2 % that balances gravity against drag at zero power,
  // so this is the stretch that actually reaches the 80 km/h cap.
  if (s < 13000) return -14;
  if (s < 15000) return -6;
  return tailScale * Math.sin((2 * Math.PI * (s - 15000)) / 500); // rolling to the finish
}

function buildMixed(spec: RouteSpec): Point[] {
  const LAT0 = 53.16;
  const LON0 = -3.82;
  const START_ELE_M = 400;

  const stepCount = Math.round(spec.targetDistanceM / POINT_SPACING_M);
  const stepM = spec.targetDistanceM / stepCount;

  // Heading wanders smoothly so the trace reads as a road rather than a ruler.
  const points: Point[] = [];
  let east = 0;
  let north = 0;
  for (let i = 0; i <= stepCount; i += 1) {
    const s = i * stepM;
    const heading =
      0.9 +
      0.55 * Math.sin((2 * Math.PI * s) / 6400) +
      0.25 * Math.sin((2 * Math.PI * s) / 2100 + 1.1);
    const [lat, lon] = toLatLon(LAT0, LON0, east, north);
    points.push({ lat, lon, eleM: 0 });
    east += stepM * Math.sin(heading);
    north += stepM * Math.cos(heading);
  }

  const elevations = tuneToAscent((scale) => {
    const raw: number[] = [];
    let ele = START_ELE_M;
    for (let i = 0; i <= stepCount; i += 1) {
      if (i > 0) ele += (mixedGrade((i - 0.5) * stepM, scale) / 100) * stepM;
      raw.push(ele);
    }
    return smooth(raw, stepM, SMOOTHING_WINDOW_M, false);
  }, spec.targetAscentM);

  return points.map((p, i) => ({ ...p, eleM: elevations[i] as number }));
}

// --- main ------------------------------------------------------------------

const specs: RouteSpec[] = [
  {
    id: 'test-rolling',
    name: 'Test Route 1 — Rolling',
    region: 'Synthetic',
    file: 'test-rolling.gpx',
    description:
      'Generated test route: a 20 km loop of continuous 2-5 % undulations, nothing sustained.',
    targetDistanceM: 20000,
    targetAscentM: 250,
  },
  {
    id: 'test-mixed',
    name: 'Test Route 2 — Mixed',
    region: 'Synthetic',
    file: 'test-mixed.gpx',
    description:
      'Generated test route: flat start, a sustained 5 km climb ramping to 12 %, a fast descent, then rolling terrain.',
    targetDistanceM: 30000,
    targetAscentM: 700,
  },
];

const manifest = specs.map((spec) => {
  const points = spec.id === 'test-rolling' ? buildRolling(spec) : buildMixed(spec);
  const gpx = toGpx(spec.name, spec.description, points);
  writeFileSync(new URL(spec.file, OUT_DIR), gpx);

  // Measure with the app's own parser, so the manifest can never disagree with it.
  const route = parseGpx(gpx);
  console.log(
    `${spec.file}: ${points.length} points, ${(route.totalDistanceM / 1000).toFixed(2)} km, ${route.totalAscentM.toFixed(0)} m ascent`,
  );

  return {
    id: spec.id,
    name: spec.name,
    region: spec.region,
    file: spec.file,
    description: spec.description,
    totalDistanceM: Math.round(route.totalDistanceM),
    totalAscentM: Math.round(route.totalAscentM),
  };
});

// Merge rather than overwrite: real GPX routes live in the same manifest and are not
// generated, so a re-run must not drop them. Only ids this script owns are replaced.
const generatedIds = new Set(manifest.map((entry) => entry.id));
let kept: unknown[] = [];
try {
  const existing = JSON.parse(readFileSync(new URL('manifest.json', OUT_DIR), 'utf8')) as {
    routes: { id: string }[];
  };
  kept = (existing.routes ?? []).filter((entry) => !generatedIds.has(entry.id));
} catch {
  // No manifest yet, or it is unreadable. Writing a fresh one is the right recovery.
}

writeFileSync(
  new URL('manifest.json', OUT_DIR),
  `${JSON.stringify({ routes: [...manifest, ...kept] }, null, 2)}\n`,
);
console.log(`routes/manifest.json written (${manifest.length} generated, ${kept.length} kept)`);
