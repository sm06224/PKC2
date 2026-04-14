# UI Singleton State Audit

**Status**: audit report, docs-only
**Date**: 2026-04-13
**Scope**: module-level mutable state in `src/adapter/ui/*` — what is still a
singleton, is it safe, and should it be reducer-owned?

## 1. 背景

P1-1 で 2 つの主要な UI singleton（`textlog-selection.ts` と
`text-to-textlog-modal.ts`）を reducer-owned に移行した。その後の監督判断で
「残り singleton は reducer に上げるべきか、軽量 clear hook で十分か、触らな
いか」を切り分ける必要が出た。本文書はその棚卸しと次実装の提案である。

実装は行わない。観測と分類のみ。

## 2. 対象一覧と持っている state

grep `^let ` で抽出した `src/adapter/ui/*` の module-level mutable state：

| ファイル | 持っている state | 種別 |
|---------|------------------|-----|
| `textlog-preview-modal.ts` | `activeModal: HTMLElement \| null` | DOM overlay |
| `slash-menu.ts` | `WeakMap<HTMLElement, ActiveSlashMenu>` + `activeRoot: HTMLElement \| null` + `assetPickerCallback` | per-root instance map |
| `asset-picker.ts` | `activePicker` / `activeTextarea` / `replaceStart/End` / `selectedIndex` / `visibleCandidates` | popover + cursor state |
| `asset-autocomplete.ts` | `activePopover` / `activeTextarea` / `queryRangeStart` / `selectedIndex` / `allCandidates` / `visibleCandidates` | popover + query state |
| `text-to-textlog-modal.ts` | `activeOverlay` / `activeRoot` / `activeSourceLid` / `activeSplitMode` / `activeResult` / `lastUserTitle` | **reducer-mirror**（P1-1 対応済み） |
| `textlog-selection.ts` | `cache: TextlogSelectionState \| null` | **reducer-mirror**（P1-1 対応済み） |
| `entry-window.ts` | `openWindows: Map` / `previewResolverContexts: Map` | multi-instance tracking（P1-2 で live-refresh 整備済み） |

P1-1 / P1-2 で処置済みの 3 ファイルは本監査では再検討不要。残り 4 つを精査
する。

## 3. 分類基準

- **A: reducer 編入すべき** — 編集セッションまたはナビゲーションを跨いで「意
  図されていない状態が残る」危険がある。stale な時に observable な corruption
  か誤操作を招く。
- **B: UI local のまま、但し clear hook が必要** — 編集セッションを跨ぐ危険
  はあるが、reducer まで上げる必要はない。renderer-driven の sync か、主要
  遷移 (SELECT_ENTRY / BEGIN_EDIT / SYS_IMPORT_COMPLETE) で close を呼べば
  十分。
- **C: 現状維持** — stale しても実害がない（renderer の
  `root.innerHTML = ''` で DOM が detach され、singleton pointer が「stale だ
  が次回の open/close で self-heal する」パターンに落ちる）。

## 4. 対象ごとの詳細

### 4.1 `textlog-preview-modal.ts`

**持っている state**: `activeModal: HTMLElement | null` のみ。他は DOM 内に
入っている（title input、body `<pre>`）。

**操作フロー**:

1. user が TEXTLOG selection mode に入る → 選択 → 「→ TEXT に変換」
2. `openTextlogPreviewModal(root, data)` — modal を root に mount、
   `activeModal` に格納
3. user が title を編集 → confirm / cancel で閉じる
4. confirm 時: `getTextlogPreviewTitle()` / `getTextlogPreviewBody()` が
   DOM から読む → `CREATE_ENTRY` + `COMMIT_EDIT` dispatch

**stale 化しうる経路**:

| 経路 | 現状の close 担保 |
|------|------------------|
| Escape | ✓ 優先順位付きで最優先に閉じる（action-binder line 1561） |
| cancel-textlog-to-text ボタン | ✓ line 470 |
| confirm-textlog-to-text ボタン後 | ✓ line 499 |
| cancel-textlog-selection | ✓ line 445 |
| open-another（上書き） | ✓ `openTextlogPreviewModal` の冒頭で閉じる |
| action-binder teardown | ✓ line 3276 付近で明示 close |
| click-outside | ✗ — modal 形式なので backdrop click は飲み込む |
| **SELECT_ENTRY で別エントリへ（プログラム的）** | ✗ 直接 close しない |
| **BEGIN_EDIT** | ✗ 直接 close しない |
| **DELETE_ENTRY of source** | ✗ 直接 close しない |
| **SYS_IMPORT_COMPLETE** | ✗ 直接 close しない |

