import { describe, it, expect } from 'vitest';
import { reduce, createInitialState, type AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { FLAGS_LID } from '@core/model/record';
import { resolveFlagsPayload } from '@core/model/system-flags-payload';

function mkEntry(lid: string, overrides: Partial<Entry> = {}): Entry {
  return {
    lid,
    title: lid,
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function stateWith(container: Container | null): AppState {
  // The flags reducer cases live inside reduceReady, so set phase
  // accordingly. createInitialState() yields phase='initializing'
  // which routes to reduceInitializing (different case set).
  return {
    ...createInitialState(),
    phase: 'ready',
    container,
  };
}

describe('system-flags reducer', () => {
  describe('SET_FLAG', () => {
    it('inserts __flags__ entry when missing and writes the value', () => {
      const initial = stateWith(mkContainer([mkEntry('e1')]));
      const { state, events } = reduce(initial, {
        type: 'SET_FLAG',
        key: 'recent.default_limit',
        value: 15,
      });
      const flagsEntry = state.container!.entries.find(
        (e) => e.lid === FLAGS_LID,
      );
      expect(flagsEntry).toBeDefined();
      expect(flagsEntry!.archetype).toBe('system-flags');
      const payload = resolveFlagsPayload(flagsEntry!.body);
      expect(payload.values).toEqual({ 'recent.default_limit': 15 });
      expect(events).toContainEqual({
        type: 'FLAGS_CHANGED',
        flags: payload,
      });
    });

    it('updates existing __flags__ entry without losing other keys', () => {
      const flagsBody = JSON.stringify({
        format: 'pkc2-system-flags',
        version: 1,
        values: { 'a.x': 1, 'b.y': 2 },
      });
      const flagsEntry = mkEntry(FLAGS_LID, {
        archetype: 'system-flags',
        body: flagsBody,
        title: 'System Flags',
      });
      const initial = stateWith(mkContainer([flagsEntry, mkEntry('e1')]));
      const { state } = reduce(initial, {
        type: 'SET_FLAG',
        key: 'a.x',
        value: 42,
      });
      const updated = state.container!.entries.find(
        (e) => e.lid === FLAGS_LID,
      )!;
      const payload = resolveFlagsPayload(updated.body);
      expect(payload.values).toEqual({ 'a.x': 42, 'b.y': 2 });
    });

    it('accepts boolean and string values', () => {
      const initial = stateWith(mkContainer([mkEntry('e1')]));
      const s1 = reduce(initial, {
        type: 'SET_FLAG',
        key: 'experiment.foo',
        value: true,
      }).state;
      const s2 = reduce(s1, {
        type: 'SET_FLAG',
        key: 'theme.preset',
        value: 'dark',
      }).state;
      const flagsEntry = s2.container!.entries.find(
        (e) => e.lid === FLAGS_LID,
      )!;
      const payload = resolveFlagsPayload(flagsEntry.body);
      expect(payload.values).toEqual({
        'experiment.foo': true,
        'theme.preset': 'dark',
      });
    });

    it('is a no-op when container is null', () => {
      const initial = stateWith(null);
      const { state, events } = reduce(initial, {
        type: 'SET_FLAG',
        key: 'foo',
        value: 1,
      });
      expect(state).toBe(initial);
      expect(events).toEqual([]);
    });
  });

  describe('RESET_FLAG', () => {
    it('drops the given key from __flags__ values', () => {
      const flagsBody = JSON.stringify({
        format: 'pkc2-system-flags',
        version: 1,
        values: { 'a.x': 1, 'b.y': 2 },
      });
      const flagsEntry = mkEntry(FLAGS_LID, {
        archetype: 'system-flags',
        body: flagsBody,
      });
      const initial = stateWith(mkContainer([flagsEntry]));
      const { state, events } = reduce(initial, {
        type: 'RESET_FLAG',
        key: 'a.x',
      });
      const payload = resolveFlagsPayload(
        state.container!.entries.find((e) => e.lid === FLAGS_LID)!.body,
      );
      expect(payload.values).toEqual({ 'b.y': 2 });
      expect(events).toContainEqual({
        type: 'FLAGS_CHANGED',
        flags: payload,
      });
    });

    it('is a no-op (no event) when key absent', () => {
      const flagsEntry = mkEntry(FLAGS_LID, {
        archetype: 'system-flags',
        body: JSON.stringify({
          format: 'pkc2-system-flags',
          version: 1,
          values: { 'a.x': 1 },
        }),
      });
      const initial = stateWith(mkContainer([flagsEntry]));
      const { state, events } = reduce(initial, {
        type: 'RESET_FLAG',
        key: 'b.y',
      });
      expect(state).toBe(initial);
      expect(events).toEqual([]);
    });
  });

  describe('RESET_ALL_FLAGS', () => {
    it('clears the __flags__ entry to empty values', () => {
      const flagsEntry = mkEntry(FLAGS_LID, {
        archetype: 'system-flags',
        body: JSON.stringify({
          format: 'pkc2-system-flags',
          version: 1,
          values: { 'a.x': 1, 'b.y': 2 },
        }),
      });
      const initial = stateWith(mkContainer([flagsEntry]));
      const { state, events } = reduce(initial, { type: 'RESET_ALL_FLAGS' });
      const payload = resolveFlagsPayload(
        state.container!.entries.find((e) => e.lid === FLAGS_LID)!.body,
      );
      expect(payload.values).toEqual({});
      expect(events).toContainEqual({
        type: 'FLAGS_CHANGED',
        flags: payload,
      });
    });

    it('is a no-op (no event) when already empty', () => {
      const flagsEntry = mkEntry(FLAGS_LID, {
        archetype: 'system-flags',
        body: JSON.stringify({
          format: 'pkc2-system-flags',
          version: 1,
          values: {},
        }),
      });
      const initial = stateWith(mkContainer([flagsEntry]));
      const { state, events } = reduce(initial, { type: 'RESET_ALL_FLAGS' });
      expect(state).toBe(initial);
      expect(events).toEqual([]);
    });
  });

  describe('I-FLAGS-2: direct UPDATE_ENTRY on __flags__ rejected', () => {
    it('UPDATE_ENTRY on FLAGS_LID is blocked by reserved-lid gate', () => {
      const flagsEntry = mkEntry(FLAGS_LID, {
        archetype: 'system-flags',
        body: JSON.stringify({
          format: 'pkc2-system-flags',
          version: 1,
          values: { 'a.x': 1 },
        }),
      });
      const initial = stateWith(mkContainer([flagsEntry]));
      // Attempt direct edit via UPDATE_ENTRY — should be rejected
      // by the existing isReservedLid gate (matches __settings__).
      const { state } = reduce(initial, {
        type: 'UPDATE_ENTRY',
        lid: FLAGS_LID,
        title: 'Hacked',
        body: 'malicious',
      });
      const stillThere = state.container!.entries.find(
        (e) => e.lid === FLAGS_LID,
      )!;
      // Body unchanged (UPDATE_ENTRY rejected)
      expect(stillThere.body).toBe(flagsEntry.body);
      expect(stillThere.title).not.toBe('Hacked');
    });
  });
});
