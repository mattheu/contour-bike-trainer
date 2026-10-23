import { useMemo, useRef } from 'react';
import { PHONE_METRICS, PowerStrip, phoneLandscapeChartStack } from '../charts';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import {
  EndIcon,
  MapIcon,
  PauseIcon,
  ProfileIcon,
  SettingsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../components/icons';
import { PhoneInlinePrimary, PhoneInlineStat, PhoneRowReading } from '../components/PhoneReading';
import { LABEL } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import { nextMapZoom, nextProfileZoom, viewAfterSwipe, viewToggle, zoomToggle } from './phone-ride';
import type { RideArrangementProps } from './ride-arrangement';
import { MapChart, ProfileChart } from './RideCharts';
import { useElementHeight, useElementWidth } from './use-element-width';
import { useViewSwipe } from './use-view-swipe';

/**
 * The ride screen on a phone turned sideways, after
 * design/mockups/phone-landscape.html and phone-landscape-map.html.
 *
 * Height is the scarce thing at 390 px, so the readings spend width instead: four slots
 * on one row with each readout beside its figure, then a single 11 px line of clocks.
 * That line also carries the view and zoom toggles at its right end — design/DESIGN.md
 * puts them there rather than in a foot so nothing sits over the chart, which is the
 * only part of the screen that gets what is left.
 */
export function RidePhoneLandscape({
  snapshot,
  readings,
  route,
  profile,
  climbs,
  window,
  samples,
  ftpW,
  title,
  lapLabel,
  pauseLabel,
  profileZoom,
  onProfileZoom,
  mapZoom,
  onMapZoom,
  view,
  onView,
  profileRef,
  mapRef,
  stripRef,
  onProfileHover,
  onMapHover,
  onPause,
  onEnd,
  onSettings,
  onDismissAlert,
  onRetryTrainer,
}: RideArrangementProps) {
  // Measured rather than taken from the mockup's 844 x 390, for the reason the portrait
  // arrangement gives: the charts are re-projected to the box they are given. Neither
  // measured element carries padding of its own — see use-element-width.
  const viewRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(viewRef);
  const areaHeight = useElementHeight(chartAreaRef);
  const stack = useMemo(() => phoneLandscapeChartStack(areaHeight), [areaHeight]);
  const chartWidth = width ?? 796;

  const toggle = viewToggle(view);
  const zoom = zoomToggle(view, profileZoom, mapZoom);

  function onZoom(): void {
    if (view === 'profile') onProfileZoom(nextProfileZoom(profileZoom));
    else onMapZoom(nextMapZoom(mapZoom));
  }

  const swipe = useViewSwipe(viewAfterSwipe, onView);

  return (
    <div className="flex min-h-0 grow flex-col px-[24px] pt-[16px] pb-[14px]">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Logo size={44} />
          {/* The route name, and the lap it is on, in the space a desktop gives a tag. */}
          <div className={`${LABEL} text-micro`}>
            {title}
            {lapLabel !== null && <span className="text-hairline"> · {lapLabel}</span>}
          </div>
        </div>
        {/* The ride's own controls stay in the header here: the foot is one 11 px line,
            and 44 px buttons in it would cost the profile its height twice over. */}
        <div className="flex items-center">
          <ButtonGroup label="Ride">
            <IconButton label={pauseLabel} size={44} onClick={onPause}>
              <PauseIcon />
            </IconButton>
            <IconButton label="End ride" size={44} onClick={onEnd}>
              <EndIcon />
            </IconButton>
          </ButtonGroup>
          <div className="ml-[12px]">
            <IconButton label="Settings" size={44} onClick={onSettings}>
              <SettingsIcon />
            </IconButton>
          </div>
        </div>
      </header>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="mt-[18px] grid shrink-0 grid-cols-4 items-start gap-[20px]">
        <PhoneInlinePrimary {...readings.power} />
        <PhoneInlinePrimary {...readings.cadence} divided />
        <PhoneInlinePrimary {...readings.heartRate} divided />
        {/* The fourth slot is a pair rather than a primary: two readings a rider glances
            at, stacked, where the other three each hold a whole column. */}
        <div className="border-hairline flex flex-col gap-[6px] border-l pt-[2px] pl-[14px]">
          <PhoneRowReading {...readings.speed} />
          {/* design/DESIGN.md gives the gradient the screen's accent on a phone — until
              the reading behind it goes stale, when muted says so before the colour does. */}
          <PhoneRowReading
            {...readings.gradient}
            tone={readings.gradient.tone === 'muted' ? 'muted' : 'accent'}
          />
        </div>
      </div>

      <div className="mt-[4px] flex shrink-0 items-center gap-[20px]">
        <PhoneInlineStat {...readings.elapsed} />
        <PhoneInlineStat {...readings.distance} divided />
        <PhoneInlineStat {...readings.climbed} divided />
        {/* Two ways of changing what you are looking at, so they share an edge. Pushed to
            the line's right end, and 32 px rather than 44: this row is the chart's
            ceiling, and design/DESIGN.md puts the pair here so neither sits over it. */}
        <div className="ml-auto">
          <ButtonGroup label="View">
            <IconButton
              label={toggle.label}
              title={toggle.label}
              size={32}
              onClick={() => {
                onView(toggle.next);
              }}
            >
              {toggle.glyph === 'map' ? <MapIcon /> : <ProfileIcon />}
            </IconButton>
            <IconButton label={zoom.label} title={zoom.label} size={32} onClick={onZoom}>
              {zoom.glyph === 'in' ? <ZoomInIcon /> : <ZoomOutIcon />}
            </IconButton>
          </ButtonGroup>
        </div>
      </div>

      {/* min-h-0 so the area measures the space the charts have rather than the charts it
          contains; justify-end so the slack falls between the toggles and the view, which
          is the clear band the mockups draw there. */}
      <div
        ref={chartAreaRef}
        className="flex min-h-0 grow flex-col justify-end gap-[14px] pb-[4px]"
      >
        <div
          ref={viewRef}
          data-testid="phone-view"
          // pan-y so a vertical gesture still belongs to the browser, and the horizontal
          // one the view wants is not spent on the back-swipe.
          style={{ touchAction: 'pan-y' }}
          {...swipe}
        >
          {view === 'profile' ? (
            <ProfileChart
              route={route}
              profile={profile}
              climbs={climbs}
              window={window}
              width={chartWidth}
              height={stack.viewHeight}
              handleRef={profileRef}
              onHover={onProfileHover}
              ghostMetrics={PHONE_METRICS}
            />
          ) : (
            <MapChart
              route={route}
              zoom={mapZoom}
              width={chartWidth}
              height={stack.viewHeight}
              handleRef={mapRef}
              onHover={onMapHover}
              ghostMetrics={PHONE_METRICS}
            />
          )}
        </div>
        {/* The strip shares the profile's x-axis, so it shares its width exactly — and
            stays under the map too, which is the one chart on the screen that does not
            have the ride's power anywhere in it. */}
        <PowerStrip
          ref={stripRef}
          samples={samples}
          ftpW={ftpW}
          startM={window?.startM ?? 0}
          endM={window?.endM ?? route.totalDistanceM}
          distanceM={0}
          width={chartWidth}
          height={stack.stripHeight}
        />
      </div>
    </div>
  );
}
