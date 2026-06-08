import { describe, it, expect } from 'vitest';
import { parseKeybindString } from '../../../src/features/keymap/parse';

describe('parseKeybindString', () => {
  it('parses single-chord Ctrl+P', () => {
    const r = parseKeybindString('Ctrl+P');
    expect(r).not.toBeNull();
    expect(r?.length).toBe(1);
    expect(r?.[0]).toEqual({ ctrl: true, shift: false, alt: false, meta: false, key: 'p' });
  });
  it('parses Ctrl+Shift+P', () => {
    const r = parseKeybindString('Ctrl+Shift+P');
    expect(r?.[0]).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: 'p' });
  });
  it('parses Alt+1 (digit key)', () => {
    const r = parseKeybindString('Alt+1');
    expect(r?.[0]?.alt).toBe(true);
    expect(r?.[0]?.key).toBe('1');
  });
  it('Cmd === Meta', () => {
    const r1 = parseKeybindString('Cmd+S');
    const r2 = parseKeybindString('Meta+S');
    expect(r1?.[0]).toEqual(r2?.[0]);
    expect(r1?.[0]?.meta).toBe(true);
    expect(r1?.[0]?.ctrl).toBe(false);
  });
  it('parses F12 (multi-char key)', () => {
    const r = parseKeybindString('F12');
    expect(r?.[0]?.key).toBe('f12');
  });
  it('parses ArrowUp', () => {
    const r = parseKeybindString('Ctrl+ArrowUp');
    expect(r?.[0]?.key).toBe('arrowup');
    expect(r?.[0]?.ctrl).toBe(true);
  });
  it('parses chord sequence (Ctrl+K Ctrl+S)', () => {
    const r = parseKeybindString('Ctrl+K Ctrl+S');
    expect(r?.length).toBe(2);
    expect(r?.[0]).toEqual({ ctrl: true, shift: false, alt: false, meta: false, key: 'k' });
    expect(r?.[1]).toEqual({ ctrl: true, shift: false, alt: false, meta: false, key: 's' });
  });
  it('case insensitive (lowercase modifiers OK)', () => {
    const a = parseKeybindString('ctrl+p');
    const b = parseKeybindString('Ctrl+P');
    expect(a?.[0]).toEqual(b?.[0]);
  });
  it('returns null on empty', () => {
    expect(parseKeybindString('')).toBeNull();
  });
  it('returns null on unknown modifier', () => {
    expect(parseKeybindString('Hyper+P')).toBeNull();
  });
  it('handles multiple spaces between chords', () => {
    const r = parseKeybindString('Ctrl+K     Ctrl+S');
    expect(r?.length).toBe(2);
  });
});
