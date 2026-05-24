/**
 * @vitest-environment happy-dom
 *
 * pgc-186 wave-α' #9(v3 統合 master G1 編集 surface 統一の延長、handoff
 * §3.4 wave-δ phase 2 text 編集 UX):textarea 編集中の `Ctrl+B` / `Ctrl+I`
 * keyboard shortcut で format-panel.wrapInline と同じ wrap 変換を発火。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  handleEditorFormatShortcut,
  applyWrapToTextarea,
} from '@adapter/ui/editor-format-shortcuts';

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'editor.format_shortcuts_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-186 editor format keyboard shortcuts(Ctrl+B / Ctrl+I)', () => {
  let ta: HTMLTextAreaElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    ta = document.createElement('textarea');
    ta.value = 'hello world';
    document.body.appendChild(ta);
  });

  afterEach(() => {
    setFlag(false);
    document.body.innerHTML = '';
  });

  function mkEvent(opts: KeyboardEventInit & { target?: EventTarget }): KeyboardEvent {
    const e = new KeyboardEvent('keydown', opts);
    if (opts.target) {
      Object.defineProperty(e, 'target', { value: opts.target, configurable: true });
    }
    return e;
  }

  it('case 1: flag OFF だと Ctrl+B は no-op(後方互換)', () => {
    setFlag(false);
    ta.setSelectionRange(0, 5); // "hello"
    const e = mkEvent({ key: 'b', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(false);
    expect(ta.value).toBe('hello world'); // 変化なし
  });

  it('case 2: flag ON + Ctrl+B で selection を `**` wrap', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'b', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('**hello** world');
  });

  it('case 3: flag ON + Ctrl+I で selection を `*` wrap', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'i', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('*hello* world');
  });

  it('case 4: Cmd+B(Mac)も発火', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'b', metaKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('**hello** world');
  });

  it('case 5: shift / alt 修飾子付きは skip(将来 chord 予約)', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e1 = mkEvent({ key: 'b', ctrlKey: true, shiftKey: true, target: ta });
    expect(handleEditorFormatShortcut(e1)).toBe(false);
    const e2 = mkEvent({ key: 'b', ctrlKey: true, altKey: true, target: ta });
    expect(handleEditorFormatShortcut(e2)).toBe(false);
    expect(ta.value).toBe('hello world');
  });

  it('case 6: target が input(非 textarea)は skip(編集中 textarea のみ対象)', () => {
    setFlag(true);
    const input = document.createElement('input');
    input.value = 'foo bar';
    input.setSelectionRange(0, 3);
    document.body.appendChild(input);
    const e = mkEvent({ key: 'b', ctrlKey: true, target: input });
    expect(handleEditorFormatShortcut(e)).toBe(false);
    expect(input.value).toBe('foo bar');
  });

  it('case 7: target が div(非 form 要素)は skip', () => {
    setFlag(true);
    const div = document.createElement('div');
    document.body.appendChild(div);
    const e = mkEvent({ key: 'b', ctrlKey: true, target: div });
    expect(handleEditorFormatShortcut(e)).toBe(false);
  });

  it('case 8: 認識しない key(`x`)は no-op', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'x', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(false);
    expect(ta.value).toBe('hello world');
  });

  it('case 9: 空 selection(start === end)でも wrap(空文字に marker 2 重)', () => {
    setFlag(true);
    ta.setSelectionRange(0, 0);
    const e = mkEvent({ key: 'b', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('****hello world'); // start から `**` `**` 挿入(format-panel.wrapInline と同経路)
  });

  it('case 10: input event を合成発火する(dirty-state 通知)', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    let inputFired = false;
    ta.addEventListener('input', () => { inputFired = true; });
    const e = mkEvent({ key: 'b', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(inputFired).toBe(true);
  });

  it('case 11: selection 範囲を marker 分後ろにずらす(format-panel 等価)', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'b', ctrlKey: true, target: ta });
    handleEditorFormatShortcut(e);
    // wrapInline は start + marker.length, end + marker.length
    expect(ta.selectionStart).toBe(2); // 0 + len('**')
    expect(ta.selectionEnd).toBe(7); // 5 + len('**')
  });

  it('case 12: preventDefault が発火(browser 既定 Ctrl+B を抑止)', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'b', ctrlKey: true, target: ta });
    let prevented = false;
    e.preventDefault = () => { prevented = true; };
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(prevented).toBe(true);
  });

  it('case 13: applyWrapToTextarea を直接呼んで wrap 動作(reusable API)', () => {
    ta.setSelectionRange(0, 5);
    applyWrapToTextarea(ta, '~~');
    expect(ta.value).toBe('~~hello~~ world');
  });

  // pgc-187 wave-α' #10:Ctrl+U / Ctrl+Shift+S extensions

  it('case 14: pgc-187 flag ON + Ctrl+U で simple-inline underline `:X:underline:` wrap', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'u', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    // applySimpleInlineAttr の出力 ── `:hello:underline:` + ` world`
    expect(ta.value).toBe(':hello:underline: world');
  });

  it('case 15: pgc-187 flag ON + Ctrl+Shift+S で strikethrough `~~X~~` wrap', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 's', ctrlKey: true, shiftKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('~~hello~~ world');
  });

  it('case 16: pgc-187 Ctrl+Shift+B(他 key + shift)は依然 skip(将来 chord 予約)', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'b', ctrlKey: true, shiftKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(false);
    expect(ta.value).toBe('hello world');
  });

  it('case 17: pgc-187 Cmd+U(Mac)も underline 発火', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'u', metaKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe(':hello:underline: world');
  });

  it('case 18: pgc-187 Ctrl+Alt+U は alt 修飾子で skip', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: 'u', ctrlKey: true, altKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(false);
  });

  // pgc-193 wave-α' #16: Ctrl+` for inline code

  it('case 19: pgc-193 Ctrl+` で inline code `X` wrap', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: '`', ctrlKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('`hello` world');
  });

  it('case 20: pgc-193 Cmd+`(Mac)も inline code 発火', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: '`', metaKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(true);
    expect(ta.value).toBe('`hello` world');
  });

  it('case 21: pgc-193 Ctrl+Shift+` は Shift 修飾子で skip', () => {
    setFlag(true);
    ta.setSelectionRange(0, 5);
    const e = mkEvent({ key: '`', ctrlKey: true, shiftKey: true, target: ta });
    expect(handleEditorFormatShortcut(e)).toBe(false);
    expect(ta.value).toBe('hello world');
  });
});
