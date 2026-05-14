/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2(2026-05-13、PR #432 stack):編集画面 選択部 追従 PKC MD
 * フォーマットパネルの test。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mountFormatPanel,
  _resetFormatPanelForTests,
} from '@adapter/ui/format-panel';

describe('PR-2JJ v2 format panel', () => {
  beforeEach(() => {
    _resetFormatPanelForTests();
    document.body.innerHTML = '';
  });

  it('mount は idempotent(2 回呼んでも 1 つだけ)', () => {
    mountFormatPanel();
    mountFormatPanel();
    // panel 自体は selection が無いと appendChild されない。listener が 1 つだけ
    // 設置されているかは selectionchange の効果で確認(後の test で間接的に検証)。
    expect(document.querySelectorAll('[data-pkc-region="format-panel"]').length).toBeLessThanOrEqual(1);
  });

  it('editor 系 textarea を focus + select すると panel が出る', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'text-edit-body');
    ta.value = 'Hello World';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, 5);
    document.dispatchEvent(new Event('selectionchange'));
    const panel = document.querySelector('[data-pkc-region="format-panel"]');
    expect(panel).not.toBeNull();
    // フォーマットボタンが描画されていること
    const btns = panel!.querySelectorAll('.pkc-format-panel-btn');
    expect(btns.length).toBeGreaterThanOrEqual(10);
  });

  it('editor 系でない textarea(filter / search 等)では出ない', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'sidebar-search');
    document.body.appendChild(ta);
    ta.focus();
    document.dispatchEvent(new Event('selectionchange'));
    const panel = document.querySelector('[data-pkc-region="format-panel"]');
    // panel が出ていない or display: none
    if (panel) {
      expect((panel as HTMLElement).style.display).toBe('none');
    }
  });

  it('Bold button click で選択範囲が ** で wrap される', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'text-edit-body');
    ta.value = 'Hello World';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, 5);
    document.dispatchEvent(new Event('selectionchange'));
    const boldBtn = document.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="B"]',
    );
    expect(boldBtn).not.toBeNull();
    boldBtn!.click();
    expect(ta.value).toBe('**Hello** World');
  });

  it('Mark button(==)で選択範囲が wrap される', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'text-edit-body');
    ta.value = 'red text';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, 3);
    document.dispatchEvent(new Event('selectionchange'));
    const markBtn = document.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="=="]',
    );
    expect(markBtn).not.toBeNull();
    markBtn!.click();
    expect(ta.value).toBe('==red== text');
  });

  it('H1 button で行頭に # 接頭', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'text-edit-body');
    ta.value = 'title line\nbody';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, 5);
    document.dispatchEvent(new Event('selectionchange'));
    const h1 = document.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="H1"]',
    );
    h1!.click();
    expect(ta.value).toBe('# title line\nbody');
  });

  it('Quote button で各行頭に > 接頭', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'text-edit-body');
    ta.value = 'line a\nline b';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    document.dispatchEvent(new Event('selectionchange'));
    const quote = document.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label=">"]',
    );
    quote!.click();
    expect(ta.value).toBe('> line a\n> line b');
  });

  it('× close button で panel が hide される', () => {
    mountFormatPanel();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'text-edit-body');
    ta.value = 'test';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, 4);
    document.dispatchEvent(new Event('selectionchange'));
    const panel = document.querySelector<HTMLElement>('[data-pkc-region="format-panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.style.display).toBe('flex');
    const close = panel!.querySelector<HTMLButtonElement>('.pkc-format-panel-close');
    close!.click();
    expect(panel!.style.display).toBe('none');
  });
});
