import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type {
  CadenceTarget,
  PowerValue,
  RepeatBlock,
  StepPower,
  Workout,
  WorkoutNode,
  WorkoutStep,
} from './types';

/**
 * YAML text to a Workout, with every failure carrying a line and a column.
 *
 * The rider writes this in a textarea, so the position matters as much as the message:
 * "step 3 has no duration" is only useful if it points at step 3. yaml's AST keeps a
 * range on every node, so semantic errors are reported against the node that is wrong
 * rather than against the top of the file.
 */

/** Generous ceilings, there to stop a typo rather than to express a view on training. */
const MAX_STEP_DURATION_S = 4 * 60 * 60;
const MAX_FTP_PERCENT = 300;
const MAX_WATTS = 2000;
const MAX_CADENCE_RPM = 200;
const MAX_REPEAT_COUNT = 100;
const MAX_REPEAT_DEPTH = 10;
/** The expanded list the runner and the Steps panel read. Nested repeats multiply, so cap the product. */
export const MAX_EXPANDED_STEPS = 1000;

const WORKOUT_KEYS = ['name', 'description', 'ftp', 'warmup', 'steps', 'cooldown'];
const STEP_KEYS = ['duration', 'power', 'ramp', 'cadence', 'name'];
const REPEAT_KEYS = ['repeat', 'steps'];

const DURATION_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const PERCENT_PATTERN = /^(\d+(?:\.\d+)?)\s*%$/;
const WATTS_PATTERN = /^(\d+(?:\.\d+)?)\s*[Ww]$/;

export class WorkoutParseError extends Error {
  /** Both 1-based, so they can be reported to a rider as written. */
  readonly line: number;
  readonly column: number;

  constructor(detail: string, line: number, column: number) {
    super(`${detail} (line ${line}, column ${column})`);
    this.name = 'WorkoutParseError';
    this.line = line;
    this.column = column;
  }
}

interface Context {
  lineCounter: LineCounter;
}

/** Every yaml node carries a range; anything else is reported against the start of the file. */
function positionOf(context: Context, node: unknown): { line: number; column: number } {
  const range = (node as { range?: [number, number, number] } | null | undefined)?.range;
  const { line, col } = context.lineCounter.linePos(range?.[0] ?? 0);
  return { line, column: col };
}

function fail(context: Context, detail: string, node: unknown): never {
  const { line, column } = positionOf(context, node);
  throw new WorkoutParseError(detail, line, column);
}

/** Durations are `90s`, `10m`, `1h30m`. Null for anything else, so the caller can place the error. */
export function parseDuration(text: string): number | null {
  const match = DURATION_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (hours === undefined && minutes === undefined && seconds === undefined) return null;
  const total = Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
  return total > 0 ? total : null;
}

/** `95%` or `250W`. Null for anything else, including `free`, which is not a value. */
export function parsePowerValue(text: string): PowerValue | null {
  const trimmed = text.trim();
  const percent = PERCENT_PATTERN.exec(trimmed);
  if (percent?.[1] !== undefined) {
    const value = Number(percent[1]);
    return value > 0 && value <= MAX_FTP_PERCENT ? { unit: 'ftpPercent', value } : null;
  }
  const watts = WATTS_PATTERN.exec(trimmed);
  if (watts?.[1] !== undefined) {
    const value = Number(watts[1]);
    return value > 0 && value <= MAX_WATTS ? { unit: 'watts', value } : null;
  }
  return null;
}

function scalarString(node: unknown): string | null {
  if (!isScalar(node)) return null;
  return typeof node.value === 'string' ? node.value : null;
}

function scalarNumber(node: unknown): number | null {
  if (!isScalar(node)) return null;
  return typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : null;
}

/** An unknown key is nearly always a typo, and a typo that parses is worse than one that does not. */
function rejectUnknownKeys(
  context: Context,
  node: unknown,
  allowed: string[],
  where: string,
): void {
  if (!isMap(node)) return;
  for (const item of node.items) {
    const key = scalarString(item.key);
    if (key === null || !allowed.includes(key)) {
      fail(context, `${where} has an unknown key "${key ?? String(item.key)}"`, item.key);
    }
  }
}

function requireMap(context: Context, node: unknown, where: string, at: unknown) {
  if (!isMap(node)) fail(context, `${where} must be a block of keys`, node ?? at);
  return node;
}

