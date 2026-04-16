# Find & Replace — v1.1 Behavior Contract

Status: ACCEPTED
Created: 2026-04-16
Category: B. Editor UX / Contracts
Related: docs/development/text-replace-current-entry.md, docs/manual/05_日常操作.md §「本文の検索・置換」, src/features/text/text-replace.ts, src/adapter/ui/text-replace-dialog.ts
Supersedes: —
Scope: current TEXT entry body に対する Find & Replace の v1.1 behavior contract を補助 spec として固定

---

## 1. 目的と位置づけ

### 1.1 本書の目的

S-26（Find & Replace ダイアログ導入）と S-27（Selection only オプション追加）によって成立した
**current-entry Find & Replace** を、v1.1 の behavior contract として 1 本に固定する。

本書は実装説明ではなく **behavior contract** である：

- どの操作が何をするかの最小仕様
- どの条件で操作が効くか／効かないか
- 周辺状態（dirty / preview / commit / undo）との関係
- 意図的に v1.1 でサポートしないこと
- 次期拡張が守るべき additive 境界

### 1.2 Canonical spec との関係

本 contract は canonical spec（`data-model.md` / `body-formats.md` / `schema-migration-policy.md` 等）の
**下層** に位置する **補助 spec** である。

- canonical spec: データ・スキーマ・変換・互換性の正規定義
- 本 contract: UI 上の操作体験と安全境界の固定

`RelationKind` や `schema_version` といった永続スキーマには一切触れない。
本 contract の変更は production code の振る舞いに影響しうるが、永続データ形式には波及しない。

### 1.3 バージョン境界

- **v1.0**: S-26 が提供した current-entry Find & Replace 最小実装
- **v1.1**: S-27 で Selection only を追加した現時点の契約（**本書はこの v1.1 を固定する**）
- **v1.x**: additive な拡張（status 文言改善、キーバインド追加など）は v1.x 内に収まる
- **v2**: textlog 対応 / broader replace / global replace は v2 以降のテーマ（§8 参照）

## 2. 対象

### 2.1 対象となる surface

本機能が有効となるのは **current TEXT entry の編集中 body textarea** のみ。

| 条件 | 要求 |
|-----|------|
| AppPhase | `'editing'` |
| entry.archetype | `'text'` |
| target DOM | `<textarea data-pkc-field="body">` |
| target location | center pane の editor（renderer 経由でマウント） |
| access mode | editable workspace（readonly / historical でない） |

上記すべてが満たされたときにのみ：

- action bar に `🔎 Replace` ボタンが描画される
- ボタン押下で `openTextReplaceDialog(textarea, root)` が呼ばれる
- ダイアログが `#pkc-root` の末尾に attach される

条件が 1 つでも欠けると、trigger 自体が存在しないため dialog は開かない。

### 2.2 live textarea であること

本機能は live な textarea DOM 要素の `.value` を直接書き換える：

- `activeTextarea` は open 時点で DOM にマウントされている textarea を保持
- その textarea が dialog open 後に DOM から外されても、dialog は閉じるまで同じ textarea 参照を使い続ける
- dialog 内での Apply は `textarea.value` への assignment + `new Event('input')` dispatch で完結する
- AppState / Container / reducer には一切触れない

この挙動の帰結として：

- Apply は **編集中の中間状態** のみを更新し、永続化は既存の commit-edit 経路（Save ボタン / Ctrl+S）に完全に委譲する
- Cancel（Esc / Cancel ボタン / edit mode の離脱）で Apply 済みの変更もすべて破棄される
- AppState.editingLid の切替 / phase 遷移はダイアログには伝播しない（ダイアログが自力で閉じる責任は持たない；unmount は user action で行う）

## 3. 非対象

### 3.1 field スコープ

以下の field は v1.1 では対象外：

| field | 理由 |
|------|------|
| `entry.title` | 短文 / 単一行 / 別用途（ナビゲーション・検索 index の源）のため |
| `entry.source_url` | 構造化 URL 値であり free-form text ではない |
| `entry.tags`（categorical relation 経由） | relation 側の構造化データ |
| `entry.created_at` / `updated_at` | 自動管理のタイムスタンプ |

title / source_url / tags の置換要求が来た場合は **v2 以降の別テーマ** として扱う。
v1.1 のダイアログは body textarea にしか作用しない。

### 3.2 archetype スコープ

TEXT 以外の archetype では Replace ボタンが描画されないため、ダイアログは開かない：

