import type { ReactNode } from 'react';
import { ICON } from './control';

/**
 * design/DESIGN.md > Screen rules: 44 px in a header or a foot, 32 px on the phone
 * landscape stats line. Omitted gives the control height — 44 on a phone, 48 above it.
 */
export type IconButtonSize = 44 | 32;

const SIZES: Record<IconButtonSize, string> = {
  44: 'size-[44px]',
  32: 'size-[32px]',
};

interface IconButtonProps {
  /** Required: the icon carries no text, so this is the only name it has. */
  label: string;
  /** A hover tooltip, where the glyph is one a rider has not met before. Separate from
   * the label because most of these are not: a tooltip on a bin icon is noise. */
  title?: string;
  /** An inline SVG. */
  children: ReactNode;
  size?: IconButtonSize;
  onClick?: () => void;
  disabled?: boolean;
}

/** DESIGN.md > Controls: an icon button is a grey box with an ink glyph. */
export function IconButton({
  label,
  title,
  children,
  size,
  onClick,
  disabled = false,
}: IconButtonProps) {
  const box = size === undefined ? 'size-[44px] sm:size-[48px]' : SIZES[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${ICON} flex items-center justify-center p-0 ${box}`}
    >
      {children}
    </button>
  );
}