function parseDurationNode(context: Context, node: unknown, where: string, at: unknown): number {
  if (node === undefined || node === null) fail(context, `${where} has no duration`, at);
  const text = scalarString(node);
  const seconds = text === null ? null : parseDuration(text);
  if (seconds === null) {
    fail(context, `${where} has an unreadable duration: write it as 90s, 10m or 1h30m`, node);
  }
  if (seconds > MAX_STEP_DURATION_S) {
    fail(context, `${where} is longer than ${MAX_STEP_DURATION_S / 3600} hours`, node);
  }
  return seconds;
}

function parsePowerNode(context: Context, node: unknown, where: string): StepPower {
  const text = scalarString(node);
  if (text === null) {
    fail(context, `${where} has an unreadable power: write it as 95%, 250W or free`, node);
  }
  if (text.trim().toLowerCase() === 'free') return { kind: 'free' };
  const value = parsePowerValue(text);
  if (value === null) {
    fail(context, `${where} has an unreadable power: write it as 95%, 250W or free`, node);
  }
  return { kind: 'constant', value };
}

function parseRampNode(context: Context, node: unknown, where: string): StepPower {
  if (!isSeq(node) || node.items.length !== 2) {
    fail(context, `${where} has an unreadable ramp: write it as [50%, 75%]`, node);
  }
  const [fromNode, toNode] = node.items;
  const ends = [fromNode, toNode].map((end) => {
    const text = scalarString(end);
    // free is deliberately not a ramp end: there is nothing to ramp to or from.
    const value = text === null ? null : parsePowerValue(text);
    if (value === null) {
      fail(context, `${where} has a ramp end that is not a power: write it as 50% or 250W`, end);
    }
    return value;
  });
  return { kind: 'ramp', from: ends[0] as PowerValue, to: ends[1] as PowerValue };
}

function parseCadenceNode(context: Context, node: unknown, where: string): CadenceTarget {
  const single = scalarNumber(node);
  if (single !== null) {
    if (single <= 0 || single > MAX_CADENCE_RPM) {
      fail(context, `${where} has a cadence outside 1-${MAX_CADENCE_RPM} rpm`, node);
    }
    return { minRpm: single, maxRpm: single };
  }
  if (isSeq(node) && node.items.length === 2) {
    const bounds = node.items.map((item) => {
      const rpm = scalarNumber(item);
      if (rpm === null || rpm <= 0 || rpm > MAX_CADENCE_RPM) {
        fail(context, `${where} has a cadence outside 1-${MAX_CADENCE_RPM} rpm`, item);
      }
      return rpm;
    }) as [number, number];
    if (bounds[0] > bounds[1]) {
      fail(context, `${where} has a cadence range that runs backwards`, node);
    }
    return { minRpm: bounds[0], maxRpm: bounds[1] };
  }
  fail(context, `${where} has an unreadable cadence: write it as 90 or [85, 95]`, node);
}

function parseNameNode(context: Context, node: unknown, where: string): string {
  const text = scalarString(node);
  if (text === null || text.trim() === '') fail(context, `${where} has an empty name`, node);
  return text.trim();
}

function parseStep(context: Context, node: unknown, where: string, at: unknown): WorkoutStep {
  const map = requireMap(context, node, where, at);
  rejectUnknownKeys(context, map, STEP_KEYS, where);

  const powerNode = map.get('power', true);
  const rampNode = map.get('ramp', true);
  if (powerNode !== undefined && rampNode !== undefined) {
    fail(context, `${where} has both power and ramp: a step holds one or the other`, rampNode);
  }
  if (powerNode === undefined && rampNode === undefined) {
    fail(context, `${where} has no power: write power: 95%, power: free or ramp: [50%, 75%]`, map);
  }

  const step: WorkoutStep = {
    kind: 'step',
    durationS: parseDurationNode(context, map.get('duration', true), where, map),
    power:
      rampNode === undefined
        ? parsePowerNode(context, powerNode, where)
        : parseRampNode(context, rampNode, where),
  };

  const cadenceNode = map.get('cadence', true);
  if (cadenceNode !== undefined) step.cadence = parseCadenceNode(context, cadenceNode, where);
  const nameNode = map.get('name', true);
  if (nameNode !== undefined) step.name = parseNameNode(context, nameNode, where);
  return step;
}

