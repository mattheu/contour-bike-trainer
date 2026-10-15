/**
 * What GATT discovery found, in a form a person can read.
 *
 * SPEC.md > Decision gate item 3: whether the trainer speaks FTMS is verified on first
 * connect rather than assumed. FtmsTrainer reports raw 128-bit UUIDs, which are exactly
 * the wrong thing to put in front of someone checking a pairing, so the naming and the
 * FTMS test live here as pure functions a test owns rather than inside the screen.
 */

/** Fitness Machine Service, 0x1826, in the full 128-bit form Web Bluetooth reports. */
export const FTMS_UUID = '00001826-0000-1000-8000-00805f9b34fb';

/** The Bluetooth SIG base: every assigned 16-bit service expands into it. */
const BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';

/** Only the services the app asks permission for, plus the two every device exposes. */
const KNOWN_SERVICES: Record<string, string> = {
  '1800': 'Generic Access',
  '1801': 'Generic Attribute',
  '180a': 'Device Information',
  '180d': 'Heart Rate',
  '1816': 'Speed and Cadence',
  '1818': 'Cycling Power',
  '1826': 'Fitness Machine (FTMS)',
};

export interface DiscoveredService {
  uuid: string;
  /** The assigned name where there is one, otherwise the id itself. */
  label: string;
  /** True for the Fitness Machine Service — the one the gate is about. */
  isFtms: boolean;
}

/** The 16-bit assigned number of a standard UUID; null for a vendor-specific one. */
export function shortUuid(uuid: string): string | null {
  const lower = uuid.trim().toLowerCase();
  if (!lower.endsWith(BASE_UUID_SUFFIX)) return null;
  const head = lower.slice(0, lower.length - BASE_UUID_SUFFIX.length);
  if (!/^[0-9a-f]{8}$/.test(head) || !head.startsWith('0000')) return null;
  return head.slice(4);
}

export function describeService(uuid: string): DiscoveredService {
  const short = shortUuid(uuid);
  const name = short === null ? undefined : KNOWN_SERVICES[short];
  return {
    uuid,
    label: name ?? (short === null ? uuid : `0x${short.toUpperCase()}`),
    isFtms: short === '1826',
  };
}

/** Deduplicated and in discovery order: the device decides what it lists, not this. */
export function describeServices(uuids: readonly string[]): DiscoveredService[] {
  const seen = new Set<string>();
  const out: DiscoveredService[] = [];
  for (const uuid of uuids) {
    const key = uuid.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(describeService(uuid));
  }
  return out;
}

/**
 * Whether FTMS was actually found. False also covers "nothing was discovered", which is
 * not the same as "no FTMS" — the screen says so rather than letting an empty list read
 * as a failed gate.
 */
export function speaksFtms(uuids: readonly string[]): boolean {
  return describeServices(uuids).some((service) => service.isFtms);
}
