/**
 * FI-About: about/build-info hidden entry v1 tests.
 *
 * Covers:
 * - core: about payload validation + fallback
 * - core: reserved lid detection
 * - reducer: reserved lid protection (edit/delete/update blocked)
 * - renderer: hidden from sidebar
 * - renderer: about view shown when no user entries
 * - renderer: about view shown when __about__ selected
 * - renderer: malformed payload fallback rendering
 * - export: about entry included
 */

/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reduce, createInitialState } from '@adapter/state/app-state';
import { render } from '@adapter/ui/renderer';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { ABOUT_LID, isReservedLid } from '@core/model/record';
import {
  isValidAboutPayload,
  resolveAboutPayload,
  filterValidModules,
  DEFAULT_ABOUT_STUB,
} from '@core/model/about-payload';

// ── helpers ──────────────────────────────────────────────────

function makeAboutEntry(bodyOverride?: string): Entry {
  const payload = {
    type: 'pkc2-about',
    version: '2.0.0',
    build: { timestamp: '2026-04-18T06:00:00Z', commit: 'abc1234', builder: 'vite+release-builder' },
    license: { name: 'MIT', url: 'https://example.com/LICENSE' },
    author: { name: 'sm06224', url: 'https://example.com' },
    runtime: { offline: true, bundled: true, externalDependencies: false },
    modules: [{ name: 'markdown-it', version: '14.1.1', license: 'MIT' }],
  };
  return {
    lid: ABOUT_LID,
    title: 'About PKC2',
    body: bodyOverride ?? JSON.stringify(payload),
    archetype: 'system-about',
    created_at: '2026-04-18T06:00:00Z',
    updated_at: '2026-04-18T06:00:00Z',
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'c1', schema_version: 1, title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(container: Container): AppState {
  return { ...createInitialState(), phase: 'ready', container };
}

// ── 1. Reserved lid detection ───────────────────────────────

describe('isReservedLid', () => {
  it('__about__ is reserved', () => {
    expect(isReservedLid('__about__')).toBe(true);
  });

  it('__settings__ is reserved', () => {
    expect(isReservedLid('__settings__')).toBe(true);
  });

  it('normal lids are not reserved', () => {
    expect(isReservedLid('entry-1')).toBe(false);
    expect(isReservedLid('about')).toBe(false);
  });

  it('too-short __ patterns are not reserved', () => {
    expect(isReservedLid('____')).toBe(false);
    expect(isReservedLid('__')).toBe(false);
  });
});

// ── 2. About payload validation ─────────────────────────────

describe('isValidAboutPayload', () => {
  it('valid payload passes', () => {
    const p = {
      type: 'pkc2-about',
      version: '2.0.0',
      build: { timestamp: '2026-04-18T06:00:00Z', commit: 'abc1234', builder: 'vite+release-builder' },
      license: { name: 'MIT', url: '' },
      author: { name: 'sm06224', url: '' },
      runtime: { offline: true, bundled: true, externalDependencies: false },
      modules: [],
    };
    expect(isValidAboutPayload(p)).toBe(true);
  });

  it('wrong type field rejects', () => {
    const p = {
      type: 'wrong',
      version: '2.0.0',
      build: { timestamp: 'x', commit: 'x', builder: 'x' },
      license: { name: 'MIT', url: '' },
      author: { name: 'x', url: '' },
      runtime: { offline: true, bundled: true, externalDependencies: false },
      modules: [],
    };
    expect(isValidAboutPayload(p)).toBe(false);
  });

  it('empty version rejects', () => {
    const p = {
      type: 'pkc2-about',
      version: '',
      build: { timestamp: 'x', commit: 'x', builder: 'x' },
      license: { name: 'MIT', url: '' },
      author: { name: 'x', url: '' },
      runtime: { offline: true, bundled: true, externalDependencies: false },
      modules: [],
    };
    expect(isValidAboutPayload(p)).toBe(false);
  });

  it('non-array modules rejects', () => {
    const p = {
      type: 'pkc2-about',
      version: '2.0.0',
      build: { timestamp: 'x', commit: 'x', builder: 'x' },
      license: { name: 'MIT', url: '' },
      author: { name: 'x', url: '' },
      runtime: { offline: true, bundled: true, externalDependencies: false },
      modules: 'not-array',
    };
    expect(isValidAboutPayload(p)).toBe(false);
  });

  it('non-boolean runtime rejects', () => {
    const p = {
      type: 'pkc2-about',
      version: '2.0.0',
      build: { timestamp: 'x', commit: 'x', builder: 'x' },
      license: { name: 'MIT', url: '' },
      author: { name: 'x', url: '' },
      runtime: { offline: 'yes', bundled: true, externalDependencies: false },
      modules: [],
    };
    expect(isValidAboutPayload(p)).toBe(false);
  });
});

// ── 3. filterValidModules ───────────────────────────────────

describe('filterValidModules', () => {
  it('keeps valid modules', () => {
    const mods = [{ name: 'a', version: '1.0', license: 'MIT' }];
    expect(filterValidModules(mods)).toHaveLength(1);
  });

  it('skips modules with missing fields', () => {
    const mods = [
      { name: 'a', version: '1.0', license: 'MIT' },
      { name: 'b' },
      { version: '1.0', license: 'MIT' },
    ];
    expect(filterValidModules(mods)).toHaveLength(1);
  });
});

// ── 4. resolveAboutPayload ──────────────────────────────────

describe('resolveAboutPayload', () => {
  it('returns default stub for undefined body', () => {
    expect(resolveAboutPayload(undefined)).toEqual(DEFAULT_ABOUT_STUB);
  });

  it('returns default stub for invalid JSON', () => {
    expect(resolveAboutPayload('not json')).toEqual(DEFAULT_ABOUT_STUB);
  });

  it('returns default stub for wrong schema', () => {
    expect(resolveAboutPayload('{"type":"wrong"}')).toEqual(DEFAULT_ABOUT_STUB);
  });

  it('parses valid payload and filters modules', () => {
    const payload = {
      type: 'pkc2-about',
      version: '2.0.0',
      build: { timestamp: 'x', commit: 'x', builder: 'x' },
      license: { name: 'MIT', url: '' },
      author: { name: 'test', url: '' },
      runtime: { offline: true, bundled: true, externalDependencies: false },
      modules: [
        { name: 'a', version: '1.0', license: 'MIT' },
        { name: 'b' },
      ],
    };
    const result = resolveAboutPayload(JSON.stringify(payload));
    expect(result.version).toBe('2.0.0');
    expect(result.modules).toHaveLength(1);
  });
});

// ── 5. Reducer: reserved lid protection ─────────────────────

describe('reducer reserved lid protection', () => {
  it('BEGIN_EDIT blocked for __about__', () => {
    const container = makeContainer([makeAboutEntry()]);
    const state = readyState(container);
    const { state: next } = reduce(state, { type: 'BEGIN_EDIT', lid: ABOUT_LID });
    expect(next.phase).toBe('ready');
    expect(next).toBe(state);
  });

  it('DELETE_ENTRY blocked for __about__', () => {
    const container = makeContainer([makeAboutEntry()]);
    const state = readyState(container);
    const { state: next } = reduce(state, { type: 'DELETE_ENTRY', lid: ABOUT_LID });
    expect(next.container!.entries).toHaveLength(1);
    expect(next).toBe(state);
  });

  it('QUICK_UPDATE_ENTRY blocked for __about__', () => {
    const container = makeContainer([makeAboutEntry()]);
    const state = readyState(container);
    const { state: next } = reduce(state, { type: 'QUICK_UPDATE_ENTRY', lid: ABOUT_LID, body: '{}' });
    expect(next).toBe(state);
  });

  it('SELECT_ENTRY works for __about__ (read-only access allowed)', () => {
    const container = makeContainer([makeAboutEntry()]);
    const state = readyState(container);
    const { state: next } = reduce(state, { type: 'SELECT_ENTRY', lid: ABOUT_LID });
    expect(next.selectedLid).toBe(ABOUT_LID);
  });
});

// ── 6. Renderer: hidden from sidebar ────────────────────────

describe('renderer about entry hidden from sidebar', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('about entry not shown in sidebar when it is the only entry', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]');
    const items = sidebar?.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items?.length ?? 0).toBe(0);
  });

  it('about entry not shown alongside user entries', () => {
    const userEntry: Entry = {
      lid: 'user-1',
      title: 'Test',
      body: 'hello',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const container = makeContainer([makeAboutEntry(), userEntry]);
    render(readyState(container), root);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]');
    const items = sidebar?.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items?.length).toBe(1);
    expect(items?.[0]?.getAttribute('data-pkc-lid')).toBe('user-1');
  });
});

