/**
 * @vitest-environment happy-dom
 *
 * text entry「末尾追記」(append-only edit)。user direction(2026-06-24):
 * text と textlog は区切り線の有無の違いでしかなく、編集の大半は既存文書への
 * 追記(と差し挟み)── Vim 的発想。textlog の append を text に持ち込み、全文を
 * editor に載せず `QUICK_UPDATE_ENTRY`(phase 遷移なし)で本文末尾へ append する。
 *
 * - text view に追記エリア(`[data-pkc-region="text-append"]`)が出る / 非 text は出ない
 * - append button / Ctrl+Enter で本文末尾へ段落区切り(空行)連結
 * - 空 body への追記は前置改行なし、空入力は no-op
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-06-24T00:00:00Z';

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    root.remove();
  };
});

function setup(textBody: string, extra: Entry[] = []) {
  const container: Container = {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Text', body: textBody, archetype: 'text', created_at: T, updated_at: T },
      ...extra,
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  return dispatcher;
}

function appendInput(): HTMLTextAreaElement {
  return root.querySelector<HTMLTextAreaElement>(
    '[data-pkc-field="text-append-text"][data-pkc-lid="e1"]',
  )!;
}
function bodyOf(d: ReturnType<typeof setup>, lid = 'e1'): string {
  return d.getState().container!.entries.find((e) => e.lid === lid)!.body;
}

describe('text entry 末尾追記(append-only)', () => {
  it('text view に追記エリア(textarea + button)が描画される', () => {
    setup('hello world');
    expect(root.querySelector('[data-pkc-region="text-append"]')).toBeTruthy();
    expect(appendInput()).toBeTruthy();
    expect(root.querySelector('[data-pkc-action="append-text"][data-pkc-lid="e1"]')).toBeTruthy();
  });

  it('非 text(todo)entry には追記エリアを出さない', () => {
    const todo: Entry = {
      lid: 't1', title: 'Todo',
      body: JSON.stringify({ status: 'open', description: 'x' }),
      archetype: 'todo', created_at: T, updated_at: T,
    };
    const d = setup('hello', [todo]);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    expect(root.querySelector('[data-pkc-region="text-append"]')).toBeFalsy();
  });

  it('append button で本文末尾へ段落区切り連結(QUICK_UPDATE_ENTRY)', () => {
    const d = setup('hello world');
    appendInput().value = 'new para';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="append-text"][data-pkc-lid="e1"]')!.click();
    expect(bodyOf(d)).toBe('hello world\n\nnew para');
  });

  it('空 body への追記は前置改行なし', () => {
    const d = setup('');
    appendInput().value = 'first';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="append-text"][data-pkc-lid="e1"]')!.click();
    expect(bodyOf(d)).toBe('first');
  });

  it('空入力(空白のみ)は no-op', () => {
    const d = setup('keep me');
    appendInput().value = '   \n  ';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="append-text"][data-pkc-lid="e1"]')!.click();
    expect(bodyOf(d)).toBe('keep me');
  });

  it('末尾の余分な空白を畳んでから連結(空行が累積しない)', () => {
    const d = setup('para1\n\n');
    appendInput().value = 'para2';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="append-text"][data-pkc-lid="e1"]')!.click();
    expect(bodyOf(d)).toBe('para1\n\npara2');
  });

  it('Ctrl+Enter でも追記される', () => {
    const d = setup('hello');
    const ta = appendInput();
    ta.value = 'via key';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(bodyOf(d)).toBe('hello\n\nvia key');
  });

  it('追記後に append textarea は空へ戻る(連続追記 UX)', () => {
    const d = setup('x');
    appendInput().value = 'y';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="append-text"][data-pkc-lid="e1"]')!.click();
    expect(bodyOf(d)).toBe('x\n\ny');
    // re-render 後の新しい textarea は空
    expect(appendInput().value).toBe('');
  });
});
