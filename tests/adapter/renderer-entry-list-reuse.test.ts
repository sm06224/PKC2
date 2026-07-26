/** @vitest-environment happy-dom */
/**
 * 編集の出入りでサイドバーの行リストを作り直さない(2026-07-26)。
 *
 * `computeRenderScope` は `phase` が変わると無条件に `'full'` を返す
 * (`render-scope.ts:183`)。編集の開始(`ready → editing`)と確定
 * (`editing → ready`)がそれで、**1 編集につきサイドバー全行を 2 回**
 * 作り直していた。
 *
 * long task を直接測ると(`tests/bench/edit-main-thread-block.mjs`、N=5000):
 *   1 編集あたりメインスレッド停止 **約 670 ms**
 *   うち保存に帰せられるのは **−16 ms**(= ほぼゼロ)
 * ⇒ **体感を殺していたのは保存ではなく描画**だった。
 *
 * 行の内容は `phase` に依存しない ── サイドバーで `phase` を読む 4 箇所
 * (空状態の案内 / ルートへのドロップ枠 / ゴミ箱ペイン / ファイルドロップ枠)は
 * すべて O(N) の行ループの外にある。よって行リストの DOM だけ使い回す。
 *
 * 本 test が守るもの:
 *   1. **同一 node が使い回される**(= O(N) を払っていない)
 *   2. 行の内容が壊れない
 *   3. 🔴 **phase に依存する部分はちゃんと更新される**(使い回しの代償が出ていない)
 *   4. 🔴 行の内容に効く変化(container / 検索 …)では **使い回さない**
 */
import { describe, it, expect } from 'vitest';
import { canReuseEntryList } from '@adapter/ui/render-scope';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';

function entry(lid: string): Entry {
  return { lid, title: lid, body: `b-${lid}`, archetype: 'text', created_at: T, updated_at: T };
}
function container(): Container {
  return {
    meta: { container_id: 'c', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1'), entry('e2')],
    relations: [],
    revisions: [],
    assets: {},
  };
}

/** 最小の AppState。実型に合わせるのではなく、**判定に使う field だけ**持たせる。 */
function baseState(over: Partial<AppState> = {}): AppState {
  return {
    phase: 'ready',
    container: container(),
    selectedLid: 'e1',
    editingLid: null,
    viewMode: 'detail',
    searchQuery: '',
    ...over,
  } as unknown as AppState;
}

describe('行リストの使い回し判定', () => {
  it('🔴 ready → editing は使い回す(行の内容は phase に依存しない)', () => {
    const prev = baseState();
    const next = baseState({ phase: 'editing', editingLid: 'e1', container: prev.container });
    expect(canReuseEntryList(prev, next)).toBe(true);
  });

  it('🔴 editing → ready も使い回す', () => {
    const c = container();
    const prev = baseState({ phase: 'editing', editingLid: 'e1', container: c });
    const next = baseState({ phase: 'ready', editingLid: null, container: c });
    expect(canReuseEntryList(prev, next)).toBe(true);
  });

  it('🔴 container が変わったら使い回さない(行が古くなる)', () => {
    const prev = baseState({ phase: 'editing', editingLid: 'e1' });
    // 編集確定 = container が変わる。この経路で使い回すと古い行が残る
    const next = baseState({ phase: 'ready', editingLid: null, container: container() });
    expect(canReuseEntryList(prev, next)).toBe(false);
  });

  it('🔴 検索語が変わったら使い回さない(絞り込み結果が変わる)', () => {
    const c = container();
    const prev = baseState({ container: c });
    const next = baseState({ phase: 'editing', container: c, searchQuery: 'foo' });
    expect(canReuseEntryList(prev, next)).toBe(false);
  });

  it('phase が変わらないなら対象外(そもそも full にならない経路)', () => {
    const c = container();
    const prev = baseState({ container: c });
    const next = baseState({ container: c, selectedLid: 'e2' });
    expect(canReuseEntryList(prev, next)).toBe(false);
  });

  it('編集以外の phase 遷移は対象外(シェルの形が変わりうる)', () => {
    const c = container();
    const prev = baseState({ container: c, phase: 'ready' });
    const next = baseState({ container: c, phase: 'exporting' });
    expect(canReuseEntryList(prev, next)).toBe(false);
  });

  it('prev が無い初回描画では使い回さない', () => {
    expect(canReuseEntryList(null, baseState())).toBe(false);
  });

  it('🔴 未知の field が増えても既定で false に倒れる', () => {
    const c = container();
    const prev = baseState({ container: c });
    // 将来 AppState に足された field が動いた状況を模す
    const next = {
      ...baseState({ phase: 'editing', editingLid: 'e1', container: c }),
      someFutureField: { changed: true },
    } as unknown as AppState;
    expect(canReuseEntryList(prev, next)).toBe(false);
  });
});
