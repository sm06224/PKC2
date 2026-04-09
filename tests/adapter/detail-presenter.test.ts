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

  it('default presenter renders editor body as textarea', () => {
    const presenter = getDefaultPresenter();
    const el = presenter.renderEditorBody(makeEntry());
    expect(el.tagName).toBe('TEXTAREA');
    expect((el as HTMLTextAreaElement).value).toBe('Test body content');
    expect(el.getAttribute('data-pkc-field')).toBe('body');
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

    it('does not resolve asset: in link syntax (images only)', () => {
      const presenter = getDefaultPresenter();
      const entry = makeTextEntry('[click](asset:ast-001)');
      const el = presenter.renderBody(
        entry,
        { 'ast-001': PNG_B64 },
        { 'ast-001': 'image/png' },
      );
      // Link with asset: URL is blocked by markdown-it's validateLink allowlist
      expect(el.innerHTML).not.toContain('href="asset:');
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
});
