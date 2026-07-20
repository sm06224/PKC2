/**
 * @vitest-environment happy-dom
 *
 * R7(#938 洗練化): inline dialog utility の単体テスト。
 * native prompt/confirm/alert 置き換えの中核 — promise 解決・
 * キーボード操作・validate・単一 instance 制約を検証する。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  showInlinePrompt,
  showInlineConfirm,
  showInlineForm,
  dismissActiveInlineDialog,
} from '@adapter/ui/inline-dialog';

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="inline-dialog"]');
}

function input(key = 'value'): HTMLInputElement {
  return dialog()!.querySelector<HTMLInputElement>(`[data-pkc-field="dialog-${key}"]`)!;
}

function clickOk(): void {
  dialog()!.querySelector<HTMLButtonElement>('[data-pkc-action="dialog-ok"]')!.click();
}

function clickCancel(): void {
  dialog()!.querySelector<HTMLButtonElement>('[data-pkc-action="dialog-cancel"]')!.click();
}

afterEach(() => {
  dismissActiveInlineDialog();
});

describe('showInlinePrompt', () => {
  it('OK で入力値を resolve、dialog が消える', async () => {
    const p = showInlinePrompt({ title: '名前' });
    expect(dialog()).not.toBeNull();
    input().value = 'hello';
    clickOk();
    expect(await p).toBe('hello');
    expect(dialog()).toBeNull();
  });

  it('cancel で null を resolve', async () => {
    const p = showInlinePrompt({ title: '名前' });
    clickCancel();
    expect(await p).toBeNull();
  });

  it('initial が seed され、空のまま OK は 空文字を resolve(解除系の契約)', async () => {
    const p = showInlinePrompt({ title: 'グループ', initial: 'Tools' });
    expect(input().value).toBe('Tools');
    input().value = '';
    clickOk();
    expect(await p).toBe('');
  });

  it('input 上の Enter = OK', async () => {
    const p = showInlinePrompt({ title: '名前' });
    input().value = 'via-enter';
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(await p).toBe('via-enter');
  });

  it('Escape = cancel(document capture)', async () => {
    const p = showInlinePrompt({ title: '名前' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('validate が error を返すと dialog は開いたまま error 表示、通過で resolve', async () => {
    const p = showInlinePrompt({
      title: '確認',
      validate: (v) => (v === 'RESET' ? null : '「RESET」と入力してください'),
    });
    input().value = 'reset';
    clickOk();
    const err = dialog()!.querySelector<HTMLElement>('[data-pkc-region="inline-dialog-error"]')!;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('RESET');
    input().value = 'RESET';
    clickOk();
    expect(await p).toBe('RESET');
  });
});

describe('showInlineConfirm', () => {
  it('OK = true / cancel = false', async () => {
    const p1 = showInlineConfirm({ title: '削除しますか？' });
    clickOk();
    expect(await p1).toBe(true);
    const p2 = showInlineConfirm({ title: '削除しますか？' });
    clickCancel();
    expect(await p2).toBe(false);
  });

  it('danger で OK button に danger class、detail が pre-line で出る', () => {
    void showInlineConfirm({ title: '完全削除', detail: '1 行目\n2 行目', danger: true });
    const ok = dialog()!.querySelector<HTMLElement>('[data-pkc-action="dialog-ok"]')!;
    expect(ok.className).toContain('pkc-inline-dialog-ok--danger');
    const detail = dialog()!.querySelector<HTMLElement>('.pkc-inline-dialog-detail')!;
    expect(detail.textContent).toContain('2 行目');
  });
});

describe('showInlineForm', () => {
  it('複数 field の値を key ごとに resolve', async () => {
    const p = showInlineForm({
      title: 'URL タイル',
      fields: [
        { key: 'url', label: 'URL' },
        { key: 'title', label: 'タイル名' },
      ],
    });
    input('url').value = 'https://example.com';
    input('title').value = 'Example';
    clickOk();
    expect(await p).toEqual({ url: 'https://example.com', title: 'Example' });
  });

  it('新しい dialog を開くと前の dialog は cancel 扱いで閉じる(単一 instance)', async () => {
    const p1 = showInlinePrompt({ title: '1 つ目' });
    const p2 = showInlinePrompt({ title: '2 つ目' });
    expect(await p1).toBeNull();
    expect(document.querySelectorAll('[data-pkc-region="inline-dialog"]')).toHaveLength(1);
    input().value = 'second';
    clickOk();
    expect(await p2).toBe('second');
  });

  it('外側 pointerdown で cancel(次 tick 以降)', async () => {
    const p = showInlinePrompt({ title: '外側 click' });
    // 外側 click 検出は setTimeout(0) 後に arm される
    await new Promise((r) => setTimeout(r, 0));
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(await p).toBeNull();
  });

  it('dialog 内 pointerdown では閉じない', async () => {
    const p = showInlinePrompt({ title: '内側 click' });
    await new Promise((r) => setTimeout(r, 0));
    input().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(dialog()).not.toBeNull();
    input().value = 'still-open';
    clickOk();
    expect(await p).toBe('still-open');
  });
});
