# Entry-ref Autocomplete v1.2 — Textlog Parity + Dangling-Popup Hardening

**Status**: implementation — 2026-04-19.
**Scope**: entry-ref autocomplete を textlog editor フィールドでも発火させ、text と textlog で **author 体験を揃える**。加えて **dangling popup を防ぐ state-listener ベースのクリーンアップ** を追加する。

## 1. 驚くべき前提: infrastructure はすでに textlog を許容している

調査の結果、以下が判明した:

```ts
// src/adapter/ui/slash-menu.ts:88-93
const SLASH_ELIGIBLE_FIELDS = new Set([
  'body',
  'todo-description',
  'textlog-append-text',   // ← 既に登録
  'textlog-entry-text',    // ← 既に登録
]);
```

`action-binder.ts:2398` の入力ゲートは `target instanceof HTMLTextAreaElement && isSlashEligible(target)` のみ。つまり **slash-menu / asset-autocomplete / entry-ref-autocomplete はすべてこのゲートを共有** しており、**textlog フィールドでも既に発火する実装になっていた**。

これは slash-menu 側の配慮で textlog 対応済みだったためで、autocomplete 側は "ゲート共有" の結果として自動的に parity を得ている。

### v1.2 の実質スコープ

| 項目 | 対応 |
|------|------|
| 機能的変更 | **なし**（既に動作中） |
| 回帰防止テスト | **追加**（PR #54/#55 は body しかテストしていないので、将来ゲートを絞り込む変更で textlog が暗黙に落ちるリスクを封じる） |
| dangling popup 問題 | **修正**（本 PR で調査中に発見した別バグ。text / textlog 共通） |
| spec doc | 本文書 |

"機能追加" ではなく **"既存挙動を仕様として固定 + 並走中に見つかったバグを修正"** という位置づけ。

## 2. 対応フィールド（v1.2 で正式サポート宣言）

| field | 場所 | 用途 |
|-------|------|------|
| `body` | text entry editor | v1 で既にサポート |
| `todo-description` | todo entry editor | 既にゲート登録済（今回 test 対象外だが動作） |
| **`textlog-append-text`** | textlog の append 欄 | **v1.2 で正式宣言** |
| **`textlog-entry-text`** | textlog 各 log entry の個別 edit | **v1.2 で正式宣言** |

textlog の個別 log entry textarea は**編集中に複数同時に存在**する（1 log = 1 textarea）。各 textarea は独立した `data-pkc-log-id` を持ち、autocomplete はそれぞれに対して個別にトリガ・挿入できる。

## 3. trigger / insertion の継承

v1 (`(entry:`) と v1.1 (`[[`) の挙動をそのまま継承。フィールドが変わっても:

- **検出ロジック**: `findEntryCompletionContext` / `findBracketCompletionContext` は文字列のみを見るので field-agnostic
- **挿入ロジック**: `insertCandidate` は textarea.value を直接書き換えるので field-agnostic
- **canonical form**: `[label](entry:lid)`（`[[` 展開後）/ `entry:lid`（`(entry:` 展開後）は保存時 textlog JSON の `text` フィールドに markdown そのまま格納される

## 4. textlog 固有の考慮点

### Keyboard precedence（衝突なし）

textlog editor には以下のキーバインドが既にある:
- **Ctrl+Enter**: append log entry
- **Plain Enter + 末尾 `>` 行**: quote assist（blockquote 継続）
- **Plain Enter + 末尾 `=` 行**: inline calc

popup のキーハンドラ（Arrow/Enter/Tab/Escape）は `handleKeydown` の先頭で早期 return するため、**popup が開いている間は textlog 側のキーバインドに流れない**。popup が閉じた状態では通常通り動作。

```
Ctrl+Enter (popup open)     → popup consumes ... wait
```

実際には popup が consume するのは `Arrow* / Enter / Tab / Escape`。**`Ctrl+Enter` は popup handler で非 consume**（`e.ctrlKey` を見ていない）。つまり Ctrl+Enter はポップアップを閉じずに append が走る可能性がある。

v1 / v1.1 でも同じ挙動（body には Ctrl+Enter の独自動作はないので問題化していない）。textlog で顕在化する可能性があるが、UX 上は**ポップアップ選択中に Ctrl+Enter した場合 append が走る**のは `Ctrl` 修飾付きなので**意図的な離脱**と解釈でき、許容範囲。v2 で popup が Ctrl+Enter を吸収する挙動を足す余地はあるが、v1.2 ではスコープ外。

### Dangling popup 問題（共通の実バグ）

