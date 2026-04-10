/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  getPresenter,
  getDefaultPresenter,
  registerPresenter,
} from '@adapter/ui/detail-presenter';
import type { DetailPresenter } from '@adapter/ui/detail-presenter';
import type { Entry } from '@core/model/record';

function makeEntry(archetype: Entry['archetype'] = 'text'): Entry {
  return {
    lid: 'e1', title: 'Test Entry', body: 'Test body content',
    archetype, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('DetailPresenter', () => {
  // ── Default presenter ──

  it('default presenter renders body as pre element', () => {
    const presenter = getDefaultPresenter();
    const el = presenter.renderBody(makeEntry());
    expect(el.tagName).toBe('PRE');
    expect(el.textContent).toBe('Test body content');
  });

  it('default presenter renders empty body placeholder', () => {
    const entry = { ...makeEntry(), body: '' };
    const el = getDefaultPresenter().renderBody(entry);
    expect(el.textContent).toBe('(empty)');
  });

  it('default presenter renders editor body as split editor with textarea and preview', () => {
    const presenter = getDefaultPresenter();
    const el = presenter.renderEditorBody(makeEntry());
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain('pkc-text-split-editor');
    const textarea = el.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe('Test body content');
    const preview = el.querySelector('[data-pkc-region="text-edit-preview"]');
    expect(preview).not.toBeNull();
  });

  // ── Registry dispatch ──

  it('returns default presenter for unregistered archetype', () => {
    const presenter = getPresenter('text');
    expect(presenter).toBe(getDefaultPresenter());
  });

  it('returns default presenter for any unknown archetype', () => {
    const presenter = getPresenter('todo');
    expect(presenter).toBe(getDefaultPresenter());
  });

  it('returns registered custom presenter', () => {
    const custom: DetailPresenter = {
      renderBody(entry: Entry) {
        const div = document.createElement('div');
        div.className = 'custom-view';
        div.textContent = `TODO: ${entry.body}`;
        return div;
      },
      renderEditorBody(entry: Entry) {
        const input = document.createElement('input');
        input.value = entry.body;
        input.setAttribute('data-pkc-field', 'body');
        return input;
      },
      collectBody(root: HTMLElement) {
        const el = root.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
        return el?.value ?? '';
      },
    };

    registerPresenter('todo', custom);

    const presenter = getPresenter('todo');
    expect(presenter).toBe(custom);

    const el = presenter.renderBody(makeEntry('todo'));
    expect(el.textContent).toBe('TODO: Test body content');

    const editorEl = presenter.renderEditorBody(makeEntry('todo'));
    expect(editorEl.tagName).toBe('INPUT');
  });

  // ── collectBody ──

  it('default presenter collectBody reads textarea value', () => {
    const presenter = getDefaultPresenter();
    const container = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-pkc-field', 'body');
    textarea.value = 'collected text';
    container.appendChild(textarea);

    expect(presenter.collectBody(container)).toBe('collected text');
  });

  it('default presenter collectBody returns empty for missing field', () => {
    const presenter = getDefaultPresenter();
    const container = document.createElement('div');
    expect(presenter.collectBody(container)).toBe('');
  });

  // ── Asset reference resolution (Foundation) ──

  describe('asset reference resolution', () => {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

    function makeTextEntry(body: string): Entry {
      return {
        lid: 'e-asset', title: 'Asset Test', body,
        archetype: 'text',
        created_at: '2026-04-09T00:00:00Z', updated_at: '2026-04-09T00:00:00Z',
      };
    }

    it('resolves asset: image reference to data URI in text body', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('![cat](asset:ast-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-001': PNG_B64 },
        { 'ast-001': 'image/png' },
      );
      expect(el.innerHTML).toContain('data:image/png;base64,');
      expect(el.innerHTML).not.toContain('asset:ast-001');
      expect(el.className).toContain('pkc-md-rendered');
    });

    it('falls back to visible marker when asset key is missing', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('![x](asset:ast-missing)');
      const el = presenter.renderBody(entry, {}, {});
      expect(el.innerHTML).toContain('missing asset');
      expect(el.innerHTML).toContain('ast-missing');
      expect(el.innerHTML).not.toContain('<img');
    });

    it('falls back to visible marker for unsupported MIME', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('![x](asset:ast-bad)');
      const el = presenter.renderBody(
        entry,
        { 'ast-bad': 'binarydata' },
        { 'ast-bad': 'application/zip' },
      );
      expect(el.innerHTML).toContain('unsupported asset');
    });

    it('leaves plain-text bodies alone when no markdown and no asset refs', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('plain text');
      const el = presenter.renderBody(entry, {}, {});
      expect(el.tagName).toBe('PRE');
      expect(el.textContent).toBe('plain text');
    });

    it('works without asset context (backward compatible)', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('![x](https://example.com/img.png)');
      const el = presenter.renderBody(entry);
      expect(el.innerHTML).toContain('img');
      expect(el.innerHTML).toContain('https://example.com/img.png');
    });

    it('rewrites link form for image MIME to unsupported marker', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[click](asset:ast-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-001': PNG_B64 },
        { 'ast-001': 'image/png' },
      );
      // Link form for an image is now rewritten to an unsupported
      // marker so the user sees actionable feedback (use ![ ] instead).
      expect(el.innerHTML).not.toContain('href="asset:');
      expect(el.innerHTML).toContain('unsupported asset');
    });

    it('preserves alt text through resolution', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('![my photo](asset:ast-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-001': PNG_B64 },
        { 'ast-001': 'image/png' },
      );
      expect(el.innerHTML).toContain('alt="my photo"');
    });
  });

  // ── Non-image asset chip rendering (link form) ──

  describe('non-image asset chip rendering', () => {
    function makeTextEntry(body: string): Entry {
      return {
        lid: 'e-chip', title: 'Chip Test', body,
        archetype: 'text',
        created_at: '2026-04-09T00:00:00Z', updated_at: '2026-04-09T00:00:00Z',
      };
    }

    it('renders a PDF link form as a fragment-hrefed chip with icon', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('See [the report](asset:ast-pdf-001) please');
      const el = presenter.renderBody(
        entry,
        { 'ast-pdf-001': 'PDFdata' },
        { 'ast-pdf-001': 'application/pdf' },
      );
      expect(el.innerHTML).toContain('href="#asset-ast-pdf-001"');
      expect(el.innerHTML).toContain('📄');
      expect(el.innerHTML).toContain('the report');
    });

    it('uses nameByKey as label fallback for empty link text', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[](asset:ast-pdf-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-pdf-001': 'PDFdata' },
        { 'ast-pdf-001': 'application/pdf' },
        { 'ast-pdf-001': 'report.pdf' },
      );
      expect(el.innerHTML).toContain('href="#asset-ast-pdf-001"');
      expect(el.innerHTML).toContain('report.pdf');
    });

    it('falls back to key when no name is provided and label is empty', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[](asset:ast-aud-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-aud-001': 'AUDdata' },
        { 'ast-aud-001': 'audio/mpeg' },
      );
      expect(el.innerHTML).toContain('href="#asset-ast-aud-001"');
      expect(el.innerHTML).toContain('ast-aud-001');
    });

    it('shows missing marker for link form with unknown key', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[gone](asset:ast-lost-001)');
      const el = presenter.renderBody(entry, {}, {});
      expect(el.innerHTML).toContain('missing asset');
      expect(el.innerHTML).not.toContain('#asset-ast-lost-001');
    });

    it('never emits an asset: href in the output', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[x](asset:ast-pdf-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-pdf-001': 'PDFdata' },
        { 'ast-pdf-001': 'application/pdf' },
      );
      expect(el.innerHTML).not.toContain('href="asset:');
    });

    it('does not emit a javascript: href for the chip', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[x](asset:ast-pdf-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-pdf-001': 'PDFdata' },
        { 'ast-pdf-001': 'application/pdf' },
      );
      expect(el.innerHTML.toLowerCase()).not.toContain('javascript:');
    });
  });
});
