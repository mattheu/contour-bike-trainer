import { LABEL, MONO } from './styles';

interface StatProps {
  label: string;
  /** Already formatted. */
  value: string;
  /** The "/ 38.2" half of a distance or climbed reading. */
  total?: string;
  unit?: string;
  /**
   * Ink for a reading. design/DESIGN.md keeps the accent for what you have done or are
   * aiming at, and a live measurement — speed, gradient — is neither. Muted is the stale
   * case: a dropped reading is greyed as well as dashed.
   */
  tone?: 'ink' | 'accent' | 'muted';
  /** A handle for the integration tests. A Tailwind class is not a contract. */
  testId?: string;
}

const TONES: Record<NonNullable<StatProps['tone']>, string> = {
  ink: 'text-ink',
  accent: 'text-accent',
  muted: 'text-muted',
};

export function Stat({ label, value, total, unit, tone = 'ink', testId }: StatProps) {
  return (
    <div data-testid={testId} className="flex flex-col gap-[4px]">
      <div className={`${LABEL} text-caption`}>{label}</div>
      <div className="flex items-baseline gap-[10px]">
        <div className={`${MONO} text-stat leading-none tracking-[-0.02em] ${TONES[tone]}`}>
          {value}
          {total !== undefined && (
            <>
              <span className="text-hairline text-sub mx-[6px]">/</span>
              <span className="text-muted text-sub">{total}</span>
            </>
          )}
        </div>
        {unit !== undefined && <div className={`${MONO} text-body text-muted`}>{unit}</div>}
      </div>
    </div>
  );
}
