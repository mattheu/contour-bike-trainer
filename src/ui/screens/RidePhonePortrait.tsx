import { useMemo, useRef } from 'react';
import { PHONE_METRICS, PowerStrip, phoneChartStack } from '../charts';
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
import { PhoneFigure, PhonePrimary, PhoneStat } from '../components/PhoneReading';
import { LABEL } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import { nextMapZoom, nextProfileZoom, viewAfterSwipe, viewToggle, zoomToggle } from './phone-ride';
import type { RideArrangementProps } from './ride-arrangement';
import { MapChart, ProfileChart } from './RideCharts';
import { useElementHeight, useElementWidth } from './use-element-width';
import { useViewSwipe } from './use-view-swipe';

/**
 * The ride screen on a phone held upright, after
 * design/mockups/phone-portrait-profile.html and phone-portrait-map.html.
 *
 * One column: the three primaries, speed and gradient, the three clocks, then the view —
 * profile or map, never both — over the power strip. Every control is an icon, because
 * at 390 px a row of tracked caps is the whole foot.
 */
export function RidePhonePortrait({
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
  // Measured rather than taken from the mockup's 390 x 844: a phone is whatever it is,
  // and the charts are re-projected to the box they are given rather than scaled into
  // it. Both measured elements carry no padding of their own — see use-element-width.
  const viewRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(viewRef);
  const areaHeight = useElementHeight(chartAreaRef);
  const stack = useMemo(() => phoneChartStack(areaHeight), [areaHeight]);
  const chartWidth = width ?? 358;

  const toggle = viewToggle(view);
  const zoom = zoomToggle(view, profileZoom, mapZoom);

  function onZoom(): void {
    if (view === 'profile') onProfileZoom(nextProfileZoom(profileZoom));
    else onMapZoom(nextMapZoom(mapZoom));
  }

  const swipe = useViewSwipe(viewAfterSwipe, onView);

  return (
    <div className="flex min-h-0 grow flex-col px-[16px] pt-[28px] pb-[28px]">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Logo size={44} />
          {/* The route name, and the lap it is on, in the space a desktop gives a tag. */}
          <div className={`${LABEL} text-micro`}>
            {title}
            {lapLabel !== null && <span className="text-hairline"> · {lapLabel}</span>}
          </div>
        </div>
        <IconButton label="Settings" size={44} onClick={onSettings}>
          <SettingsIcon />
        </IconButton>
      </header>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="mt-[32px] grid shrink-0 grid-cols-3 gap-[14px]">
        <PhonePrimary {...readings.power} />
        <PhonePrimary {...readings.cadence} divided />
        <PhonePrimary {...readings.heartRate} divided />
      </div>

      <div className="border-hairline mt-[24px] grid shrink-0 grid-cols-2 gap-[16px] border-t pt-[14px] whitespace-nowrap">
        <PhoneFigure {...readings.speed} />
        {/* design/DESIGN.md gives the gradient the screen's accent on a phone — until the
            reading behind it goes stale, when muted says so before the colour does. */}
        <PhoneFigure
          {...readings.gradient}
          tone={readings.gradient.tone === 'muted' ? 'muted' : 'accent'}
          divided
        />
      </div>

      <div className="mt-[18px] grid shrink-0 grid-cols-3 gap-[16px] whitespace-nowrap">
        <PhoneStat {...readings.elapsed} />
        <PhoneStat {...readings.distance} divided />
        <PhoneStat {...readings.climbed} divided />
      </div>

      {/* min-h-0 so the area measures the space the charts have rather than the charts
          it contains; justify-end so a short screen takes its height off the top, where
          the readings have already had theirs. */}
      <div ref={chartAreaRef} className="flex min-h-0 grow flex-col justify-end gap-[14px]">
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
        <div className="mt-[22px]">
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

      <div className="mt-[18px] flex shrink-0 items-center justify-between">
        {/* Two ways of changing what you are looking at, so they share an edge. */}
        <ButtonGroup label="View">
          <IconButton
            label={toggle.label}
            title={toggle.label}
            size={44}
            onClick={() => {
              onView(toggle.next);
            }}
          >
            {toggle.glyph === 'map' ? <MapIcon /> : <ProfileIcon />}
          </IconButton>
          <IconButton label={zoom.label} title={zoom.label} size={44} onClick={onZoom}>
            {zoom.glyph === 'in' ? <ZoomInIcon /> : <ZoomOutIcon />}
          </IconButton>
        </ButtonGroup>
        {/* Pause and End as glyphs, and grey: design/DESIGN.md takes the accent off a
            control once the ride is under way — the data owns the colour from then on. */}
        <ButtonGroup label="Ride">
          <IconButton label={pauseLabel} size={44} onClick={onPause}>
            <PauseIcon />
          </IconButton>
          <IconButton label="End ride" size={44} onClick={onEnd}>
            <EndIcon />
          </IconButton>
        </ButtonGroup>
      </div>
    </div>
  );
}
