/**
 * @vitest-environment happy-dom
 *
 * user 報告(2026-07-15)「text の末尾追記で画像貼付が失敗する」の回帰 guard。
 *
 * 原因: 画像 paste の inline 挿入対象判定(isMarkdownTextarea)に
 * `text-append-text` / `section-edit-text` が無く、fallback の
 * 「単独 attachment 作成」経路に落ちて `![...](asset:...)` が textarea に
 * 挿入されなかった。textlog-append と同格の inline 貼付対象に追加した。
 *
 * end-to-end 観測点: paste event → PASTE_ATTACHMENT(attachment entry +
 * asset が container に生える)+ 再描画後の textarea に asset 参照が入る。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

const T = '2026-07-15T00:00:00Z';

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

function setup(body = 'hello') {
  const container: Container = {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Text', body, archetype: 'text', created_at: T, updated_at: T },
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

function pasteImageOn(target: Element): void {
  const pasteEvent = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent;
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      items: [{
        kind: 'file',
        type: 'image/png',
        getAsFile: () =>
          new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'clip.png', { type: 'image/png' }),
      }],
    },
  });
  target.dispatchEvent(pasteEvent);
}

describe('text 末尾追記への画像貼付(2026-07-15 回帰)', () => {
  it('append textarea への画像 paste が asset 参照を挿入する(単独 attachment 化に落ちない)', async () => {
    const d = setup();
    const ta = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="text-append-text"][data-pkc-lid="e1"]',
    )!;
    expect(ta).toBeTruthy();
    ta.value = 'before ';
    ta.selectionStart = ta.selectionEnd = ta.value.length;

    pasteImageOn(ta);

    await vi.waitFor(() => {
      // attachment entry + asset が生える(PASTE_ATTACHMENT 経路)
      const c = d.getState().container!;
      expect(c.entries.some((e) => e.archetype === 'attachment')).toBe(true);
      expect(Object.keys(c.assets).length).toBeGreaterThan(0);
      // 再描画後の append textarea に `![...](asset:...)` が挿入されている
      const fresh = root.querySelector<HTMLTextAreaElement>(
        '[data-pkc-field="text-append-text"]',
      )!;
      expect(fresh.value).toMatch(/^before !\[screenshot-.*\]\(asset:att-.*\)$/);
    });
  });

  it('挿入された参照は追記実行で本文末尾に載る(end-to-end)', async () => {
    const d = setup('existing body');
    const ta = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="text-append-text"][data-pkc-lid="e1"]',
    )!;
    pasteImageOn(ta);
    await vi.waitFor(() => {
      const fresh = root.querySelector<HTMLTextAreaElement>(
        '[data-pkc-field="text-append-text"]',
      )!;
      expect(fresh.value).toContain('](asset:');
    });
    // 追記実行
    root.querySelector<HTMLButtonElement>('[data-pkc-action="append-text"][data-pkc-lid="e1"]')!.click();
    const body = d.getState().container!.entries.find((e) => e.lid === 'e1')!.body;
    expect(body).toContain('existing body');
    expect(body).toMatch(/!\[screenshot-.*\]\(asset:att-.*\)/);
  });
});
