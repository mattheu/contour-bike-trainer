import type { ReactNode } from 'react';
import { ICON } from './control';

interface IconButtonProps {
  /** Required: the icon carries no text, so this is the only name it has. */
  label: string;
  /** A hover tooltip, where the glyph is one a rider has not met before. Separate from
   * the label because most of these are not: a tooltip on a bin icon is noise. */
  title?: string;
  /** An inline SVG. */
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

/** DESIGN.md > Controls: an icon button is a grey box with an ink glyph. */
export function IconButton({ label, title, children, onClick, disabled = false }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${ICON} flex size-[44px] items-center justify-center p-0 sm:size-[48px]`}
    >
      {children}
    </button>
  );
}
