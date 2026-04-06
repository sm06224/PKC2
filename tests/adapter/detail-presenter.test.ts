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
    };

    registerPresenter('todo', custom);

    const presenter = getPresenter('todo');
    expect(presenter).toBe(custom);

    const el = presenter.renderBody(makeEntry('todo'));
    expect(el.textContent).toBe('TODO: Test body content');

    const editorEl = presenter.renderEditorBody(makeEntry('todo'));
    expect(editorEl.tagName).toBe('INPUT');
  });
});
