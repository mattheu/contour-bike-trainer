import { useState } from 'react';
import { SettingsPanel } from '../components/SettingsPanel';
import { LABEL, MONO } from '../components/styles';
import {
  ADVANCED_FIELDS,
  PRIMARY_FIELDS,
  PROFILE_FIELDS,
  clampProfile,
  formatValue,
  type FieldSpec,
  type ProfileField,
  type RiderProfile as Profile,
  parseField,
} from './rider-profile';

interface RiderProfileProps {
  profile: Profile;
  /** One field at a time, merged into the stored blob by the settings repository. */
  onChange: (patch: Partial<Profile>) => void;
  onClose: () => void;
}

const SECTION =
  'border-hairline flex flex-col gap-[16px] border-t pt-[32px] first:border-t-0 first:pt-0';

type Drafts = Record<ProfileField, string>;
type Errors = Partial<Record<ProfileField, string>>;

function draftsFrom(profile: Profile): Drafts {
  const out = {} as Drafts;
  for (const spec of PROFILE_FIELDS) out[spec.key] = formatValue(spec.key, profile[spec.key]);
  return out;
}

/**
 * The set-once numbers, deliberately not in the ride settings panel.
 *
 * The split is the point: the ride panel holds what you change on the bike — devices,
 * difficulty, targets — and this holds what is true about the rider whatever they are
 * riding. Mixing them would put FTP a mis-tap away mid-interval, which is how a ride ends
 * up re-zoned halfway through.
 *
 * Each valid keystroke persists. There is no Save: a settings blob that merges one key at
 * a time has nothing to batch, and a Save button would only invent a state where what is
 * on the glass and what is stored disagree.
 */
export function RiderProfile({ profile, onChange, onClose }: RiderProfileProps) {
  // Seeded once. The panel owns the draft text from here, so a re-render upstream cannot
  // take half-typed characters out of the field. Clamped on the way in because a blob
  // written by an older build can still hold an FTP the zones would divide by.
  const [committed, setCommitted] = useState<Profile>(() => clampProfile(profile));
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(clampProfile(profile)));
  const [errors, setErrors] = useState<Errors>({});

  const edit = (key: ProfileField, raw: string) => {
    setDrafts((current) => ({ ...current, [key]: raw }));
    const result = parseField(key, raw);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [key]: result.message }));
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCommitted((current) => ({ ...current, [key]: result.value }));
    onChange({ [key]: result.value });
  };

  /** Leaving a field in a state that was never stored would be a lie about what is saved. */
  const restore = (key: ProfileField) => {
    if (errors[key] === undefined) return;
    setDrafts((current) => ({ ...current, [key]: formatValue(key, committed[key]) }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  return (
    <SettingsPanel title="Rider profile" onClose={onClose}>
      <div className="flex flex-col gap-[32px]">
        {PRIMARY_FIELDS.map((spec) => (
          <Field
            key={spec.key}
            spec={spec}
            value={drafts[spec.key]}
            error={errors[spec.key]}
            onEdit={edit}
            onRestore={restore}
          />
        ))}
      </div>

      <div className={SECTION}>
        <div className="flex flex-col gap-[6px]">
          <div className={`${LABEL} text-caption`}>Advanced</div>
          <div className="text-caption text-muted font-sans">
            Aerodynamics and rolling resistance. Optional — the defaults suit most riders on road
            tyres.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-[16px]">
          {ADVANCED_FIELDS.map((spec) => (
            <Field
              key={spec.key}
              spec={spec}
              value={drafts[spec.key]}
              error={errors[spec.key]}
              onEdit={edit}
              onRestore={restore}
              compact
            />
          ))}
        </div>
      </div>

      <div className="grow" />
      <div className="text-caption text-muted font-sans">
        Rides already recorded keep the FTP, maximum heart rate and weights they were ridden with,
        so changing these does not re-zone your history.
      </div>
    </SettingsPanel>
  );
}

function Field({
  spec,
  value,
  error,
  onEdit,
  onRestore,
  compact = false,
}: {
  spec: FieldSpec;
  value: string;
  error?: string;
  onEdit: (key: ProfileField, raw: string) => void;
  onRestore: (key: ProfileField) => void;
  /** The advanced four, which sit three-up and drop their label to the smaller size. */
  compact?: boolean;
}) {
  const id = `profile-${spec.key}`;

  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className={compact ? `${MONO} text-micro text-muted` : LABEL}>
        {spec.label}
      </label>
      <div className="flex items-baseline gap-[10px]">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={spec.step}
          min={spec.min}
          max={spec.max}
          value={value}
          onChange={(event) => onEdit(spec.key, event.target.value)}
          onBlur={() => onRestore(spec.key)}
          aria-invalid={error !== undefined}
          className={[
            MONO,
            'min-h-[44px] w-full border-0 border-b bg-transparent py-[8px]',
            compact ? 'text-caption' : 'text-sub',
            error === undefined ? 'border-hairline text-ink' : 'border-alert text-alert',
          ].join(' ')}
        />
        {spec.unit !== '' && (
          <span className={`${MONO} text-caption text-muted shrink-0`}>{spec.unit}</span>
        )}
      </div>
      {error !== undefined && <div className="text-caption text-alert font-sans">{error}</div>}
      {spec.hint !== undefined && (
        <div className="text-caption text-muted font-sans">{spec.hint}</div>
      )}
    </div>
  );
}
