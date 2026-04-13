/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { folderPresenter } from '@adapter/ui/folder-presenter';
import { registerPresenter, getPresenter } from '@adapter/ui/detail-presenter';
import type { Entry } from '@core/model/record';

function makeFolder(body = ''): Entry {
  return {
    lid: 'f1',
    title: 'My Folder',
    body,
    archetype: 'folder',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('folderPresenter', () => {
  describe('renderBody', () => {
    it('shows plain description inside <pre class="pkc-view-body"> (no markdown syntax)', () => {
      const el = folderPresenter.renderBody(makeFolder('Some notes about this folder'));
      const pre = el.querySelector('pre.pkc-view-body');
      expect(pre).not.toBeNull();
      expect(pre!.textContent).toBe('Some notes about this folder');
      expect(el.querySelector('.pkc-md-rendered')).toBeNull();
    });

    it('shows empty state when body is empty', () => {
      const el = folderPresenter.renderBody(makeFolder(''));
      expect(el.querySelector('.pkc-folder-empty')).not.toBeNull();
      expect(el.querySelector('.pkc-folder-empty')?.textContent).toContain('no description');
    });
  });

  // ───────────────────────────────────────────────────
  // Slice 3: description markdown rendering
  // ───────────────────────────────────────────────────

  describe('renderBody — markdown (Slice 3)', () => {
    it('markdown description renders as <div class="pkc-md-rendered">', () => {
      const el = folderPresenter.renderBody(
        makeFolder('# Project\n\n- alpha\n- beta'),
        undefined,
        undefined,
        undefined,
        [],
      );
      const desc = el.querySelector('.pkc-md-rendered');
      expect(desc).not.toBeNull();
      expect(desc!.tagName).toBe('DIV');
      expect(desc!.querySelector('h1')).not.toBeNull();
      expect(desc!.querySelectorAll('li').length).toBe(2);
      // Plain <pre> must not also be emitted when we've gone markdown.
      expect(el.querySelector('pre.pkc-view-body')).toBeNull();
    });

    it('entry: link in description gets navigate-entry-ref', () => {
      const entries: Entry[] = [
        makeFolder('# Folder\n\nsee [T](entry:target)'),
        { lid: 'target', title: 'T', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ];
      const el = folderPresenter.renderBody(entries[0]!, {}, {}, {}, entries);
      const link = el.querySelector('a[href="entry:target"]');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('data-pkc-action')).toBe('navigate-entry-ref');
    });

    it('entry: image in description expands to an embedded section', () => {
      const entries: Entry[] = [
        makeFolder('# F\n\n![x](entry:target)'),
        {
          lid: 'target',
          title: 'T',
          body: '# Target body',
          archetype: 'text',
          created_at: '',
          updated_at: '',
        },
      ];
      const el = folderPresenter.renderBody(entries[0]!, {}, {}, {}, entries);
      const section = el.querySelector('section.pkc-transclusion');
      expect(section).not.toBeNull();
      expect(section!.getAttribute('data-pkc-embed-source')).toBe('entry:target');
    });

    it('asset: image in description resolves to a data URL', () => {
      const el = folderPresenter.renderBody(
        makeFolder('# F\n\n![pic](asset:ast-1)'),
        { 'ast-1': 'AAAA' },
        { 'ast-1': 'image/png' },
        {},
        [],
      );
      const img = el.querySelector('.pkc-md-rendered img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    });

    it('self-embed in a folder description renders a blocked placeholder', () => {
      const entries: Entry[] = [makeFolder('# F\n\n![x](entry:f1)')];
      const el = folderPresenter.renderBody(entries[0]!, {}, {}, {}, entries);
      const blocked = el.querySelector('.pkc-embed-blocked');
      expect(blocked).not.toBeNull();
      expect(blocked!.getAttribute('data-pkc-embed-blocked-reason')).toBe('self');
    });

    it('single-line plain body with no markdown syntax still uses <pre> (no regression)', () => {
      const el = folderPresenter.renderBody(makeFolder('hello'), {}, {}, {}, []);
      const pre = el.querySelector('pre.pkc-view-body');
      expect(pre).not.toBeNull();
      expect(pre!.textContent).toBe('hello');
    });
  });

  describe('renderEditorBody', () => {
    it('renders textarea with body value', () => {
      const el = folderPresenter.renderEditorBody(makeFolder('desc'));
      const textarea = el as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea.value).toBe('desc');
      expect(textarea.getAttribute('data-pkc-field')).toBe('body');
    });

    it('has placeholder text', () => {
      const el = folderPresenter.renderEditorBody(makeFolder(''));
      expect((el as HTMLTextAreaElement).placeholder).toContain('description');
    });
  });

  describe('collectBody', () => {
    it('collects body from textarea', () => {
      const root = document.createElement('div');
      const textarea = document.createElement('textarea');
      textarea.setAttribute('data-pkc-field', 'body');
      textarea.value = 'updated description';
      root.appendChild(textarea);
      expect(folderPresenter.collectBody(root)).toBe('updated description');
    });

    it('returns empty string when no textarea found', () => {
      const root = document.createElement('div');
      expect(folderPresenter.collectBody(root)).toBe('');
    });
  });

  describe('registration', () => {
    it('can be registered and retrieved', () => {
      registerPresenter('folder', folderPresenter);
      expect(getPresenter('folder')).toBe(folderPresenter);
    });
  });
});
