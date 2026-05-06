/**
 * buildSystemOnlyContainer tests (PR-PP, 2026-05-06).
 *
 * "New PKC" export ボタンが呼び出す pure helper。
 *   - reserved system entries(`__settings__` / `__flags__` /
 *     `__about__`)だけを残す
 *   - relations / revisions / assets は空
 *   - container_id / created_at / updated_at は new
 *   - title は default または override
 */
import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import { buildSystemOnlyContainer } from '@features/auto-fill/system-only-container';

function makeSourceContainer(): Container {
  return {
    meta: {
      container_id: 'source-id',
      title: 'My Workspace',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-05-06T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      // user content
      {
        lid: 'user-1', title: 'My Note', body: 'private notes',
        archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
      },
      {
        lid: 'user-2', title: 'My Todo', body: '{"status":"open","description":"do it"}',
        archetype: 'todo', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-05-02T00:00:00Z',
      },
      // system entries — should be kept
      {
        lid: '__settings__', title: 'Settings', body: '{"theme":{"mode":"dark"}}',
        archetype: 'system-settings', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-05-03T00:00:00Z',
      },
      {
        lid: '__flags__', title: 'Flags', body: '{"recent.default_limit":5}',
        archetype: 'system-flags', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-05-04T00:00:00Z',
      },
      {
        lid: '__about__', title: 'About', body: 'PKC2 release notes',
        archetype: 'system-about', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-05-05T00:00:00Z',
      },
    ],
    relations: [
      { id: 'r1', from: 'user-1', to: 'user-2', kind: 'structural' },
    ],
    revisions: [
      { id: 'rev1', entry_lid: 'user-1', title: 'My Note', body: 'older notes',
        archetype: 'text', timestamp: '2026-04-01T00:00:00Z' } as never,
    ],
    assets: { 'asset-1': 'BASE64DATA' },
  };
}

describe('buildSystemOnlyContainer', () => {
  it('keeps only reserved system entries', () => {
    const source = makeSourceContainer();
    const result = buildSystemOnlyContainer(source, { nowIso: '2026-05-06T12:00:00Z' });
    const lids = result.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['__about__', '__flags__', '__settings__']);
  });

  it('strips all relations / revisions / assets', () => {
    const source = makeSourceContainer();
    const result = buildSystemOnlyContainer(source);
    expect(result.relations).toEqual([]);
    expect(result.revisions).toEqual([]);
    expect(result.assets).toEqual({});
  });

  it('assigns a fresh container_id and timestamps', () => {
    const source = makeSourceContainer();
    const result = buildSystemOnlyContainer(source, { nowIso: '2026-05-06T12:00:00Z' });
    expect(result.meta.container_id).not.toBe(source.meta.container_id);
    expect(result.meta.container_id).toMatch(/^new-pkc-/);
    expect(result.meta.created_at).toBe('2026-05-06T12:00:00Z');
    expect(result.meta.updated_at).toBe('2026-05-06T12:00:00Z');
  });

  it('uses default title when not overridden', () => {
    const source = makeSourceContainer();
    const result = buildSystemOnlyContainer(source);
    expect(result.meta.title).toBe('New PKC2 (system-only)');
  });

  it('honors title override', () => {
    const source = makeSourceContainer();
    const result = buildSystemOnlyContainer(source, { title: '私のテンプレート' });
    expect(result.meta.title).toBe('私のテンプレート');
  });

  it('does not mutate the source container', () => {
    const source = makeSourceContainer();
    const beforeEntries = source.entries.length;
    const beforeRelations = source.relations.length;
    buildSystemOnlyContainer(source);
    expect(source.entries.length).toBe(beforeEntries);
    expect(source.relations.length).toBe(beforeRelations);
  });

  it('preserves system entry body content (settings + flags must round-trip)', () => {
    const source = makeSourceContainer();
    const result = buildSystemOnlyContainer(source);
    const settings = result.entries.find((e) => e.lid === '__settings__')!;
    const flags = result.entries.find((e) => e.lid === '__flags__')!;
    expect(settings.body).toBe('{"theme":{"mode":"dark"}}');
    expect(flags.body).toBe('{"recent.default_limit":5}');
  });

  it('emits empty entries when source has no system entries', () => {
    const source: Container = {
      meta: makeSourceContainer().meta,
      entries: [{
        lid: 'only-user', title: 'Only', body: 'b', archetype: 'text',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
      relations: [], revisions: [], assets: {},
    };
    const result = buildSystemOnlyContainer(source);
    expect(result.entries).toEqual([]);
  });
});
