# Sidebar click no auto-scroll (PR #174, 2026-04-27)

**Status**: implemented (PR #174)
**Date**: 2026-04-27
**User direction**:
> 「左ペインがスクロールオンするほどのエントリが大量にある状態で、エントリを選択すると、エントリがスクロール表示域の下端になるように勝手にずれる。これにより、ユーザーはダブルクリックしたいのに別のエントリを選択するという動作になっている」

## 1. 症状

- Sidebar に entry が多くスクロール可能な状態
- ユーザーが entry をクリック (1st click)
- `SELECT_ENTRY` dispatch → renderer rebuild
- Post-render の `scrollSelectedSidebarNodeIntoView` が
  `scrollIntoView({ block: 'nearest' })` を発動
- 部分的に viewport 下端で clipping されている entry の場合、
  `nearest` は entry の bottom を viewport 下端に揃えるよう
  scroll する
- マウスカーソルは画面座標で同じ位置に留まる → カーソルの下に
  あった entry が **別 entry** に置き換わる
- ユーザーが続いて 2nd click (ダブルクリック狙い) → 別 entry
  が選択される

## 2. 修正方針

`scrollSelectedSidebarNodeIntoView` の memo (`data-pkc-last-
scrolled-lid` on `#pkc-root`) を **action-binder 側で先回り**
して書き込む。Sidebar 内の click 由来 `SELECT_ENTRY` のときだけ。

```ts
// action-binder.ts, case 'select-entry':
const sidebarRegion = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
const fromSidebarClick = !!sidebarRegion?.contains(target);
const suppressAutoScroll = (clickLid: string): void => {
  if (fromSidebarClick) {
    root.dataset.pkcLastScrolledLid = clickLid;
  }
};
// ... 各 dispatch path で suppressAutoScroll(lid) を呼ぶ
```

Renderer 側の helper:
```ts
function scrollSelectedSidebarNodeIntoView(state, root) {
  if (!state.selectedLid) return;
  if (root.dataset.pkcLastScrolledLid === state.selectedLid) return; // ← short-circuit
  // ... scroll into view ...
}
```

`fromSidebarClick === true` の時、dispatch の前に dataset を書く
ので、render 後の helper は memo 一致と判断して early return。
スクロールは発生しない。

## 3. なぜ external jump は auto-scroll を残すか

外部 surface (breadcrumb / recent pane / calendar / kanban /
search-result row / `entry:` link) からの `SELECT_ENTRY` は target
entry が **scrolled-out / collapsed-out** の可能性がある。Sidebar
で見えていない entry を選んだら、当然 sidebar をスクロールして
位置を示すべき。

判定基準は **click target が `[data-pkc-region="sidebar"]` の
descendant かどうか** だけ。Sidebar 内 click → already-visible →
no scroll。Sidebar 外 click (breadcrumb / center pane の `entry:`
link 等) → scroll into view (従来動作維持)。

## 4. 適用 dispatch path

`case 'select-entry':` 内の 3 path:
- 単純 click (`me.detail < 2 && !ctrl/meta/shift`) — 主な要修正パス
- Shift+click (`SELECT_RANGE`) — anchor 用に同じく suppress

それ以外:
- Ctrl/Meta+click (`TOGGLE_MULTI_SELECT`) — `selectedLid` を
  flip しないので scroll helper は元々 trigger されない
- Double-click (`handleDblClickAction`) — entry-window (popup)
  を開く別 path、sidebar scroll 関係なし

## 5. Tests

`tests/adapter/sidebar-click-no-autoscroll.test.ts` (+3):
1. Sidebar click が memo を pre-write し、scrollIntoView が
   呼ばれない
2. プログラマティック `SELECT_ENTRY` (action-binder 通らず) は
   従来通り scrollIntoView が呼ばれる
3. Center pane breadcrumb (`data-pkc-action="select-entry"`) も
   従来通り scrollIntoView が呼ばれる

`HTMLElement.prototype.scrollIntoView` を spy で差し替えて呼び
出し履歴を検査する流儀。

## 6. Backward compatibility

- Source-of-truth は renderer 側 helper の memo。Action-binder
  はその memo を pre-write するだけで、新しい semantic は導入
  しない。
- 既存の `dataset.pkcLastScrolledLid` contract (`#pkc-root` の
  data attr に最後に scroll した LID を保持) は不変。
- 既存の auto-scroll path (external jump) は完全に従来動作。
- Touch device 上の動作も同様 — ここではマウスカーソルの代わり
  に finger position だが「視覚的に同じ場所をタップしたら同じ
  entry が選ばれる」期待は同じ。

## 7. 関連

- Source: `src/adapter/ui/action-binder.ts` `case 'select-entry':`
- Helper: `src/adapter/ui/renderer.ts`
  `scrollSelectedSidebarNodeIntoView`
- Memo storage: `#pkc-root` の `data-pkc-last-scrolled-lid` data
  attribute (root replacement 越しに survive する設計)
- 触発した audit: PR #173 着地後の user audit (大量エントリ環境
  での dblclick 失敗)
