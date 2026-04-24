/**
 * @vitest-environment happy-dom
 *
 * External Permalink receive — boot-time hash navigation.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §4 / §7 (post-correction).
 *
 * Validates that opening PKC2 with `<base>#pkc?container=<cid>&entry=<lid>`
 * lands the user on the target entry. Cross-container, missing target,
 * malformed, and ordinary `#fragment` URLs all fall through as safe
 * no-ops.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyExternalPermalinkOnBoot,
  parseExternalPermalinkFromUrl,
  resolveTargetLid,
  type ReceiveOutcome,
} from '@adapter/ui/external-permalink-receive';
import type { Container } from '@core/model/container';
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { Dispatchable } from '@core/action';

const T = '2026-04-24T00:00:00Z';
const SELF = 'c-self';
const OTHER = 'c-other';
const BASE = 'https://example.com/pkc2.html';

function makeContainer(overrides: Partial<Container> = {}): Container {
  return {
    meta: {
      container_id: SELF,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'b', archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Entry 2', body: 'b', archetype: 'text', created_at: T, updated_at: T },
      {
        lid: 'att1',
        title: 'photo.png',
        body: JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 10, asset_key: 'ast-001' }),
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
      },
      {
        lid: 'att-legacy',
        title: 'old.png',
        body: JSON.stringify({ name: 'old.png', mime: 'image/png', size: 10, data: 'base64' }),
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: { 'ast-001': 'data:image/png;base64,aGVsbG8=' },
    ...overrides,
  };
}

interface DispatchSpy {
  readonly calls: Dispatchable[];
  readonly dispatcher: Dispatcher;
}

function makeDispatcher(): DispatchSpy {
  const calls: Dispatchable[] = [];
  const dispatcher = {
    dispatch: vi.fn((action: Dispatchable) => {
      calls.push(action);
    }),
    getState: vi.fn(),
    onState: vi.fn(),
    onEvent: vi.fn(),
  } as unknown as Dispatcher;
  return { calls, dispatcher };
}

beforeEach(() => {
  // Each test installs its own happy-dom location URL via window.location.assign-equivalent.
  document.body.innerHTML = '';
});

describe('parseExternalPermalinkFromUrl — pure parser facade', () => {
  it('parses an entry permalink URL', () => {
    const r = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&entry=e1`);
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('entry');
    expect(r!.targetId).toBe('e1');
    expect(r!.containerId).toBe(SELF);
  });

  it('parses an asset permalink URL', () => {
    const r = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&asset=ast-001`);
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('asset');
    expect(r!.targetId).toBe('ast-001');
  });

  it('returns null for non-PKC hash', () => {
    expect(parseExternalPermalinkFromUrl(`${BASE}#section1`)).toBeNull();
    expect(parseExternalPermalinkFromUrl(`${BASE}`)).toBeNull();
  });

  it('returns null for malformed #pkc? query', () => {
    expect(parseExternalPermalinkFromUrl(`${BASE}#pkc?garbage`)).toBeNull();
    expect(parseExternalPermalinkFromUrl(`${BASE}#pkc?entry=e1`)).toBeNull(); // missing container
  });
});

describe('resolveTargetLid — entry / asset lookup', () => {
  const container = makeContainer();

  it('returns the entry lid when entry exists', () => {
    const parsed = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&entry=e1`)!;
    expect(resolveTargetLid(parsed, container)).toBe('e1');
  });

  it('returns null when entry is missing', () => {
    const parsed = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&entry=ghost`)!;
    expect(resolveTargetLid(parsed, container)).toBeNull();
  });

  it('returns the owning attachment lid for an asset key', () => {
    const parsed = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&asset=ast-001`)!;
    expect(resolveTargetLid(parsed, container)).toBe('att1');
  });

  it('returns null for an asset key with no owning attachment', () => {
    const parsed = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&asset=ghost-key`)!;
    expect(resolveTargetLid(parsed, container)).toBeNull();
  });

  it('does not match legacy inline attachments (no asset_key field)', () => {
    // `att-legacy` has `data` inline but no asset_key — must not match.
    const parsed = parseExternalPermalinkFromUrl(`${BASE}#pkc?container=${SELF}&asset=does-not-matter`)!;
    expect(resolveTargetLid(parsed, container)).toBeNull();
  });
});

describe('applyExternalPermalinkOnBoot — entry navigation', () => {
  it('dispatches SELECT_ENTRY with revealInSidebar for same-container entry', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?container=${SELF}&entry=e1`,
    );
    expect(outcome.kind).toBe('navigated');
    expect((outcome as ReceiveOutcome & { kind: 'navigated' }).lid).toBe('e1');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      type: 'SELECT_ENTRY',
      lid: 'e1',
      revealInSidebar: true,
    });
  });

  it('safely no-ops on missing entry (no SELECT_ENTRY)', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?container=${SELF}&entry=ghost`,
    );
    expect(outcome.kind).toBe('missing-entry');
    expect(calls).toHaveLength(0);
  });
});

describe('applyExternalPermalinkOnBoot — asset navigation', () => {
  it('navigates to the owning attachment entry for a same-container asset', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?container=${SELF}&asset=ast-001`,
    );
    expect(outcome.kind).toBe('navigated');
    expect((outcome as ReceiveOutcome & { kind: 'navigated' }).lid).toBe('att1');
    expect(calls[0]).toEqual({
      type: 'SELECT_ENTRY',
      lid: 'att1',
      revealInSidebar: true,
    });
  });

  it('safely no-ops on missing asset (no SELECT_ENTRY)', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?container=${SELF}&asset=ghost-key`,
    );
    expect(outcome.kind).toBe('missing-asset');
    expect(calls).toHaveLength(0);
  });
});

describe('applyExternalPermalinkOnBoot — cross-container guard', () => {
  it('does NOT dispatch for a cross-container permalink', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?container=${OTHER}&entry=e1`,
    );
    expect(outcome.kind).toBe('cross-container');
    expect(calls).toHaveLength(0);
  });
});

describe('applyExternalPermalinkOnBoot — non-interference', () => {
  it('ordinary hash (#section1) → no dispatch, outcome no-hash', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#section1`,
    );
    expect(outcome.kind).toBe('no-hash');
    expect(calls).toHaveLength(0);
  });

  it('URL without any hash → no-op', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(dispatcher, container, BASE);
    expect(outcome.kind).toBe('no-hash');
    expect(calls).toHaveLength(0);
  });

  it('empty URL → no-op', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(dispatcher, container, '');
    expect(outcome.kind).toBe('no-hash');
    expect(calls).toHaveLength(0);
  });

  it('malformed #pkc? query → outcome malformed, no dispatch', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?garbage`,
    );
    expect(outcome.kind).toBe('malformed');
    expect(calls).toHaveLength(0);
  });

  it('unrelated query string in URL → ignored', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}?utm=foo`,
    );
    expect(outcome.kind).toBe('no-hash');
    expect(calls).toHaveLength(0);
  });
});

describe('applyExternalPermalinkOnBoot — base URL flavours', () => {
  it('works with file:// base URL', () => {
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `file:///home/u/pkc2.html#pkc?container=${SELF}&entry=e1`,
    );
    expect(outcome.kind).toBe('navigated');
    expect(calls[0]).toMatchObject({ type: 'SELECT_ENTRY', lid: 'e1' });
  });

  it('preserves the entry fragment when present (URL-encoded)', () => {
    // The receive helper currently navigates by lid only — fragment is
    // captured by the parser but not written to AppState in v0. The
    // navigation itself must still succeed.
    const { dispatcher, calls } = makeDispatcher();
    const container = makeContainer();
    const outcome = applyExternalPermalinkOnBoot(
      dispatcher,
      container,
      `${BASE}#pkc?container=${SELF}&entry=e1&fragment=log%2Fxyz`,
    );
    expect(outcome.kind).toBe('navigated');
    if (outcome.kind === 'navigated') {
      expect(outcome.parsed.fragment).toBe('log/xyz');
    }
    expect(calls[0]).toMatchObject({ type: 'SELECT_ENTRY', lid: 'e1' });
  });
});
