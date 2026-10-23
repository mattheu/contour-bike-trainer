/**
 * The ride controls' glyphs.
 *
 * design/DESIGN.md > Screen rules: on a phone every ride control is an icon — pause, end,
 * view, zoom, settings — drawn at 1.25 px on a 16 px box. The paths are read off
 * design/mockups/phone-portrait-profile.html and phone-portrait-map.html rather than
 * redrawn, so a glyph means the same thing in the build as it does in the design.
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

/** A mountain profile, shown while the map is up. */
export function ProfileIcon({ size }: { size?: IconSize }) {
  return (
    <Glyph size={size}>
      <path d="M1.5,13 L5,7 L7.5,10 L11,3.5 L14.5,13 Z" />
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
 * A gear. Drawn on its own 18 px box rather than the 16 the rest share: the spokes run to
 * the corners, so the same shape inside a 16 px viewBox loses its points to the edge.
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
      aria-hidden="true"
    >
      <circle cx={9} cy={9} r={2.5} />
      <path d="M9,1.5 V4 M9,14 V16.5 M1.5,9 H4 M14,9 H16.5 M3.7,3.7 L5.5,5.5 M12.5,12.5 L14.3,14.3 M3.7,14.3 L5.5,12.5 M12.5,5.5 L14.3,3.7" />
    </svg>
  );
}
