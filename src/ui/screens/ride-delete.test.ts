import { describe, expect, it } from 'vitest';
import {
  cancelDelete,
  deleteAlert,
  deleteWording,
  isArmed,
  pressDelete,
  retainArmed,
} from './ride-delete';

describe('pressDelete', () => {
  it('arms a ride that was not armed', () => {
    expect(pressDelete(null, 'a')).toEqual({ armed: 'a', deleted: null });
  });

  it('deletes on the second press of the same ride', () => {
    expect(pressDelete('a', 'a')).toEqual({ armed: null, deleted: 'a' });
  });

  it('moves the confirmation rather than arming two rides', () => {
    expect(pressDelete('a', 'b')).toEqual({ armed: 'b', deleted: null });
  });

  it('leaves nothing armed once a ride is deleted, so a third press re-arms', () => {
    const first = pressDelete(null, 'a');
    const second = pressDelete(first.armed, 'a');
    expect(pressDelete(second.armed, 'a')).toEqual({ armed: 'a', deleted: null });
  });
});

describe('isArmed', () => {
  it('is true only for the armed ride', () => {
    expect(isArmed('a', 'a')).toBe(true);
    expect(isArmed('a', 'b')).toBe(false);
    expect(isArmed(null, 'a')).toBe(false);
  });
});

describe('cancelDelete', () => {
  it('disarms', () => {
    expect(cancelDelete()).toBeNull();
  });
});

describe('retainArmed', () => {
  it('keeps a ride that is still on screen', () => {
    expect(retainArmed('a', ['a', 'b'])).toBe('a');
  });

  it('drops a ride a filter has hidden', () => {
    expect(retainArmed('a', ['b', 'c'])).toBeNull();
  });

  it('drops a ride that has left the list entirely', () => {
    expect(retainArmed('a', [])).toBeNull();
  });

  it('passes nothing through as nothing', () => {
    expect(retainArmed(null, ['a'])).toBeNull();
  });
});

describe('deleteWording', () => {
  it('asks rather than warns about a ride that just finished, and returns to Routes', () => {
    expect(deleteWording('finished')).toEqual({
      action: 'Discard ride',
      prompt: 'Discard?',
      confirm: 'Discard',
      cancel: 'Keep',
      returnTo: 'routes',
    });
  });

  it('says a historic ride cannot be undone, and returns to Rides', () => {
    expect(deleteWording('history')).toEqual({
      action: 'Delete ride',
      prompt: "Sure? Can't be undone",
      confirm: 'Delete',
      cancel: 'Keep',
      returnTo: 'rides',
    });
  });

  it('offers a worded way out of both, not just a click elsewhere', () => {
    expect(deleteWording('finished').cancel).not.toBe('');
    expect(deleteWording('history').cancel).not.toBe('');
  });
});

describe('deleteAlert', () => {
  it('names the ride and clears itself when the delete worked', () => {
    expect(deleteAlert({ status: 'done' }, 'Ditchling Beacon Loop')).toEqual({
      level: 'info',
      message: 'Ditchling Beacon Loop deleted.',
    });
  });

  it('blocks on a failure, because the ride the rider thinks is gone is still there', () => {
    expect(
      deleteAlert({ status: 'failed', reason: 'the database is closed' }, 'Free ride'),
    ).toEqual({
      level: 'fault',
      message: 'That ride could not be deleted: the database is closed',
    });
  });
});
