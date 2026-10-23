import type { ReactNode } from 'react';
import { CONTROL_GAP } from './control';
import { IconButton } from './IconButton';
import { SettingsIcon } from './icons';
import { Logo } from './Wordmark';

interface AppHeaderProps {
  /**
   * The Rides · Routes · Workouts Segmented, or a label on a screen that has no nav to
   * carry — How it works is the one of those.
   */
  nav: ReactNode;
  /** One accent action, or the period summary on screens that have no action. */
  action?: ReactNode;
  /**
   * Opens the rider profile. A settings affordance rather than a fourth tab: Rides,
   * Routes and Workouts are collections and a profile is not, and a fourth segment would
   * shift widths the Workouts tab already has to move in phase 3.
   */
  onSettings?: () => void;
}

export function AppHeader({ nav, action, onSettings }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-[28px]">
        <Logo size="header" />
        {nav}
      </div>
      <div className={`flex items-center ${CONTROL_GAP}`}>
        {action}
        {onSettings !== undefined && (
          <IconButton label="Rider profile" onClick={onSettings}>
            <SettingsIcon />
          </IconButton>
        )}
      </div>
    </header>
  );
}
