/**
 * @vitest-environment happy-dom
 *
 * 領域 5: PKC-Markdown 拡張記法の slash command(コマンドパレット拡充)。
 *
 * AST 対応済の PKC-Markdown 拡張(highlight / em-dot / ruby / footnote /
 * sup / section role callout / figure)を `/` メニューから挿入できる
 * よう SLASH_COMMANDS に追加した。syntax は
 * `tests/features/ast/fixtures/full-pkc-fixture.md` 準拠。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openSlashMenu,
  closeSlashMenu,
  filterSlashMenu,
  handleSlashMenuKeydown,
  SLASH_COMMANDS,
} from '@adapter/ui/slash-menu';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeSlashMenu();
  root.remove();
});

/** 領域 5 で追加した 9 コマンドの定義(id → insert / cursorOffset)。 */
const NEW_COMMANDS: { id: string; insert: string; cursorOffset?: number }[] = [
  { id: 'highlight', insert: '====', cursorOffset: 2 },
  { id: 'emdot', insert: '....', cursorOffset: 2 },
  { id: 'sup', insert: ':sup:[]', cursorOffset: 6 },
  { id: 'ruby', insert: '[[ruby:漢字|かな]]' },
  { id: 'footnote', insert: '[^1]' },
  { id: 'note', insert: ':::section{role=note}\n\n:::', cursorOffset: 22 },
  { id: 'warning', insert: ':::section{role=warning}\n\n:::', cursorOffset: 25 },
  { id: 'tip', insert: ':::section{role=tip}\n\n:::', cursorOffset: 21 },
  { id: 'figure', insert: ':::figure{id=fig-1}\n\n:::', cursorOffset: 20 },
];

describe('領域 5: 新 slash command の定義', () => {
  for (const c of NEW_COMMANDS) {
    it(`/${c.id} は正しい insert / cursorOffset を持つ`, () => {
      const cmd = SLASH_COMMANDS.find((x) => x.id === c.id);
      expect(cmd, `command /${c.id} が SLASH_COMMANDS に存在しない`).toBeDefined();
      expect(cmd!.insert).toBe(c.insert);
      expect(cmd!.cursorOffset).toBe(c.cursorOffset);
    });
  }

  it('全 command id が一意(新規追加で衝突なし)', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('領域 5: slash command 挿入(end-to-end)', () => {
  function runInsert(filter: string, arrowDowns = 0): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = `/${filter}`;
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    openSlashMenu(ta, 0, root);
    filterSlashMenu(filter);
    for (let i = 0; i < arrowDowns; i++) {
      handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    }
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    return ta;
  }

  it('/highlight は ==== を挿入しキャレットをマーカー間に置く', () => {
    const ta = runInsert('highlight');
    expect(ta.value).toBe('====');
    expect(ta.selectionStart).toBe(2);
  });

  it('/emdot は .... を挿入しキャレットをマーカー間に置く', () => {
    const ta = runInsert('emdot');
    expect(ta.value).toBe('....');
    expect(ta.selectionStart).toBe(2);
  });

  it('/sup は :sup:[] を挿入しキャレットを括弧内に置く', () => {
    const ta = runInsert('sup');
    expect(ta.value).toBe(':sup:[]');
    expect(ta.selectionStart).toBe(6);
  });

  it('/ruby は ruby テンプレートを挿入する', () => {
    const ta = runInsert('ruby');
    expect(ta.value).toBe('[[ruby:漢字|かな]]');
  });

  it('/footnote は [^1] を挿入する', () => {
    const ta = runInsert('footnote');
    expect(ta.value).toBe('[^1]');
  });

  it('/warning は section callout を挿入しキャレットを本文行に置く', () => {
    const ta = runInsert('warning');
    expect(ta.value).toBe(':::section{role=warning}\n\n:::');
    expect(ta.selectionStart).toBe(25);
  });

  it('/figure は figure ブロックを挿入しキャレットを本文行に置く', () => {
    const ta = runInsert('figure');
    expect(ta.value).toBe(':::figure{id=fig-1}\n\n:::');
    expect(ta.selectionStart).toBe(20);
  });

  it('/note は footnote と区別され section note callout を挿入する', () => {
    // 'note' は 'footnote' にも部分一致するため、filter 結果は
    // [footnote, note] の順。ArrowDown 1 回で note を選ぶ。
    const ta = runInsert('note', 1);
    expect(ta.value).toBe(':::section{role=note}\n\n:::');
    expect(ta.selectionStart).toBe(22);
  });
});
