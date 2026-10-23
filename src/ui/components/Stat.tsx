import { COLOUR_SHIFT } from './motion';
import { LABEL, MONO } from './styles';

/** 32 px on a desktop, 20 where five of them share a tablet's width. */
export type StatSize = 32 | 20;

/**
 * The slash total and the unit beside the value. They part company on a desktop and meet
 * again on a tablet, where design/DESIGN.md puts both at 12 px.
 */
const SIZES: Record<StatSize, { value: string; total: string; unit: string }> = {
  32: { value: 'text-stat', total: 'text-sub', unit: 'text-body' },
  20: { value: 'text-sub', total: 'text-caption', unit: 'text-caption' },
};

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
  size?: StatSize;
  /** A handle for the integration tests. A Tailwind class is not a contract. */
  testId?: string;
}

const TONES: Record<NonNullable<StatProps['tone']>, string> = {
  ink: 'text-ink',
  accent: 'text-accent',
  muted: 'text-muted',
};

export function Stat({ label, value, total, unit, tone = 'ink', size = 32, testId }: StatProps) {
  const s = SIZES[size];

  return (
    <div data-testid={testId} className="flex flex-col gap-[4px]">
      <div className={`${LABEL} text-caption`}>{label}</div>
      <div className="flex items-baseline gap-[10px]">
        {/* The tone crosses over rather than cutting: a reading going stale and a workout's
            interval countdown going accent in its last ten seconds are both changes of
            state, and design/DESIGN.md gives a change of state a 0.3 s colour change.
            motion-reduce makes it a cut — the colour itself is what carries the meaning. */}
        <div
          className={`${MONO} ${s.value} leading-none tracking-[-0.02em] ${TONES[tone]} ${COLOUR_SHIFT}`}
        >
          {value}
          {total !== undefined && (
            <>
              <span className={`text-hairline ${s.total} mx-[6px]`}>/</span>
              <span className={`text-muted ${s.total}`}>{total}</span>
            </>
          )}
        </div>
        {unit !== undefined && <div className={`${MONO} ${s.unit} text-muted`}>{unit}</div>}
      </div>
    </div>
  );
}
