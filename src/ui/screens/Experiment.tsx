import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  CONCLUSION_LABELS,
  computeVerdict,
  formatDurationMs,
  formatShare,
  parseLogExport,
  type LoadedRun,
  type StreamAssessment,
  type Verdict,
} from '../../instrument/verdict';
import { Logo } from '../components/Wordmark';
import { Button } from '../components/Button';
import { CONTROL_GAP } from '../components/control';
import { LABEL, MONO, SERIF } from '../components/styles';
import { ms, num } from '../format';
import * as services from '../services';
import { experimentStore, type ExperimentSnapshot } from '../store';
import { useRideStore } from '../useRideStore';

/**
 * The instrument that decides ADR-0000: does Chrome throttle a hidden tab's Bluetooth
 * notifications, and therefore is this app a browser tab or an Electron shell.
 *
 * Deliberately plain. Everything on it is either a measurement or a control over one, and
 * a run that cannot be trusted says so above its own conclusion — a confident wrong answer
 * here is worse than none, because phase 5 is built on whichever way this goes.
 *
 * It computes nothing itself: the verdict, the validity rules and the statistics all live
 * in src/instrument, under test, and this file renders what they return.
 */
export function Experiment() {
  const experiment = useSyncExternalStore<ExperimentSnapshot>(
    experimentStore.subscribe,
    experimentStore.getSnapshot,
  );
  // Hidden and visible totals, which decide whether the run counts at all.
  const visibility = useSyncExternalStore(
    services.visibility.subscribe,
    services.visibility.getSnapshot,
  );
  const ride = useRideStore();

  const [loaded, setLoaded] = useState<{ name: string; run: LoadedRun } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const verdict = useMemo(
    () =>
      computeVerdict({
        summary: experiment.summary,
        visibility,
        droppedEvents: experiment.droppedEvents,
      }),
    [experiment.summary, experiment.droppedEvents, visibility],
  );

  async function loadFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    const result = parseLogExport(await file.text());
    if (result.ok) {
      setLoaded({ name: file.name, run: result.run });
      setLoadError(null);
    } else {
      setLoaded(null);
      setLoadError(result.error);
    }
  }

  return (
    <div className="text-ink h-screen overflow-y-auto">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-[28px] page-gutter page-gutter-y">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-[18px]">
            <Logo />
            <div className={`${SERIF} text-title`}>Background experiment</div>
            <div className={`${LABEL} text-caption`}>ADR-0000 · proposed</div>
          </div>
          <div className={`${MONO} text-caption text-muted flex gap-[18px]`}>
            <span>{services.source}</span>
            <span>window {experiment.visibilityState}</span>
            <span>probe {experiment.running ? 'running' : 'stopped'}</span>
          </div>
        </header>

        <Devices ride={ride} />

        <div className={loaded === null ? '' : 'grid grid-cols-2 gap-[40px]'}>
          <VerdictPanel
            heading="This run"
            subheading={`${services.source} · ${num(experiment.eventCount)} events recorded`}
            verdict={verdict}
          />
          {loaded !== null && (
            <VerdictPanel
              heading={loaded.name}
              subheading={`${loaded.run.source} · ${num(loaded.run.eventCount)} events${
                loaded.run.startWallClock === null ? '' : ` · ${loaded.run.startWallClock}`
              }`}
              verdict={loaded.run.verdict}
            />
          )}
        </div>

        <Controls
          running={experiment.running}
          deviceConnected={ride.trainerState === 'connected' || ride.hrmState === 'connected'}
          onLoadFile={(file) => void loadFile(file)}
          onClearLoaded={() => {
            setLoaded(null);
            setLoadError(null);
          }}
          loadedName={loaded?.name ?? null}
          loadError={loadError}
        />
      </div>
    </div>
  );
}

/**
 * Condition 3 measures Bluetooth notifications, so there has to be a device sending them.
 * The normal ride flow is bypassed here, and with it the settings panel that pairs a
 * device, which would otherwise leave the instrument measuring nothing but its own timer.
 */
function Devices({ ride }: { ride: ReturnType<typeof useRideStore> }) {
  return (
    <div className={`border-hairline flex items-center border-t border-b py-[16px] ${CONTROL_GAP}`}>
      <div className={`${MONO} text-caption text-muted grow`}>
        {`trainer ${ride.trainerState} · ${num(ride.powerW)} W · ${num(ride.cadenceRpm)} rpm`}
        {` — hrm ${ride.hrmState} · ${num(ride.heartRateBpm)} bpm`}
      </div>
      <Button
        onClick={() =>
          void (ride.trainerState === 'connected'
            ? services.disconnectTrainer()
            : services.connectTrainer())
        }
      >
        {deviceButtonLabel('trainer', ride.trainerState)}
      </Button>
      <Button
        onClick={() =>
          void (ride.hrmState === 'connected' ? services.disconnectHrm() : services.connectHrm())
        }
      >
        {deviceButtonLabel('HRM', ride.hrmState)}
      </Button>
    </div>
  );
}

