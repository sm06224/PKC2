/**
 * @vitest-environment happy-dom
 *
 * Data menu grouping — Share (HTML) | Archive (ZIP) | Import.
 *
 * Pins the user-visible contract for how the Data menu surfaces
 * three distinct export/import workflows:
 *
 *   1. Share (standalone HTML, openable without PKC2)
 *        Export │ Light │ 📤 Selected as HTML
 *   2. Archive (ZIP, re-importable into PKC2)
 *        ZIP │ [TEXTLOGs] │ [TEXTs] │ [Mixed] │ 📦 Selected (TEXT/TEXTLOG)
 *   3. Import
 *        Import │ 📥 Textlog │ 📥 Text │ 📥 Entry │ 📥 Batch
 *
 * Icon convention:
 *   📤 share (HTML, recipient does not need PKC2)
 *   📦 package (ZIP, recipient needs PKC2 to re-import)
 *   📥 import (ingesting external bundles)
 *
 * These tests prevent regression of the grouping, ordering, icon
 * assignment, and the title-text contract that tells the user
 * which button is "shareable" vs "re-importable". See
 * docs/development/selected-entry-html-clone-export.md.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    phase: 'ready',
    container: null,
    selectedLid: null,
    editingLid: null,
    error: null,
    embedded: false,
    pendingOffers: [],
    importPreview: null,
    batchImportPreview: null,
    searchQuery: '',
    archetypeFilter: new Set(),
    tagFilter: null,
    sortKey: 'created_at',
    sortDirection: 'desc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    showArchived: false,
    viewMode: 'detail' as const,
    calendarYear: 2026,
    calendarMonth: 4,
    multiSelectedLids: [],
    batchImportResult: null,
    collapsedFolders: [],
    ...overrides,
  };
}

function mkContainer(archetypes: Array<'text' | 'textlog' | 'todo' | 'folder'>): Container {
  return {
    meta: {
      container_id: 'grouping-test',
      title: 'Test Container',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: archetypes.map((archetype, i) => ({
      lid: `e${i + 1}`,
      title: `Entry ${i + 1}`,
      body: archetype === 'textlog' ? '[]' : 'body',
      archetype,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })),
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => { root.remove(); };
});

function panel(): HTMLElement {
  return root.querySelector('[data-pkc-region="export-import-panel"]')!;
}

function buttonByAction(action: string): HTMLButtonElement | null {
  return panel().querySelector(`button[data-pkc-action="${action}"]`);
}

function allButtons(): HTMLButtonElement[] {
  return Array.from(panel().querySelectorAll('button'));
}

function indexOfAction(action: string): number {
  return allButtons().findIndex((b) => b.getAttribute('data-pkc-action') === action);
}

describe('Data menu — three-group layout', () => {
  it('Share group buttons precede Archive group buttons', () => {
    render(baseState({ container: mkContainer(['text', 'textlog']) }), root);

    const iExport = indexOfAction('begin-export');
    const iLight = allButtons()
      .findIndex((b) => b.getAttribute('data-pkc-export-mode') === 'light');
    const iSelectedHtml = indexOfAction('export-selected-entry-html');
    const iZip = indexOfAction('export-zip');
    const iSelectedZip = indexOfAction('export-selected-entry');

    // All three Share buttons come before any Archive button.
    expect(iExport).toBeGreaterThanOrEqual(0);
    expect(iLight).toBeGreaterThan(iExport);
    expect(iSelectedHtml).toBeGreaterThan(iLight);
    expect(iZip).toBeGreaterThan(iSelectedHtml);
    expect(iSelectedZip).toBeGreaterThan(iZip);
  });

  it('renders two visible | separators (Share|Archive and Archive|Import)', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const seps = panel().querySelectorAll('span.pkc-eip-sep');
    expect(seps.length).toBe(2);
    for (const s of Array.from(seps)) {
      expect(s.textContent).toBe('|');
    }
  });

  it('the first separator sits between Selected as HTML and ZIP', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    // Walk the content children and locate the sep right after the
    // HTML clone button.
    const details = panel().querySelector('details')!;
    const children = Array.from(details.querySelector('.pkc-eip-content')!.children);
    const htmlIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-action') === 'export-selected-entry-html',
    );
    const zipIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-action') === 'export-zip',
    );
    expect(htmlIdx).toBeGreaterThan(-1);
    expect(zipIdx).toBeGreaterThan(htmlIdx);
    // Exactly one sep between them.
    const between = children.slice(htmlIdx + 1, zipIdx);
    expect(between.length).toBe(1);
    expect(between[0]!.className).toContain('pkc-eip-sep');
  });
});

describe('Data menu — Share group (HTML distribution)', () => {
  it('Export button title emphasises "配布用 HTML" and "PKC2 不要"', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const btn = buttonByAction('begin-export')!;
    const title = btn.getAttribute('title') ?? '';
    expect(title).toContain('配布用 HTML');
    expect(title).toContain('PKC2 不要');
  });

  it('Light button title emphasises "配布用 HTML" and "PKC2 不要"', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const btn = allButtons().find(
      (b) => b.getAttribute('data-pkc-export-mode') === 'light',
    )!;
    const title = btn.getAttribute('title') ?? '';
    expect(title).toContain('配布用 HTML');
    expect(title).toContain('PKC2 不要');
  });

  it('Selected as HTML uses 📤 icon and enabled title says "配布用 HTML" + "PKC2 不要"', () => {
    const container = mkContainer(['text']);
    render(baseState({ container, selectedLid: 'e1' }), root);
    const btn = buttonByAction('export-selected-entry-html')!;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('📤 Selected as HTML');
    const title = btn.getAttribute('title') ?? '';
    expect(title).toContain('配布用 HTML');
    expect(title).toContain('PKC2 不要');
  });

  it('Selected as HTML is disabled when no entry is selected', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const btn = buttonByAction('export-selected-entry-html')!;
    expect(btn.disabled).toBe(true);
    // Even when disabled, label still carries the share icon so the
    // workflow is legible.
    expect(btn.textContent).toBe('📤 Selected as HTML');
    const title = btn.getAttribute('title') ?? '';
    expect(title).toContain('エントリ選択時のみ有効');
    expect(title).toContain('PKC2 不要');
  });
});

describe('Data menu — Archive group (ZIP interchange)', () => {
  it('ZIP button title emphasises "再インポート" (distinguishes from Share)', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const btn = buttonByAction('export-zip')!;
    const title = btn.getAttribute('title') ?? '';
    expect(title).toContain('再インポート');
  });

  it('TEXTLOGs title emphasises "再インポート" when shown', () => {
    render(baseState({ container: mkContainer(['textlog']) }), root);
    const btn = buttonByAction('export-textlogs-container')!;
    expect(btn.getAttribute('title') ?? '').toContain('再インポート');
  });

  it('TEXTs title emphasises "再インポート" when shown', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const btn = buttonByAction('export-texts-container')!;
    expect(btn.getAttribute('title') ?? '').toContain('再インポート');
  });

  it('Mixed title emphasises "再インポート" when shown', () => {
    render(baseState({ container: mkContainer(['text', 'textlog']) }), root);
    const btn = buttonByAction('export-mixed-container')!;
    expect(btn.getAttribute('title') ?? '').toContain('再インポート');
  });

  it('Selected (ZIP) uses 📦 icon (not 📤) so the two Selected buttons are distinct', () => {
    render(
      baseState({ container: mkContainer(['text']), selectedLid: 'e1' }),
      root,
    );
    const btn = buttonByAction('export-selected-entry')!;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('📦 Selected (TEXT)');
    // Explicitly assert the 📤 icon is NOT used for the ZIP button
    // — that icon is reserved for the HTML share button so users
    // can tell the two workflows apart at a glance.
    expect(btn.textContent).not.toContain('📤');
  });

  it('Selected (ZIP) textlog entry shows 📦 Selected (TEXTLOG)', () => {
    render(
      baseState({ container: mkContainer(['textlog']), selectedLid: 'e1' }),
      root,
    );
    const btn = buttonByAction('export-selected-entry')!;
    expect(btn.textContent).toBe('📦 Selected (TEXTLOG)');
  });

  it('Selected (ZIP) disabled label stays 📦 (package icon) for workflow legibility', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const btn = buttonByAction('export-selected-entry')!;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('📦 Selected');
    const title = btn.getAttribute('title') ?? '';
    expect(title).toContain('再インポート');
    expect(title).toContain('TEXT / TEXTLOG 選択時のみ有効');
  });

  it('Selected (ZIP) stays disabled for non-text/textlog selection (folder, todo)', () => {
    // folder
    const c1 = mkContainer(['folder']);
    render(baseState({ container: c1, selectedLid: 'e1' }), root);
    expect(buttonByAction('export-selected-entry')!.disabled).toBe(true);
    root.innerHTML = '';
    // todo
    const c2 = mkContainer(['todo']);
    render(baseState({ container: c2, selectedLid: 'e1' }), root);
    expect(buttonByAction('export-selected-entry')!.disabled).toBe(true);
  });
});

describe('Data menu — Selected HTML vs Selected ZIP distinguishability', () => {
  it('the two Selected buttons carry different icons, labels, and titles', () => {
    render(
      baseState({ container: mkContainer(['text']), selectedLid: 'e1' }),
      root,
    );
    const zip = buttonByAction('export-selected-entry')!;
    const html = buttonByAction('export-selected-entry-html')!;
    // Icons differ
    expect(zip.textContent!.startsWith('📦')).toBe(true);
    expect(html.textContent!.startsWith('📤')).toBe(true);
    // Label wording differs
    expect(zip.textContent).not.toBe(html.textContent);
    // Title wording differs — one leads with "再インポート", the other
    // with "PKC2 不要" — so the two affordances are legible side by side.
    expect(zip.getAttribute('title') ?? '').toContain('再インポート');
    expect(html.getAttribute('title') ?? '').toContain('PKC2 不要');
    // And neither title leaks the other's keyword, so there is no
    // "ZIP re-importable" phrasing on the HTML button or vice versa.
    expect(zip.getAttribute('title') ?? '').not.toContain('PKC2 不要');
    expect(html.getAttribute('title') ?? '').not.toContain('再インポート');
  });
});

describe('Data menu — regression guards', () => {
  it('button count at ready/no-selection is still 12 (no functional drift)', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    expect(allButtons().length).toBe(12);
  });

  it('core data-pkc-action values are unchanged (action-binder contract)', () => {
    render(baseState({ container: mkContainer(['text', 'textlog']) }), root);
    for (const action of [
      'begin-export',
      'export-zip',
      'export-textlogs-container',
      'export-texts-container',
      'export-mixed-container',
      'export-selected-entry',
      'export-selected-entry-html',
      'begin-import',
      'import-textlog-bundle',
      'import-text-bundle',
      'import-entry-package',
      'import-batch-bundle',
    ]) {
      expect(buttonByAction(action)).not.toBeNull();
    }
  });

  it('Import group still comes last (Archive → Import separator preserved)', () => {
    render(baseState({ container: mkContainer(['text']) }), root);
    const iSelectedZip = indexOfAction('export-selected-entry');
    const iImport = indexOfAction('begin-import');
    expect(iImport).toBeGreaterThan(iSelectedZip);
  });
});
