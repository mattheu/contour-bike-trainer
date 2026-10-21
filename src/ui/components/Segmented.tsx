import { ButtonGroup } from './ButtonGroup';
import { CONTROL_SIZE, SELECTED, TONE } from './control';

/** Chart zoom is 32, nav and filters 44, the desktop control row 48. */
export type SegmentedSize = 32 | 44 | 48;

const SIZES: Record<SegmentedSize, string> = {
  32: 'text-micro min-h-[32px] px-[12px] py-[6px]',
  44: 'text-caption min-h-[44px] px-[18px] py-[10px]',
  48: `${CONTROL_SIZE} px-[20px] py-[12px]`,
};

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: SegmentedSize;
  /** Names the group for screen readers, e.g. "Chart zoom". */
  label: string;
}

/**
 * One choice, not a row of actions: exactly one member is selected, and it is the only ink
 * one. The flush edges are ButtonGroup's; the tones and states are control.ts's. All this
 * adds is the selection — aria-pressed and the ink member — and the size.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 44,
  label,
}: SegmentedProps<T>) {
  return (
    <ButtonGroup label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`${selected ? SELECTED : TONE.grey} ${SIZES[size]}`}
          >
            {option.label}
          </button>
        );
      })}
    </ButtonGroup>
  );
}