**実害評価**:

上記「直接 close しない」経路であっても、reducer dispatch → render() は必ず
発火する。`render()` は冒頭で `root.innerHTML = ''` を実行するので、mount
されていた overlay は DOM から **detach される**。この瞬間:

- 視覚的には modal が消える（期待通り）
- `activeModal` singleton は detach された DOM ノードを保持し続ける
- `isTextlogPreviewModalOpen()` は `true` を返す（内部的 stale）
- user が何かクリックしても、modal は root 内にないので action-binder の
  delegated listener に届かない（confirm が不意発火する経路はない）
- 次に open / close / Escape が呼ばれると `closeTextlogPreviewModal()` が呼
  ばれて `activeModal = null` に self-heal

**評価**: **B** — observable な corruption は無いが、reducer との整合性を保
つため sync から auto-close するのが理想。コスト低。preview == commit の契約
は現状でも壊れていない（detach された modal の confirm は不発火）。

**望ましい解決方法**:

P1-1 の `text-to-textlog-modal.ts` と同じパターンで、`AppState.textlogSelection`
と modal の生死を連動させる。具体的には:

- `renderer.ts` に `syncTextlogPreviewModalFromState(state, root)` を呼ぶ 1 行を
  追加
- `textlog-preview-modal.ts` に sync 関数を追加:
  - `state.textlogSelection === null` **かつ** `activeModal !== null` ならば
    `closeTextlogPreviewModal()` を呼ぶ
  - 既に detach されているかもしれないので `isConnected` チェックも追加

AppState の新フィールドは不要（`textlogSelection === null` を監視するだけ）。
reducer 追加も不要。

**実装コスト**: 低（~30 行 production + ~80 行 tests）

**テスト方針**:
- `SELECT_ENTRY` を別 lid にすると modal が閉じる
- `BEGIN_EDIT` で modal が閉じる
- `DELETE_ENTRY` で modal が閉じる
- `SYS_IMPORT_COMPLETE` で modal が閉じる
- 同一 lid の SELECT_ENTRY では modal は閉じない
- orphan detach 後の自動 close も動作する

### 4.2 `slash-menu.ts`

**持っている state**:

- `WeakMap<HTMLElement, ActiveSlashMenu>` — per-root instance map
- `activeRoot: HTMLElement | null` — 「今どの root の menu が visible か」
- `assetPickerCallback` — `/asset` コマンド用の callback 参照

**操作フロー**:

1. user が `/` を textarea に入力 → `openSlashMenu(textarea, slashPos, root)`
2. 矢印 / 文字入力でフィルタ
3. Enter / Tab / click で確定 → insert → close
4. Escape / click-outside / open-another で close

**stale 化しうる経路**:

| 経路 | 現状の close 担保 |
|------|------------------|
| Escape | ✓ |
| click-outside | ✓ line 2647+ |
| open-another root | ✓ `openSlashMenu` の冒頭で `closeSlashMenu()` |
| action-binder teardown | ✓ |
| item insert | ✓ 各 onSelect 末尾で close |
| **state 変更で render → detach** | self-heal（textarea 自体が消える） |

**実害評価**:

slash-menu は **textarea に bind された popover** である。renderer が
`root.innerHTML = ''` を実行すると textarea 自体が消える。menu も消える。
次回 open 時に `closeSlashMenu()` が singleton を null にする。**self-heal
する**。

さらに、slash-menu は既に `WeakMap<root, Instance>` 方式で、pure module
singleton よりも堅牢（multi-root シナリオにも対応可）。

**評価**: **C** — 触らない。per-keystroke の超 transient UI で、reducer 編
入は overkill。clear hook も不要。

### 4.3 `asset-picker.ts`

**持っている state**: popover DOM + cursor replacement range + filter 状態。

**操作フロー**: slash-menu とほぼ同じ — user が `/asset` をトリガーに開く →
image asset を選択 → markdown 挿入 → close。

**stale 化しうる経路**:

| 経路 | 現状の close 担保 |
|------|------------------|
| Escape | ✓ |
| click-outside | ✓ line 2656+ |
| open-another | ✓ `openAssetPicker` 冒頭で `closeAssetPicker()` |
| insert | ✓ |
| action-binder teardown | ✓ |

**実害評価**: slash-menu と同じ。`root.innerHTML = ''` で textarea + popover
が detach され、singleton pointer は stale するが next open で self-heal。

