/** @vitest-environment happy-dom */
/**
 * 行 memo の「派生値」invalidation(2026-07-26)。
 *
 * 従来、行 memo は **container 参照が変わると全行を捨てて**いた。理由は
 * 「relations / revisions / connectedness の派生値が全行で古くなるから」。
 * ところが本文を 1 文字直すだけでも container 参照は変わるので、
 * **編集の確定のたびに 5000 行すべてが作り直されていた**。
 *
 * 実測(N=5000、`Performance.getMetrics` で Script / Layout / Style を分離):
 *
 *   取消(保存なし) Script  89 ms
 *   確定(保存あり) Script 195 ms   ← 差 **106 ms** が行の作り直し
 *
 * そこで `derivedRowFingerprint` を memo に載せ、**指紋が違う行だけ**作り直す
 * 方式にした(tree 行が depth / collapsed などで既にやっていたのと同じ方式)。
 *
 * 🔴 **本 test の役目は「速くなったこと」ではなく「嘘をつかないこと」**。
 * 指紋に載せ忘れた入力があると、型 error も既存 test の failure も出ないまま
 * **古い行 DOM が使い回され、画面だけが更新されない**。
 * `renderEntryItem` が読む container 由来の値を 1 つずつ動かして、
 * ちゃんと行が作り直されることを確かめる。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const T = '2026-07-26T00:00:00Z';

function entry(lid: string, over: Partial<Entry> = {}): Entry {
  return {
    lid, title: lid, body: `body-${lid}`, archetype: 'text',
    created_at: T, updated_at: T, ...over,
  };
}

function fixture(over: Partial<Container> = {}): Container {
  return {
    meta: { container_id: 'c', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('a1'), entry('a2'), entry('a3')],
    relations: [],
    revisions: [],
    assets: {},
    ...over,
  };
}

function readyState(container: Container): AppState {
  // 実 reducer を通す ── 手書きの部分 state だと header 等が別の理由で落ち、
  // memo の検証になっていない test になる(実際に踏んだ)。
  const { state } = reduce(createInitialState(), { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

let root: HTMLElement;
const rowOf = (lid: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-pkc-region="entry-list"] [data-pkc-lid="${lid}"]`);

beforeEach(() => {
  document.body.innerHTML = '<div id="pkc-root"></div>';
  root = document.getElementById('pkc-root')!;
  __resetEntryRowMemoForTest();
});

/** 1 回目を描いて、対象行の node を返す。 */
function firstRender(container: Container): { state: AppState; before: HTMLElement | null } {
  const state = readyState(container);
  render(state, root, null);
  return { state, before: rowOf('a2') };
}

describe('行 memo の派生値 invalidation', () => {
  it('何も変わらなければ使い回す(前提の確認)', () => {
    const c1 = fixture();
    const { state, before } = firstRender(c1);
    render(readyState(c1), root, state);
    expect(rowOf('a2')).toBe(before);
  });

  it('🔴 revision が増えたら、その行は作り直される(履歴マーカー)', () => {
    const c1 = fixture();
    const { state, before } = firstRender(c1);
    // a2 に revision が付く = 行の「履歴あり」表示が変わりうる
    const c2 = fixture({
      entries: c1.entries,
      revisions: [{ id: 'r1', entry_lid: 'a2', snapshot: '{}', created_at: T }],
    });
    render(readyState(c2), root, state);
    expect(rowOf('a2')).not.toBe(before);
  });

  it('🔴 被参照(backlink)が増えたら、その行は作り直される', () => {
    const c1 = fixture();
    const { state, before } = firstRender(c1);
    const rel: Relation = {
      id: 'rel1', from: 'a1', to: 'a2', kind: 'structural', created_at: T, updated_at: T,
    };
    const c2 = fixture({ entries: c1.entries, relations: [rel] });
    render(readyState(c2), root, state);
    // a2 は被参照が 0 → 1 になったので作り直される
    expect(rowOf('a2')).not.toBe(before);
  });

  it('🔴 **自分は変わっていないのに他行の編集で孤立状態が変わる**場合も作り直される', () => {
    // relations が付くと a1 / a2 の両方の connectedness が変わる。
    // a2 の entry 参照は一切変えていないことが要点 ── 参照だけ見る memo では
    // 取りこぼす経路。
    const c1 = fixture();
    const state = readyState(c1);
    render(state, root, null);
    const a1Before = rowOf('a1');
    const a3Before = rowOf('a3');

    const rel: Relation = {
      id: 'rel1', from: 'a1', to: 'a2', kind: 'structural', created_at: T, updated_at: T,
    };
    render(readyState(fixture({ entries: c1.entries, relations: [rel] })), root, state);

    expect(rowOf('a1')).not.toBe(a1Before); // 接続された
    expect(rowOf('a3')).toBe(a3Before);     // 無関係な行は使い回す
  });

  it('🔴 手動並べ替えに入ったら、選択行は作り直される(↑↓ ボタンが出る)', () => {
    // ⚠ 行が読むのは `sortKey === 'manual'` **だけ**。updated → title では
    //   行の見た目は変わらないので、そこを期待にすると test が嘘になる
    //   (最初そう書いて落ちた)。実態に合わせて manual を使う。
    const c1 = fixture();
    const state = readyState(c1);
    render(state, root, null);
    const before = rowOf('a1');
    render(
      { ...readyState(c1), sortKey: 'manual', selectedLid: 'a1' } as unknown as AppState,
      root, state,
    );
    expect(rowOf('a1')).not.toBe(before);
  });

  it('🔴 readonly が変わったら作り直される(操作の出し分け)', () => {
    const c1 = fixture();
    const { state, before } = firstRender(c1);
    render({ ...readyState(c1), readonly: true } as unknown as AppState, root, state);
    expect(rowOf('a2')).not.toBe(before);
  });

  it('編集した行だけ作り直され、他行は使い回される(本命の経路)', () => {
    const c1 = fixture();
    const state = readyState(c1);
    render(state, root, null);
    const a1Before = rowOf('a1');
    const a2Before = rowOf('a2');

    // COMMIT_EDIT 相当: a1 だけ新しい参照になり、container 参照も変わる
    const c2 = fixture({
      entries: [{ ...c1.entries[0]!, body: 'edited' }, c1.entries[1]!, c1.entries[2]!],
    });
    render(readyState(c2), root, state);

    expect(rowOf('a1')).not.toBe(a1Before);
    expect(rowOf('a2')).toBe(a2Before);
  });
});
