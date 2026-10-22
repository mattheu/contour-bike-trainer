import { describe, expect, it } from 'vitest';
import {
  formatHash,
  parseHash,
  resolve,
  resolveSignedOut,
  rideLabel,
  type Location,
} from './routing';

const NOTHING_RIDDEN = { label: null, finishedRideId: null };

describe('parseHash', () => {
  it('reads the three lists', () => {
    expect(parseHash('#/routes')).toEqual({ name: 'routes' });
    expect(parseHash('#/workouts')).toEqual({ name: 'workouts' });
    expect(parseHash('#/rides')).toEqual({ name: 'rides' });
  });

  it('reads an empty hash, and /login, as the login screen', () => {
    expect(parseHash('')).toEqual({ name: 'login' });
    expect(parseHash('#')).toEqual({ name: 'login' });
    expect(parseHash('#/')).toEqual({ name: 'login' });
    expect(parseHash('#/login')).toEqual({ name: 'login' });
    expect(parseHash('#/login/extra')).toBeNull();
  });

  it('reads How it works, which is the one other screen reachable signed out', () => {
    expect(parseHash('#/how-it-works')).toEqual({ name: 'how-it-works' });
    expect(parseHash('#/how-it-works/extra')).toBeNull();
  });

  it('reads the two screens that carry a record id', () => {
    expect(parseHash('#/workouts/sweet-spot-50')).toEqual({
      name: 'workout',
      workoutId: 'sweet-spot-50',
    });
    expect(parseHash('#/rides/0f2a-uuid')).toEqual({ name: 'summary', rideId: '0f2a-uuid' });
  });

  it('reads the ride label without resolving it', () => {
    expect(parseHash('#/ride')).toEqual({ name: 'ride', label: null });
    expect(parseHash('#/ride?route=greenhow-hill')).toEqual({
      name: 'ride',
      label: { kind: 'route', slug: 'greenhow-hill' },
    });
    expect(parseHash('#/ride?workout=sweet-spot-3x9')).toEqual({
      name: 'ride',
      label: { kind: 'workout', slug: 'sweet-spot-3x9' },
    });
  });

  it('treats an empty or absent label as no label, not as a ride of nothing', () => {
    expect(parseHash('#/ride?route=')).toEqual({ name: 'ride', label: null });
    expect(parseHash('#/ride?something=else')).toEqual({ name: 'ride', label: null });
  });

  it('rejects what the app has no screen for', () => {
    expect(parseHash('#/nonsense')).toBeNull();
    expect(parseHash('#/routes/greenhow-hill')).toBeNull();
    expect(parseHash('#/ride/step/3')).toBeNull();
    expect(parseHash('#/rides/one/two')).toBeNull();
  });

  it('is indifferent to a leading or trailing slash', () => {
    expect(parseHash('#/routes/')).toEqual({ name: 'routes' });
    expect(parseHash('/routes')).toEqual({ name: 'routes' });
  });

  it('decodes an id that needed encoding', () => {
    expect(parseHash('#/rides/a%2Fb')).toEqual({ name: 'summary', rideId: 'a/b' });
  });
});

describe('formatHash', () => {
  it('writes the paths ADR-0018 names', () => {
    expect(formatHash({ name: 'login' })).toBe('#/login');
    expect(formatHash({ name: 'how-it-works' })).toBe('#/how-it-works');
    expect(formatHash({ name: 'routes' })).toBe('#/routes');
    expect(formatHash({ name: 'workout', workoutId: '30-30s' })).toBe('#/workouts/30-30s');
    expect(formatHash({ name: 'summary', rideId: 'abc' })).toBe('#/rides/abc');
    expect(formatHash({ name: 'ride', label: null })).toBe('#/ride');
    expect(formatHash({ name: 'ride', label: { kind: 'route', slug: 'sa-calobra' } })).toBe(
      '#/ride?route=sa-calobra',
    );
  });
});

describe('round trip', () => {
  const every: Location[] = [
    { name: 'login' },
    { name: 'how-it-works' },
    { name: 'routes' },
    { name: 'workouts' },
    { name: 'rides' },
    { name: 'workout', workoutId: '7f3d9c1e-0000-4000-8000-000000000001' },
    { name: 'summary', rideId: '7f3d9c1e-0000-4000-8000-000000000002' },
    { name: 'ride', label: null },
    { name: 'ride', label: { kind: 'route', slug: 'greenhow-hill' } },
    { name: 'ride', label: { kind: 'workout', slug: 'over-unders-45' } },
  ];

  it('parses back everything it writes', () => {
    for (const location of every) {
      expect(parseHash(formatHash(location))).toEqual(location);
    }
  });

  it('writes back everything it parses', () => {
    for (const location of every) {
      const hash = formatHash(location);
      expect(formatHash(parseHash(hash) ?? { name: 'routes' })).toBe(hash);
    }
  });
});

