import { describe, expect, it } from 'vitest';

import { controlWrite } from './erg';

describe('controlWrite', () => {
  it('sends the target while ERG is on and the step has one', () => {
    expect(controlWrite('erg', 240)).toEqual({ kind: 'target', watts: 240 });
  });

  it('sends simulation parameters on a free step, which releases ERG', () => {
    expect(controlWrite('erg', null)).toEqual({ kind: 'simulation' });
  });

  it('sends simulation parameters with ERG off, target or no target', () => {
    // The whole feature in one line: a step with a target is ridden exactly as a free
    // step is, so the rider holds the number rather than the trainer.
    expect(controlWrite('manual', 240)).toEqual({ kind: 'simulation' });
    expect(controlWrite('manual', null)).toEqual({ kind: 'simulation' });
  });

  it('sends no target at zero watts either, which is a target like any other', () => {
    expect(controlWrite('erg', 0)).toEqual({ kind: 'target', watts: 0 });
    expect(controlWrite('manual', 0)).toEqual({ kind: 'simulation' });
  });
});
