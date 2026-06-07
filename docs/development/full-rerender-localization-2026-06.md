# Full re-render 局所化調査(L1 #768)

> 2026-06-07。方針正本 [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §6 L1 の deliverable。
> `render()` の `root.innerHTML = ''` full re-render 経路を調べ、もっさり寄与の大きい経路を**計測付きで特定**し、局所化が安全な経路を申し送る。**本 PR は調査まで**(実装は follow-up、§6 参照)。

## §1 現状アーキテクチャ — scope framework は既存、center 経路が未カバー

`render(state, root, prev)`(`renderer.ts`)は冒頭で `computeRenderScope(state, prev)`(`render-scope.ts`)を呼び、4 段階に分岐する:

| scope | 処理 | 導入 |
|---|---|---|
| `none` | DOM 触らず return | PR #177 |
| `settings-only` | `applySystemSettings`(root 属性のみ)| PR #177 |
| `sidebar-only` | `replaceSidebarRegion`(sidebar subtree を in-place 差し替え)| PR #178 |
| `full` | **`root.innerHTML = ''` → shell 全再構築** | 既定 |

- `sidebar-only` の precedent = `replaceSidebarRegion()`(`renderer.ts:657`):region を query → scroll 退避 → 同じ render helper(`renderSidebar`)で subtree を作り直し → `replaceWith` → scroll 復元。**center 側に同型の `replaceCenterRegion` は未実装**。
- `computeRenderScope` は保守的(「迷ったら `full`」)。新 AppState field は列挙されるまで `full` に落ちる。

## §2 full 落ちトリガーの棚卸し

`render-scope.ts` は **~45 個の field** を「非一致なら `full`」に列挙している。ユーザー操作頻度で分類すると:

| 区分 | トリガー field(dispatch)| 局所化余地 |
|---|---|---|
| **高頻度・局所化可能** | `selectedLid`(**SELECT_ENTRY**)| ◎ 最頻のナビ。selection ハイライト + center swap のみで足りる |
| | `container`(**QUICK_UPDATE_ENTRY** = todo トグル / inline body 編集)| ◎ 1 entry の body だけ変化。reducer は `{ ...state, container }` で新 ref を作るため `full` に落ちる |
| **中頻度** | `editingLid`+`container`(COMMIT_EDIT / 編集出入り)| ○ center + 当該 row |
| | `textlogSelection`(TOGGLE_TEXTLOG_LOG_SELECTION)| ○ center のみ |
| **正当に full** | `viewMode` / `calendarYear` / `calendarMonth` / `graph*`(view 切替)| × center 全体が別物 |
| | `container` の構造変化(relations / tree shape / assets)| △ tree / link index / connectedness の再導出が要る |
| | overlays(menu / storageProfile / shortcutHelp / flagsInspector / import / merge…)| × overlay は full でも安い |

> 注:`container` トリガーは**両義的**。QUICK_UPDATE_ENTRY の body-only 変化と、relation 追加のような構造変化が同じ `state.container !== prev.container` で判定されるため、現状はまとめて `full`。局所化には「body だけ変わったか / 構造が変わったか」の判別が要る(§4-A)。

## §3 計測 — center は定数、sidebar は O(N)

`tests/adapter/render-cost-measure.test.ts`(`npx vitest run tests/adapter/render-cost-measure.test.ts`)。happy-dom で full render し、region 別 DOM ノード数と wall-clock を測った:

| N(entries)| total nodes | sidebar | center | rows | sidebar/total | render ms(happy-dom)|
|---|---|---|---|---|---|---|
| 100 | 1,109 | 596 | **38** | 100 | 54% | 112 |
| 500 | 4,042 | 2,729 | **38** | 500 | 68% | 260 |
| 2,000 | 15,042 | 10,729 | **38** | 2,000 | 71% | 2,663 |
| 5,000 | (測定中断)| — | — | — | — | **~24,000**(5s timeout 超過)|

- **center pane = 38 ノード固定**(選択 1 entry の detail)。N に依存しない。
- **sidebar = 約 5.4 ノード/行で O(N)**。total の 54%→71% を占め、N とともに増大。
- つまり **SELECT_ENTRY のたびに、本来 center(38)+ 2 行のハイライト切替だけでよいのに、sidebar の ~5.4N ノードを丸ごと捨てて再構築**している。N=2000 で ~1 万ノードの無駄再生成。
- wall-clock は happy-dom 値(実ブラウザより遅い)で絶対値は参考。ただし O(N) の形は実機でも同じ。実ブラウザ実測は既に bench(PR #176–178)が裏付け:**full-shell repaint ≈ 143–180ms @1000 entries**(`SET_SEARCH_QUERY` / `RESTORE_SETTINGS`)。sidebar-only 化でこれが ~0.4ms まで落ちた前例があり、SELECT_ENTRY / QUICK_UPDATE は**今まさにその full repaint 経路を毎回踏んでいる**。

## §4 局所化機会(優先度 × 安全性)

### A. QUICK_UPDATE_ENTRY body-only → center + 当該 row 局所(優先度 高)

- **対象**:todo status トグル、checkbox flip、inline body 編集(`preserveCenterPaneScroll` でラップされている全ハンドラ = `action-binder.ts:940`。コメントに「renderer does `root.innerHTML=''` on every dispatch」と明記)。
- **やること**:変化した 1 entry の center body を再描画 + sidebar の当該 row(title / status badge)だけ更新。
- **リスク**:body に entry-ref が含まれると link index / connectedness 数(sidebar / meta 表示)が変わりうる。
  - 緩和:**todo status トグルは body が JSON status のみで ref を持たない** → 純粋に安全な最小スコープ。まずここだけ局所化し、一般の body 編集は ref-set 変化検出 or archetype gate を後段で。
- **副産物**:局所化できれば `preserveCenterPaneScroll` workaround は不要になる(scroll が飛ばないので)。

### B. SELECT_ENTRY → selection ハイライト + center swap(優先度 高・最頻)

- **やること**:
  1. 旧 selected row と新 selected row の `data-pkc-selected` / class を **O(1)** で付け替え。
  2. `replaceCenterRegion(state, root)`(新規、`replaceSidebarRegion` と同型)で center を差し替え。
  3. root 属性 `data-pkc-has-selection` / `data-pkc-mobile-page` を更新。
- **リスク**(中):meta pane / action bar / References summary / recent-pane が center region 内に収まっているかの確認、scroll / focus continuity(`captureRenderContinuity` 相当)、iPhone push/pop page 遷移。center region(`[data-pkc-region="center"]` + `.pkc-center-content`)の境界が「selection で変わる全て」を含むことを実装時に確認。

### C. 新 RenderScope の追加(機構)

- `render-scope.ts` に `'center-only'`(または `'selection'`)を追加。`selectedLid` のみ変化 / `container` が body-only 変化のケースを既存の保守的列挙から切り出す。
- `renderer.ts` に `replaceCenterRegion` を追加(`replaceSidebarRegion` を雛形に)。
- `main.ts` の onState subscriber に分岐を追加(`sidebar-only` 分岐と同じく continuity capture/restore を伴う)。

## §5 実装申し送り(follow-up PR 用)

1. **最小から**:まず A の **todo status トグルだけ**を局所化(ref 無しで純粋安全)。効果計測 → 横展開。
2. 次に B(SELECT_ENTRY)。center region の包含関係を確認してから `replaceCenterRegion` を実装。
3. **必須 visual parity test**(CLAUDE.md Testing):SELECT_ENTRY / todo トグルは click を伴う視覚 feature。`elementFromPoint` / 実 event 経由の parity test を最低 1 件(描画と状態の一致 = 局所更新後も DOM が full render と同一になること)。`docs/development/visual-state-parity-testing.md` 準拠。
4. **回帰 guard**:`render-cost-measure.test.ts` を「before」基準として残す。局所化後は SELECT_ENTRY 経路が sidebar ノードを再生成しないことを別 parity test で固定。
5. **保守ポリシー堅持**:`render-scope.ts` の「迷ったら full」を崩さない。新 narrow scope は**カバーする field を全列挙**し、未列挙の同時変化は `full` にフォールバック(`sidebar-only && settingsChanged → full` と同じ合流規則)。

## §6 なぜ本 PR で実装しないか

- #768 の受け入れ条件は「**経路の特定(計測付き)+ 安全な経路一覧 + 申し送り**」= 調査。実装は別 issue。
- center 局所化は **core render path の正当性**に触れる(保守ポリシーが「迷ったら full」な理由 = stale pane 事故)。visual parity test を伴う慎重な perf PR として分離するのが安全。
- プライム・ディレクティブ(機能を足さない)下では perf(計算量を削る)は許可だが、リスクのある core 改変は段階導入(A の todo トグルから)が筋。

## 参照

- `src/adapter/ui/render-scope.ts`(scope 判定)/ `renderer.ts:657`(`replaceSidebarRegion` 雛形)/ `action-binder.ts:940`(`preserveCenterPaneScroll` = full re-render 前提の workaround)
- `tests/adapter/render-cost-measure.test.ts`(本調査の計測)
- bundle 側の姉妹調査:[`bundle-audit-2026-06.md`](./bundle-audit-2026-06.md)(L1 #767)