function parseRepeat(context: Context, node: unknown, where: string, depth: number): RepeatBlock {
  const map = requireMap(context, node, where, node);
  rejectUnknownKeys(context, map, REPEAT_KEYS, where);

  const countNode = map.get('repeat', true);
  const count = scalarNumber(countNode);
  if (count === null || !Number.isInteger(count) || count < 1 || count > MAX_REPEAT_COUNT) {
    fail(
      context,
      `${where} must repeat a whole number of times, 1 to ${MAX_REPEAT_COUNT}`,
      countNode,
    );
  }
  if (depth > MAX_REPEAT_DEPTH) {
    fail(context, `${where} nests repeats more than ${MAX_REPEAT_DEPTH} deep`, map);
  }
  return {
    kind: 'repeat',
    count,
    steps: parseStepList(context, map.get('steps', true), where, map, depth),
  };
}

/** The steps of a workout or of a repeat: a non-empty sequence of steps and nested repeats. */
function parseStepList(
  context: Context,
  node: unknown,
  where: string,
  at: unknown,
  depth: number,
): WorkoutNode[] {
  if (node === undefined || node === null) fail(context, `${where} has no steps`, at);
  if (!isSeq(node)) fail(context, `${where} must be a list of steps`, node);
  if (node.items.length === 0) fail(context, `${where} has no steps`, node);

  return node.items.map((item, index) => {
    const label = where === 'the workout' ? `step ${index + 1}` : `${where}.${index + 1}`;
    if (isMap(item) && item.get('repeat', true) !== undefined) {
      return parseRepeat(context, item, label, depth + 1);
    }
    return parseStep(context, item, label, item);
  });
}

/** The product of the repeat counts: what the expanded list will actually be. */
function expandedCount(nodes: readonly WorkoutNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === 'step' ? 1 : node.count * expandedCount(node.steps)),
    0,
  );
}

export function parseWorkout(source: string): Workout {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new WorkoutParseError('The workout is empty', 1, 1);
  }

  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter });
  const context: Context = { lineCounter };

  const first = document.errors[0];
  if (first !== undefined) {
    // yaml's pretty message appends its own position and a source snippet; keep the prose.
    const [detail] = first.message.split(' at line ');
    const [start] = first.linePos ?? [];
    throw new WorkoutParseError(
      detail ?? 'The workout is not valid YAML',
      start?.line ?? 1,
      start?.col ?? 1,
    );
  }

  const root = document.contents;
  if (!isMap(root)) {
    fail(context, 'The workout must be a block of keys, starting with its name', root);
  }
  rejectUnknownKeys(context, root, WORKOUT_KEYS, 'the workout');

  const workout: Workout = {
    name: parseNameNode(context, root.get('name', true), 'the workout'),
    steps: parseStepList(context, root.get('steps', true), 'the workout', root, 0),
  };

  const descriptionNode = root.get('description', true);
  if (descriptionNode !== undefined) {
    const description = scalarString(descriptionNode);
    if (description === null)
      fail(context, 'The description must be a line of text', descriptionNode);
    workout.description = description.trim();
  }

  const ftpNode = root.get('ftp', true);
  if (ftpNode !== undefined) {
    const ftp = scalarNumber(ftpNode);
    if (ftp === null || ftp <= 0 || ftp > MAX_WATTS) {
      fail(context, `The workout ftp must be a number of watts, 1 to ${MAX_WATTS}`, ftpNode);
    }
    workout.ftp = ftp;
  }

  // Warmup and cooldown are ordinary steps given their own keys, so they parse as steps.
  const warmupNode = root.get('warmup', true);
  if (warmupNode !== undefined) {
    workout.warmup = parseStep(context, warmupNode, 'the warmup', root);
  }
  const cooldownNode = root.get('cooldown', true);
  if (cooldownNode !== undefined) {
    workout.cooldown = parseStep(context, cooldownNode, 'the cooldown', root);
  }

  const total = expandedCount(workout.steps);
  if (total > MAX_EXPANDED_STEPS) {
    fail(
      context,
      `The workout expands to ${total} steps, more than the ${MAX_EXPANDED_STEPS} allowed`,
      root,
    );
  }

  return workout;
}
