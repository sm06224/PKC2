/**
 * MATERIALIZE_THUMBNAIL reducer tests (PR-HH, 2026-05-06).
 *
 * Validates the contract documented on the action type:
 *   - replaces frontmatter `thumbnail: <http URL>` with `thumbnail:
 *     asset:KEY`
 *   - writes the asset bytes to `container.assets`
 *   - idempotent on a body that has already been rewritten
 *   - blocked when readonly / no container / unknown lid
 *   - works in editing phase too (delegated path)
 */
import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

function makeContainer(thumbnailLine: string): Container {
  return {
    meta: {
      container_id: 'mat-test',
      title: 'Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'Cover Entry',
        body: `---\ntitle: Foo\n${thumbnailLine}\nprovider: youtube\n---\n\nbody`,
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyWith(container: Container): AppState {
  return { ...createInitialState(), phase: 'ready', container };
}

describe('MATERIALIZE_THUMBNAIL', () => {
  it('replaces http URL with asset:KEY and writes the asset', () => {
    const container = makeContainer('thumbnail: https://i.ytimg.com/vi/x/0.jpg');
    const { state } = reduce(readyWith(container), {
      type: 'MATERIALIZE_THUMBNAIL',
      lid: 'e1',
      assetKey: 'thumb-e1-aa',
      assetData: 'BASE64BYTES',
      mime: 'image/jpeg',
    });
    expect(state.container?.entries[0]!.body).toContain('thumbnail: asset:thumb-e1-aa');
    expect(state.container?.entries[0]!.body).not.toContain('i.ytimg.com');
    expect(state.container?.assets['thumb-e1-aa']).toBe('BASE64BYTES');
  });

  it('emits no events (post-accept side effect, no user-visible churn)', () => {
    const container = makeContainer('thumbnail: https://example.com/cover.png');
    const { events } = reduce(readyWith(container), {
      type: 'MATERIALIZE_THUMBNAIL',
      lid: 'e1',
      assetKey: 'k',
      assetData: 'bytes',
      mime: 'image/png',
    });
    expect(events).toEqual([]);
  });

  it('idempotent: when body already references asset:KEY, only writes the asset', () => {
    const container = makeContainer('thumbnail: asset:already');
    const before = container.entries[0]!.body;
    const { state } = reduce(readyWith(container), {
      type: 'MATERIALIZE_THUMBNAIL',
      lid: 'e1',
      assetKey: 'k2',
      assetData: 'bytes',
      mime: 'image/png',
    });
    expect(state.container?.entries[0]!.body).toBe(before);
    expect(state.container?.assets['k2']).toBe('bytes');
  });

  it('blocked when readonly', () => {
    const container = makeContainer('thumbnail: https://example.com/x.jpg');
    const base: AppState = { ...readyWith(container), readonly: true };
    const { state, events } = reduce(base, {
      type: 'MATERIALIZE_THUMBNAIL',
      lid: 'e1',
      assetKey: 'k',
      assetData: 'b',
      mime: 'image/jpeg',
    });
    expect(state).toBe(base);
    expect(events).toEqual([]);
  });

  it('blocked when lid does not exist', () => {
    const container = makeContainer('thumbnail: https://example.com/x.jpg');
    const base = readyWith(container);
    const { state, events } = reduce(base, {
      type: 'MATERIALIZE_THUMBNAIL',
      lid: 'unknown',
      assetKey: 'k',
      assetData: 'b',
      mime: 'image/jpeg',
    });
    expect(state).toBe(base);
    expect(events).toEqual([]);
  });

  it('works during editing phase (delegated to ready handler)', () => {
    const container = makeContainer('thumbnail: https://example.com/cover.png');
    const editingState: AppState = {
      ...readyWith(container),
      phase: 'editing',
      editingLid: 'e1',
    };
    const { state } = reduce(editingState, {
      type: 'MATERIALIZE_THUMBNAIL',
      lid: 'e1',
      assetKey: 'edit-k',
      assetData: 'bytes',
      mime: 'image/png',
    });
    expect(state.phase).toBe('editing');
    expect(state.editingLid).toBe('e1');
    expect(state.container?.entries[0]!.body).toContain('thumbnail: asset:edit-k');
  });
});