**評価**: **C** — 触らない。

### 4.4 `asset-autocomplete.ts`

**持っている state**: popover DOM + query range + filter 状態。

**操作フロー**: user が `(asset:` をタイプ → query 補完 popover → Enter/Tab
で key 挿入 → close。

**stale 化しうる経路**: asset-picker と同じパターン。

**評価**: **C** — 触らない。asset-picker と同じ理由。

## 5. 分類サマリ

| 対象 | 分類 | 実装コスト | 優先度 |
|-----|------|-----------|-------|
| `textlog-preview-modal.ts` | **B**（clear hook 追加） | 低（~30 行 + test） | 中 |
| `slash-menu.ts` | **C**（現状維持） | 0 | — |
| `asset-picker.ts` | **C**（現状維持） | 0 | — |
| `asset-autocomplete.ts` | **C**（現状維持） | 0 | — |

P1-1 で処置済み 2 件 (`text-to-textlog-modal.ts`, `textlog-selection.ts`) と
合わせ、**reducer 編入の新規候補は 0 件**。これは「A 分類対象なし」と表現で
きる。

## 6. 今すぐ reducer 編入すべきもの

**なし**。

残った `textlog-preview-modal.ts` も、実害が観測されない stale（renderer の
DOM 置換で self-heal）のため、reducer 編入よりも **renderer-driven auto-close
hook** の方が妥当。

## 7. 推奨する次実装

1 タスクだけ。

### 7.1 `textlog-preview-modal` の auto-close sync

**目的**: `textlogSelection` が reducer で null になった瞬間に、modal の
singleton pointer を切る。singleton を触らない設計変更。

**変更範囲**:

- `src/adapter/ui/textlog-preview-modal.ts`: `syncTextlogPreviewModalFromState(state)`
  追加。`state.textlogSelection === null && activeModal !== null` のとき
  `closeTextlogPreviewModal()` を呼ぶ。orphan detach も `isConnected` で
  検知して self-heal。
- `src/adapter/ui/renderer.ts`: `render()` 末尾に `syncTextlog...()` 呼び出
  しを 1 行追加（`syncTextToTextlogModalFromState` と同じ位置）。
- `tests/adapter/entry-window-entries-refresh.test.ts` 等と同じパターンで、
  `SELECT_ENTRY` 別 lid / `BEGIN_EDIT` / `DELETE_ENTRY` / `SYS_IMPORT_COMPLETE`
  で閉じることを test で固定。
- 同一 lid の SELECT_ENTRY では閉じないことも固定。

**AppState 追加なし / reducer 追加なし / Revision field 追加なし**。純粋に
UI 層の sync hook。

**コスト**: ~30 行 production + ~80 行 tests。30 分程度。

**backward compatibility**: 既存の close 経路は全て維持。新しく追加されるの
は「reducer の `textlogSelection === null` でも自動で閉じる」という 1 経路
のみ。

### 7.2 実装しない方がよいもの

- **slash-menu / asset-picker / asset-autocomplete**: reducer 編入も clear
  hook も不要。stale しても self-heal する設計であり、観測される user-visible
  corruption は無い。触るとむしろ複雑化する。
- `textlog-preview-modal` の **reducer 編入（A）**: `activeModal` は純粋に
  DOM 参照のみ、identity は `textlogSelection` で既に持たれている。state に
  mirror する意義がない。

## 8. この先の順序

監督の判断を踏まえれば、**7.1 のみを実装して UI singleton のフェーズを締め
る** のが最小投資で最大効果。

これが済むと、PKC2 の UI singleton は:

- A 分類（reducer owned / forward cached）: 2 件（P1-1 で処置済み）
- B 分類（clear hook）: 1 件（7.1 で処置）
- C 分類（触らない）: 3 件

となり、**stale-leak 系の observable bug が存在しない状態**が担保できる。

## 9. 参考コード位置（調査時に辿った箇所）

- Escape 優先順位: `src/adapter/ui/action-binder.ts:1561-1594`
- click-outside handler: `src/adapter/ui/action-binder.ts:2647+`
- bindActions teardown: `src/adapter/ui/action-binder.ts:3276+`
- renderer の DOM 置換: `src/adapter/ui/renderer.ts:111`（`root.innerHTML = ''`）
- P1-1 sync パターン（模範）: `src/adapter/ui/text-to-textlog-modal.ts`
  の `syncTextToTextlogModalFromState`

## 10. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-13 | 初版（P1-1 完了後の残 singleton 棚卸し） |
