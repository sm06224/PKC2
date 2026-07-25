/**
 * @vitest-environment happy-dom
 *
 * 空タイトル entry の表示 ── **内部 lid を画面に出さない**。
 *
 * 背景(視覚監査 2026-07-25、docs/development/visual-audit-2026-07-25.md §2 A3):
 * filer の名前列だけが `entry.title || entry.lid` で fallback しており、
 * タイトルが空の entry で **内部 ID(`x-empty`)が user 向け画面に露出**していた。
 * 他の表示経路は全て `(untitled)` を使っており表記も割れていた。調べたところ
 * filer sidebar / filer breadcrumb / contact-sheet caption / grid card /
 * inventory 列 / folder select / 移動先 select / export の link ラベルなど
 * **13 箇所**が同じ形をしていたので一斉に `(untitled)` へ寄せた。
 *
 * ただし次は **意図的に lid のまま**で、ここを直してはいけない:
 *   - ファイル名生成(entry-bundle / text-bundle / textlog-bundle /
 *     folder-export / download):空文字だと衝突するので一意な lid が要る
 *   - 検索の haystack(renderer.ts の sidebar 検索):lid で引けるのは仕様
 *
 * 本 test は「render された DOM のどこにも lid が文字列として出ない」を
 * 直接 assert する ── 個別 selector を列挙するより漏れに強い。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { __resetRegistry, __resetUrlCache, setContainerFlagSource } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';
/** 検出しやすいよう、通常語と衝突しない lid にする。 */
const EMPTY_LID = 'zz-untitled-probe';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: '親フォルダ', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: EMPTY_LID, title: '', body: '本文だけあってタイトルが空', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: '普通のエントリ', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: EMPTY_LID, kind: 'structural', created_at: TS, updated_at: TS },
    ],
    revisions: [],
    assets: {},
  };
}

/**
 * render 済み DOM の **テキストとして見える部分** に lid が出ていないか。
 * `data-pkc-lid` 等の属性は機能上必要なので除外する(属性は user に見えない)。
 */
function visibleText(root: HTMLElement): string {
  return root.textContent ?? '';
}

describe('空タイトル entry の表示(内部 lid を露出しない)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setContainerFlagSource({});
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  function boot(flags: Record<string, string | boolean | number> = {}, selected = EMPTY_LID): void {
    setContainerFlagSource(flags);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selected });
    render(dispatcher.getState(), root);
  }

  it('tree サイドバー:空タイトル行に lid が出ず (untitled) が出る', () => {
    boot({ 'sidebar.mode': 'tree' });
    const text = visibleText(root);
    expect(text, `lid "${EMPTY_LID}" が画面テキストに露出している`).not.toContain(EMPTY_LID);
    expect(text).toContain('(untitled)');
  });

  it('filer サイドバー:空タイトル行に lid が出ない', () => {
    boot({ 'sidebar.mode': 'filer' });
    expect(visibleText(root)).not.toContain(EMPTY_LID);
  });

  it('filer ビュー(explorer テーブル):名前列に lid が出ない', () => {
    setContainerFlagSource({});
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
    render(dispatcher.getState(), root);
    const filer = root.querySelector('[data-pkc-region="filer-view"]');
    expect(filer, 'filer ビューが描画されていない(前提の健全性)').not.toBeNull();
    const text = filer?.textContent ?? '';
    expect(text, '空タイトルの子が filer に出ていない(前提の健全性)').toContain('(untitled)');
    expect(text, `lid "${EMPTY_LID}" が filer の表示に露出している`).not.toContain(EMPTY_LID);
  });

  it('detail ビュー(パンくず含む):空タイトルで lid が出ない', () => {
    boot({ 'sidebar.mode': 'tree' });
    const headerPath = root.querySelector('[data-pkc-region="header-path"]');
    expect(headerPath?.textContent ?? '').not.toContain(EMPTY_LID);
    expect(headerPath?.textContent ?? '').toContain('(untitled)');
  });

  // ── source-level guard ────────────────────────────────────────────
  // profile(explorer / contact-sheet / inventory 等)ごとに描画経路が分かれる
  // ため、DOM assert だけでは全経路を踏めない。`title || …lid` という形自体を
  // 禁止して、**どの経路にも再導入されない**ようにする。意図的に lid が要る
  // 箇所(ファイル名生成 / 検索 haystack)は allowlist に理由付きで載せる。
  it('renderer.ts に表示用の `title || lid` fallback が残っていない', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/adapter/ui/renderer.ts'), 'utf-8');
    const offenders: string[] = [];
    src.split('\n').forEach((line, i) => {
      if (!/title\s*\|\|\s*[A-Za-z_.]*\.lid/.test(line)) return;
      // allowlist: 検索の haystack(lid で引けるのは仕様)
      if (line.includes('toLowerCase().includes(searchQuery)')) return;
      offenders.push(`${i + 1}: ${line.trim()}`);
    });
    expect(
      offenders,
      '表示に内部 lid を出す fallback が復活しています。`|| \'(untitled)\'` を使うこと。' +
        'ファイル名生成など lid が必要な箇所は adapter/platform 側に置く:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('機能属性としての lid は残る(表示だけ差し替え、選択は壊さない)', () => {
    boot({ 'sidebar.mode': 'tree' });
    const byAttr = root.querySelector(`[data-pkc-lid="${EMPTY_LID}"]`);
    expect(byAttr, 'data-pkc-lid 属性まで消してはいけない(選択・DnD が壊れる)').not.toBeNull();
  });
});
