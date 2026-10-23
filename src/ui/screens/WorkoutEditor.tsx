import { useCallback, useState } from 'react';
import type { AlertState } from '../../ride/types';
import type { Workout as StoredWorkout } from '../../storage/types';
import { Button } from '../components/Button';
import { CONTROL_GAP } from '../components/control';
import { LABEL, MONO, SERIF } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import {
  READ_ONLY_NOTE,
  caretRow,
  saveAlert,
  validateSource,
  type ParseFailure,
  type SaveResult,
} from './workout-editor';
import { canEditWorkout } from './workouts-list';
import { WORKOUT_REFERENCE } from './workout-reference';

interface WorkoutEditorProps {
  workout: StoredWorkout;
  /** Writes the source as given; the record's name comes back out of the YAML. */
  onSave: (workoutId: string, source: string) => Promise<SaveResult>;
  onClose: () => void;
  /** The ids this build supplies: see services.builtInWorkouts. One of those opens for
   * reading — the starters are the documentation and must still be legible here. */
  builtIn: ReadonlySet<string>;
}

/**
 * No mockup: a textarea holding the YAML, and the controls DESIGN.md allows around it.
 *
 * What is stored is this text, not a parsed tree, so comments and layout survive a round
 * trip and the file the rider wrote is the file they get back. It is validated on save
 * rather than on every keystroke — an error that appears halfway through typing a
 * duration is noise — and a failure names its line and column and shows the line itself,
 * because "step 3 has no duration" is a hunt without them.
 *
 * Save is ink rather than accent: DESIGN.md gives Save to the single committing action,
 * and the accent on this part of the app is New workout on the list behind it.
 *
 * A starter opens read-only: the box is not editable and Save is absent rather than
 * disabled, because a disabled control says this could happen and currently cannot. What
 * stays is everything the starter is for — its YAML, its comments, and the format
 * reference beside it — and one line saying what this workout is.
 */
