/**
 * @vitest-environment happy-dom
 *
 * pgc-125 wave-δ #1(MASTER.md §7 text):Editor footer wordcount。
 *
 * Tier 0 flag `shell.editor_footer_wordcount_enabled`:
 *   OFF(default):従来 editor のみ
 *   ON:text / textlog 編集中、editor 末尾に compact metrics row
 *      (📊 N chars · M words · L lines)を append
 *
 * Inspector Style tab(pgc-118)が meta pane で archetype-level metrics を
 * 見せるのに対し、本 footer は editor 内で完結する目線移動最小の動線。
 *
 * 注:本 PR は静的 render のみ(textarea 入力には追従しない)。live update
 * は後続 PR で textarea input event を hook して実装予定。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(body: string, archetype: 'text' | 'textlog' | 'todo' = 'text'): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body, archetype, created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.editor_footer_wordcount_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-125 Editor footer wordcount', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
  });

  function bootEditing(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function footer(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="editor-footer-wordcount"]');
  }
  function metrics(): HTMLElement | null {
    return root.querySelector('.pkc-editor-footer-metrics');
  }

  it('flag OFF:footer 出ない(従来 editor のみ)', () => {
    setFlag(false);
    bootEditing(makeContainer('hello world'));
    expect(footer()).toBeNull();
  });

  it('flag ON + text editing:footer に "11 chars · 2 words · 1 lines" 表示', () => {
    setFlag(true);
    bootEditing(makeContainer('hello world'));
    expect(footer()).not.toBeNull();
    const text = metrics()?.textContent ?? '';
    expect(text).toContain('11 chars');
    expect(text).toContain('2 words');
    expect(text).toContain('1 lines');
  });

  it('flag ON + 空 body:footer に "0 chars · 0 words · 0 lines"', () => {
    setFlag(true);
    bootEditing(makeContainer(''));
    const text = metrics()?.textContent ?? '';
    expect(text).toContain('0 chars');
    expect(text).toContain('0 words');
    expect(text).toContain('0 lines');
  });

  it('flag ON + multi-line body:line count が改行数に追従', () => {
    setFlag(true);
    bootEditing(makeContainer('line1\nline2\nline3'));
    const text = metrics()?.textContent ?? '';
    expect(text).toContain('3 lines');
  });

  it('flag ON + 📊 icon が footer 内に表示', () => {
    setFlag(true);
    bootEditing(makeContainer('x'));
    const icon = root.querySelector('.pkc-editor-footer-icon');
    expect(icon?.textContent).toBe('📊');
  });

  it('flag ON + data-pkc-*-count attribute に machine-readable な値', () => {
    setFlag(true);
    bootEditing(makeContainer('hello\nworld'));
    const m = metrics();
    expect(m?.getAttribute('data-pkc-char-count')).toBe('11');
    expect(m?.getAttribute('data-pkc-word-count')).toBe('2');
    expect(m?.getAttribute('data-pkc-line-count')).toBe('2');
  });

  it('flag ON + textlog archetype でも同様に表示', () => {
    setFlag(true);
    bootEditing(makeContainer('logs body', 'textlog'));
    expect(footer()).not.toBeNull();
  });

  it('flag ON + todo archetype では出ない(text / textlog 限定)', () => {
    setFlag(true);
    bootEditing(makeContainer('{"status":"open","description":"x"}', 'todo'));
    expect(footer()).toBeNull();
  });
});
