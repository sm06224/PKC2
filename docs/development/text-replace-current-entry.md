# Text Replace — Current TEXT Entry Body

Status: COMPLETED 2026-04-16
Related: `src/features/text/text-replace.ts`, `src/adapter/ui/text-replace-dialog.ts`, `src/adapter/ui/action-binder.ts`, `src/adapter/ui/renderer.ts`, `tests/features/text/text-replace.test.ts`, `tests/adapter/text-replace-dialog.test.ts`

---

## 目的

現在開いている TEXT entry の body に対して、最小ダイアログで find / replace を実行できるようにする。
scope を厳密に絞り、Global replace / textlog / block editor / title 置換など事故しやすい領域には広げない。

## Scope (v1)

### 対象

- **current selected TEXT entry の body textarea** のみ（`data-pkc-field="body"` かつ `entry.archetype === 'text'`）
- 編集モード（`phase === 'editing'`）中のみトリガー可能
- readonly workspace は action bar に「Edit」ボタン自体が出ないため、dialog もトリガー不可
- historical revision viewer は phase が 'editing' にならないため同上

### 非対象（意図的に v1 外）

- title / source_url / tags の置換
- textlog entry の置換
- form / folder / attachment の置換
- block editor 対応
- 全 entry 一括置換・複数 entry 選択
- Replace Next / Replace All の両立（今回は一括 Replace All のみ）
- whole word / multiline toggle / preserve case
- 置換結果 body 全ハイライト
- slash command / command palette 統合
- undo 基盤の再設計

## UI

- Edit 中の action bar に `🔎 Replace` ボタンを追加（TEXT archetype のみ）
- クリックで overlay dialog を表示
- dialog の構成：
  - `Find` テキスト入力
  - `Replace with` テキスト入力
  - `Regex` checkbox
  - `Case sensitive` checkbox
  - 状態表示行（hit count / エラー / empty hint）
  - `Close` / `Apply` ボタン
- Enter キーで Apply（Apply が有効な場合のみ）
- Escape キーでダイアログを閉じる（`stopPropagation` で edit cancel に伝播しない）
- Close / backdrop クリックで閉じる
- 閉じたあと body textarea にフォーカスを戻す

## Option semantics

| オプション | 効果 |
|-----------|------|
| Regex OFF | Find 文字列を **リテラル** として扱う。RegExp メタ文字は escape される |
| Regex ON | Find 文字列を JavaScript `RegExp` source として解釈。invalid なら即エラー表示 + Apply 無効 |
| Case OFF | `gi` フラグ（デフォルト） |
| Case ON | `g` フラグのみ |
| Selection only OFF（既定） | 現在の body 全文を対象にする |
| Selection only ON（S-27 / 2026-04-16） | ダイアログを開いた時点で textarea に選択範囲があった場合にのみ有効化。count / replace を `body.slice(start, end)` 内に限定 |

### Selection only の挙動詳細

- **範囲キャプチャ**: `openTextReplaceDialog` 時に `textarea.selectionStart` / `selectionEnd` を snapshot し、`DialogState.range` に保存する。ダイアログを開いた瞬間の範囲で固定される（以降の textarea 外クリック・focus 変化で視覚的に選択が外れても範囲は保持される）
- **無効化条件**: 開いた時点で選択が空（`start === end` / 非数値 / null）ならチェックボックスは `disabled` 表示。以降 enable できない（ダイアログを閉じて選択し直してから再度開く必要がある）
- **ステータス行**: ON 時は `N match(es) will be replaced in selection.` / `No matches in selection.`、OFF 時は従来どおり `... in current entry.`
- **Apply 後の range 追従**: 置換で選択スライスの長さが変わった場合、`newRange = { start, end: end + (newLen - oldLen) }` で更新し、textarea 上の selection も同じ範囲に `setSelectionRange` で再指定。連続 Apply は常に新しいスライスのみを対象にする
- **Regex / Case との直交**: Selection only は他のオプションと独立に組み合わせ可能。invalid regex ガード / 0 ヒット ガードは ON / OFF いずれでも維持される
- **pure helper**: `countMatchesInRange` / `replaceAllInRange`（`features/text/text-replace.ts`）が内部の切り出し + スティッチを担う。dialog 側は range の保持と view の更新だけを行う

### Replacement 文字列

- **Regex OFF**: `$` は **literal** として扱う（`$1` はそのまま `$1` 文字列を挿入）
- **Regex ON**: JS 標準の `$&` / `$1` / `$<name>` back-reference を honor

