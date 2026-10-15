import type { ReactNode } from 'react';

/**
 * DESIGN.md > Controls: buttons that act together sit flush, each after the first pulling
 * left 1 px to share a border, so they read as one object rather than two boxes that
 * happen to be adjacent. This is the only place that rule is written; Segmented builds on
 * it, and the z ordering that decides which shared border wins lives in `control.ts`.
 *
 * A group is a row of actions: no aria-pressed, no selected value. Segmented is the other
 * kind, one choice with one ink member. They stay apart because giving actions a selected
 * semantic to share code would say the wrong thing to a screen reader.
 */
export function ButtonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex [&>*:not(:first-child)]:-ml-px" role="group" aria-label={label}>
      {children}
    </div>
  );
}
