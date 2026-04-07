/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
    it('shows description when body has content', () => {
      const el = folderPresenter.renderBody(makeFolder('Some notes about this folder'));
      expect(el.querySelector('.pkc-view-body')?.textContent).toBe('Some notes about this folder');
    });

    it('shows empty state when body is empty', () => {
      const el = folderPresenter.renderBody(makeFolder(''));
      expect(el.querySelector('.pkc-folder-empty')).not.toBeNull();
      expect(el.querySelector('.pkc-folder-empty')?.textContent).toContain('no description');
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