| archetype | 理由 |
|-----------|------|
| `textlog` | 別 UI（追記欄 / log 行単位 viewer）・時系列構造・`log.id` / `flags` 等の別 metadata 有り。replace 単位の設計が TEXT と異なる |
| `todo` | body が JSON（`{ status, description, date?, archived? }`）。free-text ではない |
| `form` | body が JSON（form 構造）。free-text ではない |
| `attachment` | body は asset reference + メタ。ユーザは基本編集しない |
| `folder` | body は markdown description（副次的）。replace 対象にする価値は低い |
| `generic` / `opaque` | runtime 内部・未解釈データ |

**block editor** は v1.1 では実装されておらず、導入時に別途 contract を再定義する。

### 3.3 access mode スコープ

以下のモードでは trigger が描画されないため、ダイアログは開けない：

- **readonly workspace**（`AppState.readonly === true`）: 編集モード自体に入れない
- **historical revision viewer**: 過去リビジョンの閲覧は read-only。現在状態に反映するには **復元** を使う
- **preservation viewer** / **selected-only export viewer**: clone された read-only 状態

### 3.4 orchestration スコープ

v1.1 では以下の orchestration は非対象：

- **global replace**: 複数 entry を跨いだ置換
- **multi-entry replace**: サイドバー複数選択に対する置換
- **cross-archetype replace**: textlog + TEXT を同時に対象にする置換
- **container-wide search-replace**: Container 全体を対象にした検索 + 置換

これらは v1.1 の「current-entry only」という安全境界を壊すため v2 以降で別テーマ扱い。

## 4. Option semantics

### 4.1 オプション一覧

v1.1 のダイアログが提供する入力・オプション：

| オプション | 既定 | 役割 |
|-----------|-----|-----|
| `Find` text input | — | 検索文字列 / RegExp source |
| `Replace with` text input | `''` | 置換文字列 |
| `Regex` checkbox | OFF | Find を `RegExp` として解釈するか |
| `Case sensitive` checkbox | OFF | 大文字小文字を区別するか |
| `Selection only` checkbox | OFF（選択がある場合のみ enable） | 範囲内に操作を限定するか |

Apply / Close / Escape / backdrop click のボタン・操作仕様は §6 で扱う。

### 4.2 オプションの組み合わせ

4 つの checkbox オプションは互いに直交（orthogonal）：

- Regex ON × Case sensitive ON × Selection only ON の全組み合わせが許容される
- あるオプションが他のオプションの意味を変えることはない（例: Selection only ON は対象範囲を狭めるだけで、regex の解釈を変えない）

### 4.3 Gating 契約

以下のいずれかに該当すると Apply ボタンは **disabled**：

| 条件 | 状態行の文言 | エラー表示 |
|-----|------------|-----------|
| Find 欄が空 | `Enter text to find…` | なし |
| Regex ON で invalid な pattern | `Invalid regex: <engine message>` | `data-pkc-error="true"` |
| hit count が 0 | `No matches in <scope>.` | なし |

`<scope>` は Selection only の状態に応じて `current entry` / `selection` に切り替わる。
Apply が disabled の状態で defensive に click しても、Apply 処理は query/range 側でも再度 guard されるため実害はない。

### 4.4 Regex ON / OFF の挙動差

Find 欄の解釈：

| Regex | Find の扱い |
|-------|------------|
| OFF | リテラル文字列。RegExp メタ文字（`\ ^ $ . * + ? ( ) [ ] { } |`）は escape されて文字として検索 |
| ON | JavaScript `RegExp` source。`g` flag 常時付与、Case OFF なら `i` も付与 |

Replace with の解釈：

| Regex | Replace with の扱い |
|-------|--------------------|
| OFF | リテラル文字列。`$` は escape されるため `$1` は文字列 `$1` として挿入される |
| ON | `String.prototype.replace` の規則に従う。`$&` / `$1` / `$<name>` 等の back-reference が有効 |

この差は **plain user の誤操作防止** を優先する設計：

- Regex OFF のユーザが `$1` を検索結果に含めようとして back-reference に誤解釈される事故を防ぐ
- Regex ON は明示的 opt-in なので、back-reference 等の規則は習熟済みと仮定して標準挙動

invalid regex は `RegExp` コンストラクタがスローした例外を文字列化して status 行にそのまま表示する。

## 5. Selection semantics

### 5.1 snapshot タイミング

Selection only オプションは **ダイアログを開いた瞬間** の textarea selection を 1 度だけ snapshot する：

- `openTextReplaceDialog` 入口で `textarea.selectionStart` / `textarea.selectionEnd` を読む
- overlay を mount する **前** に読む（mount は focus を奪い textarea の視覚的選択を外すため）
- `end > start` であれば `SelectionRange { start, end }` として `DialogState.range` に保持
- `end <= start` または数値でない場合は `null`（= Selection only は使えない状態）

