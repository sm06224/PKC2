# PR #197 — Navigation history bridge

**Status**: implemented
**Date**: 2026-04-28
**Roadmap**: 領域 1(履歴ナビゲーション)— 順 3

User direction:
> 戻る進むボタンとマウスの同名ボタン、キーボードでalt+←、alt+→で
> 内部的なパンくずリストを移動したい。

## 1. 背景

PKC2 内のナビゲーション(SELECT_ENTRY、SET_VIEW_MODE)は state レベルで
完結していて、ブラウザの戻る進むボタンから到達できなかった。

ブラウザの戻る/進むは:
- ツールバーの戻る進むアイコン
- マウスの **button 4 / 5**(X1 / X2)
- キーボード **Alt+← / Alt+→**(Windows / Linux)、**Cmd+[ / Cmd+]**(macOS)

これら全てが **`popstate`** イベントを発火する。**`history.pushState`
+ `popstate` リスナー**を組むだけで、ユーザー要望の 3 つの入力経路が
全部一発でカバーできる。

## 2. 実装

### `src/adapter/ui/nav-history.ts` 新規

```ts
interface NavSnapshot {
  selectedLid: string | null;
  viewMode: 'detail' | 'calendar' | 'kanban';
}

export function mountNavHistory(dispatcher: Dispatcher): NavHistoryHandle {
  let restoring = false;
  let lastSnapshot = snapshot(dispatcher.getState());

  // boot snapshot を replaceState (pushState ではなく) で seed
  window.history.replaceState({ pkc2: lastSnapshot }, '');

  // state 変化を観察 → selectedLid / viewMode 変化なら pushState
  dispatcher.onState((state) => {
    if (restoring) return;
    const cur = snapshot(state);
    if (sameSnap(cur, lastSnapshot)) return;
    lastSnapshot = cur;
    window.history.pushState({ pkc2: cur }, '');
  });

  // popstate → スナップショット復元 (restoring フラグでループ防止)
  window.addEventListener('popstate', (e) => {
    const restored = e.state?.pkc2;
    if (!restored) return;
    restoring = true;
    try {
      // SELECT_ENTRY → 必要に応じて SET_VIEW_MODE
    } finally { restoring = false; }
  });
}
```

### snapshot 設計

最小限:`selectedLid + viewMode` のみ。

含めない:
- `searchQuery` / `archetypeFilter` 等のフィルタ — workspace setup で
  あって "ナビゲーション位置" ではない
- `textlogSelection` — entry 内の view state
- `editingLid` / `phase` — 編集中の back は専用 CANCEL_EDIT path がある

PKC2 の "ナビゲーション位置" の本質的単位は `selectedLid + viewMode` の
2 軸、と判断。

### restoring フラグ

`popstate` で snapshot を復元する際の `dispatcher.dispatch(SELECT_ENTRY)`
が再び `state.onState` を発火 → 新 pushState を発生させる無限ループを
防ぐため、復元中は state 観察側で push をスキップ。

### `main.ts` 統合

`mountPersistence` の直後で `mountNavHistory(dispatcher)` を呼ぶ
(初期 state が落ち着いた後にスナップショットを seed したいため)。

## 3. 動作仕様

| 入力 | 経路 | 動作 |
|---|---|---|
| ツールバー戻る進む | popstate | snapshot 復元 |
| マウス button 4/5(X1/X2)| popstate(ブラウザ既定)| 同上 |
| Alt+← / Alt+→(Win/Linux)| popstate(ブラウザ既定)| 同上 |
| `Cmd+[` / `Cmd+]`(macOS)| popstate(ブラウザ既定)| 同上 |
| `SELECT_ENTRY` ディスパッチ | onState → pushState | 履歴に積む |
| `SET_VIEW_MODE` ディスパッチ | onState → pushState | 履歴に積む |
| `DESELECT_ENTRY` | onState → pushState(selectedLid=null)| 同上 |
| 同 selectedLid + viewMode の dispatch | sameSnap → 何もしない | 重複 push 抑止 |

## 4. テスト

新規 `tests/adapter/nav-history-pr197.test.ts`(8 件):

1. boot snapshot を `replaceState` で seed(history.length 増えない)
2. SELECT_ENTRY → pushState、`selectedLid` 反映
3. SET_VIEW_MODE → pushState、`viewMode` 反映
4. ナビゲーション無関係の dispatch(TOGGLE_RECENT_PANE)では push されない
5. popstate で snapshot 復元 → SELECT_ENTRY 反映
6. popstate に `selectedLid: null` → DESELECT_ENTRY
7. popstate-restore は新 history entry を作らない(ループ防止検証)
8. `dispose()` で popstate handler 解除

合計 5979 / 5979 unit pass + 11 / 11 smoke pass。

## 5. 後方互換性

- 既存の `selectedLid` / `viewMode` action / state shape 不変
- iPhone push-pop(PR #173-#174)は **`mobile-back` action** で動く
  別経路。本 PR の popstate 経路と並走するが、両者とも最終的に
  SELECT_ENTRY / DESELECT_ENTRY を投げるので結果は整合する。
- `editingLid` / `phase: 'editing'` 中の popstate は selectedLid を
  変えるだけ — 編集中ロックが必要なら reducer が `blocked` を返して
  反映されない(既存の guard を尊重)
- bundle.js +1.1 KB / bundle.css 不変
- bench への影響:state subscription 1 個追加(popstate 発火頻度は
  低いので render hot path には影響なし)

## 6. roadmap 残り

- 順 1 ✓ iPhone textarea zoom 抑制(PR #195)
- 順 2 ✓ コピーボタン拡充(PR #196)
- 順 3 ✓ 戻る進む / Alt+←/→(本 PR)
- 順 4 編集支援 indent / brackets / list **+ iPhone/iPad バッククォート入力支援**
- 順 5 コマンドパレット拡充 + scrollIntoView 修正
- 順 6 マークダウン方言拡充
- 順 7 iPhone/iPad action bar

## 7. Files touched

- 新規: `src/adapter/ui/nav-history.ts` (~120 行)
- 修正: `src/main.ts`(import + boot 後 mount 呼び出し、~6 行)
- 新規: `tests/adapter/nav-history-pr197.test.ts`(8 件)
- 新規: `docs/development/nav-history-pr197-findings.md` (this doc)