popup は `root` の直下に append される。一方 renderer は状態変化時に `root.innerHTML = ''` で全消去する (`renderer.ts:248`)。結果:

- ユーザーが編集中に popup を開く
- Save / Cancel / SELECT_ENTRY などで phase が 'editing' から遷移
- render が走り、textarea も popup DOM も消える
- JS 側の `activePopover` 参照は古い DOM を保持したまま → `isEntryRefAutocompleteOpen()` が stale な true を返し、次回 open 時に `closeEntryRefAutocomplete()` が呼ばれるが `.remove()` は no-op（既に外れている）
- 実害は軽微だが、`activeTextarea` は失効した DOM ノードを保持し続ける → GC を阻害

本 PR では **state listener を action-binder に追加** して、phase が 'editing' から遷移したら全 popup を閉じる。text / textlog 共通の対策。

#### 実装方針

```ts
// bindActions 内
let prevPhase: AppPhase | null = null;
const unsubState = dispatcher.onState((state) => {
  if (prevPhase === 'editing' && state.phase !== 'editing') {
    closeSlashMenu();
    closeAssetPicker();
    closeAssetAutocomplete();
    closeEntryRefAutocomplete();
  }
  prevPhase = state.phase;
});

// cleanup 関数で unsubState() を呼ぶ
```

`BEGIN_EDIT` 側（'ready' → 'editing'）は新規 textarea 生成で自然に新しい popup lifecycle が始まるため、close は不要（むしろ呼ぶと副作用が出る可能性がある）。

### Textlog JSON 往復

textlog は body が JSON（`{ entries: [{ id, text, ... }] }`）。autocomplete は個別 textarea の `value` を書き換えるだけなので、JSON 化は既存の `collectBody()` 側で行われる。autocomplete から見ると **text body と区別なし**。

## 5. テスト観点（追加分）

### 新規テストファイル
`tests/adapter/entry-ref-autocomplete-textlog.test.ts`

- `textlog-append-text` フィールドで `(entry:` トリガが起動する
- `textlog-append-text` フィールドで `[[` トリガが起動する
- `textlog-entry-text` フィールドで `(entry:` トリガが起動する
- `textlog-entry-text` フィールドで `[[` トリガが起動する
- 同 textarea で挿入後 textarea.value が正しく更新される（text と同形）
- popup の DOM region attribute / 選択状態は text と同じ

### 既存ファイル拡張
`tests/adapter/mutation-shell.test.ts` 等: state listener の popup cleanup を検証
- 編集中に popup を開く
- `COMMIT_EDIT` dispatch
- popup が閉じていること（`isEntryRefAutocompleteOpen() === false`）

## 6. 実装構成

| 層 | ファイル | 変更 |
|----|---------|------|
| adapter/ui | `src/adapter/ui/action-binder.ts` | state listener 追加 + cleanup |
| tests | `tests/adapter/entry-ref-autocomplete-textlog.test.ts` | 新規 textlog 対応テスト |
| tests | `tests/adapter/action-binder.test.ts`（または新規）| popup cleanup 回帰テスト |
| docs | `docs/development/entry-autocomplete-v1.2-textlog.md` | 本文書 |

source 変更は **action-binder.ts の 10 行程度**（state listener + unsubscribe）。pure helper / adapter module は無変更。

## 7. 用語整理

本 PR は **既存の "entry-ref autocomplete" を textlog に拡張**するだけで、新しい概念や用語を導入しない。

| 用語 | 位置づけ |
|------|----------|
| `entry-ref autocomplete` | 機能名（v1.2 で textlog も含むと再定義） |
| `(entry:` trigger | v1 既定 |
| `[[` bracket trigger | v1.1 既定 |
| "field parity" | 本 PR の達成概念（text / textlog / todo-description すべてで同じ autocomplete が動く状態） |

"parity" は **暫定の運用語**。将来 form archetype や他 archetype が autocomplete 対応する場合に概念拡張する可能性あり。

## 8. 非スコープ（v2+ 候補）

- **recent-first 並び**（次回 PR 予定、ユーザー合意済）
- **fragment 補完**（`(entry:lid#log/` 等）
- **popup が Ctrl+Enter を吸収する挙動**
- **todo-description フィールドの明示的テスト**（ゲートには入っているが本 PR のテスト対象外、追従は容易）

## 9. Rollback / 互換性

- 機能面: 既存挙動の仕様化のみ。rollback で "未仕様" に戻るだけ
- dangling popup fix: state listener の追加のみ。副作用はゼロ（phase が 'editing' でなければ何もしない）
- `git revert` で完全復元可能
