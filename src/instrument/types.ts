/**
 * Event shapes for the phase 1 background experiment. Kept in their own module so
 * stats.ts and recorder.ts can both depend on them without an import cycle.
 */

export type EventKind =
  | 'ibd-notification' // Indoor Bike Data arrived from the trainer
  | 'timer-tick' // the control probe: the thing we expect Chrome to throttle
  | 'hr-notification'
  | 'control-write' // a control point command was sent
  | 'control-response' // its indication came back
  | 'connection-state'
  | 'visibility-change'
  | 'marker'; // user-pressed, to annotate a run

/** Canonical order, used for deterministic rendering and export. */
export const EVENT_KINDS: readonly EventKind[] = [
  'ibd-notification',
  'timer-tick',
  'hr-notification',
  'control-write',
  'control-response',
  'connection-state',
  'visibility-change',
  'marker',
];

/** Small and JSON-serialisable: the log has to survive a round trip to a file. */
export type EventDetail = Record<string, string | number | boolean | null | undefined>;

export interface RecordedEvent {
  kind: EventKind;
  t: number; // performance.now(), the measurement that matters
  wallClock: string; // ISO 8601, for correlating with what you were doing
  detail?: EventDetail;
}
