# TEXTLOG Replace — Current Log Implementation Notes (S-28)

Status: COMPLETED 2026-04-16
Related: `docs/spec/textlog-replace-v1-behavior-contract.md` (canonical contract), `docs/spec/textlog-replace-feasibility-and-minimum-scope.md`, `src/adapter/ui/textlog-log-replace-dialog.ts`, `src/adapter/ui/textlog-presenter.ts`, `src/adapter/ui/action-binder.ts`, `tests/adapter/textlog-log-replace-dialog.test.ts`

---

## 目的

textlog の編集モードで、**1 つの log entry** の text に対して Find & Replace を実行できるようにする。TEXT Replace (S-26/S-27) と同じ pure helper を共有しつつ、dialog / trigger / target / status 文言は textlog 固有の別モジュールで管理する。

本書は behavior contract (`docs/spec/textlog-replace-v1-behavior-contract.md`) の実装メモであり、新たな仕様ではない。

## Scope

### v1 対象

- **target**: `<textarea data-pkc-field="textlog-entry-text" data-pkc-log-id="<id>">` 1 本
- **phase**: `editing` のみ（`renderEditorBody` 内でのみ trigger が描画される）
- **archetype**: `textlog` のみ
- **options**: Find / Replace / Regex / Case sensitive
- **対象 log**: trigger 起動元の log 1 つ（`data-pkc-log-id` で解決）

### v1 非対象

- whole textlog / selected lines / visible lines
- Selection only（TEXT v1.1 にある機能、textlog v1 では未搭載）
- append area の textarea
- viewer (ready phase) からの trigger
- metadata rewrite (id / createdAt / flags / array order)
- multi-entry / global / cross-archetype replace
- readonly / historical / preservation viewer

## v1 behavior

### UI

- 各 `.pkc-textlog-edit-row` の delete ボタン (`✕`) の隣に `🔎` ボタンを追加
- `data-pkc-action="open-log-replace-dialog"` + `data-pkc-log-id="<id>"`
- title: `Find & replace inside this log`

### Dialog

- mount 位置: `#pkc-root` の末尾
- `data-pkc-region="textlog-log-replace-dialog"`
- 構成: Find input / Replace input / Regex checkbox / Case sensitive checkbox / status 行 / Apply + Close ボタン
- CSS クラスは既存 `.pkc-text-replace-*` を再利用（同じ見た目で良い）
- field 名は `textlog-log-replace-find` / `-replace` / `-regex` / `-case` / `-apply` / `-close` で TEXT dialog と衝突しない

### 閉じ方・キーバインド

- Close ボタン / backdrop mousedown / Escape キー（capture phase で `stopPropagation`）
- Enter キーで Apply が enabled なら即発火
- 閉じる際は起動 log textarea に focus を戻す

### Apply 経路

1. `textarea.value` を pure helper `replaceAll` で置換
2. `textarea.value = next` で上書き
3. `new Event('input', { bubbles: true })` を dispatch
4. status 行の hit count を再評価

commit-edit (`Ctrl+S`) 時に既存の `textlogPresenter.collectBody` が各 log textarea から text を取り出し、`serializeTextlogBody` で JSON を再構築する。これにより id / createdAt / flags / 配列順はすべて自動で保護される。

## Invariance（実装で保証される事項）

contract §5 の不変条件は、以下の実装的な帰結として自然に守られる：

| 不変項目 | 実装上の根拠 |
|---------|-------------|
| `log.id` | textarea には text のみ。id は hidden field / presenter 内部で保持 |
| `log.createdAt` | 同上。編集中の UI では read-only span 表示のみ |
| `log.flags` | 別 checkbox (`data-pkc-field="textlog-flag"`) が管理、replace の target 外 |
| 配列 length / order | `collectBody` が `createdAt` 昇順で正規化 |
| 他 log の text | dialog は活性 log textarea 1 本のみ参照 |
| append area | `data-pkc-field="textlog-append-text"`、dialog の target 対象外 |
| viewer sort mode | UI 状態は独立、replace は永続データのみ触る |
| JSON shape | 各 log textarea は独立に render されており、parse→replace→serialize 経路を経由 |

## Intentionally unsupported (v1)

- Selection only（v1.x 追加候補 / contract §4.2）
- whole textlog / selected lines（v2 別契約）
- Replace next / prev
- hit position ハイライト
- slash command / command palette 統合
- viewer phase からの起動
- title / source_url / tags 置換
- multi-entry / global replace
- Undo 専用 UI（edit cancel で全体破棄が正規）

## Shared vs. textlog-specific

**Shared from `src/features/text/text-replace.ts`**:

- `buildFindRegex(query, options)`
- `countMatches(body, query, options)`
- `replaceAll(body, query, replacement, options)`
- `ReplaceOptions` type

**Textlog-specific**:

- Dialog module (`src/adapter/ui/textlog-log-replace-dialog.ts`)
- Trigger rendering (`textlog-presenter.ts renderEditorBody`)
- Action handler (`action-binder.ts open-log-replace-dialog`)
- Status 文言 (`… in current log.`)
- Target resolution (`data-pkc-log-id` + `data-pkc-field="textlog-entry-text"`)
- field / action namespace (`textlog-log-replace-*`)

TEXT dialog (`text-replace-dialog.ts`) は一切書き換えない。

## Test coverage summary

`tests/adapter/textlog-log-replace-dialog.test.ts`（13 件、happy-dom integration）:

1. trigger がすべての log edit row に 1 つずつ描画される
2. 起動 log が `data-pkc-log-id` で正しく解決され dialog が開く / focus が Find input に入る
3. plain case-insensitive replace が current log のみを更新し他 log 不変
4. case-sensitive 動作
5. regex + back-reference が current log に閉じて機能
6. invalid regex で Apply disabled + エラー表示
7. 0 hit で Apply disabled + defensive click が no-op
8. commit-edit 後の body に対して id / createdAt / flags / 配列順が不変
9. Apply が `input` event を発火 (dirty hook が観測可能)
10. 非 log textarea は silent に無視
11. `data-pkc-log-id` 欠落 textarea は silent に無視
12. Escape で閉じる + `stopPropagation` でグローバルに伝播しない
13. readonly workspace では trigger が描画されない（編集モード自体に入れない）

## Future extensions

contract §8 に従う：

- v1.x 候補: log 内 Selection only
- v2 候補: whole textlog / selected lines / Replace next
- いずれも本書の invariance 契約を破壊しない additive 追加として導入する

## 関連ファイル

- 実装: `src/adapter/ui/textlog-log-replace-dialog.ts`, `src/adapter/ui/textlog-presenter.ts`, `src/adapter/ui/action-binder.ts`
- 共有 helper: `src/features/text/text-replace.ts`
- 契約: `docs/spec/textlog-replace-v1-behavior-contract.md`
- 可否調査: `docs/spec/textlog-replace-feasibility-and-minimum-scope.md`
- テスト: `tests/adapter/textlog-log-replace-dialog.test.ts`
