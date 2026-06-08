/**
 * @vitest-environment happy-dom
 *
 * 領域 5 編集 command 拡充(user 督促 2026-05-28):command palette から
 * 編集中 body textarea に対して inline wrap + line-prefix snippet を発火できる
 * ことを検証。`activeBodyTextarea` helper の優先順位 + apply 後の textarea
 * value 変化 + active textarea 不在時の silent no-op を確認。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  resetCommandRegistry,
  executeCommand,
  getCommandMetas,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import { createDispatcher } from '@adapter/state/dispatcher';

function makeBodyTextarea(value: string, selStart = 0, selEnd = value.length): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.setAttribute('data-pkc-field', 'body');
  ta.value = value;
  document.body.appendChild(ta);
  ta.selectionStart = selStart;
  ta.selectionEnd = selEnd;
  return ta;
}

describe('command palette: 領域 5 編集 command 拡充', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetCommandRegistry();
    document.body.innerHTML = '';
    const dispatcher = createDispatcher();
    registerBuiltinCommands(dispatcher);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: editor.format.bold で選択範囲を ** で wrap', () => {
    const ta = makeBodyTextarea('hello world', 0, 5);
    ta.focus();
    executeCommand('editor.format.bold');
    expect(ta.value).toBe('**hello** world');
    expect(ta.selectionStart).toBe(2);
    expect(ta.selectionEnd).toBe(7);
  });

  it('case 2: editor.format.italic で選択範囲を * で wrap', () => {
    const ta = makeBodyTextarea('foo bar', 4, 7);
    ta.focus();
    executeCommand('editor.format.italic');
    expect(ta.value).toBe('foo *bar*');
  });

  it('case 3: editor.format.strike で選択範囲を ~~ で wrap', () => {
    const ta = makeBodyTextarea('abc', 0, 3);
    ta.focus();
    executeCommand('editor.format.strike');
    expect(ta.value).toBe('~~abc~~');
  });

  it('case 4: editor.format.code-inline で選択範囲を ` で wrap', () => {
    const ta = makeBodyTextarea('xy', 0, 2);
    ta.focus();
    executeCommand('editor.format.code-inline');
    expect(ta.value).toBe('`xy`');
  });

  it('case 5: editor.format.highlight で選択範囲を == で wrap', () => {
    const ta = makeBodyTextarea('q', 0, 1);
    ta.focus();
    executeCommand('editor.format.highlight');
    expect(ta.value).toBe('==q==');
  });

  it('case 6: editor.insert.heading1 で行頭に # を追加', () => {
    const ta = makeBodyTextarea('title\n', 0, 0);
    ta.focus();
    executeCommand('editor.insert.heading1');
    expect(ta.value).toMatch(/^#\s/);
  });

  it('case 7: editor.insert.quote で行頭に > を追加', () => {
    const ta = makeBodyTextarea('quoted\n', 0, 0);
    ta.focus();
    executeCommand('editor.insert.quote');
    expect(ta.value).toMatch(/^>\s/);
  });

  it('case 8: editor.insert.list-bullet で行頭に - を追加', () => {
    const ta = makeBodyTextarea('item\n', 0, 0);
    ta.focus();
    executeCommand('editor.insert.list-bullet');
    expect(ta.value).toMatch(/^-\s/);
  });

  it('case 9: editor.insert.code-block で ``` fence を挿入', () => {
    const ta = makeBodyTextarea('code\n', 0, 4);
    ta.focus();
    executeCommand('editor.insert.code-block');
    expect(ta.value).toContain('```');
  });

  it('case 10: editor.insert.section-break で +++ を挿入', () => {
    const ta = makeBodyTextarea('para\n', 5, 5);
    ta.focus();
    executeCommand('editor.insert.section-break');
    expect(ta.value).toContain('+++');
  });

  it('case 11: editor.insert.align-center で行頭に || prefix', () => {
    const ta = makeBodyTextarea('centered\n', 0, 0);
    ta.focus();
    executeCommand('editor.insert.align-center');
    expect(ta.value).toMatch(/^\|\|/);
  });

  it('case 12: 編集中 body textarea が無いと silent no-op(warn のみ)', () => {
    // body textarea を一切 mount しない
    document.body.innerHTML = '';
    expect(() => executeCommand('editor.format.bold')).not.toThrow();
    expect(() => executeCommand('editor.insert.heading1')).not.toThrow();
  });

  it('case 13: activeElement 優先 ── focus 中の body textarea が選ばれる', () => {
    const ta1 = makeBodyTextarea('one', 0, 3);
    const ta2 = makeBodyTextarea('two', 0, 3);
    ta2.focus();
    executeCommand('editor.format.bold');
    // ta2 が focus 中なので ta2 が wrap される
    expect(ta2.value).toBe('**two**');
    expect(ta1.value).toBe('one'); // ta1 は触られない
  });

  it('case 14: focus 無し時は最初に query された body textarea を使う', () => {
    const ta1 = makeBodyTextarea('foo', 0, 3);
    makeBodyTextarea('bar', 0, 3); // 2 件目は touch されない
    // focus は強制 blur(document.activeElement = body)
    (document.activeElement as HTMLElement)?.blur();
    executeCommand('editor.format.bold');
    // querySelector 最初の hit = ta1
    expect(ta1.value).toBe('**foo**');
  });

  it('case 15: 全 編集 command が Edit category で登録される', () => {
    const metas = getCommandMetas();
    const editorIds = [
      'editor.format.bold', 'editor.format.italic', 'editor.format.strike',
      'editor.format.code-inline', 'editor.format.highlight',
      'editor.insert.code-block',
      'editor.insert.heading1', 'editor.insert.heading2', 'editor.insert.heading3',
      'editor.insert.quote', 'editor.insert.list-bullet',
      'editor.insert.section-break',
      'editor.insert.align-center', 'editor.insert.align-right', 'editor.insert.align-left',
      'editor.insert.ruby', 'editor.insert.em-dot', 'editor.insert.comment',
      'editor.insert.simple-inline',
    ];
    for (const id of editorIds) {
      const m = metas.find((mm) => mm.id === id);
      expect(m, `command ${id} should be registered`).toBeDefined();
      expect(m!.category).toBe('Edit');
    }
  });

  it('case 16: keybind が登録済 command は palette に hint として保持', () => {
    const metas = getCommandMetas();
    const bold = metas.find((m) => m.id === 'editor.format.bold');
    expect(bold?.keybind).toBe('Ctrl+B');
    const italic = metas.find((m) => m.id === 'editor.format.italic');
    expect(italic?.keybind).toBe('Ctrl+I');
  });
});
