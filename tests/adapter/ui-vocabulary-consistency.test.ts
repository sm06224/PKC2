/**
 * @vitest-environment happy-dom
 *
 * UI 文言の一貫性 ── **同じ画面に日英を混ぜない / 同じ概念に 2 つの語を使わない**。
 *
 * 背景(視覚監査 2026-07-25、docs/development/visual-audit-2026-07-25.md §3 B2):
 * `docs/development/i18n-requirements.md` の「UI string translation:
 * Not Implemented」が起点で、string table が無いまま後発 PR が ad-hoc に
 * 日本語を足した結果、同一画面に `Rename` / `✎ 編集` / `Download` /
 * `Copy link` / `TEXT に変換` が並ぶ状態になっていた。
 *
 * user 裁定(2026-07-25)は「**目立つ画面だけ日本語に寄せる**」。string table の
 * 新設は機能追加なので見送り(#1010 に Issue 化)。したがって tree / filer の
 * 重複文言は **定数化せず両方に同じ文字列を書く**のが今回の正解
 * (CLAUDE.md 不変条件 6「三行の重複 > 早すぎる抽象化」)。
 *
 * ただし「同じ文字列を 2 箇所に書く」は放っておくと必ずまた割れるので、
 * **機械的に縛る**のが本 test の役割。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { __resetRegistry, __resetUrlCache, setContainerFlagSource } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: '親フォルダ', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'e1', title: '子エントリ', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [{ id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: TS, updated_at: TS }],
    revisions: [], assets: {},
  };
}

describe('UI 文言の一貫性(視覚監査 2026-07-25 B2)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setContainerFlagSource({});
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  function renderWith(flags: Record<string, string | boolean | number>): string {
    setContainerFlagSource(flags);
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(d.getState(), root);
    return root.querySelector('[data-pkc-region="sidebar"]')?.textContent ?? '';
  }

  it('tree / filer サイドバーが同じ概念に同じ語を使う(検索欄)', () => {
    // 混在の直接の原因は tree 経路と filer 経路の二重実装。placeholder は
    // textContent に出ないので DOM から直接読む。
    const readPlaceholder = (flags: Record<string, string>): string => {
      setContainerFlagSource(flags);
      const d = createDispatcher();
      d.onState((s) => render(s, root));
      d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
      render(d.getState(), root);
      const input = root.querySelector<HTMLInputElement>('[data-pkc-region="sidebar"] input');
      return input?.getAttribute('placeholder') ?? '';
    };
    const tree = readPlaceholder({ 'sidebar.mode': 'tree' });
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    const filer = readPlaceholder({ 'sidebar.mode': 'filer' });
    expect(tree, 'tree サイドバーの検索欄の文言が空').not.toBe('');
    expect(filer, 'filer サイドバーの検索欄の文言が空').not.toBe('');
    expect(tree, 'tree と filer で検索欄の文言が割れている').toBe(filer);
  });

  it('サイドバーの操作ヒントが日本語で揃っている', () => {
    const text = renderWith({ 'sidebar.mode': 'tree' });
    expect(text).toContain('ドラッグで移動');
    expect(text).toContain('ダブルクリック');
    expect(text).toContain('右クリック');
  });

  // ── source-level guard ───────────────────────────────────────────
  // 「目立つ画面」に英語が戻ってこないよう、既に日本語化した文字列を
  // 名指しで禁止する。allowlist ではなく **denylist** にするのは、
  // string table を作らない裁定のもとでは「全部を縛る」手段が無いため。
  it('日本語化済みのラベルが英語に戻っていない', () => {
    const files = [
      'src/adapter/ui/renderer.ts',
      'src/adapter/ui/attachment-presenter.ts',
    ];
    // ソース内で **UI 文字列として** 現れたら退行、というリテラル。
    const banned = [
      "textContent = 'Tags'",
      "textContent = 'Categorical'",
      "textContent = 'Properties'",
      "textContent = 'References'",
      "textContent = 'Contents'",
      "textContent = 'Add Relation'",
      "textContent = 'Download'",
      "textContent = 'Rename'",
      "'No backlinks.'",
      "'No outgoing relations.'",
      "'No outgoing links.'",
      "'No broken links.'",
      "'Search entries…'",
      "'⚙ Filters'",
      "'No matching entries",
      "'Drop a file here to attach'",
      "'📎 Drop file to attach'",
      "'📎 Drop files here'",
      "'↑ Drop here for root level'",
      "'Preview is not available",
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf-8');
      src.split('\n').forEach((line, i) => {
        for (const b of banned) {
          if (line.includes(b)) hits.push(`${f}:${i + 1} ${b}`);
        }
      });
    }
    expect(
      hits,
      '日本語化した UI 文言が英語に戻っています(#1010 の string table 化までは' +
        '個別に日本語で書くのが現在の方針):\n' + hits.join('\n'),
    ).toEqual([]);
  });
});