export function WorkoutEditor({ workout, onSave, onClose, builtIn }: WorkoutEditorProps) {
  const editable = canEditWorkout(workout.id, builtIn);
  const [draft, setDraft] = useState(workout.source);
  // What is actually in storage, so "unsaved changes" means it rather than merely
  // meaning that the rider has typed something.
  const [saved, setSaved] = useState(workout.source);
  const [failure, setFailure] = useState<ParseFailure | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const clearAlert = useCallback(() => setAlert(null), []);
  const [saving, setSaving] = useState(false);

  const edit = (next: string) => {
    setDraft(next);
    // The error pointed at a line that has just moved under it.
    setFailure(null);
  };

  const save = () => {
    const result = validateSource(draft);
    if (!result.ok) {
      setFailure(result.failure);
      setAlert(null);
      return;
    }
    setFailure(null);
    setSaving(true);
    void onSave(workout.id, draft).then((outcome) => {
      setSaving(false);
      if (outcome.status === 'saved') setSaved(draft);
      setAlert(saveAlert(outcome, result.workout.name));
    });
  };

  const dirty = draft !== saved;

  return (
    <div className="text-ink flex h-screen flex-col gap-[24px] overflow-hidden px-[16px] sm:px-[40px] wide:px-[64px] py-[24px] sm:py-[44px]">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-[18px]">
          <Logo />
          {/* Serif, as a workout's name is everywhere else it appears. */}
          <div className={`${SERIF} text-title`}>{workout.name}</div>
          {dirty && (
            <div className={`${LABEL} text-micro whitespace-nowrap`}>· unsaved changes</div>
          )}
        </div>
        <div className={`flex items-center ${CONTROL_GAP}`}>
          {editable && (
            <Button tone="ink" onClick={save} disabled={saving}>
              Save
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      </header>

      {alert !== null && <AlertStrip alert={alert} onDismiss={clearAlert} onRetry={clearAlert} />}

      {/* The header and the alert stay full width; everything below them is the box and
          the reference beside it. */}
      <div className="flex min-h-0 grow gap-[24px]">
        <div className="flex min-h-0 min-w-0 grow flex-col gap-[24px]">
          <label htmlFor="workout-source" className={`${LABEL} text-micro shrink-0`}>
            Workout
          </label>
          {/* wrap off: a wrapped line makes the line the error names impossible to count to. */}
          <textarea
            id="workout-source"
            value={draft}
            onChange={(event) => edit(event.target.value)}
            readOnly={!editable}
            spellCheck={false}
            wrap="off"
            aria-invalid={failure !== null}
            aria-describedby={
              failure !== null ? 'workout-source-error' : editable ? undefined : 'workout-read-only'
            }
            className={[
              MONO,
              'text-label bg-ground/60 min-h-0 grow resize-none border p-[16px] leading-[1.6]',
              'focus-visible:outline-ink focus-visible:outline-2 focus-visible:outline-offset-2',
              failure === null ? 'border-hairline text-ink' : 'border-alert text-ink',
            ].join(' ')}
          />

          {/* Where the failure would be, and for the same reason: it is about the box. */}
          {!editable && (
            <p id="workout-read-only" className={`${NOTE} shrink-0`}>
              {READ_ONLY_NOTE}
            </p>
          )}

          {/* Under the box rather than under the row: it points at a line in the box. */}
          {failure !== null && <Failure failure={failure} />}
        </div>

        <Reference />
      </div>
    </div>
  );
}

/**
 * The format, beside the box it is about. Static and always open: there is no toggle to
 * find and nothing to click, because YAML is indentation-sensitive and a snippet inserted
 * at the wrong depth is a parse error — worse than no help at all.
 *
 * Every fragment in it is data in workout-reference.ts, checked against parse.ts by
 * workout-reference.test.ts, so it cannot quietly drift into describing a format the app
 * no longer reads.
 *
 * No accent and no box: this is reference material rather than an action, and nothing
 * here is pressable. Save stays the only emphasised control on the screen.
 */
function Reference() {
  return (
    <aside
      aria-labelledby="workout-format-heading"
      className="flex w-[380px] shrink-0 flex-col gap-[24px]"
    >
      <h2 id="workout-format-heading" className={`${LABEL} text-micro shrink-0`}>
        Format
      </h2>
      {/* Scrolls inside itself: the screen does not scroll, and the box does not narrow. */}
      <div className="bg-ground/60 flex min-h-0 grow flex-col gap-[24px] overflow-y-auto p-[16px]">
        {WORKOUT_REFERENCE.map((section) => (
          <section key={section.heading} className={SECTION}>
            <h3 className={`${LABEL} text-caption`}>{section.heading}</h3>
            {section.note !== undefined && <p className={NOTE}>{section.note}</p>}
            {section.entries.map((entry) => (
              <div key={entry.snippet.code} className="flex flex-col gap-[4px]">
                <pre className={`${MONO} text-caption text-ink m-0 overflow-x-auto`}>
                  {entry.snippet.code}
                </pre>
                {entry.detail !== undefined && <p className={NOTE}>{entry.detail}</p>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

/** The divided block RiderProfile's Advanced section uses, at the sidebar's tighter rhythm. */
const SECTION =
  'border-hairline flex flex-col gap-[12px] border-t pt-[24px] first:border-t-0 first:pt-0';

/** Sans for the prose about the YAML, so the two are never mistaken for each other. */
const NOTE = 'text-caption text-muted m-0 font-sans';

/**
 * The message against the line it names. The excerpt is the rider's own line with a caret
 * under the column, which is the difference between being told what is wrong and being
 * told where — in a textarea there is nothing else to point with.
 */
function Failure({ failure }: { failure: ParseFailure }) {
  return (
    <div
      id="workout-source-error"
      role="alert"
      className="border-hairline flex shrink-0 flex-col gap-[6px] border-t pt-[16px]"
    >
      <div className="flex items-baseline gap-[12px]">
        <span className={`${MONO} text-caption text-alert whitespace-nowrap`}>
          Line {failure.line}, column {failure.column}
        </span>
        <span className="text-caption text-alert font-sans">{failure.detail}</span>
      </div>
      {failure.text !== null && (
        <pre className={`${MONO} text-caption text-muted m-0 overflow-x-auto`}>
          <span className="text-ink">{failure.text}</span>
          {'\n'}
          <span className="text-alert">{caretRow(failure.text, failure.column)}</span>
        </pre>
      )}
    </div>
  );
}
