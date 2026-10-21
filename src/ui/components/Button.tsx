import type { ReactNode } from 'react';
import { CONTROL_SIZE, TONE, type ControlTone } from './control';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  /**
   * `accent` for the one action the screen exists for, `ink` for the single committing
   * action in a panel, `grey` for everything else. Nothing else is a call site's to say:
   * hover, focus, disabled and stacking all live in the tone.
   */
  tone?: ControlTone;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

/**
 * The 1 px box is the whole signal that something is pressable, so nothing else carries
 * one. 44 px tall on phones, 48 from the first breakpoint up.
 */
export function Button({
  children,
  onClick,
  tone = 'grey',
  disabled = false,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${TONE[tone]} ${CONTROL_SIZE} px-[20px] py-[12px]`}
    >
      {children}
    </button>
  );
}
