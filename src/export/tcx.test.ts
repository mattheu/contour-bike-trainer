import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';

import type { RideSample } from '../storage/types';
import { buildTcx, escapeXml, tcxFileName, type TcxRide } from './tcx';

const RIDE: TcxRide = {
  startedAt: '2026-09-30T07:05:00.000Z',
  routeName: 'Test Route 2 — Mixed',
  elapsedS: 2,
  distanceM: 16.9,
  avgPowerW: 216.5,
  avgHeartRateBpm: 142.4,
};

function sample(patch: Partial<RideSample> & { t: number }): RideSample {
  return {
    distanceM: 0,
    speedKmh: 30,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 140,
    lat: 51.5,
    lon: -1.5,
    eleM: 100,
    ...patch,
  };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function parse(xml: string): Record<string, unknown> {
  const validation = XMLValidator.validate(xml);
  expect(validation).toBe(true);
  return parser.parse(xml) as Record<string, unknown>;
}

describe('tcxFileName', () => {
  it('names the file contour-YYYY-MM-DD-HHmm.tcx in local time', () => {
    // Built from local parts so the expectation holds in any timezone.
    expect(tcxFileName(new Date(2026, 8, 30, 7, 5))).toBe('contour-2026-09-30-0705.tcx');
    expect(tcxFileName(new Date(2026, 0, 2, 19, 42))).toBe('contour-2026-01-02-1942.tcx');
  });

  it('refuses an unparseable date rather than naming a file NaN', () => {
    expect(() => tcxFileName('not a date')).toThrow(/invalid date/i);
  });
});

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`Fred & Wilma's <route> "one"`)).toBe(
      'Fred &amp; Wilma&apos;s &lt;route&gt; &quot;one&quot;',
    );
  });
});

describe('the laps of an exported ride', () => {
  /** A lapped ride: one sample every ten seconds at 10 m/s, so a lap is 100 s and 1 km. */
  function lapped(seconds: number): RideSample[] {
    const samples: RideSample[] = [];
    for (let t = 0; t <= seconds; t += 10) samples.push(sample({ t, distanceM: t * 10 }));
    return samples;
  }

  function laps(xml: string): Record<string, unknown>[] {
    const document = parse(xml) as {
      TrainingCenterDatabase: { Activities: { Activity: { Lap: unknown } } };
    };
    const lap = document.TrainingCenterDatabase.Activities.Activity.Lap;
    return (Array.isArray(lap) ? lap : [lap]) as Record<string, unknown>[];
  }

  it('writes one Distance-triggered lap per split, with the time the split says', () => {
    const xml = buildTcx({
      ride: { ...RIDE, elapsedS: 200, distanceM: 2000, lapSplits: [100, 100] },
      samples: lapped(200),
    });

    const written = laps(xml);
    expect(written).toHaveLength(2);
    for (const lap of written) {
      expect(lap.TriggerMethod).toBe('Distance');
      expect(lap.TotalTimeSeconds).toBe(100);
      expect(lap.DistanceMeters).toBe(1000);
    }
    // Each lap stamped where it began, so the splits land in the right place on Strava.
    expect(written[0]?.StartTime).toBe('2026-09-30T07:05:00.000Z');
    expect(written[1]?.StartTime).toBe('2026-09-30T07:06:40.000Z');
  });

  it('puts every trackpoint in the lap it was ridden in, and none in two', () => {
    const xml = buildTcx({
      ride: { ...RIDE, elapsedS: 200, distanceM: 2000, lapSplits: [100, 100] },
      samples: lapped(200),
    });

    const tracks = laps(xml).map((lap) => (lap.Track as { Trackpoint: unknown[] }).Trackpoint);
    expect(tracks[0]).toHaveLength(11);
    expect(tracks[1]).toHaveLength(10);
  });

  it('closes a ride ended mid-lap with a Manual lap rather than dropping it', () => {
    const xml = buildTcx({
      ride: { ...RIDE, elapsedS: 250, distanceM: 2500, lapSplits: [100, 100] },
      samples: lapped(250),
    });

    const written = laps(xml);
    expect(written).toHaveLength(3);
    expect(written[2]?.TriggerMethod).toBe('Manual');
    expect(written[2]?.TotalTimeSeconds).toBe(50);
    expect(written[2]?.DistanceMeters).toBe(500);
  });

  it('scores each lap from its own trackpoints', () => {
    const samples = lapped(200).map((s) => (s.t <= 100 ? s : { ...s, powerW: 300 }));
    const xml = buildTcx({
      ride: { ...RIDE, elapsedS: 200, distanceM: 2000, lapSplits: [100, 100] },
      samples,
    });

    const watts = laps(xml).map(
      (lap) =>
        (lap.Extensions as { 'ns3:LX': { 'ns3:AvgWatts': number } })['ns3:LX']['ns3:AvgWatts'],
    );
    expect(watts).toEqual([200, 300]);
  });

  it('keeps the single Manual lap for a ride that completed no length', () => {
    const xml = buildTcx({ ride: { ...RIDE, lapSplits: [] }, samples: [sample({ t: 0 })] });

    const written = laps(xml);
    expect(written).toHaveLength(1);
    expect(written[0]?.TriggerMethod).toBe('Manual');
    // The record's own figures, which is what a ride with no laps has always exported.
    expect(written[0]?.TotalTimeSeconds).toBe(2);
    expect(written[0]?.DistanceMeters).toBe(16.9);
  });
});