snapshot は dialog セッション中のみ生存し、dialog を閉じると破棄される。

### 5.2 再キャプチャしない契約

ダイアログを開いた後にユーザが textarea を再度クリックして別の範囲を選択しても、
**v1.1 では元の snapshot を保持し続ける**。

- dialog open 中は Find / Replace inputs に focus が留まる設計
- ユーザが textarea を再選択するには dialog を閉じる必要がある
- この制約を緩めて「live selection」モードを追加することは v2 以降の検討対象（§8）

結果として「選択範囲を変えたいときは一度 Close → 選択し直す → 再 open」が v1.1 の正規フロー。

### 5.3 無効化条件

`DialogState.range === null` のとき、Selection only checkbox は以下の状態になる：

- `disabled = true`
- `title = 'No selection in the body textarea'`
- checked にしても `activeRange()` は `null` を返すため、全文モードとして振る舞う

### 5.4 Apply 後の range shift

Selection only ON で Apply を実行し、置換で範囲内のテキスト長が変わった場合：

1. `oldValue = textarea.value` を取得
2. `replaceAllInRange(oldValue, start, end, ...)` で `next` を得る
3. `delta = next.length - oldValue.length` を計算
4. `newRange = { start, end: end + delta }` として `DialogState.range` を更新
5. `textarea.setSelectionRange(newRange.start, newRange.end)` で textarea 側 selection も追従

この shift により、**連続 Apply は常に同じ論理範囲**（= 元の選択範囲が置換で変形したもの）を対象にする。

### 5.5 範囲外の不変性

Selection only ON の Apply は `body.slice(0, start) + replaced + body.slice(end)` のスティッチで組み立てるため、
範囲外のテキストはバイト単位で完全に不変。

この不変性は `replaceAllInRange` pure helper の契約として `features/text/text-replace.ts` で保証されている。

## 6. State interaction

### 6.1 textarea 書き換え

Apply は以下の順序で textarea を更新する：

1. 新しい body 文字列 `next` を計算
2. `next === oldValue` なら no-op として即 return（0 ヒット時の defensive guard）
3. `textarea.value = next` で値を上書き
4. `textarea.dispatchEvent(new Event('input', { bubbles: true }))` で input event を発火
5. Selection only ON なら `setSelectionRange` で範囲を再指定
6. `rerun()`（= `updateStatus` 再評価）で hit count を 0 等に反映

`execCommand('insertText')` は使わない — replace は非連続な複数挿入・削除を含むため、
単一の `.value` assignment + 合成 input event のほうが決定的。

### 6.2 dirty / preview / commit-edit フロー

Apply で発火される `input` event は、既存の編集中フローと **完全に同じ経路** を通る：

| 観測者 | Apply が観測される経路 |
|-------|---------------------|
| dirty state 検知 | textarea の input listener 経由 |
| markdown preview の debounce 更新 | `handleTextEditPreviewInput` 経由 |
| Save / Cancel ボタンの活性状態 | 通常のキー入力と同じ |
| commit-edit (`Ctrl+S`) | 最終 textarea.value を読んで dispatch |

これにより：

- Apply 後に Save を押せば、置換済みの本文が `COMMIT_EDIT` で永続化される
- Apply 後に Cancel を押せば、**Apply での変更もまとめて破棄される**
- Apply 単体ではリビジョンは作られない（commit されるまで revision スナップショットは走らない）

ダイアログを閉じる操作（Close / Esc / backdrop）は Apply / Cancel のどちらも行わない。
単に UI を消すだけで、これまで Apply 済みの内容は textarea に残る。

### 6.3 Undo 契約

v1.1 では **独自の undo 機構は実装しない**：

- dialog 内に Undo ボタンはない
- `Ctrl+Z` ハンドリングも追加しない
- Apply 後に取り消したい場合は **Cancel（edit mode 離脱）で全体破棄** するのが正規フロー

Browser native な undo stack は `.value` assignment では原則更新されない（execCommand 経路を使わないため）。
この挙動は意図されたもの：

- 複数回 Apply で得た中間状態を個別に巻き戻したい要求が来たら v2 で検討する
- v1.1 では「Cancel か Save の二択」という単純化された終了契約を優先する

### 6.4 AppState / Container / reducer 非依存

ダイアログは以下に一切触れない：

- `AppState.*` の field（読み取りも書き込みも行わない）
- `dispatcher.dispatch()` / `dispatcher.onState()`
- `Container.entries[*].body` の永続表現
- `Revision` / `Relation` の生成