/** The verdict, its validity, then the numbers under it — in that order, so the sentence
 * a person acts on is never below the evidence they would have to assemble themselves. */
function VerdictPanel({
  heading,
  subheading,
  verdict,
}: {
  heading: string;
  subheading: string;
  verdict: Verdict;
}) {
  const { validity } = verdict;

  return (
    <section className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[4px]">
        <div className={LABEL}>{heading}</div>
        <div className={`${MONO} text-caption text-muted`}>{subheading}</div>
        {/* Counts beside the conclusion: a verdict that changes is then explained by the
            stream that changed under it, rather than looking like the panel is unstable. */}
        <div className={`${MONO} text-caption text-muted`}>
          {verdict.streams
            .map(
              (stream) =>
                `${STREAM_LABELS[stream.kind] ?? stream.kind} ${stream.stats?.count ?? 0}`,
            )
            .join(' · ')}
        </div>
      </div>

      {validity.valid ? (
        <div className="flex flex-col gap-[10px]">
          <div className={`${SERIF} text-stat`}>{CONCLUSION_LABELS[verdict.conclusion]}</div>
          <div className="text-body text-ink max-w-[62ch] font-sans">{verdict.summary}</div>
          <div className={`${MONO} text-caption text-muted`}>
            {`confidence ${verdict.confidence}`}
          </div>
          {validity.warnings.map((warning) => (
            <div key={warning} className={`${MONO} text-caption text-muted max-w-[62ch]`}>
              {warning}
            </div>
          ))}
        </div>
      ) : (
        /* An invalid run has no conclusion. Showing one at full size and disowning it
           underneath is how a wrong answer gets acted on — the shell decision rests on
           this, so the headline has to be the honest one. */
        <div className="flex flex-col gap-[10px]">
          <div className={`${SERIF} text-stat`}>No answer yet</div>
          <div className="text-body text-ink max-w-[62ch] font-sans">
            This run cannot tell you whether Chrome throttles the app. Fix the points above and run
            it again.
          </div>
          <Invalid problems={validity.problems} />
          <div className={`${MONO} text-caption text-muted max-w-[62ch]`}>
            {`for reference only, on an invalid run: ${CONCLUSION_LABELS[verdict.conclusion].toLowerCase()}`}
          </div>
        </div>
      )}

      <Facts verdict={verdict} />
      <Streams streams={verdict.streams} />
    </section>
  );
}

const STREAM_LABELS: Partial<Record<string, string>> = {
  'timer-tick': 'timer',
  'ibd-notification': 'bike data',
  'hr-notification': 'heart rate',
};

/** What to connect, and what the one button does next. A button that still reads
 * "Connect trainer" after connecting is the clearest possible way to look broken. */
function deviceButtonLabel(device: string, state: string): string {
  if (state === 'connected') return `Disconnect ${device}`;
  if (state === 'connecting') return 'Connecting…';
  if (state === 'reconnecting') return 'Reconnecting…';
  return `Connect ${device}`;
}

/** design/DESIGN.md > Alerts: a warning is a hairline box with a 2 px amber left edge. */
function Invalid({ problems }: { problems: readonly string[] }) {
  return (
    <div className="border-hairline border-l-alert flex flex-col gap-[6px] border border-l-2 p-[16px]">
      <div className={`${LABEL} text-caption text-ink`}>This run is not valid</div>
      {problems.map((problem) => (
        <div key={problem} className="text-caption text-muted max-w-[62ch] font-sans">
          {problem}
        </div>
      ))}
    </div>
  );
}

