# selection render scope 実装設計(L1 #693 / #768 follow-up)

> 2026-06-07。[`full-rerender-localization-2026-06.md`](./full-rerender-localization-2026-06.md)(#768 調査)§4-B / §5 の **実装設計 follow-up**。調査が特定した「SELECT_ENTRY のたびに sidebar の ~5.4N ノードを丸ごと捨てて再構築している」最頻もっさり経路を、新 `'selection'` render scope で局所化する**実装前の設計**。コードはまだ書かない。承認後に着手する。

## §0 前提(調査 doc からの引き継ぎ)

- `render()` は `computeRenderScope(state, prev)` で `none` / `settings-only` / `sidebar-only` / `full` に分岐(`render-scope.ts`)。`selectedLid` 変化は現状 **`full` にフォールバック**(`root.innerHTML='' → shell 全再構築`)。
- center pane = **38 ノード固定**(N 非依存)。sidebar = **O(N)**(total の 54–71%)。SELECT_ENTRY は本来 center 差し替え + 2 行のハイライト切替で足りるのに、sidebar 全体を再生成している(N=2000 で ~1 万ノードの無駄)。
- 雛形 = `replaceSidebarRegion()`(`renderer.ts:657`):region query → scroll 退避 → 同じ render helper で subtree 再生成 → `replaceWith` → scroll/continuity 復元。center 版 `replaceCenterRegion` は未実装。

## §1 scope 判定表 — `'selection'` を carve out する正確な条件

`computeRenderScope` の保守ポリシー(「迷ったら `full`」「narrow scope はカバー field を全列挙」)を堅持する。`'selection'` は **`selectedLid` のみが実質変化し、残りの full/sidebar トリガーが全て同一**のときだけ返す。

SELECT_ENTRY reducer(`app-state.ts:1236`)が `selectedLid` 以外に書き換えうる field を実測し、判定を以下に固定する:

| field | SELECT_ENTRY での挙動 | `'selection'` 判定での扱い |
|---|---|---|
| `selectedLid` | `action.lid` に変更(**トリガー**)| 変化を要求 |
| `multiSelectedLids` | **毎回新 `[]`** を生成(ref 常に変わる)| **許容**(selection-only が multi ハイライトも解除する。空配列化を DOM 側で反映)|
| `collapsedFolders` | `revealInSidebar===true` かつ祖先 folded のときだけ新 ref。tree 内クリック(最頻)では **ref 保存** | **`===` を要求**。変化したら tree shape が変わる ⇒ `full` にフォールバック |
| `textlogSelection` | 別 entry 用なら `null` 化、それ以外 ref 保存 | **許容**(center に内包。selection は center を再描画する)|
| `textToTextlogModal` | 同上 | **許容**(同上)|
| 上記以外の全 full トリガー(`container` / `editingLid` / `phase` / `viewMode` / `graph*` / overlays …)| SELECT_ENTRY は触らない | **`===` を要求**。一つでも変化したら `full` |
| 全 sidebar-only トリガー(search / filter / sort …)| SELECT_ENTRY は触らない | **`===` を要求**。変化したら `sidebar-only` 既存経路へ |

判定ロジック(擬似):

```
// computeRenderScope 内、現行の即 full 列挙より前で:
const onlySelectionChanged =
     state.selectedLid !== prev.selectedLid          // トリガー
  && state.container === prev.container               // 構造不変
  && state.editingLid === prev.editingLid
  && state.phase === prev.phase
  && state.viewMode === prev.viewMode
  && state.collapsedFolders === prev.collapsedFolders // tree shape 不変
  && /* …残り全 full トリガー === prev… */
  && /* …全 sidebar-only トリガー === prev… */;
  // multiSelectedLids / textlogSelection / textToTextlogModal は除外(許容)
if (onlySelectionChanged) return 'selection';
```

> 合流規則は既存と同じ:`'selection'` 条件を満たさない `selectedLid` 変化は従来どおり `full`。`collapsedFolders` も同時変化(reveal ジャンプ)なら `full`(tree 再構築が要るため、無理に selection に寄せない)。**未列挙の新 AppState field が同時変化したら `full` に落ちる**よう、判定は「全 full/sidebar トリガーが === であること」を**肯定列挙**で書く(否定の列挙漏れで stale を出さない)。

## §2 DOM 差分手順 — `replaceSelectionRegions(state, root)`

`render()` に `if (scope === 'selection') { replaceSelectionRegions(state, root); return; }` を追加(`sidebar-only` 分岐の直後)。手順:

1. **root 属性更新**
   - `data-pkc-has-selection` = `state.selectedLid ? 'true' : 'false'`
   - `data-pkc-mobile-page` = `resolveMobilePage(state)`(iPhone push/pop page 遷移)
2. **sidebar ハイライト移動(O(1)、tree 再構築なし)**
   - 現 `[data-pkc-selected="true"]` と `[data-pkc-multi-selected="true"]` を全て query して属性除去。
   - 新 `selectedLid` の行を**現 view の正しい container 内**で取得しハイライト付与。view mode 別に付与先が異なる(調査 §1):tree/list = `[data-pkc-region="entry-list"] li[data-pkc-lid]`、kanban card、calendar item、filer row。`viewMode` は `'selection'` 条件で不変なので**現在の view の付与ロジックだけ**を呼べばよい。実装は full render の付与箇所(`renderer.ts:2994/4120/4171/4676/7011`)と**同一の述語**を切り出した共通 helper `applySelectionHighlight(root, state)` にして drift を防ぐ。
3. **center pane 差し替え** — `replaceCenterRegion(state, root)`(新規、`replaceSidebarRegion` 同型)
   - `[data-pkc-region="center"]` を query → `.pkc-center-content` の scrollTop を退避 → `renderCenter(state)` で作り直し → `replaceWith` → scroll 復元(rAF 再適用込み)。
4. **meta pane の出現/消滅 reconciliation**(sidebar-only に無い、selection 固有の難所)
   - 望ましい状態 = full render と同じ:`selected = findSelectedEntry(state)`(filer mode なら `resolveFilerScope`)→ `hasMetaPane = !!selected && selected.archetype !== 'system-about'`。
   - 現 DOM の `[data-pkc-region="meta"]` + `[data-pkc-resize="right"]` の有無と突き合わせ、4 ケースを処理:
     - 有→有:`renderMetaPane(...)` で `replaceWith`。
     - 無→有:center の後ろに rightHandle + metaPane を `insertAdjacent` で挿入。
     - 有→無:metaPane + rightHandle を除去。
     - 無→無:何もしない。
   - `[data-pkc-region="tray-right"]` の `display`(meta 折り畳み時のトレイ)も `hasMetaPane` に合わせて更新。
   - **filer mode 特殊ケース**:meta は selectedLid ではなく scope folder 固定(`renderer.ts:841`)。filer 内 row クリックで selectedLid だけ変わり scope folder 不変なら meta は**変えなくてよい**が、§1 で `viewMode` 不変を要求しているので filer⇄detail の遷移は `full` に落ちる。filer 内 selection は「meta を再描画しても同 scope なので冪等」= 安全側。
5. **continuity**(main.ts subscriber 側、`sidebar-only` と同様)
   - `captureRenderContinuity` → `replaceSelectionRegions` 経由 render → `restoreRenderContinuity`。center 内の focus/caret/scroll を保つ。
   - `populateAttachmentPreviews` / `populateInlineAssetPreviews` は **center が差し替わる**ので両方呼ぶ(sidebar-only は inline をスキップしたが、selection は center 側なので inline も必要)。`cleanupBlobUrls` を replace 前に呼び center pane の旧 Blob を revoke。

## §3 main.ts subscriber 分岐

`onState` に `sidebar-only` 分岐(`main.ts:206`)と同型で追加:

```
if (renderScope === 'selection') {
  cleanupBlobUrls(root);                 // 旧 center Blob revoke
  const continuity = captureRenderContinuity(root);
  render(state, root, prevRenderState);  // 内部で replaceSelectionRegions
  restoreRenderContinuity(root, continuity);
  populateAttachmentPreviews(root, dispatcher);
  populateInlineAssetPreviews(root, dispatcher);
  locationNavTracker.consume(root, state.pendingNav ?? null);
  prevSelectedLid = state.selectedLid;
  prevRenderState = state;
  return;
}
```

## §4 visual parity test 仕様(CLAUDE.md Testing、必須)

局所更新の不変条件 = **「`'selection'` 経路で更新した後の DOM が、同 state を `full` render した DOM と region 単位で一致する」**。

1. **center/meta parity**(parity 本体):
   - 2 entry(A=text, B=todo)を持つ container を mount → A を select(full)→ B を select(`'selection'` 経路)。
   - 期待:`[data-pkc-region="center"]` と `[data-pkc-region="meta"]` の innerHTML(または正規化テキスト)が、B を **full render した参照 DOM** と一致。
2. **selection highlight 移動**:`[data-pkc-selected="true"]` がちょうど 1 個、かつ `data-pkc-lid===B`。旧 A 行から外れている。
3. **sidebar 非再生成(回帰 guard、調査 §3 の効果固定)**:select 前後で sidebar の特定 row ノードの**同一性**(`===` ノード参照)が保たれる = tree が再構築されていないこと。`render-cost-measure.test.ts` を before 基準に併置。
4. **meta 出現/消滅**:`system-about` 等 meta 無し entry ⇄ 通常 entry の selection で rightHandle + metaPane が正しく挿入/除去されること。
5. **視覚 parity**(`visual-state-parity-testing.md` 準拠):`elementFromPoint` / 実 click 経由で B 行をクリック → center が B の内容に変わることを観測点(DOM 数値/表示要素)で assert。DOM attribute 遷移で止めない。

## §5 段階導入(調査 §5 を踏襲)

1. **本設計の承認**(本 doc)。
2. **PR-1**:`render-scope.ts` の `'selection'` 判定 + `replaceCenterRegion` + `applySelectionHighlight` + meta reconciliation + main.ts 分岐 + §4 parity test。core render 改変なので **merge 前に user 確認**(自動 merge しない)。
3. **PR-2(任意・後段)**:調査 §4-A の QUICK_UPDATE_ENTRY body-only 局所化(todo status トグルから)。`container` の body-only 判別が要るため別 PR。

## §6 リスクと不採用案

- **stale pane**:保守ポリシーが `full` 既定な理由。§1 を肯定列挙にし、未知 field 同時変化を `full` に落とすことで「列挙漏れ → stale」を構造的に防ぐ。§4 の full-render 一致 parity が最終 guard。
- **不採用:selection でも sidebar も作り直す**案 — もっさりの主因(O(N) sidebar 再生成)を温存するので却下。highlight の O(1) 付け替えに限定する。
- **不採用:per-view 付与を replaceSelectionRegions に直書き**案 — full render と drift する。`applySelectionHighlight` 共通 helper に切り出し、full path もそれを呼ぶ形にして単一正本化する。

## 参照

- [`full-rerender-localization-2026-06.md`](./full-rerender-localization-2026-06.md)(#768 調査・本設計の前提)
- [`visual-state-parity-testing.md`](./visual-state-parity-testing.md)(parity test 方法論)
- `src/adapter/ui/render-scope.ts`(scope 判定)/ `renderer.ts:657`(`replaceSidebarRegion` 雛形)/ `renderer.ts:733`(`renderShell` の main area 構成)/ `app-state.ts:1236`(SELECT_ENTRY reducer)
- `tests/adapter/render-cost-measure.test.ts`(回帰 guard 基準)