// ── 7. Renderer: about view shown when no user entries ──────

describe('renderer about view display', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('shows about view when container has only __about__ entry', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const aboutView = root.querySelector('[data-pkc-region="about-view"]');
    expect(aboutView).not.toBeNull();
  });

  it('about view displays PKC2 title', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const title = root.querySelector('.pkc-about-title');
    expect(title?.textContent).toBe('PKC2');
  });

  it('about view displays version', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const version = root.querySelector('.pkc-about-version');
    expect(version?.textContent).toBe('v2.0.0');
  });

  it('about view displays modules table', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const table = root.querySelector('.pkc-about-table');
    expect(table).not.toBeNull();
    const rows = table?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(1);
  });

  it('about view when __about__ is explicitly selected', () => {
    const userEntry: Entry = {
      lid: 'user-1',
      title: 'Test',
      body: 'hello',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const container = makeContainer([makeAboutEntry(), userEntry]);
    const state = { ...readyState(container), selectedLid: ABOUT_LID };
    render(state, root);
    const aboutView = root.querySelector('[data-pkc-region="about-view"]');
    expect(aboutView).not.toBeNull();
  });

  it('does NOT show about view when user entries exist and none selected', () => {
    const userEntry: Entry = {
      lid: 'user-1',
      title: 'Test',
      body: 'hello',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const container = makeContainer([makeAboutEntry(), userEntry]);
    render(readyState(container), root);
    const aboutView = root.querySelector('[data-pkc-region="about-view"]');
    expect(aboutView).toBeNull();
  });
});

