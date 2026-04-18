/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, buildAssetMimeMap, buildAssetNameMap } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { todoPresenter } from '@adapter/ui/todo-presenter';
import { formPresenter } from '@adapter/ui/form-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-04-10T00:00:00Z';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

function makeContainer(entries: Entry[], assets: Record<string, string> = {}): Container {
  return {
    meta: {
      container_id: 'cnt-test',
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets,
  };
}

function makeTextEntry(lid: string, body: string): Entry {
  return { lid, title: 'Test Text', body, archetype: 'text', created_at: T, updated_at: T };
}

function makeAttachmentEntry(lid: string, name: string, mime: string, assetKey: string): Entry {
  return {
    lid,
    title: name,
    body: JSON.stringify({ name, mime, asset_key: assetKey }),
    archetype: 'attachment',
    created_at: T,
    updated_at: T,
  };
}

function makeEditingState(container: Container, selectedLid: string): AppState {
  return {
    phase: 'editing',
    container,
    selectedLid,
    editingLid: selectedLid,
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
    batchImportResult: null, collapsedFolders: [],
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  registerPresenter('todo', todoPresenter);
  registerPresenter('form', formPresenter);
  registerPresenter('attachment', attachmentPresenter);
  return () => { document.body.removeChild(root); };
});

describe('TEXT split editor preview — asset resolution', () => {
  it('resolves image asset in initial preview', () => {
    const textEntry = makeTextEntry('e-text', '![photo](asset:ast-001)');
    const attEntry = makeAttachmentEntry('e-att', 'photo.png', 'image/png', 'ast-001');
    const container = makeContainer([textEntry, attEntry], { 'ast-001': PNG_B64 });
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const preview = root.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.innerHTML).toContain('data:image/png;base64,');
    expect(preview!.innerHTML).not.toContain('asset:ast-001');
  });

  it('resolves non-image asset as chip in initial preview', () => {
    const textEntry = makeTextEntry('e-text', '[report](asset:ast-pdf)');
    const attEntry = makeAttachmentEntry('e-att', 'report.pdf', 'application/pdf', 'ast-pdf');
    const container = makeContainer([textEntry, attEntry], { 'ast-pdf': 'PDFdata' });
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const preview = root.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.innerHTML).toContain('href="#asset-ast-pdf"');
    expect(preview!.innerHTML).toContain('📄');
    expect(preview!.innerHTML).not.toContain('href="asset:');
  });

  it('shows missing asset marker in initial preview', () => {
    const textEntry = makeTextEntry('e-text', '![gone](asset:ast-missing)');
    const container = makeContainer([textEntry], {});
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const preview = root.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.innerHTML).toContain('missing asset');
    expect(preview!.innerHTML).toContain('ast-missing');
  });

  it('leaves plain text preview unchanged when no asset refs', () => {
    const textEntry = makeTextEntry('e-text', 'just plain text');
    const container = makeContainer([textEntry], {});
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const preview = root.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toBe('just plain text');
  });

  it('resolves markdown with asset refs in initial preview', () => {
    const textEntry = makeTextEntry('e-text', '# Title\n\n![img](asset:ast-001)\n\nSome text');
    const attEntry = makeAttachmentEntry('e-att', 'img.png', 'image/png', 'ast-001');
    const container = makeContainer([textEntry, attEntry], { 'ast-001': PNG_B64 });
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const preview = root.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.innerHTML).toMatch(/<h1[ >]/);
    expect(preview!.innerHTML).toContain('data:image/png;base64,');
  });

  it('source textarea body is never mutated by resolution', () => {
    const originalBody = '![photo](asset:ast-001)';
    const textEntry = makeTextEntry('e-text', originalBody);
    const attEntry = makeAttachmentEntry('e-att', 'photo.png', 'image/png', 'ast-001');
    const container = makeContainer([textEntry, attEntry], { 'ast-001': PNG_B64 });
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const textarea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe(originalBody);
  });

  it('preserves alt text through asset resolution in preview', () => {
    const textEntry = makeTextEntry('e-text', '![my screenshot](asset:ast-001)');
    const attEntry = makeAttachmentEntry('e-att', 'shot.png', 'image/png', 'ast-001');
    const container = makeContainer([textEntry, attEntry], { 'ast-001': PNG_B64 });
    const state = makeEditingState(container, 'e-text');

    render(state, root);
    const preview = root.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview!.innerHTML).toContain('alt="my screenshot"');
  });
});

describe('buildAssetMimeMap / buildAssetNameMap', () => {
  it('builds MIME map from attachment entries', () => {
    const att = makeAttachmentEntry('e-att', 'file.png', 'image/png', 'ast-001');
    const container = makeContainer([att]);
    const map = buildAssetMimeMap(container);
    expect(map['ast-001']).toBe('image/png');
  });

  it('builds name map from attachment entries', () => {
    const att = makeAttachmentEntry('e-att', 'report.pdf', 'application/pdf', 'ast-pdf');
    const container = makeContainer([att]);
    const map = buildAssetNameMap(container);
    expect(map['ast-pdf']).toBe('report.pdf');
  });

  it('skips non-attachment entries', () => {
    const text = makeTextEntry('e-text', 'hello');
    const container = makeContainer([text]);
    expect(buildAssetMimeMap(container)).toEqual({});
    expect(buildAssetNameMap(container)).toEqual({});
  });
});
