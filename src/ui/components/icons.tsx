/**
 * The ride controls' glyphs.
 *
 * design/DESIGN.md > Screen rules: on a phone every ride control is an icon — pause, end,
 * view, zoom, steps, skip, settings — drawn at 1.25 px on a 16 px box. The paths are read off
 * design/mockups/icons.html rather than redrawn, so a glyph means the same thing in the
 * build as it does in the design. That guide is the one source: a screen mockup drawing
 * an older version of a glyph is the screen being out of date, not a second opinion.
 *
 * One <svg> wrapper for all of them: stroke weight, cap and join are the drawing's
 * grammar rather than each glyph's own choice, and a glyph that set its own would be the
 * one that looked wrong next to the others.
 */

import type { ReactNode } from 'react';

/** 16 px on a phone control; the desktop header draws its gear at 18. */
export type IconSize = 16 | 18;

function Glyph({ size = 16, children }: { size?: IconSize; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Two bars. */
export function PauseIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M5.5,3 V13 M10.5,3 V13" />
    </Glyph>
  );
}

/** A square: stop, not a triangle — nothing about ending a ride is a "play". */
export function EndIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <rect x={3.5} y={3.5} width={9} height={9} />
    </Glyph>
  );
}

/** A folded map. Shown while the profile is up: the glyph is the view you would get. */
export function MapIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M1.5,4 L5.5,2.5 L10.5,4.5 L14.5,3 V12 L10.5,13.5 L5.5,11.5 L1.5,13 Z M5.5,2.5 V11.5 M10.5,4.5 V13.5" />
    </Glyph>
  );
}

/**
 * A line chart over its baseline, shown while the map is up.
 *
 * design/DESIGN.md > Screen rules names this one a line chart rather than a profile: an
 * open line that falls as well as rises, over a separate rule. A closed silhouette that
 * only climbed would be a mountain, which is a place rather than a reading.
 */
export function ProfileIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M1.5,12.5 L5,6.5 L8,9.5 L11,3.5 L14.5,8" />
      <path d="M1.5,14.5 H14.5" />
    </Glyph>
  );
}

/** Magnifier +, on the whole-route view. */
export function ZoomInIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <circle cx={7} cy={7} r={4.5} />
      <path d="M10.5,10.5 L14.5,14.5 M7,5 V9 M5,7 H9" />
    </Glyph>
  );
}

/** The same magnifier, minus the upright: once zoomed, the way out is back out. */
export function ZoomOutIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <circle cx={7} cy={7} r={4.5} />
      <path d="M10.5,10.5 L14.5,14.5 M5,7 H9" />
    </Glyph>
  );
}

/**
 * A bulleted list, shown while the workout plan chart is up.
 *
 * The bullets are filled rather than stroked, which is the one place a glyph overrides the
 * wrapper: a 0.9 r circle at 1.25 px of stroke is a ring with no hole in it.
 */
export function StepsIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M5.5,4 H14 M5.5,8 H14 M5.5,12 H14" />
      <circle cx={2.5} cy={4} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={2.5} cy={8} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={2.5} cy={12} r={0.9} fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Four blocks rising, as the plan chart draws them, shown while the step list is up. */
export function PlanIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M2.5,13.5 V9 M6.5,13.5 V4.5 M10.5,13.5 V7 M14.5,13.5 V2.5" />
    </Glyph>
  );
}

/**
 * A play triangle against a bar: skip to the next step.
 *
 * The bar is what makes it a skip rather than a start — a triangle on its own is the
 * control this screen does not have, because a workout is already running.
 */
export function SkipIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M3,3 L10.5,8 L3,13 Z" />
      <path d="M13,3 V13" />
    </Glyph>
  );
}

/**
 * A six-tooth cog outline round a hub, never rays: design/DESIGN.md > Screen rules draws
 * the line there because a hub with spokes reads as a sun. Drawn on its own 18 px box
 * rather than the 16 the rest share, because the teeth run to the corners and the same
 * shape inside a 16 px viewBox loses them to the edge.
 *
 * No round cap, since the outline is closed and has no ends to cap — only the join, which
 * is what keeps six teeth from coming to six points.
 */
export function SettingsIcon({ size = 18 }: { size?: IconSize }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.00,1.50 L10.94,1.76 L11.75,4.24 L12.89,5.11 L15.50,5.25 L16.24,7.06 L14.50,9.00 L14.31,10.42 L15.50,12.75 L14.30,14.30 L11.75,13.76 L10.42,14.31 L9.00,16.50 L7.06,16.24 L6.25,13.76 L5.11,12.89 L2.50,12.75 L1.76,10.94 L3.50,9.00 L3.69,7.58 L2.50,5.25 L3.70,3.70 L6.25,4.24 L7.58,3.69 Z" />
      <circle cx={9} cy={9} r={2.2} />
    </svg>
  );
}
