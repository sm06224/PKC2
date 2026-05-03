import { describe, it, expect } from 'vitest';
import {
  resolveFlagsPayload,
  serializeFlagsPayload,
  setFlagValue,
  removeFlagValue,
  clearFlagValues,
  FLAGS_DEFAULTS,
  type SystemFlagsPayload,
} from '@core/model/system-flags-payload';

describe('system-flags-payload', () => {
  describe('resolveFlagsPayload', () => {
    it('returns FLAGS_DEFAULTS for undefined / empty body', () => {
      expect(resolveFlagsPayload(undefined)).toEqual(FLAGS_DEFAULTS);
      expect(resolveFlagsPayload('')).toEqual(FLAGS_DEFAULTS);
    });

    it('returns FLAGS_DEFAULTS for invalid JSON', () => {
      expect(resolveFlagsPayload('{not json')).toEqual(FLAGS_DEFAULTS);
    });

    it('returns FLAGS_DEFAULTS for non-object root', () => {
      expect(resolveFlagsPayload('"string"')).toEqual(FLAGS_DEFAULTS);
      expect(resolveFlagsPayload('42')).toEqual(FLAGS_DEFAULTS);
      expect(resolveFlagsPayload('null')).toEqual(FLAGS_DEFAULTS);
    });

    it('returns FLAGS_DEFAULTS for wrong format discriminator', () => {
      const body = JSON.stringify({
        format: 'pkc2-system-settings',
        version: 1,
        values: { foo: 1 },
      });
      expect(resolveFlagsPayload(body)).toEqual(FLAGS_DEFAULTS);
    });

    it('returns FLAGS_DEFAULTS for version mismatch', () => {
      const body = JSON.stringify({
        format: 'pkc2-system-flags',
        version: 99,
        values: { foo: 1 },
      });
      expect(resolveFlagsPayload(body)).toEqual(FLAGS_DEFAULTS);
    });

    it('preserves valid primitive values', () => {
      const body = JSON.stringify({
        format: 'pkc2-system-flags',
        version: 1,
        values: { 'recent.default_limit': 15, 'experiment.foo': true, 'theme.preset': 'dark' },
      });
      const out = resolveFlagsPayload(body);
      expect(out.values).toEqual({
        'recent.default_limit': 15,
        'experiment.foo': true,
        'theme.preset': 'dark',
      });
    });

    it('drops non-primitive values silently (forward-compat)', () => {
      const body = JSON.stringify({
        format: 'pkc2-system-flags',
        version: 1,
        values: {
          'good.number': 42,
          'bad.object': { a: 1 },
          'bad.array': [1, 2, 3],
          'good.bool': false,
          'bad.null': null,
        },
      });
      const out = resolveFlagsPayload(body);
      expect(out.values).toEqual({ 'good.number': 42, 'good.bool': false });
    });

    it('treats non-object values field as empty', () => {
      const body = JSON.stringify({
        format: 'pkc2-system-flags',
        version: 1,
        values: 'invalid',
      });
      expect(resolveFlagsPayload(body).values).toEqual({});
    });
  });

  describe('serializeFlagsPayload', () => {
    it('produces a stable JSON shape with sorted keys', () => {
      const p: SystemFlagsPayload = {
        format: 'pkc2-system-flags',
        version: 1,
        values: { 'b.key': 2, 'a.key': 1, 'c.key': 3 },
      };
      const text = serializeFlagsPayload(p);
      const reparsed = JSON.parse(text);
      // Keys should appear sorted in the serialized form.
      expect(Object.keys(reparsed.values)).toEqual(['a.key', 'b.key', 'c.key']);
    });

    it('round-trips through resolve', () => {
      const p: SystemFlagsPayload = {
        format: 'pkc2-system-flags',
        version: 1,
        values: { x: 1, y: 'hello', z: true },
      };
      const round = resolveFlagsPayload(serializeFlagsPayload(p));
      expect(round).toEqual(p);
    });
  });

  describe('functional helpers', () => {
    it('setFlagValue adds / replaces without mutating input', () => {
      const a = { ...FLAGS_DEFAULTS };
      const b = setFlagValue(a, 'foo', 1);
      expect(a.values).toEqual({});
      expect(b.values).toEqual({ foo: 1 });
      const c = setFlagValue(b, 'foo', 2);
      expect(b.values).toEqual({ foo: 1 });
      expect(c.values).toEqual({ foo: 2 });
    });

    it('removeFlagValue is a no-op when key absent (same reference)', () => {
      const a: SystemFlagsPayload = {
        ...FLAGS_DEFAULTS,
        values: { foo: 1 },
      };
      const b = removeFlagValue(a, 'bar');
      expect(b).toBe(a);
    });

    it('removeFlagValue drops the given key without mutating input', () => {
      const a: SystemFlagsPayload = {
        ...FLAGS_DEFAULTS,
        values: { foo: 1, bar: 2 },
      };
      const b = removeFlagValue(a, 'foo');
      expect(a.values).toEqual({ foo: 1, bar: 2 });
      expect(b.values).toEqual({ bar: 2 });
    });

    it('clearFlagValues is a no-op when already empty', () => {
      expect(clearFlagValues(FLAGS_DEFAULTS)).toBe(FLAGS_DEFAULTS);
    });

    it('clearFlagValues empties the values map without mutating input', () => {
      const a: SystemFlagsPayload = {
        ...FLAGS_DEFAULTS,
        values: { foo: 1, bar: 2 },
      };
      const b = clearFlagValues(a);
      expect(a.values).toEqual({ foo: 1, bar: 2 });
      expect(b.values).toEqual({});
    });
  });
});
