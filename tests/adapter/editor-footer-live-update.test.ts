/**
 * @vitest-environment happy-dom
 *
 * pgc-126 wave-δ #2(MASTER.md §7 text):editor footer wordcount の
 * **live update**(pgc-125 static render の follow-up)。
 *
 * action-binder の root 'input' listener が textarea[data-pkc-field="body"]
 * の入力を hook し、近傍 `.pkc-editor` 内の `[data-pkc-region="editor-
 * footer-wordcount"]` の metrics を realtime に DOM 直書き更新する。state
 * mutation なし、render pipeline 不介入。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(body: string): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body, archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  url.searchParams.set('pkc-flag', `shell.editor_footer_wordcount_enabled=${value ? '1' : '0'}`);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-126 Editor footer wordcount live update', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
  });

  function bootEditing(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function metrics(): HTMLElement | null {
    return root.querySelector('.pkc-editor-footer-metrics');
  }
  function bodyTextarea(): HTMLTextAreaElement | null {
    return root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
  }

  function typeAt(textarea: HTMLTextAreaElement, value: string): void {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('flag ON:input event で metrics が realtime に更新される(short → long)', () => {
    setFlag(true);
    bootEditing(makeContainer('hi'));
    const initial = metrics()?.textContent ?? '';
    expect(initial).toContain('2 chars');
    expect(initial).toContain('1 words');
    // 長い text を type
    typeAt(bodyTextarea()!, 'hello world this is a longer text');
    const updated = metrics()?.textContent ?? '';
    expect(updated).toContain('33 chars');
    expect(updated).toContain('7 words');
    expect(updated).toContain('1 lines');
  });

  it('flag ON:multi-line 入力で line count が live 反映', () => {
    setFlag(true);
    bootEditing(makeContainer('one'));
    typeAt(bodyTextarea()!, 'line1\nline2\nline3\nline4');
    expect(metrics()?.textContent).toContain('4 lines');
  });

  it('flag ON:空文字に戻すと 0/0/0 に更新', () => {
    setFlag(true);
    bootEditing(makeContainer('initial content'));
    expect(metrics()?.textContent).toContain('15 chars');
    typeAt(bodyTextarea()!, '');
    const text = metrics()?.textContent ?? '';
    expect(text).toContain('0 chars');
    expect(text).toContain('0 words');
    expect(text).toContain('0 lines');
  });

  it('flag ON:data-pkc-*-count attribute も同時更新', () => {
    setFlag(true);
    bootEditing(makeContainer('x'));
    typeAt(bodyTextarea()!, 'abc def');
    const m = metrics();
    expect(m?.getAttribute('data-pkc-char-count')).toBe('7');
    expect(m?.getAttribute('data-pkc-word-count')).toBe('2');
    expect(m?.getAttribute('data-pkc-line-count')).toBe('1');
  });

  it('flag OFF:input しても footer 自体無いので state 不変', () => {
    setFlag(false);
    const d = bootEditing(makeContainer('hello'));
    expect(metrics()).toBeNull();
    // textarea があれば input しても footer 無いだけで no-op
    const ta = bodyTextarea();
    if (ta) typeAt(ta, 'longer text now');
    // dispatcher state は editing 中だが body は textarea 内のみ
    expect(d.getState().editingLid).toBe('e1');
  });

  it('flag ON + non-body field の input は footer 更新しない(scope check)', () => {
    setFlag(true);
    bootEditing(makeContainer('hello'));
    const initial = metrics()?.textContent ?? '';
    expect(initial).toContain('5 chars');
    // 偽の non-body textarea を投入して input event 発火
    const fake = document.createElement('textarea');
    fake.setAttribute('data-pkc-field', 'title');
    fake.value = 'lots of text in title field';
    root.appendChild(fake);
    fake.dispatchEvent(new Event('input', { bubbles: true }));
    // footer は変わらない(body field でないので handler は skip)
    expect(metrics()?.textContent).toContain('5 chars');
  });
});
