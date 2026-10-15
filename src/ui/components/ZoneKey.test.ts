import { describe, expect, it } from 'vitest';
import { ZONE_WASH_OPACITY } from '../charts';
import { ZONE_COUNT, ZONE_FRACTIONS, ZONE_NAMES, zoneForPower } from '../../zones/power';
import { zoneKeyEntries } from './ZoneKey';

/**
 * The key is only worth having if it cannot drift from what it describes, so these assert
 * against the zone model and the wash scale rather than against the strings themselves.
 * A literal here would be the second place the boundaries live, which is the failure the
 * derivation exists to prevent.
 */
/** 0.55 reads as 55, not as 55.00000000000001: the key prints whole percentages. */
const percent = (fraction: number | undefined) => String(Math.round((fraction ?? 0) * 100));

describe('zoneKeyEntries', () => {
  it('has an entry per zone, in order', () => {
    const entries = zoneKeyEntries();
    expect(entries).toHaveLength(ZONE_COUNT);
    expect(entries.map((entry) => entry.zone)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('names every zone from the model', () => {
    for (const entry of zoneKeyEntries()) expect(entry.name).toBe(ZONE_NAMES[entry.zone]);
  });

  it('draws every entry at the shade the chart and the Steps panel use', () => {
    for (const entry of zoneKeyEntries()) expect(entry.wash).toBe(ZONE_WASH_OPACITY[entry.zone]);
  });

  it('shows zone 1 as unwashed, which is what the scale says it is', () => {
    expect(zoneKeyEntries()[0]?.wash).toBe(0);
    expect(zoneKeyEntries().filter((entry) => entry.wash === 0)).toHaveLength(1);
  });

  it('leaves the open ends open rather than inventing a floor or a ceiling', () => {
    const entries = zoneKeyEntries();
    expect(entries[0]?.band).toBe(`< ${percent(ZONE_FRACTIONS[0])}`);
    expect(entries[ZONE_COUNT - 1]?.band).toBe(`> ${percent(ZONE_FRACTIONS.at(-1))}`);
  });

  it('bounds the middle zones by the boundaries either side of them', () => {
    const bands = zoneKeyEntries()
      .slice(1, -1)
      .map((entry) => entry.band);
    expect(bands).toEqual(
      ZONE_FRACTIONS.slice(0, -1).map(
        (lower, index) => `${percent(lower)}–${percent(ZONE_FRACTIONS[index + 1])}`,
      ),
    );
  });

  it('states a band that the zone model would actually class as that zone', () => {
    // A rider at the midpoint of each printed band lands in the zone the key names, which
    // is the claim the key makes and the one a boundary change would break.
    const ftp = 200;
    for (const entry of zoneKeyEntries()) {
      const figures = entry.band.match(/\d+/g)?.map(Number) ?? [];
      const midpoint =
        figures.length === 2
          ? ((figures[0]! + figures[1]!) / 200) * ftp
          : // One figure is an open end: step inside it rather than sit on the boundary.
            ((figures[0]! + (entry.zone === 1 ? -10 : 10)) / 100) * ftp;
      expect(zoneForPower(midpoint, ftp)).toBe(entry.zone);
    }
  });
});