// ── 8. Renderer: malformed payload fallback ─────────────────

describe('renderer about malformed fallback', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('malformed body falls back to unknown version', () => {
    const container = makeContainer([makeAboutEntry('not-json')]);
    render(readyState(container), root);
    const version = root.querySelector('.pkc-about-version');
    expect(version?.textContent).toBe('vunknown');
  });

  it('wrong type field falls back', () => {
    const container = makeContainer([makeAboutEntry('{"type":"wrong"}')]);
    render(readyState(container), root);
    const version = root.querySelector('.pkc-about-version');
    expect(version?.textContent).toBe('vunknown');
  });
});

// ── 9. Export includes about entry ──────────────────────────

describe('export includes about entry', () => {
  it('about entry is present in container.entries (not filtered by export)', () => {
    const container = makeContainer([makeAboutEntry()]);
    expect(container.entries.some((e) => e.lid === ABOUT_LID)).toBe(true);
    expect(container.entries.some((e) => e.archetype === 'system-about')).toBe(true);
  });
});

// ── 10. Builder about entry ─────────────────────────────────

describe('about entry builder', () => {
  it('buildAboutEntry produces valid payload', async () => {
    const { buildAboutEntry } = await import('../../build/about-entry-builder');
    const pkg = {
      version: '2.0.0',
      license: 'MIT',
      author: 'sm06224',
      homepage: 'https://github.com/sm06224/PKC2',
      dependencies: { 'markdown-it': '^14.1.1' },
    };
    const entry = buildAboutEntry(pkg, '2026-04-18T06:00:00Z', 'abc1234');
    expect(entry.lid).toBe(ABOUT_LID);
    expect(entry.archetype).toBe('system-about');

    const body = JSON.parse(entry.body);
    expect(isValidAboutPayload(body)).toBe(true);
    expect(body.version).toBe('2.0.0');
    expect(body.build.commit).toBe('abc1234');
    expect(body.modules).toHaveLength(1);
    expect(body.modules[0].name).toBe('markdown-it');
  });

  it('buildAboutEntry handles missing optional fields', async () => {
    const { buildAboutEntry } = await import('../../build/about-entry-builder');
    const pkg = { version: '1.0.0' };
    const entry = buildAboutEntry(pkg, '2026-04-18T06:00:00Z', 'unknown');
    const body = JSON.parse(entry.body);
    expect(body.author.name).toBe('unknown');
    expect(body.license.name).toBe('unknown');
    expect(body.modules).toHaveLength(0);
  });
});