describe('resolve', () => {
  it('sends an unknown hash and the two signed-out screens to the routes list', () => {
    expect(resolve(null, NOTHING_RIDDEN)).toEqual({ name: 'routes' });
    expect(resolve({ name: 'login' }, NOTHING_RIDDEN)).toEqual({ name: 'routes' });
    expect(resolve({ name: 'how-it-works' }, NOTHING_RIDDEN)).toEqual({ name: 'routes' });
  });

  it('leaves every screen that stands on its own alone', () => {
    const standalone: Location[] = [
      { name: 'routes' },
      { name: 'workouts' },
      { name: 'rides' },
      { name: 'workout', workoutId: 'abc' },
      { name: 'summary', rideId: 'def' },
    ];
    for (const location of standalone) {
      expect(resolve(location, NOTHING_RIDDEN)).toEqual(location);
    }
  });

  it('redirects a cold /ride, whatever the label claims', () => {
    expect(resolve({ name: 'ride', label: null }, NOTHING_RIDDEN)).toEqual({ name: 'routes' });
    expect(
      resolve({ name: 'ride', label: { kind: 'route', slug: 'greenhow-hill' } }, NOTHING_RIDDEN),
    ).toEqual({ name: 'routes' });
  });

  it('writes the label from the engine rather than reading the one in the bar', () => {
    const label = { kind: 'workout', slug: 'vo2-max-50' } as const;
    expect(
      resolve(
        { name: 'ride', label: { kind: 'route', slug: 'a-stale-label' } },
        { label, finishedRideId: null },
      ),
    ).toEqual({ name: 'ride', label });
  });

  it('turns a finished and saved ride into its summary', () => {
    expect(
      resolve(
        { name: 'ride', label: { kind: 'route', slug: 'sa-calobra' } },
        { label: { kind: 'route', slug: 'sa-calobra' }, finishedRideId: 'ride-9' },
      ),
    ).toEqual({ name: 'summary', rideId: 'ride-9' });
  });

  it('is idempotent, so the bar settles in one correction', () => {
    const ride = { label: { kind: 'route', slug: 'alpe-dhuez' } as const, finishedRideId: null };
    const once = resolve(null, ride);
    expect(resolve(once, ride)).toEqual(once);
    const riding = resolve({ name: 'ride', label: null }, ride);
    expect(resolve(riding, ride)).toEqual(riding);
  });
});

describe('resolveSignedOut', () => {
  it('keeps the two screens an install with no session can show', () => {
    expect(resolveSignedOut({ name: 'how-it-works' })).toEqual({ name: 'how-it-works' });
    expect(resolveSignedOut({ name: 'login' })).toEqual({ name: 'login' });
  });

  it('sends a hash carried in from a signed-in install back to login', () => {
    expect(resolveSignedOut(null)).toEqual({ name: 'login' });
    expect(resolveSignedOut({ name: 'routes' })).toEqual({ name: 'login' });
    expect(resolveSignedOut({ name: 'summary', rideId: 'def' })).toEqual({ name: 'login' });
    expect(resolveSignedOut({ name: 'ride', label: null })).toEqual({ name: 'login' });
  });
});

describe('rideLabel', () => {
  it('slugs the name, which is what a bundled id already is', () => {
    expect(rideLabel({ workoutName: null, routeName: 'Greenhow Hill' })).toEqual({
      kind: 'route',
      slug: 'greenhow-hill',
    });
  });

  it('slugs an imported route by its name, with no id anywhere near it', () => {
    expect(rideLabel({ workoutName: null, routeName: 'Morning Loop' })).toEqual({
      kind: 'route',
      slug: 'morning-loop',
    });
    expect(rideLabel({ workoutName: null, routeName: "Alpe d'Huez" })).toEqual({
      kind: 'route',
      slug: 'alpe-d-huez',
    });
  });

  it('prefers the workout, which has no route under it', () => {
    expect(rideLabel({ workoutName: 'Sweet Spot 3×9', routeName: 'Greenhow Hill' })).toEqual({
      kind: 'workout',
      slug: 'sweet-spot-3-9',
    });
  });

  it('falls back rather than leaving an empty label', () => {
    expect(rideLabel({ workoutName: '— ·', routeName: null })).toEqual({
      kind: 'workout',
      slug: 'workout',
    });
    expect(rideLabel({ workoutName: null, routeName: '' })).toEqual({
      kind: 'route',
      slug: 'route',
    });
  });

  it('is null when nothing is being ridden', () => {
    expect(rideLabel({ workoutName: null, routeName: null })).toBeNull();
  });
});
