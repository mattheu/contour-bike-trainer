import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { SERIF } from './styles';
import { SLIDE } from './motion';

interface SettingsPanelProps {
  /** Required: a panel called "Settings" says nothing in an app that has two of them. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A 580 px aside over a 55 % scrim, sliding in from the right. Wider than the mockup's 440:
 * the device rows and the field hints wrapped at that width, and the panel has room to
 * spare on the screens this app runs on. Mount it when the panel
 * opens and unmount it when it closes; the caller owns that.
 *
 * It scrolls only when it has to. The panel fits a 900 px window as it stands, but a
 * trainer that reports a long service list can outgrow it, and a discovery block that
 * pushes End ride off the bottom is worse than a scrollbar.
 */
export function SettingsPanel({ title, onClose, children }: SettingsPanelProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="bg-ground absolute inset-0 cursor-default border-0 opacity-[0.55]"
      />
      <aside
        aria-label={title}
        className={[
          'bg-ground border-hairline absolute top-0 right-0 bottom-0 flex w-[580px]',
          'flex-col gap-[48px] overflow-y-auto border-l px-[48px] py-[44px]',
          SLIDE,
        ].join(' ')}
        style={{ transform: shown ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="flex items-baseline justify-between">
          <div className={`${SERIF} text-stat text-ink`}>{title}</div>
          <Button onClick={onClose}>Close</Button>
        </div>
        {children}
      </aside>
    </div>
  );
}
