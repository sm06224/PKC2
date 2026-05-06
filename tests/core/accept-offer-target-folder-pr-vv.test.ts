/**
 * ACCEPT_OFFER target_folder_lid reducer tests (PR-VV, 2026-05-06).
 *
 * User 修正指示4:「取り込み先の指定をしたい」
 *
 * Validates the additive contract:
 *   - target_folder_lid 未指定 / null → root scope(従来挙動)
 *   - target_folder_lid が folder lid → structural relation 1 件
 *     生成、RELATION_CREATED event を emit
 *   - target_folder_lid が unknown / non-folder → root scope へ
 *     fallback、relation 不生成(silent)
 */
import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'pr-vv-test',
      title: 'PR-VV',
      created_at: '2026-05-06T00:00:00Z',
      updated_at: '2026-05-06T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'fld-1', title: 'Inbox',
        archetype: 'folder', body: '',
        created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z',
      },
      {
        lid: 'note-1', title: 'A regular text note', body: 'plain',
        archetype: 'text', created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyWithOffer(): AppState {
  const offer = {
    offer_id: 'vv-1',
    title: 'New Capture',
    body: '# captured',
    archetype: 'text' as const,
    source_container_id: null,
    reply_to_id: null,
    received_at: '2026-05-06T01:00:00Z',
    source_url: null,
    captured_at: null,
    kind: null,
    thumbnail_url: null,
    provider: null,
    duration_sec: null,
    pages: null,
    isbn: null,
    author: null,
    brand: null,
  };
  return {
    ...createInitialState(),
    phase: 'ready',
    container: makeContainer(),
    pendingOffers: [offer],
  };
}

describe('PR-VV: ACCEPT_OFFER target_folder_lid', () => {
  it('without target_folder_lid, entry lands at root (no relation)', () => {
    const { state, events } = reduce(readyWithOffer(), {
      type: 'ACCEPT_OFFER',
      offer_id: 'vv-1',
    });
    // No relation created.
    expect(state.container?.relations.length).toBe(0);
    // Events: OFFER_ACCEPTED + ENTRY_CREATED only.
    expect(events.map((e) => e.type)).toEqual(['OFFER_ACCEPTED', 'ENTRY_CREATED']);
  });

  it('with target_folder_lid pointing at a folder, structural relation is created', () => {
    const { state, events } = reduce(readyWithOffer(), {
      type: 'ACCEPT_OFFER',
      offer_id: 'vv-1',
      target_folder_lid: 'fld-1',
    });
    expect(state.container?.relations.length).toBe(1);
    const rel = state.container!.relations[0]!;
    expect(rel.from).toBe('fld-1');
    expect(rel.kind).toBe('structural');
    // Events: OFFER_ACCEPTED + ENTRY_CREATED + RELATION_CREATED.
    expect(events.map((e) => e.type)).toEqual([
      'OFFER_ACCEPTED', 'ENTRY_CREATED', 'RELATION_CREATED',
    ]);
  });

  it('target_folder_lid pointing at a non-folder entry → root fallback (no relation, no event)', () => {
    const { state, events } = reduce(readyWithOffer(), {
      type: 'ACCEPT_OFFER',
      offer_id: 'vv-1',
      target_folder_lid: 'note-1', // text, not folder
    });
    expect(state.container?.relations.length).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['OFFER_ACCEPTED', 'ENTRY_CREATED']);
  });

  it('target_folder_lid pointing at unknown lid → root fallback (silent)', () => {
    const { state, events } = reduce(readyWithOffer(), {
      type: 'ACCEPT_OFFER',
      offer_id: 'vv-1',
      target_folder_lid: 'unknown-folder',
    });
    expect(state.container?.relations.length).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['OFFER_ACCEPTED', 'ENTRY_CREATED']);
  });

  it('target_folder_lid: null → root scope (same as undefined)', () => {
    const { state, events } = reduce(readyWithOffer(), {
      type: 'ACCEPT_OFFER',
      offer_id: 'vv-1',
      target_folder_lid: null,
    });
    expect(state.container?.relations.length).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['OFFER_ACCEPTED', 'ENTRY_CREATED']);
  });
});