function Facts({ verdict }: { verdict: Verdict }) {
  const { validity } = verdict;
  const rows: { label: string; value: string }[] = [
    { label: 'Elapsed', value: formatDurationMs(validity.elapsedMs) },
    { label: 'Hidden', value: formatDurationMs(validity.hiddenMs) },
    { label: 'Visible', value: formatDurationMs(validity.visibleMs) },
    { label: 'Share hidden', value: formatShare(validity.hiddenShare) },
    { label: 'Past 5 min hidden', value: validity.pastIntensiveThreshold ? 'yes' : 'no' },
    { label: 'Busiest stream', value: `${num(validity.sampleCount)} events` },
    { label: 'Dropped', value: num(validity.droppedEvents) },
  ];

  return (
    <div className="grid grid-cols-4 gap-x-[24px] gap-y-[14px]">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-[4px]">
          <div className={`${LABEL} text-micro`}>{row.label}</div>
          <div className={`${MONO} text-caption text-ink`}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

const CELL = 'py-[8px] text-left align-baseline';

/**
 * The control timer against the notification streams: the comparison is the experiment.
 * verdict.streams is assessStreams() over the same summary, so the table and the
 * conclusion can never be reading different numbers.
 */
function Streams({ streams }: { streams: readonly StreamAssessment[] }) {
  return (
    <table className={`${MONO} text-caption w-full border-collapse`}>
      <thead>
        <tr className="border-hairline border-b">
          {['Stream', 'Health', 'Events', 'Median', 'p95', 'Max', 'Gaps > 5s'].map((head) => (
            <th key={head} className={`${LABEL} text-micro ${CELL}`} scope="col">
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {streams.map((stream) => (
          <tr key={stream.kind} className="border-hairline border-b">
            <td className={`${CELL} text-ink`}>{stream.kind}</td>
            <td className={`${CELL} ${stream.health === 'healthy' ? 'text-ink' : 'text-muted'}`}>
              {stream.health}
            </td>
            <td className={`${CELL} text-muted`}>{num(stream.stats?.count ?? 0)}</td>
            <td className={`${CELL} text-ink`}>{ms(stream.stats?.median ?? null)}</td>
            <td className={`${CELL} text-muted`}>{ms(stream.stats?.p95 ?? null)}</td>
            <td className={`${CELL} text-muted`}>{ms(stream.stats?.max ?? null)}</td>
            <td className={`${CELL} text-muted`}>{num(stream.stats?.gapsOver5s ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Controls({
  running,
  deviceConnected,
  onLoadFile,
  onClearLoaded,
  loadedName,
  loadError,
}: {
  running: boolean;
  deviceConnected: boolean;
  onLoadFile: (file: File | undefined) => void;
  onClearLoaded: () => void;
  loadedName: string | null;
  loadError: string | null;
}) {
  return (
    <div className="border-hairline flex flex-col gap-[16px] border-t pt-[24px]">
      {!running && !deviceConnected && (
        /* A Bluetooth connection does not survive a page reload, so arriving here fresh
           and starting a probe measures nothing but the timer — which is how twelve
           minutes get thrown away without anything appearing to be wrong. */
        <div className="border-hairline border-l-alert flex flex-col gap-[6px] border border-l-2 p-[16px]">
          <div className={`${LABEL} text-caption text-ink`}>No device connected</div>
          <div className="text-caption text-muted max-w-[62ch] font-sans">
            Start the probe now and the run records only its own timer, with no Bluetooth stream to
            compare it against. Connect the trainer first — a reload drops the connection, so it
            needs doing again after every refresh.
          </div>
        </div>
      )}
      <div className={`flex flex-wrap items-center ${CONTROL_GAP}`}>
        {/* The probe is the one accent control: starting and stopping it is the run. */}
        <Button
          tone={running ? 'grey' : 'accent'}
          onClick={running ? services.stopProbe : services.startProbe}
        >
          {running ? 'Stop probe' : 'Start probe'}
        </Button>
        <Button onClick={services.addMarker}>Mark condition</Button>
        <Button onClick={services.clearLog}>Clear log</Button>
        <Button onClick={services.downloadInstrumentationLog}>Download JSON</Button>
      </div>

      <div className="flex flex-wrap items-center gap-[16px]">
        <label className={`${LABEL} text-caption`} htmlFor="load-run">
          Compare a saved run
        </label>
        <input
          id="load-run"
          type="file"
          accept="application/json,.json"
          onChange={(event) => onLoadFile(event.target.files?.[0])}
          className={`${MONO} text-caption text-muted file:border-hairline file:text-muted file:mr-[12px] file:min-h-[32px] file:cursor-pointer file:border file:bg-transparent file:px-[12px] file:font-sans file:uppercase`}
        />
        {loadedName !== null && <Button onClick={onClearLoaded}>Clear comparison</Button>}
      </div>

      {loadError !== null && (
        <div className="text-caption text-muted max-w-[62ch] font-sans">{loadError}</div>
      )}

      <p className="text-caption text-muted max-w-[80ch] font-sans">
        SPEC.md asks for the same ten-minute run under four conditions: visible and focused, visible
        but unfocused, fully hidden behind a full-screen video, and the Electron spike with
        backgroundThrottling off. Connect a device, start the probe, mark the condition, leave it at
        least ten minutes, then download the JSON before clearing for the next one.
      </p>
    </div>
  );
}
