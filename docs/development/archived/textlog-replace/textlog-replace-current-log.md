# TEXTLOG Replace — Current Log Implementation Notes (S-28; Selection only S-29 / v1.x)

Status: COMPLETED 2026-04-16 (v1) / EXTENDED 2026-04-16 (v1.x: Selection only)
Related: `docs/spec/textlog-replace-v1-behavior-contract.md` (canonical contract), `docs/spec/textlog-replace-feasibility-and-minimum-scope.md`, `docs/development/textlog-replace-current-log-audit.md`, `src/adapter/ui/textlog-log-replace-dialog.ts`, `src/adapter/ui/textlog-presenter.ts`, `src/adapter/ui/action-binder.ts`, `tests/adapter/textlog-log-replace-dialog.test.ts`

---

## 目的

textlog の編集モードで、**1 つの log entry** の text に対して Find & Replace を実行できるようにする。TEXT Replace (S-26/S-27) と同じ pure helper を共有しつつ、dialog / trigger / target / status 文言は textlog 固有の別モジュールで管理する。

本書は behavior contract (`docs/spec/textlog-replace-v1-behavior-contract.md`) の実装メモであり、新たな仕様ではない。

## Scope

### v1 / v1.x 対象

- **target**: `<textarea data-pkc-field="textlog-entry-text" data-pkc-log-id="<id>">` 1 本
- **phase**: `editing` のみ（`renderEditorBody` 内でのみ trigger が描画される）
- **archetype**: `textlog` のみ
- **options**: Find / Replace / Regex / Case sensitive / **Selection only**（v1.x で追加、log 内範囲限定）
- **対象 log**: trigger 起動元の log 1 つ（`data-pkc-log-id` で解決）
- **Selection only の対象**: 起動 log textarea 内の captured range のみ（log 跨ぎは構造的に不可能）

### v1.x 非対象

- whole textlog / selected lines / visible lines
- append area の textarea
- viewer (ready phase) からの trigger
- metadata rewrite (id / createdAt / flags / array order)
- multi-entry / global / cross-archetype replace
- readonly / historical / preservation viewer
- ダイアログ open 後の selection 再キャプチャ（live selection mode は v2 検討）

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

## Selection only (v1.x / S-29)

S-29 で additive に追加。TEXT 側 Selection only と同じ「open 時 1 回キャプチャ → checkbox 切替で count/replace の対象を切り替え → Apply 後は range を delta shift」モデルを log textarea に閉じて適用する。

### 追加された挙動

- ダイアログ open 時、textarea の `selectionStart/End` を snapshot（mount 前）
- captured 範囲が `null`（empty selection / non-numeric）なら checkbox は `disabled`
- checkbox ON 時:
  - status 文言が `... in selection.` に切替
  - count は `countMatchesInRange` で範囲内のみ
  - Apply は `replaceAllInRange` で範囲内のみ書き換え
  - Apply 後 `delta = next.length - oldValue.length` で range を補正、textarea の selection も `setSelectionRange` で追従
- checkbox OFF 時: 既存の current log 全文挙動（status は `... in current log.`）

### 不変条件（v1.x でも維持）

- `log.id` / `log.createdAt` / `log.flags` 不変（textarea には text しか出ない）
- 他 log の text / metadata 不変（dialog は target 1 本のみ参照）
- entries 配列 length / order 不変（collectBody が原本順を再構築）
- append area / viewer sort mode 不変
- 範囲外の本文（`body.slice(0, start)` と `body.slice(end)`）は **byte-identical**

### 共有 helper

`features/text/text-replace.ts` の `countMatchesInRange` / `replaceAllInRange` を再利用。S-27 で TEXT 側 Selection only のために追加した pure helper をそのまま流用しており、textlog 用の追加実装は dialog 側のみ。

## Intentionally unsupported (v1.x)

- whole textlog / selected lines（v2 別契約）
- Replace next / prev
- hit position ハイライト
- slash command / command palette 統合
- viewer phase からの起動
- title / source_url / tags 置換
- multi-entry / global replace
- Undo 専用 UI（edit cancel で全体破棄が正規）
- live selection mode（open 後の再キャプチャ; v2 検討）

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

`tests/adapter/textlog-log-replace-dialog.test.ts`（23 件、happy-dom integration; +10 件は S-29 / v1.x で追加）:

### v1 baseline（13 件）

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

### v1.x Selection only（+10 件）

14. 選択なしで開くと checkbox `disabled`
15. 選択ありで開くと checkbox `enabled`
16. ON 時は範囲内のみ count（status `... in selection.`）
17. OFF 時は current log 全文 count（status `... in current log.`）
18. ON 時 replace は範囲内のみ、範囲外の本文不変
19. 連続 Apply で range が shift し 2 回目も新範囲に留まる（`aa × 4` → `bbbb × 3 + aa` → `c × 3 + aa`）
20. regex + Selection only の組み合わせ
21. invalid regex ガードが Selection only ON でも維持
22. Apply で `input` event 発火（dirty hook 維持）
23. Selection only ON での commit-edit 後も id / createdAt / flags / 配列順が不変

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
