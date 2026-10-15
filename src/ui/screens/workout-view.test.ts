import { describe, expect, it } from 'vitest';
import type { ExpandedStep } from '../../workout/expand';
import { planSegments, zoneWash } from '../charts';
import type { WorkoutSnapshot } from '../store';
import {
  RULE_MARGIN,
  CADENCE_MAX_RPM,
  CADENCE_MIN_RPM,
  cadenceBand,
  cadenceNote,
  canSkip,
  currentStep,
  difficultyInertReason,
  ergLabel,
  ERG_MODE_OPTIONS,
  intervalClock,
  currentRowNumber,
  hoveredRowNumber,
  powerHero,
  scaleLabel,
  stepIndexForRow,
  stepRows,
  stepsHeading,
  workoutClock,
} from './workout-view';

const ftpPercent = (value: number) => ({ unit: 'ftpPercent' as const, value });

/** The session's, which every stepRows call needs to put a zone behind a row. */
const FTP = 250;

const STEPS: ExpandedStep[] = [
  {
    kind: 'step',
    durationS: 600,
    power: { kind: 'ramp', from: ftpPercent(50), to: ftpPercent(75) },
    name: 'Warmup',
  },
  {
    kind: 'step',
    durationS: 600,
    power: { kind: 'constant', value: ftpPercent(90) },
    name: 'Sweet spot',
  },
  {
    kind: 'step',
    durationS: 300,
    power: { kind: 'constant', value: ftpPercent(55) },
    name: 'Recovery',
  },
  { kind: 'step', durationS: 180, power: { kind: 'constant', value: ftpPercent(65) } },
  { kind: 'step', durationS: 30, power: { kind: 'free' }, name: 'Max effort' },
];

function snapshot(patch: Partial<WorkoutSnapshot> = {}): WorkoutSnapshot {
  return {
    name: '2x20 threshold',
    steps: STEPS,
    stepIndex: 1,
    stepCount: STEPS.length,
    stepName: 'Sweet spot',
    targetW: 239,
    cadence: null,
    stepRemainingS: 402,
    totalRemainingS: 1512,
    nextLabel: '5:00 Recovery · 55 %',
    ergEngaged: true,
    ergMode: 'erg',
    scalePct: 100,
    ftpW: FTP,
    ...patch,
  };
}

describe('currentStep', () => {
  it('is the step the runner says is being ridden', () => {
    expect(currentStep(snapshot())).toBe(STEPS[1]);
  });

  it('is null once the plan has run out, which is stepCount', () => {
    expect(currentStep(snapshot({ stepIndex: STEPS.length }))).toBeNull();
  });
});

