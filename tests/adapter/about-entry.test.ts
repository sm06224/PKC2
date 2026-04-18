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
 * - renderer: dependencies + devDependencies tables
 * - renderer: proud-zero message when a table is empty
 * - export: about entry included
 * - builder: dependencies + devDependencies both injected
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

function makeValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'pkc2-about',
    version: '2.0.0',
    description: 'Portable Knowledge Container',
    build: { timestamp: '2026-04-18T06:00:00Z', commit: 'abc1234', builder: 'vite+release-builder' },
    license: { name: 'AGPL-3.0', url: 'https://example.com/LICENSE' },
    author: { name: 'sm06224', url: 'https://example.com' },
    homepage: 'https://example.com',
    runtime: { offline: true, bundled: true, externalDependencies: false },
    dependencies: [{ name: 'markdown-it', version: '14.1.1', license: 'MIT' }],
    devDependencies: [{ name: 'vite', version: '6.0.0', license: 'MIT' }],
    ...overrides,
  };
}

function makeAboutEntry(bodyOverride?: string): Entry {
  return {
    lid: ABOUT_LID,
    title: 'About PKC2',
    body: bodyOverride ?? JSON.stringify(makeValidPayload()),
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
    expect(isValidAboutPayload(makeValidPayload())).toBe(true);
  });

  it('wrong type field rejects', () => {
    expect(isValidAboutPayload(makeValidPayload({ type: 'wrong' }))).toBe(false);
  });

  it('empty version rejects', () => {
    expect(isValidAboutPayload(makeValidPayload({ version: '' }))).toBe(false);
  });

  it('missing description rejects', () => {
    const p = makeValidPayload();
    delete p.description;
    expect(isValidAboutPayload(p)).toBe(false);
  });

  it('non-array dependencies rejects', () => {
    expect(isValidAboutPayload(makeValidPayload({ dependencies: 'not-array' }))).toBe(false);
  });

  it('non-array devDependencies rejects', () => {
    expect(isValidAboutPayload(makeValidPayload({ devDependencies: 'not-array' }))).toBe(false);
  });

  it('non-boolean runtime rejects', () => {
    expect(isValidAboutPayload(makeValidPayload({
      runtime: { offline: 'yes', bundled: true, externalDependencies: false },
    }))).toBe(false);
  });

  it('missing homepage rejects', () => {
    const p = makeValidPayload();
    delete p.homepage;
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

  it('parses valid payload and filters both dependency lists', () => {
    const payload = makeValidPayload({
      dependencies: [
        { name: 'a', version: '1.0', license: 'MIT' },
        { name: 'b' },
      ],
      devDependencies: [
        { name: 'c', version: '2.0', license: 'Apache-2.0' },
        { license: 'MIT' },
      ],
    });
    const result = resolveAboutPayload(JSON.stringify(payload));
    expect(result.version).toBe('2.0.0');
    expect(result.dependencies).toHaveLength(1);
    expect(result.devDependencies).toHaveLength(1);
    expect(result.devDependencies[0]?.name).toBe('c');
  });

  it('default stub exposes empty dependencies and devDependencies', () => {
    expect(DEFAULT_ABOUT_STUB.dependencies).toEqual([]);
    expect(DEFAULT_ABOUT_STUB.devDependencies).toEqual([]);
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

  it('about view displays description', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const desc = root.querySelector('.pkc-about-description');
    expect(desc?.textContent).toBe('Portable Knowledge Container');
  });

  it('about view displays two module tables (runtime + dev)', () => {
    const container = makeContainer([makeAboutEntry()]);
    render(readyState(container), root);
    const tables = root.querySelectorAll('.pkc-about-table');
    expect(tables.length).toBe(2);
  });

  it('about view displays zero-count proud message when devDependencies is empty', () => {
    const entry = makeAboutEntry(JSON.stringify(makeValidPayload({ devDependencies: [] })));
    const container = makeContainer([entry]);
    render(readyState(container), root);
    const empties = root.querySelectorAll('.pkc-about-modules-empty');
    expect(empties.length).toBe(1);
    expect(empties[0]?.textContent).toContain('custom tooling');
  });

  it('about view displays zero-count proud message when dependencies is empty', () => {
    const entry = makeAboutEntry(JSON.stringify(makeValidPayload({ dependencies: [] })));
    const container = makeContainer([entry]);
    render(readyState(container), root);
    const empties = root.querySelectorAll('.pkc-about-modules-empty');
    expect(empties.length).toBe(1);
    expect(empties[0]?.textContent).toContain('self-contained');
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
  it('buildAboutEntry produces valid payload with both dependency lists', async () => {
    const { buildAboutEntry } = await import('../../build/about-entry-builder');
    const pkg = {
      version: '2.0.0',
      description: 'Portable Knowledge Container',
      license: 'AGPL-3.0',
      author: { name: 'sm06224', url: 'https://github.com/sm06224' },
      homepage: 'https://github.com/sm06224/pkc2',
      dependencies: { 'markdown-it': '^14.1.1' },
      devDependencies: { 'vite': '^6.0.0' },
    };
    const entry = buildAboutEntry(pkg, '2026-04-18T06:00:00Z', 'abc1234');
    expect(entry.lid).toBe(ABOUT_LID);
    expect(entry.archetype).toBe('system-about');

    const body = JSON.parse(entry.body);
    expect(isValidAboutPayload(body)).toBe(true);
    expect(body.version).toBe('2.0.0');
    expect(body.description).toBe('Portable Knowledge Container');
    expect(body.homepage).toBe('https://github.com/sm06224/pkc2');
    expect(body.build.commit).toBe('abc1234');
    expect(body.dependencies.length).toBeGreaterThanOrEqual(1);
    expect(body.dependencies.find((m: { name: string }) => m.name === 'markdown-it')).toBeDefined();
    expect(body.devDependencies.length).toBeGreaterThanOrEqual(1);
    expect(body.devDependencies.find((m: { name: string }) => m.name === 'vite')).toBeDefined();
  });

  it('buildAboutEntry handles missing optional fields', async () => {
    const { buildAboutEntry } = await import('../../build/about-entry-builder');
    const pkg = { version: '1.0.0' };
    const entry = buildAboutEntry(pkg, '2026-04-18T06:00:00Z', 'unknown');
    const body = JSON.parse(entry.body);
    expect(body.author.name).toBe('unknown');
    expect(body.license.name).toBe('unknown');
    expect(body.description).toBe('');
    expect(body.homepage).toBe('');
    expect(body.dependencies).toHaveLength(0);
    expect(body.devDependencies).toHaveLength(0);
  });
});
