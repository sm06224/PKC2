/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPreference,
  getPreference,
  setPreference,
} from '@adapter/ui/image-optimize/preference-store';

beforeEach(() => {
  localStorage.clear();
});

describe('preference-store', () => {
  it('returns null when nothing is stored', () => {
    expect(getPreference('paste')).toBeNull();
  });

  it('round-trips a stored preference', () => {
    setPreference('paste', { action: 'optimize', keepOriginal: false });
    const pref = getPreference('paste');
    expect(pref).not.toBeNull();
    expect(pref!.action).toBe('optimize');
    expect(pref!.keepOriginal).toBe(false);
    expect(typeof pref!.rememberedAt).toBe('string');
  });

  it('keeps paste / drop / attach preferences independent', () => {
    setPreference('paste', { action: 'optimize', keepOriginal: false });
    setPreference('drop', { action: 'decline', keepOriginal: true });

    const pastePref = getPreference('paste');
    const dropPref = getPreference('drop');
    const attachPref = getPreference('attach');

    expect(pastePref?.action).toBe('optimize');
    expect(dropPref?.action).toBe('decline');
    expect(attachPref).toBeNull();
  });

  it('overwrites on subsequent setPreference calls', () => {
    setPreference('paste', { action: 'optimize', keepOriginal: false });
    setPreference('paste', { action: 'decline', keepOriginal: true });
    const pref = getPreference('paste');
    expect(pref?.action).toBe('decline');
    expect(pref?.keepOriginal).toBe(true);
  });

  it('clears a stored preference', () => {
    setPreference('paste', { action: 'optimize', keepOriginal: false });
    expect(getPreference('paste')).not.toBeNull();
    clearPreference('paste');
    expect(getPreference('paste')).toBeNull();
  });

  it('tolerates corrupt localStorage entries', () => {
    localStorage.setItem('pkc2.imageOptimize.preference.paste', 'not json');
    expect(getPreference('paste')).toBeNull();
  });
});