唯一の side effect は `textarea.value` と `input` event の発火。
これにより編集中フローの他のどの経路とも干渉しないことが保証される。

## 7. Intentionally unsupported (v1.1)

以下は v1.1 では実装しない。将来の拡張テーマとして個別に検討する。

| 機能 | 理由 / 将来の扱い |
|-----|------------------|
| Replace next / Replace prev ナビゲーション | v1.1 は一括 Replace All のみ。逐次は次テーマ |
| Find の hit position ハイライト | textarea 内 visual highlight の実装コストが高い |
| textarea 内 複数 discontiguous selection | DOM textarea は単一 selection のみ |
| Whole word / word boundary option | regex の `\b` で代用可能、option 追加は見送り |
| Preserve case（`Foo` → `Bar` で `FOO` → `BAR` 等） | 仕様が多分岐、v1.1 scope 外 |
| Multiline toggle | JS `RegExp` の `m` フラグ UI 公開は v2 検討 |
| Undo / Redo 専用 UI | §6.3 参照 |
| Slash command `/replace` | command surface 統合は別テーマ |
| Command palette 統合 | 同上 |
| title / source_url / tags への拡張 | §3.1 参照、v2 以降 |
| textlog / form / attachment / folder の body 対応 | §3.2 参照、archetype 別設計が必要 |
| multi-entry / global replace | §3.4 参照、v2 以降 |
| live selection mode（open 後の再選択に追従） | §5.2 参照、v2 検討 |

## 8. Future extension boundary

v1.1 の contract を **壊さずに** 拡張する方針：

### 8.1 additive 原則

- 新しい option は既存 option の意味を変えない形で追加する
- 既存 option の default を変えるのは **breaking change**（v2 以降のみ許容）
- status 文言の literal 一致を前提にするテストは書かない（`toContain` / `toMatch` を使う）
- pure helper に新 signature を足す場合は既存 function を温存した additive 追加にする（S-27 で採用したパターン）

### 8.2 次のテーマ分割予定

| テーマ | 分類 |
|-------|-----|
| textlog 向け限定 replace の可否調査 | docs-only |
| textlog replace の最小実装 | v2 実装テーマ（別契約） |
| broader replace（複数 entry スコープ） | v2 実装テーマ |
| global replace（container 全域） | v2 以降、慎重設計 |

v1.1 → v2 への跨ぎで壊れうる項目を事前に明示：

- Selection only の snapshot タイミング（§5.1）は live selection モード追加時に意味が変わりうる
- §3.4 の「orchestration スコープ非対象」は v2 で崩れる想定

### 8.3 canonical spec への昇格条件

本 contract を canonical spec（`docs/spec/` の他文書と同格）に昇格させる必要が生じるのは、
以下のいずれかに該当した時点とする：

- replace 操作が AppState / reducer / Container に直接作用するように設計が変わったとき
- replace が永続スキーマ（entry.body の構造 / Relation の新 kind 等）に波及するとき
- 複数 archetype を跨ぐ orchestration が導入されたとき

それまでは本書は **補助 spec** に留める。

## 9. 関連ドキュメント

| ドキュメント | 関係 |
|------------|------|
| `docs/development/text-replace-current-entry.md` | 実装寄りの dev doc（S-26 / S-27 の実装メモ）。本書は同 doc の behavior contract 側を昇格させたもの |
| `docs/manual/05_日常操作.md` §「本文の検索・置換」 | ユーザ向け操作ガイド。本書の意図を non-contract な平易文で説明 |
| `docs/manual/09_トラブルシューティングと用語集.md` | Find & Replace / Plain Search / Regex / Current Entry / Historical Revision 用語定義 |
| `src/features/text/text-replace.ts` | `buildFindRegex` / `countMatches` / `replaceAll` / `countMatchesInRange` / `replaceAllInRange` の pure helper 実装 |
| `src/adapter/ui/text-replace-dialog.ts` | overlay singleton + selection lifecycle の実装 |
| `docs/planning/USER_REQUEST_LEDGER.md` §1 S-26 / S-27 | User request 履歴 |

---

## 10. 位置づけサマリ

- **状態**: v1.1 として固定（S-26 + S-27 時点）
- **更新条件**: breaking な契約変更があったら本書を bump（v1.2 / v2）、additive 拡張は本書を部分追記で吸収
- **本書の読者**: 次テーマを担当する Claude セッション、および仕様レビュアー
- **本書が守るもの**: 「current TEXT entry body only」の安全境界、option orthogonality、state non-interference
