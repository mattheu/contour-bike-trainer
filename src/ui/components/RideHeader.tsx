import type { ReactNode } from 'react';
import { Button } from './Button';
import { CONTROL_GAP } from './control';
import { ButtonGroup } from './ButtonGroup';
import { IconButton } from './IconButton';
import { SettingsIcon } from './icons';
import { LABEL } from './styles';
import { Logo } from './Wordmark';

interface RideHeaderProps {
  /** The route name, or the workout name when a workout is loaded. */
  title: string;
  /** The route behind a workout, drawn after a hairline separator. */
  subtitle?: string;
  /**
   * A mark on the title line rather than more prose on it: the loop tag and its lap
   * counter. No separator, because it carries its own shape — see LoopTag.
   */
  tag?: ReactNode;
  /** What the one accent control reads now: Start, Pause or Resume. See ride-view. */
  pauseLabel: string;
  /**
   * Controls that belong to what is being ridden rather than to the ride itself, drawn
   * left of the ride group as their own group. The workout difficulty is the one of them.
   */
  actions?: ReactNode;
  onPause: () => void;
  onEnd: () => void;
  onSettings: () => void;
}

export function RideHeader({
  title,
  subtitle,
  tag,
  pauseLabel,
  actions,
  onPause,
  onEnd,
  onSettings,
}: RideHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-[18px]">
        <Logo />
        <div className={LABEL}>{title}</div>
        {tag}
        {subtitle !== undefined && (
          <>
            <div className={`${LABEL} text-hairline`}>·</div>
            <div className={LABEL}>{subtitle}</div>
          </>
        )}
      </div>
      <div className={`flex items-center ${CONTROL_GAP}`}>
        {actions}
        {/* Start/Pause and End ride are the same kind of thing — what to do with the ride
            in front of you — so they share an edge. The gear is a different kind of thing
            and keeps its gap: a group says "these go together", and a gap too small to
            read as deliberate says nothing at all. */}
        {/* Grey, not accent. DESIGN.md gives accent to an action that *begins* something —
            Start on a route, New workout — and takes it away once the ride is under way:
            the data owns the colour from then on, so Pause and End ride are both grey. */}
        <ButtonGroup label="Ride">
          <Button onClick={onPause}>{pauseLabel}</Button>
          <Button onClick={onEnd}>End ride</Button>
        </ButtonGroup>
        <IconButton label="Settings" onClick={onSettings}>
          <SettingsIcon />
        </IconButton>
      </div>
    </header>
  );
}