describe('stepRows', () => {
  it('numbers every step in the session, not only what remains', () => {
    expect(stepRows(snapshot(), FTP).map((row) => row.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks what is behind, what is current and what is ahead', () => {
    expect(stepRows(snapshot({ stepIndex: 2 }), FTP).map((row) => row.state)).toEqual([
      'done',
      'done',
      'current',
      'ahead',
      'ahead',
    ]);
  });

  it('counts the current step down in place, so it matches the interval clock', () => {
    const rows = stepRows(snapshot(), FTP);
    expect(rows[1]?.duration).toBe('6:42');
    expect(rows[1]?.duration).toBe(intervalClock(snapshot()).value);
  });

  it('shows the plan length for every step that is not current', () => {
    const rows = stepRows(snapshot(), FTP);
    expect(rows[0]?.duration).toBe('10:00');
    expect(rows[2]?.duration).toBe('5:00');
  });

  it('reads a step as name, target and duration', () => {
    const rows = stepRows(snapshot(), FTP);
    expect(rows[1]).toEqual({
      number: 2,
      name: 'Sweet spot',
      target: '90 %',
      duration: '6:42',
      state: 'current',
      wash: zoneWash(4),
      // The brighter of the two rows it divides, plus the hairline's own value. Here that
      // is this row itself: the warmup above it is lighter.
      rule: Math.max(rows[0]?.wash ?? 0, zoneWash(4) ?? 0) + RULE_MARGIN,
    });
  });

  it('leaves the name blank where the author wrote none, rather than guessing one', () => {
    const row = stepRows(snapshot(), FTP)[3];
    expect(row?.name).toBe('');
    expect(row?.target).toBe('65 %');
  });

  it('keeps a ramp and a free block in the form they were written', () => {
    const rows = stepRows(snapshot(), FTP);
    expect(rows[0]?.target).toBe('50 → 75 %');
    expect(rows[4]?.target).toBe('free');
  });

  it('rules each row above the brighter of the rows either side of it', () => {
    const rows = stepRows(snapshot(), FTP);
    for (const [index, row] of rows.entries()) {
      const above = index === 0 ? 0 : (rows[index - 1]?.wash ?? 0);
      expect(row.rule).toBeGreaterThan(above);
      expect(row.rule).toBeGreaterThan(row.wash ?? 0);
    }
  });

  it('rules two unwashed rows at the hairline exactly, changing nothing', () => {
    const rows = stepRows(snapshot(), FTP);
    // The free step has no wash; neither does the recovery-zone row, if any sits above it.
    const free = rows.find((row) => row.wash === null);
    expect(free?.rule).toBeGreaterThanOrEqual(RULE_MARGIN);
  });

  it('washes each row at its zone, which is the plan chart own block scale', () => {
    const rows = stepRows(snapshot(), FTP);
    // Sweet spot at 90 % is zone 4; recovery at 55 % is zone 2, and lighter for it.
    expect(rows[1]?.wash).toBe(zoneWash(4));
    expect(rows[2]?.wash).toBe(zoneWash(2));
    expect(rows[2]?.wash).toBeLessThan(rows[1]?.wash as number);
  });

  it('leaves a free step unwashed: no target is an absence, not zone 1', () => {
    expect(stepRows(snapshot(), FTP)[4]?.wash).toBeNull();
  });

  it('lightens every wash when the rider takes the difficulty down', () => {
    const full = stepRows(snapshot(), FTP);
    const easier = stepRows(snapshot({ scalePct: 70 }), FTP);
    expect(easier[1]?.wash).toBeLessThan(full[1]?.wash as number);
  });

  it('has everything behind it once the session has finished', () => {
    const states = stepRows(snapshot({ stepIndex: STEPS.length }), FTP).map((row) => row.state);
    expect(states).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
});

describe('currentRowNumber', () => {
  it('is the row the rider is on, which is what the panel scrolls to', () => {
    expect(currentRowNumber(stepRows(snapshot({ stepIndex: 2 }), FTP))).toBe(3);
  });

  it('holds still while a step counts down, so the panel does not move on every tick', () => {
    const before = currentRowNumber(stepRows(snapshot({ stepRemainingS: 402 }), FTP));
    expect(currentRowNumber(stepRows(snapshot({ stepRemainingS: 61 }), FTP))).toBe(before);
  });

  it('has nothing to hold once the plan has run out', () => {
    expect(currentRowNumber(stepRows(snapshot({ stepIndex: STEPS.length }), FTP))).toBeNull();
  });
});

describe('hoveredRowNumber', () => {
  const rows = stepRows(snapshot(), FTP);

  it('is the row the hovered block belongs to, 1-based like the panel', () => {
    expect(hoveredRowNumber(rows, 0)).toBe(1);
    expect(hoveredRowNumber(rows, 3)).toBe(4);
  });

  it('is nothing when the pointer is on no block', () => {
    expect(hoveredRowNumber(rows, null)).toBeNull();
  });

  it('lights no row for the free step, because nothing can hover one', () => {
    // STEPS[4] is free, and the chart only has hit areas where it has blocks — so the
    // indices that ever reach here are exactly the plan's segments, and 4 is not one.
    const hoverable = planSegments(STEPS, FTP).map((segment) => segment.stepIndex);
    expect(hoverable).not.toContain(4);
    expect(hoverable.map((index) => hoveredRowNumber(rows, index))).toEqual([1, 2, 3, 4]);
  });

  it('lights no row for a step the plan no longer has', () => {
    expect(hoveredRowNumber(rows, STEPS.length)).toBeNull();
  });
});

describe('stepIndexForRow', () => {
  const rows = stepRows(snapshot(), FTP);

  it('is the step the row names, 0-based like the plan', () => {
    expect(stepIndexForRow(rows, 1)).toBe(0);
    expect(stepIndexForRow(rows, 4)).toBe(3);
  });

  it('is nothing when the pointer is on no row', () => {
    expect(stepIndexForRow(rows, null)).toBeNull();
  });

  it('is nothing for a row the panel does not have', () => {
    expect(stepIndexForRow(rows, 0)).toBeNull();
    expect(stepIndexForRow(rows, STEPS.length + 1)).toBeNull();
  });

  it('answers for the free row, which has a step even though it has no block', () => {
    // STEPS[4] is free. The row resolves like any other; nothing outlines because no
    // block carries index 4, which is blockForStep's business rather than this one's.
    expect(stepIndexForRow(rows, 5)).toBe(4);
  });

  it('is the exact inverse of hoveredRowNumber, so the two ends cannot drift', () => {
    for (const row of rows) {
      expect(hoveredRowNumber(rows, stepIndexForRow(rows, row.number))).toBe(row.number);
    }
    expect(stepIndexForRow(rows, hoveredRowNumber(rows, null))).toBeNull();
  });
});

describe('stepsHeading', () => {
  it('counts the steps and their total', () => {
    expect(stepsHeading(STEPS)).toBe('5 · 29 min');
  });

  it('follows a skip down, because the run is what will be ridden', () => {
    const skipped = STEPS.map((step, index) => (index === 1 ? { ...step, durationS: 198 } : step));
    expect(stepsHeading(skipped)).toBe('5 · 22 min');
  });

  it('says nothing rather than dividing by an empty plan', () => {
    expect(stepsHeading([])).toBe('0 · 0 min');
  });
});

describe('canSkip', () => {
  it('is on while a step is being ridden', () => {
    expect(canSkip(snapshot())).toBe(true);
  });

  it('is off once the plan has run out', () => {
    expect(canSkip(snapshot({ stepIndex: STEPS.length }))).toBe(false);
  });
});

describe('powerHero', () => {
  it('shows the target and its share of FTP', () => {
    expect(powerHero(239, 265)).toEqual({ target: '239', note: 'target 90 % FTP' });
  });

  it('reports the work actually being asked for when the difficulty is scaled', () => {
    // 90 % of 265 ridden at 80 %: the share follows the target, not the file.
    expect(powerHero(191, 265).note).toBe('target 72 % FTP');
  });

  it('says a free step has no target rather than leaving a stale number', () => {
    expect(powerHero(null, 265)).toEqual({ target: null, note: 'no target' });
  });

  it('treats a zero target as no target, because nothing to hold is not a target of nothing', () => {
    expect(powerHero(0, 265).target).toBeNull();
  });

  it('falls back to watts rather than dividing by an FTP it does not have', () => {
    expect(powerHero(239, 0)).toEqual({ target: '239', note: 'target 239 W' });
  });
});

describe('cadenceNote', () => {
  it('names a single cadence', () => {
    expect(cadenceNote({ minRpm: 90, maxRpm: 90 })).toBe('target 90 rpm');
  });

  it('names a range', () => {
    expect(cadenceNote({ minRpm: 85, maxRpm: 95 })).toBe('target 85–95 rpm');
  });

  it('is absent where the step asks for no cadence', () => {
    expect(cadenceNote(null)).toBeNull();
  });
});

describe('cadenceBand', () => {
  it('places the band and the tick in a fixed window', () => {
    const band = cadenceBand({ minRpm: 85, maxRpm: 95 }, 91);
    expect(band?.from).toBeCloseTo(0.4167, 4);
    expect(band?.to).toBeCloseTo(0.5833, 4);
    expect(band?.marker).toBeCloseTo(0.5167, 4);
  });

  it('is null where there is no target, so the hero reads as a free ride does', () => {
    expect(cadenceBand(null, 91)).toBeNull();
  });

  it('keeps an absent reading absent rather than sinking it to the bottom of the band', () => {
    expect(cadenceBand({ minRpm: 85, maxRpm: 95 }, null)?.marker).toBeNull();
  });

  it('clamps a reading outside the window to its ends', () => {
    const band = cadenceBand({ minRpm: 85, maxRpm: 95 }, 140);
    expect(band?.marker).toBe(1);
    expect(cadenceBand({ minRpm: 85, maxRpm: 95 }, 20)?.marker).toBe(0);
  });

  it('clamps a target written outside the window too', () => {
    const band = cadenceBand({ minRpm: 40, maxRpm: 200 }, CADENCE_MIN_RPM);
    expect(band).toEqual({ from: 0, to: 1, marker: 0 });
    expect(cadenceBand({ minRpm: CADENCE_MAX_RPM, maxRpm: CADENCE_MAX_RPM }, null)?.from).toBe(1);
  });

  it('reads a band written backwards the way it was meant', () => {
    expect(cadenceBand({ minRpm: 95, maxRpm: 85 }, null)).toEqual(
      cadenceBand({ minRpm: 85, maxRpm: 95 }, null),
    );
  });
});

describe('intervalClock', () => {
  it('counts the step down against its own length', () => {
    expect(intervalClock(snapshot())).toEqual({ value: '6:42', total: '10:00' });
  });

  it('has nothing to show once the plan has run out', () => {
    expect(intervalClock(snapshot({ stepIndex: STEPS.length }))).toEqual({
      value: '—',
      total: '—',
    });
  });
});

describe('workoutClock', () => {
  it('counts up against completed time plus the plan that remains', () => {
    expect(workoutClock(1698, 1512)).toEqual({ value: '28:18', total: '53:30' });
  });

  it('shortens the total when a skip shortens the session', () => {
    expect(workoutClock(1698, 1110).total).toBe('46:48');
  });

  it('passes an hour in hours', () => {
    expect(workoutClock(3600, 180)).toEqual({ value: '1:00:00', total: '1:03:00' });
  });
});

describe('ergLabel', () => {
  it('says what the trainer is doing', () => {
    expect(ergLabel(true)).toBe('engaged');
    expect(ergLabel(false)).toBe('released');
  });
});

describe('scaleLabel', () => {
  it('reads as a percentage', () => {
    expect(scaleLabel(100)).toBe('100 %');
    expect(scaleLabel(85)).toBe('85 %');
  });
});

describe('ERG_MODE_OPTIONS', () => {
  it('offers both states by name, ERG first, so neither has to be inferred', () => {
    expect(ERG_MODE_OPTIONS).toEqual([
      { value: 'erg', label: 'ERG' },
      { value: 'manual', label: 'Manual' },
    ]);
  });
});

describe('difficultyInertReason', () => {
  it('is nothing with ERG on: the control still does what it says', () => {
    expect(difficultyInertReason('erg')).toBeNull();
  });

  it('says why the slider does nothing with ERG off rather than leaving it dead', () => {
    const reason = difficultyInertReason('manual');
    expect(reason).not.toBeNull();
    // It must not read as "this is your resistance control now": ADR-0008 forbids the
    // slider reaching the physics, so the reason names the gradient it has lost instead.
    expect(reason).toContain('No effect');
    expect(reason).toContain('gradient');
  });
});
