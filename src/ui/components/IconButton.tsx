import type { ReactNode } from 'react';
import { ICON } from './control';

interface IconButtonProps {
  /** Required: the icon carries no text, so this is the only name it has. */
  label: string;
  /** An inline SVG. */
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

/** DESIGN.md > Controls: an icon button is a grey box with an ink glyph. */
export function IconButton({ label, children, onClick, disabled = false }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`${ICON} flex size-[44px] items-center justify-center p-0 sm:size-[48px]`}
    >
      {children}
    </button>
  );
}