describe('buildTcx', () => {
  it('produces the known document for a known sample set', () => {
    const xml = buildTcx({
      ride: { ...RIDE, routeName: 'Flat 1 km' },
      samples: [
        sample({ t: 0, distanceM: 0, lat: 51.5, lon: -1.5, eleM: 100 }),
        sample({ t: 1, distanceM: 8.3, lat: 51.50007, lon: -1.5, eleM: 100.5, powerW: 210 }),
      ],
    });

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '  <Activities>',
        '    <Activity Sport="Biking">',
        '      <Id>2026-09-30T07:05:00.000Z</Id>',
        '      <Lap StartTime="2026-09-30T07:05:00.000Z">',
        '        <TotalTimeSeconds>2.0</TotalTimeSeconds>',
        '        <DistanceMeters>16.9</DistanceMeters>',
        '        <MaximumSpeed>8.333</MaximumSpeed>',
        '        <Calories>0</Calories>',
        '        <AverageHeartRateBpm><Value>142</Value></AverageHeartRateBpm>',
        '        <Intensity>Active</Intensity>',
        '        <TriggerMethod>Manual</TriggerMethod>',
        '        <Track>',
        '          <Trackpoint>',
        '            <Time>2026-09-30T07:05:00.000Z</Time>',
        '            <Position>',
        '              <LatitudeDegrees>51.5000000</LatitudeDegrees>',
        '              <LongitudeDegrees>-1.5000000</LongitudeDegrees>',
        '            </Position>',
        '            <AltitudeMeters>100.0</AltitudeMeters>',
        '            <DistanceMeters>0.0</DistanceMeters>',
        '            <HeartRateBpm><Value>140</Value></HeartRateBpm>',
        '            <Cadence>88</Cadence>',
        '            <Extensions>',
        '              <ns3:TPX>',
        '                <ns3:Watts>200</ns3:Watts>',
        '              </ns3:TPX>',
        '            </Extensions>',
        '          </Trackpoint>',
        '          <Trackpoint>',
        '            <Time>2026-09-30T07:05:01.000Z</Time>',
        '            <Position>',
        '              <LatitudeDegrees>51.5000700</LatitudeDegrees>',
        '              <LongitudeDegrees>-1.5000000</LongitudeDegrees>',
        '            </Position>',
        '            <AltitudeMeters>100.5</AltitudeMeters>',
        '            <DistanceMeters>8.3</DistanceMeters>',
        '            <HeartRateBpm><Value>140</Value></HeartRateBpm>',
        '            <Cadence>88</Cadence>',
        '            <Extensions>',
        '              <ns3:TPX>',
        '                <ns3:Watts>210</ns3:Watts>',
        '              </ns3:TPX>',
        '            </Extensions>',
        '          </Trackpoint>',
        '        </Track>',
        '        <Extensions>',
        '          <ns3:LX>',
        '            <ns3:AvgWatts>217</ns3:AvgWatts>',
        '          </ns3:LX>',
        '        </Extensions>',
        '      </Lap>',
        '      <Notes>Flat 1 km</Notes>',
        '    </Activity>',
        '  </Activities>',
        '</TrainingCenterDatabase>',
        '',
      ].join('\n'),
    );
  });

  it('parses as well-formed XML with the elements Strava reads', () => {
    const xml = buildTcx({ ride: RIDE, samples: [sample({ t: 0 }), sample({ t: 1 })] });
    const document = parse(xml) as {
      TrainingCenterDatabase: {
        Activities: {
          Activity: {
            Sport: string;
            Id: string;
            Lap: { StartTime: string; Track: { Trackpoint: unknown[] } };
          };
        };
      };
    };

    const activity = document.TrainingCenterDatabase.Activities.Activity;
    expect(activity.Sport).toBe('Biking');
    expect(activity.Id).toBe('2026-09-30T07:05:00.000Z');
    expect(activity.Lap.StartTime).toBe('2026-09-30T07:05:00.000Z');
    expect(activity.Lap.Track.Trackpoint).toHaveLength(2);
  });

  it('omits an absent value rather than writing it as zero', () => {
    const xml = buildTcx({
      ride: { ...RIDE, avgPowerW: null, avgHeartRateBpm: null },
      samples: [
        sample({
          t: 0,
          powerW: null,
          cadenceRpm: null,
          heartRateBpm: null,
          lat: null,
          lon: null,
          eleM: null,
          speedKmh: null,
        }),
      ],
    });

    // A silent power meter is not a coasting rider and a dropped fix is not the equator.
    expect(xml).not.toContain('<ns3:Watts>');
    expect(xml).not.toContain('<Cadence>');
    expect(xml).not.toContain('<HeartRateBpm>');
    expect(xml).not.toContain('<Position>');
    expect(xml).not.toContain('<AltitudeMeters>');
    expect(xml).not.toContain('<MaximumSpeed>');
    expect(xml).not.toContain('<AverageHeartRateBpm>');
    expect(xml).not.toContain('<ns3:LX>');
    // Distance is always known: the engine computes it, the trainer does not report it.
    expect(xml).toContain('<DistanceMeters>0.0</DistanceMeters>');
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it('omits Position when only one of lat and lon is present', () => {
    const xml = buildTcx({ ride: RIDE, samples: [sample({ t: 0, lon: null })] });
    expect(xml).not.toContain('<Position>');
  });

  it('escapes XML special characters in the route name', () => {
    const xml = buildTcx({
      ride: { ...RIDE, routeName: `Bill & Ben's <hill> "loop"` },
      samples: [sample({ t: 0 })],
    });

    expect(xml).toContain('<Notes>Bill &amp; Ben&apos;s &lt;hill&gt; &quot;loop&quot;</Notes>');
    // The real assertion: an unescaped ampersand makes the whole file unparseable.
    expect(XMLValidator.validate(xml)).toBe(true);
    const document = parse(xml) as {
      TrainingCenterDatabase: { Activities: { Activity: { Notes: string } } };
    };
    expect(document.TrainingCenterDatabase.Activities.Activity.Notes).toBe(
      `Bill & Ben's <hill> "loop"`,
    );
  });

  it('omits Notes entirely for a free ride with no route', () => {
    const xml = buildTcx({ ride: { ...RIDE, routeName: null }, samples: [sample({ t: 0 })] });
    expect(xml).not.toContain('<Notes>');
  });

  it('keeps heart rate and cadence inside the unsignedByte the schema allows', () => {
    const xml = buildTcx({
      ride: { ...RIDE, avgHeartRateBpm: 999 },
      samples: [sample({ t: 0, heartRateBpm: 900, cadenceRpm: -5 })],
    });

    expect(xml).toContain('<HeartRateBpm><Value>254</Value></HeartRateBpm>');
    expect(xml).toContain('<Cadence>0</Cadence>');
    expect(xml).toContain('<AverageHeartRateBpm><Value>254</Value></AverageHeartRateBpm>');
  });

  it('stamps each trackpoint at its own offset from the ride start', () => {
    const xml = buildTcx({
      ride: RIDE,
      samples: [sample({ t: 0 }), sample({ t: 90 }), sample({ t: 3661.5 })],
    });

    expect(xml).toContain('<Time>2026-09-30T07:05:00.000Z</Time>');
    expect(xml).toContain('<Time>2026-09-30T07:06:30.000Z</Time>');
    expect(xml).toContain('<Time>2026-09-30T08:06:01.500Z</Time>');
  });

  it('exports an empty track rather than throwing on a ride with no samples', () => {
    const xml = buildTcx({ ride: { ...RIDE, avgPowerW: null }, samples: [] });
    expect(xml).toContain('<Track>');
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it('refuses a ride with an unparseable start time', () => {
    expect(() => buildTcx({ ride: { ...RIDE, startedAt: 'nonsense' }, samples: [] })).toThrow(
      /invalid start time/i,
    );
  });
});
