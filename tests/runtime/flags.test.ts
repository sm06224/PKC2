import { describe, it, expect, beforeEach } from 'vitest';
import {
  defineFlag,
  getRegisteredFlags,
  getActiveFlagCount,
  setContainerFlagSource,
  __resetRegistry,
  __resetUrlCache,
} from '@runtime/flags';

declare global {
  // eslint-disable-next-line no-var
  var __PKC_FLAGS_URL__: Record<string, string> | undefined;
}

describe('runtime/flags', () => {
  beforeEach(() => {
    __resetRegistry();
    delete (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
      .__PKC_FLAGS_URL__;
    __resetUrlCache();
  });

  describe('defineFlag', () => {
    it('returns the default when no override is set', () => {
      expect(defineFlag('test.numeric', 10)).toBe(10);
      expect(defineFlag('test.bool', false)).toBe(false);
      expect(defineFlag('test.string', 'auto')).toBe('auto');
    });

    it('throws on duplicate registration', () => {
      defineFlag('test.dup', 1);
      expect(() => defineFlag('test.dup', 2)).toThrow(/duplicate registration/);
    });

    it('reads URL override via globalThis.__PKC_FLAGS_URL__', () => {
      (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
        .__PKC_FLAGS_URL__ = { 'test.numeric': '42', 'test.bool': 'true' };
      __resetUrlCache();
      expect(defineFlag('test.numeric', 10)).toBe(42);
      expect(defineFlag('test.bool', false)).toBe(true);
    });

    it('reads container override via setContainerFlagSource', () => {
      setContainerFlagSource({ 'test.numeric': 99 });
      expect(defineFlag('test.numeric', 10)).toBe(99);
    });

    it('URL takes precedence over container', () => {
      (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
        .__PKC_FLAGS_URL__ = { 'test.numeric': '7' };
      __resetUrlCache();
      setContainerFlagSource({ 'test.numeric': 99 });
      expect(defineFlag('test.numeric', 10)).toBe(7);
    });

    it('falls back to default when type mismatches', () => {
      (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
        .__PKC_FLAGS_URL__ = { 'test.numeric': 'not-a-number' };
      __resetUrlCache();
      expect(defineFlag('test.numeric', 10)).toBe(10);
    });

    it('falls back to default when value out of range', () => {
      setContainerFlagSource({ 'test.bounded': 999 });
      expect(defineFlag('test.bounded', 10, { range: [1, 100] })).toBe(10);
    });

    it('falls back to default when value not in enum', () => {
      setContainerFlagSource({ 'test.enum': 'unknown' });
      expect(
        defineFlag('test.enum', 'a', { enum: ['a', 'b', 'c'] }),
      ).toBe('a');
    });

    it('accepts in-range numeric override', () => {
      setContainerFlagSource({ 'test.bounded': 50 });
      expect(defineFlag('test.bounded', 10, { range: [1, 100] })).toBe(50);
    });

    it('accepts enum-listed string override', () => {
      setContainerFlagSource({ 'test.enum': 'b' });
      expect(
        defineFlag('test.enum', 'a', { enum: ['a', 'b', 'c'] }),
      ).toBe('b');
    });

    it('coerces URL string to boolean (true / false / 1 / 0)', () => {
      (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
        .__PKC_FLAGS_URL__ = { f1: '1', f2: '0', f3: 'true', f4: 'false' };
      __resetUrlCache();
      expect(defineFlag('f1', false)).toBe(true);
      expect(defineFlag('f2', true)).toBe(false);
      expect(defineFlag('f3', false)).toBe(true);
      expect(defineFlag('f4', true)).toBe(false);
    });
  });

  describe('getRegisteredFlags', () => {
    it('enumerates all registered flags with source labels', () => {
      defineFlag('a.x', 1);
      setContainerFlagSource({ 'b.y': 2 });
      defineFlag('b.y', 0);
      (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
        .__PKC_FLAGS_URL__ = { 'c.z': 'urlval' };
      __resetUrlCache();
      defineFlag('c.z', 'default');
      const flags = getRegisteredFlags();
      const bySource = Object.fromEntries(
        flags.map((f) => [f.key, f.source]),
      );
      expect(bySource).toEqual({
        'a.x': 'default',
        'b.y': 'container',
        'c.z': 'url',
      });
    });

    it('returns insertion order', () => {
      defineFlag('z.first', 1);
      defineFlag('a.second', 2);
      defineFlag('m.third', 3);
      const keys = getRegisteredFlags().map((f) => f.key);
      expect(keys).toEqual(['z.first', 'a.second', 'm.third']);
    });
  });

  describe('getActiveFlagCount', () => {
    it('counts flags whose current value differs from default', () => {
      defineFlag('a', 1);
      setContainerFlagSource({ b: 2, c: 'changed' });
      defineFlag('b', 1);
      defineFlag('c', 'default');
      expect(getActiveFlagCount()).toEqual({ total: 3, active: 2 });
    });

    it('returns zero active when all flags use default', () => {
      defineFlag('a', 1);
      defineFlag('b', 'x');
      expect(getActiveFlagCount()).toEqual({ total: 2, active: 0 });
    });
  });
});