### Apply の挙動

- `Find` が空、または invalid regex → Apply 無効
- hit count が 0 → Apply 無効（button disabled）
- hit count > 0 → Apply 有効、クリックで textarea.value を一括置換
- Apply 後：
  - `textarea.dispatchEvent(new Event('input'))` を発火（既存の preview debounce / dirty 状態検知が自動的に動く）
  - dialog は閉じず、hit count が 0 に再評価される
  - ユーザーは同 dialog で次の検索／置換をそのまま継続可能

## Safety

- Readonly / historical revision では action bar に trigger が出ないため dialog は開けない
- Invalid regex 時は Apply が disabled、エラーメッセージを inline 表示
- Plain mode で `$1` 等の replacement が back-reference として誤解釈されないよう replacement literal を escape
- 連続 open で overlay がスタックしないよう、2 度目の open では既存 overlay を unmount
- dirty state / Save / Cancel / commit-edit は既存経路のまま動作（ダイアログは textarea.value を書き換え + input event を発火するのみ）

## v1 intentionally unsupported

- 置換の **Undo 専用 button**（既存の edit Cancel で editor を閉じれば破棄される前提）
- ~~範囲選択内の部分置換~~（**S-27 / 2026-04-16 で Selection only として追加済み**）
- Find の hit position ハイライト
- Find next / Find prev ナビゲーション
- 変更件数のログ保存
- Slash command `/replace` からの起動
- ダイアログ開後に選択範囲を切り替える UI（キャプチャは open 時の 1 回きり）
- 複数 discontiguous selection / multi-cursor

## Test coverage summary

### `tests/features/text/text-replace.test.ts`（31 件、うち S-27 で +11）

pure helper：

- `buildFindRegex`: 空 query / plain mode escape / `gi` vs `g` フラグ / valid regex / invalid regex（6 件）
- `countMatches`: plain case-insensitive / plain case-sensitive / regex / 空 query / invalid regex / no-match（6 件）
- `replaceAll`: plain case-insensitive / plain case-sensitive / regex back-reference / replacement 内 `$` escape（plain）/ 空 query / invalid regex / no-match / 空 replacement（8 件）
- `countMatchesInRange`（S-27）: 範囲内カウント / 空 range / 無効 range / case 感度 / regex モード（5 件）
- `replaceAllInRange`（S-27）: 範囲内置換とスティッチ / 範囲内 0 ヒット no-op / 空 range / 無効 range / regex back-reference / 長さ変化する置換（6 件）

### `tests/adapter/text-replace-dialog.test.ts`（24 件、うち S-27 で +9）

integration（happy-dom）：

- 非 body textarea は無視
- open 時の focus / 空 query hint / Apply 初期 disabled
- case insensitive / case sensitive hit count
- regex mode hit count
- invalid regex エラー + Apply disabled
- no matches 時 Apply disabled
- plain replacement → textarea 更新 + `input` event 発火
- regex back-reference 置換
- hit 0 で Apply 叩いても no-op
- Close button で閉じる
- Escape で閉じる + `stopPropagation`
- 閉じたあと body textarea に focus 戻る
- 2 回 open で overlay スタックしない

Selection only 関連（S-27、+9 件）：

- 選択なしで開くと Selection-only checkbox が `disabled`
- 選択ありで開くと Selection-only checkbox が `enabled`
- ON 時は範囲内のみカウント（status 文言も `in selection.` に切替）
- OFF 時は従来どおり全文カウント（status 文言は `in current entry.`）
- ON 時の Apply は範囲内のみ置換、範囲外は不変
- 連続 Apply で range が shift（2 回目は短くなった範囲内に留まる）
- regex mode + Selection only の組み合わせ
- invalid regex ガードが Selection only ON でも維持される
- Apply 後に `input` event が発火（dirty / preview hook 維持）

## 既存挙動への影響

- action bar：既存 Save / Cancel の**後に** `🔎 Replace` ボタンを追加（TEXT archetype のみ、他 archetype では従来通り）
- action-binder：`open-replace-dialog` ケースを新規追加。既存の `commit-edit` / `cancel-edit` / `begin-edit` はバイト単位で unchanged
- 既存 paste / slash / IME / 通常タイピング経路は影響なし
- ダイアログは reducer / AppState に状態を持たない — 既存の edit セッションと独立
