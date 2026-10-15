import { LABEL, MONO } from './styles';

/** Uphill bins from design/DESIGN.md Marks: 2–4, 4–7, 7–10, >10 %. */
const WASHES = [
  { x: 0, opacity: 0.07 },
  { x: 50, opacity: 0.13 },
  { x: 100, opacity: 0.2 },
  { x: 150, opacity: 0.28 },
];

interface GradientKeyProps {
  label?: string;
}

export function GradientKey({ label = 'Gradient' }: GradientKeyProps) {
  return (
    <div className="flex items-center gap-[14px]">
      <div className={`${LABEL} text-micro`}>{label}</div>
      <svg width="190" height="14" viewBox="0 0 190 14" aria-hidden="true">
        {WASHES.map((wash) => (
          <rect
            key={wash.x}
            x={wash.x}
            y="0"
            width="40"
            height="14"
            fill="var(--color-ink)"
            opacity={wash.opacity}
          />
        ))}
      </svg>
      <div className={`${MONO} text-micro text-muted`}>2 · 4 · 7 · 10 %</div>
    </div>
  );
}
