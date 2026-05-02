# TEXTLOG Replace — v1 Behavior Contract

Status: ACCEPTED
Created: 2026-04-16
Category: B. Editor UX / Contracts
Related: docs/spec/textlog-replace-feasibility-and-minimum-scope.md, docs/spec/find-replace-behavior-contract.md, docs/development/completed/textlog-foundation.md, src/features/textlog/textlog-body.ts, src/adapter/ui/textlog-presenter.ts, src/features/text/text-replace.ts
Supersedes: —
Scope: textlog archetype に対する Find & Replace の v1 behavior contract を補助 spec として固定（current log line only）

---

## 1. 目的と位置づけ

### 1.1 本書の目的

`docs/spec/textlog-replace-feasibility-and-minimum-scope.md` の結論（v1 = 粒度 A / current log only）に基づき、textlog 向け Find & Replace の **v1 behavior contract** を 1 本に固定する。

本書は実装説明ではなく **behavior contract** である：

- どの操作が何をするかの最小仕様
- どの条件で操作が効くか／効かないか
- 永続データに対する不変条件（invariance）
- 周辺状態（dirty / preview / commit / undo / 他 log / append area）との関係
- 意図的に v1 でサポートしないこと
- 次期拡張が守るべき additive 境界

実装（production code / dialog UI / pure helper）は本書の確定後に別テーマとして起こす。

### 1.2 関連 doc との関係

| doc | 関係 |
|-----|-----|
| `docs/spec/textlog-replace-feasibility-and-minimum-scope.md` | 本書の出発点。粒度 A 採用 / metadata 不変 / TEXT contract 非破壊 / dialog 別モジュール の方針を本書が contract 化する |
| `docs/spec/find-replace-behavior-contract.md` | TEXT body v1.1 contract。本書は **対称** な contract で、option semantics と pure helper を共有しつつ UI / target / scope は独立に定める |
| `docs/development/completed/textlog-foundation.md` | textlog 全体仕様。本書の不変条件はここで定義された `TextlogBody` / `TextlogEntry` schema を破壊しないことを保証する |

### 1.3 v1 の境界（本書が固定する scope）

- **粒度**: current log line only — 編集モード中、trigger を起動した特定の log entry の `text` のみが対象
- **対象 archetype**: `textlog` のみ（TEXT は別 contract）
- **対象 phase**: `'editing'` のみ
- **メタデータ**: 一切書き換えない（id / createdAt / flags / 配列順）
- **UI 干渉**: 他の log / append area / viewer sort mode に波及しない

v1.x は上記の境界内での additive 拡張のみ。粒度 C（whole textlog）/ Selection only / Replace next 等は v2 以降の別契約。

## 2. 対象

### 2.1 対象となる surface

本機能が有効となるのは **textlog の編集モードにおける、特定 log entry の text textarea** のみ。

| 条件 | 要求 |
|-----|------|
| AppPhase | `'editing'` |
| entry.archetype | `'textlog'` |
| target DOM | `<textarea data-pkc-field="textlog-entry-text" data-pkc-log-id="<id>">` |
| target location | `renderEditorBody` が描画した `.pkc-textlog-edit-row` 内の textarea |
| access mode | editable workspace（readonly / historical / preservation viewer でない） |

上記すべてが満たされたときにのみ：

- 編集モード中の各 log row（または近傍の trigger surface）から Replace 起動を受け付ける
- trigger 起動で `openTextlogLogReplaceDialog(textarea, root)` 相当が呼ばれる（実装テーマで具体化）
- ダイアログが overlay として `#pkc-root` 末尾に attach される

条件が 1 つでも欠けると trigger は描画されず、dialog は開かない。

### 2.2 「current line」の定義

v1 contract の **current** は **trigger を起動した log textarea を指す**。具体的には：

- trigger（Replace ボタン / キーバインド等）には起動元 log の `data-pkc-log-id` が付随する
- dialog open 時にその log id から DOM 内の `<textarea data-pkc-field="textlog-entry-text" data-pkc-log-id="<id>">` を 1 本に解決する
- dialog はこの 1 本の textarea を **dialog セッション中の唯一の対象** として保持する

dialog open 後に他の log row へ focus を移しても、本 dialog の対象は **変わらない**。
別の log を対象にしたい場合は dialog を Close → 別 row の trigger から再 open する。

これは TEXT contract（§5.1 の selection snapshot）と同じ「open 時 1 度だけ捕捉、以後は固定」の原則を **log 単位** に適用したもの。

### 2.3 live textarea であること

- v1 dialog は `activeTextarea` を解決済み 1 本に限定して保持する
- AppState / Container / reducer に状態を持たない
- Apply は `textarea.value = next` + `dispatchEvent(new Event('input'))` のみで完結する
- 永続化は既存の commit-edit 経路（Save ボタン / Ctrl+S）に完全委譲する

## 3. 非対象

### 3.1 log entry のメタデータ

各 `TextlogEntry` のメタフィールドは v1 で **完全不変**：

| field | 不変条件 |
|------|---------|
| `log.id` | replace で書き換えない。任意の Find / Replace 入力でも id は変化しない |
| `log.createdAt` | 同上。textarea 内に偶然 ISO 文字列が含まれていても、それは `text` の一部であり createdAt ではない |
| `log.flags` | 同上。`important` を replace で消したり付けたりは禁止 |

理由：

- これらは log の identity / 表示 / 並べ替え / backlink (`entry:<lid>#log/<id>`) / CSV round-trip の根拠になっている
- 文字列置換でこれらを巻き込むと、JSON 構造の整合性が壊れるか、意味論が静かに変わる

### 3.2 textlog 構造に対する非対象

| 非対象 | 内容 | 理由 |
|-------|-----|------|
| `entries` 配列の順序 | replace で並び替えない | storage は createdAt 昇順 / display は降順、再ソートは責務違反 |
| `entries` 配列の長さ | replace で log を増減しない | line split / merge / 全 log 削除 等は禁止 |
| append area の textarea | 未 commit の下書きは対象外 | append area は編集 phase 外の独立 quick-update 経路 |
| 他 log の `text` | 起動 log 以外の text は変化しない | 「current line only」の核心 |
| viewer の sort mode | replace で表示状態を変えない | display state は永続データの外側 |
| 編集モード外の log（viewer 状態） | replace 対象にしない | trigger は editing phase 限定 |

### 3.3 粒度として v1 で持ち込まないもの

以下は **意図的に v1 に含めない**（粒度比較で却下済み or v2 検討）：

- **whole textlog**（全 log の text を一括置換） — preview UI / undo 戦略が未確定、v2 候補
- **selected lines**（TEXTLOG→TEXT 用 selection mode の流用） — UI 二重用途化の検討が別途必要
- **visible lines**（viewer の sort / filter で見えている log のみ） — display state 依存、永続不採用

### 3.4 archetype / mode の非対象

| カテゴリ | 内容 | 理由 |
|---------|-----|------|
| 他 archetype | TEXT / todo / form / attachment / folder / generic / opaque | TEXT は別 contract、それ以外は free-text body を持たない or 別構造 |
| readonly workspace | `AppState.readonly === true` | 編集モード自体に入れない |
| historical revision viewer | 過去 revision の閲覧 | 編集モード非対応、復元 経由が正規 |
| preservation viewer / selected-only export viewer | clone された read-only 状態 | 同上 |
| TEXTLOG→TEXT 変換 preview 中 | 変換専用 modal が active | replace 起動経路は TEXTLOG → TEXT modal とは排他 |

### 3.5 orchestration の非対象

- **global replace**: 複数 textlog entry をまたぐ
- **multi-entry replace**: サイドバー複数選択に対する
- **cross-entry**: 別 entry を一緒に対象にする
- **cross-archetype**: TEXT + textlog を同一 dialog で扱う
- **container-wide search-replace**: Container 全域

これらはすべて v1 の「current line only」境界を壊すため v2 以降で別テーマ扱い。

## 4. Option semantics

### 4.1 オプション一覧

v1 のダイアログが提供する入力・オプション：

| オプション | 既定 | 役割 |
|-----------|-----|-----|
| `Find` text input | — | 検索文字列 / RegExp source |
| `Replace with` text input | `''` | 置換文字列 |
| `Regex` checkbox | OFF | Find を `RegExp` として解釈するか |
| `Case sensitive` checkbox | OFF | 大文字小文字を区別するか |

### 4.2 v1 / v1.x のオプション搭載状況

- ~~**Selection only** — v1 では非搭載~~ → **delivered v1.x / S-29（2026-04-16）**: log textarea の selection を open 時に snapshot し、ON で `countMatchesInRange` / `replaceAllInRange` を使用、Apply 後 range shift。本書の不変条件（id / createdAt / flags / 配列順 / 他 log 不変）は維持。詳細は `docs/development/archived/textlog-replace/textlog-replace-current-log.md` の Selection only セクション
- **Replace next / Replace prev**: 一括 Replace All のみ（v1.x でも継続非対応）
- **whole word / multiline toggle / preserve case**: TEXT contract と同様に v1.x では非搭載

Apply / Close / Escape / backdrop click 等のボタン挙動は §6 で扱う。

### 4.3 オプションの組み合わせと Gating 契約

3 つの input/checkbox は互いに直交（orthogonal）：

- Regex ON × Case sensitive ON の全組み合わせが許容される
- あるオプションが他のオプションの意味を変えることはない

以下のいずれかに該当すると Apply ボタンは **disabled**：

| 条件 | 状態行の文言（推奨） | エラー表示 |
|-----|-------------------|-----------|
| Find 欄が空 | `Enter text to find…` | なし |
| Regex ON で invalid な pattern | `Invalid regex: <engine message>` | `data-pkc-error="true"` |
| hit count が 0 | `No matches in current log.` | なし |

`<scope>` は v1 では `current log` 固定。**v1.x（S-29）以降は Selection only checkbox が ON のとき `selection` に切り替わる**（OFF / disabled 状態では引き続き `current log`）。
Apply が disabled の状態で defensive に click しても、Apply 処理は再度 guard されるため実害なし。

### 4.4 Regex ON / OFF の挙動差

Find 欄の解釈は TEXT contract と完全同一：

| Regex | Find の扱い |
|-------|------------|
| OFF | リテラル文字列。RegExp メタ文字（`\ ^ $ . * + ? ( ) [ ] { } \|`）は escape されて文字として検索 |
| ON | JavaScript `RegExp` source。`g` flag 常時付与、Case OFF なら `i` も付与 |

Replace with の解釈：

| Regex | Replace with の扱い |
|-------|--------------------|
| OFF | リテラル文字列。`$` は escape されるため `$1` は文字列 `$1` として挿入される |
| ON | `String.prototype.replace` の規則に従う（`$&` / `$1` / `$<name>` 等の back-reference が有効） |

### 4.5 multi-line 跨ぎ防止

v1 contract では replace の評価対象は **1 log の `text` 文字列のみ**。

- regex の match scope は単一 log.text に閉じている（pure helper を log.text に直接適用するため）
- 複数 log の text を結合してから regex を評価する経路は **存在してはならない**
- regex の `\n` / `[\s\S]` 等が複数 log を跨いで match することは構造的に起きない

これは textlog の不変条件（§5）を実装側で担保するための核心制約。

## 5. Invariance contract

v1 の最重要部分。replace 前後で **絶対に変わらない** ものを列挙する。

### 5.1 永続データの不変条件

| 不変項目 | 内容 |
|---------|-----|
| 起動 log の `id` | replace で書き換えない |
| 起動 log の `createdAt` | replace で書き換えない（ISO 文字列が偶然 text に含まれていても無関係） |
| 起動 log の `flags` | `important` 等の付与・解除は replace では起こらない |
| 他 log の `text` | 起動 log 以外の text は変化しない |
| 他 log の `id` / `createdAt` / `flags` | 同上、すべて不変 |
| `entries` 配列の length | replace で log を増減しない |
| `entries` 配列の order | replace で並び替えない（storage 昇順が維持される） |

### 5.2 表示状態の不変条件

| 不変項目 | 内容 |
|---------|-----|
| viewer の sort mode | replace は表示状態を切り替えない |
| viewer の filter（将来導入時を含む）| replace は filter を変更しない |
| 他 entry の選択 / scroll 位置 | replace の副作用としては変化しない |
| append area の textarea 値 | replace は append area の下書きに触れない |

### 5.3 textlog 構造（JSON shape）の不変条件

実装は body 文字列を **直接 `String.replace` してはならない**。常に以下の経路を取る：

1. （現在の textlog editor は既に `parseTextlogBody` 経由で render しており、各 log textarea が独立に存在する）
2. 起動 log の textarea の `.value`（= log.text）を pure helper で置換
3. textarea.value を上書き + input event 発火
4. commit-edit 時に既存の `collectBody` が各 log textarea から `text` を再構築し `serializeTextlogBody` で JSON に戻す

この経路により以下が保証される：

- `{ entries: [...] }` の JSON shape は破壊されない
- 各 entry の id / createdAt / flags は textarea には現れない（read-only span / hidden field 経由）ので、textarea の text 置換に巻き込まれることが構造的に不可能
- 配列 length / order は collectBody が `createdAt` 昇順で正規化するため安定

### 5.4 v1 で変わるもの（変更範囲の閉じた仕様）

replace の Apply で変わるのは **1 つだけ**：

- 起動 log の `text` 文字列（textarea.value 経由）

それ以外はすべて §5.1〜§5.3 の不変条件で保護される。

## 6. State interaction

### 6.1 textarea 書き換え

Apply は以下の順序で起動 log の textarea を更新する：

1. 新しい text 文字列 `next` を計算（pure helper を `oldValue = textarea.value` に適用）
2. `next === oldValue` なら no-op として即 return（0 ヒット時の defensive guard）
3. `textarea.value = next` で値を上書き
4. `textarea.dispatchEvent(new Event('input', { bubbles: true }))` で input event を発火
5. `rerun()`（= `updateStatus` 再評価）で hit count を 0 等に反映

`execCommand('insertText')` は使わない（TEXT contract と同じ理由：複数挿入・削除を含むため決定的でない）。

### 6.2 commit-edit / collectBody との接続

Apply で発火される `input` event は、textlog editor の既存フローと完全に同じ経路を通る：

| 観測者 | Apply が観測される経路 |
|-------|---------------------|
| dirty state 検知 | textarea の input listener 経由 |
| 編集中 viewer の自動 preview（あれば）| 通常のキー入力と同じ |
| Save / Cancel ボタンの活性状態 | 通常のキー入力と同じ |
| commit-edit (`Ctrl+S`) | textlogPresenter の `collectBody` が各 log textarea を読んで JSON 再構築 → `COMMIT_EDIT` で永続化 |

これにより：

- Apply 後に Save を押せば、置換済みの log.text が含まれた textlog body 全体が `COMMIT_EDIT` で永続化される
- Apply 後に Cancel を押せば、Apply での変更も含めてエディタの全変更がまとめて破棄される
- Apply 単体ではリビジョンは作られない（commit されるまで revision snapshot は走らない）
- `collectBody` は配列順を `createdAt` 昇順で正規化するため、配列順の不変条件（§5.1）が自動保護される

ダイアログを閉じる操作（Close / Esc / backdrop）は Apply / Cancel どちらも行わない。単に UI を消すだけで、これまで Apply 済みの内容は textarea に残る。

### 6.3 他 log / append area への非波及

Apply は **起動 log の textarea 1 本のみ** を書き換える：

- 他 log の textarea には触れない
- append area の textarea（未 commit の下書き）には触れない
- editor 内の flag checkbox / delete button / timestamp span には触れない
- viewer 側 DOM（編集 phase 中は通常マウントされない）には触れない

これは「current line only」契約の物理的な保証。

### 6.4 helper 共有と UI 契約の分離

| 共有可能（`src/features/text/text-replace.ts`） | 共有不可（textlog 専用） |
|-----------------------------------------------|------------------------|
| `buildFindRegex(query, options)` | trigger 描画位置（log row 近傍 vs action bar） |
| `countMatches(body, query, options)` | target textarea の解決（log id 経由） |
| `replaceAll(body, query, replacement, options)` | dialog DOM 構造 / class 名 / data-pkc-* 命名 |
| option semantics（Regex / Case sensitive） | status 文言（`current log` 固定） |
| Gating 契約（empty / invalid / 0 hit） | "current" の意味（log = entry textarea ではなく log textarea） |

`countMatchesInRange` / `replaceAllInRange` は v1 では使わない（Selection only 非搭載のため）。将来 v1.x で log 内 Selection only を追加する場合は同 helper を流用できる。

### 6.5 AppState / Container / reducer 非依存

ダイアログは TEXT contract と同じく以下に一切触れない：

- `AppState.*` の field（読み取りも書き込みも行わない）
- `dispatcher.dispatch()` / `dispatcher.onState()`
- `Container.entries[*].body` の永続表現
- `Revision` / `Relation` の生成

唯一の side effect は **起動 log textarea の `.value` と `input` event 発火**。
これにより編集中フローの他のどの経路とも干渉しないことが保証される。

### 6.6 Undo 契約

v1 では独自の undo 機構は実装しない（TEXT contract §6.3 と同じ方針）：

- dialog 内に Undo ボタンはない
- `Ctrl+Z` ハンドリングも追加しない
- Apply 後に取り消したい場合は **Cancel（edit mode 離脱）で全体破棄** が正規フロー

## 7. Intentionally unsupported (v1)

以下は v1 では実装しない。将来の拡張テーマとして個別に検討する。

| 機能 | 理由 / 将来の扱い |
|-----|------------------|
| **whole textlog replace**（全 log の text を一括）| feasibility §3.3 の粒度 C。preview UI / undo / guard 設計が別途必要。v2 |
| **selected lines replace**（selection mode 流用）| feasibility §3.2 の粒度 B。conversion selection との二重用途化検討が必要。v2 |
| **visible lines replace**（viewer sort/filter 依存）| feasibility §3.4 の粒度 D。永続不採用 |
| **multi-line structural transforms** | line 分割・結合・並び替えを伴う replace |
| **line split / merge**（改行で分割 / 連結）| 構造変更を伴うため別契約が必要 |
| **timestamp rewrite** | `log.createdAt` を replace 経由で書き換える |
| **flag rewrite** | `log.flags` を replace 経由で書き換える |
| **id rewrite** | `log.id` を replace 経由で書き換える |
| **order-sensitive replace** | 「N 番目の log のみ対象」のような順序依存 |
| **append area への replace** | 未 commit の下書きは編集 phase 外の独立 UI |
| **highlight preview**（textlog viewer 内 `<mark>`）| visual highlight の実装コストが高い |
| **Replace next / prev navigation** | v1 は一括 Replace All のみ |
| **whole word / multiline toggle / preserve case** | TEXT contract と同じく v1 非搭載 |
| **Selection only**（log 内範囲限定）| v1 では搭載しない（§4.2）。v1.x で additive に追加可能 |
| **Undo / Redo 専用 UI** | §6.6 参照 |
| **slash command `/replace`** | command surface 統合は別テーマ |
| **command palette 統合** | 同上 |
| **multi-entry / global / cross-archetype replace** | §3.5 参照、v2 以降 |
| **viewer (ready phase) からの replace 起動** | v1 は editing phase 限定 |

## 8. Future extension boundary

v1 contract を **壊さずに** 拡張する方針。

### 8.1 additive 原則

- 新しい option は既存 option の意味を変えない形で追加する
- 既存 option の default を変えるのは breaking change（v2 以降のみ）
- 不変条件（§5）は v1.x 内では絶対に変えない
  - id / createdAt / flags / order / 他 log は永続的に不変扱い
- pure helper（`features/text/text-replace.ts`）に新 signature を足す場合は既存 function を温存した additive 追加にする
- status 文言の literal 一致を前提にするテストは書かない（`toContain` / `toMatch` を使う）

### 8.2 次のテーマ分割予定

| テーマ | 分類 |
|-------|-----|
| textlog log-level Selection only（log 内範囲限定）| v1.x 候補（contract additive 拡張） |
| textlog whole-textlog replace（粒度 C）| v2 別契約 |
| textlog selected-lines replace（粒度 B）| v2 別契約（conversion selection との UI 統合検討含む） |
| textlog Replace next / prev | v2 別契約 |
| broader replace（複数 entry スコープ）| v2 以降、慎重設計 |
| global replace（container 全域）| v2 以降、最後 |

### 8.3 v1 → v2 で崩れうる項目

- 「current」が log textarea 1 本である定義（§2.2）は粒度 C / B 導入で意味が変わる
- 1 dialog セッションが 1 log に対応する関係（§6.3）は whole textlog 導入で 1:N に拡張される
- status 文言 `current log` は scope バリアント追加で派生形が増える

これらは v2 で破壊的に再定義される可能性があり、本書はあくまで **v1 = current log only の固定** として参照される。

### 8.4 canonical spec への昇格条件

本 contract が canonical spec（`docs/spec/data-model.md` 等と同格）に昇格する必要があるのは以下のいずれかの時点：

- replace 操作が AppState / reducer / Container に直接作用するように設計が変わったとき
- replace が永続スキーマ（`TextlogEntry` の field 追加 / `TextlogBody` 構造変更 等）に波及するとき
- 複数 archetype を跨ぐ orchestration が導入されたとき

それまでは本書は **補助 spec** として `docs/spec/` 配下に留める。

## 9. Examples

以下は概念例。実装の入出力そのものではない。

### 9.1 単純な line text 置換

**起動 log（focus 中、編集モード）**

```
id: 01HZ...A
createdAt: 2026-04-16T01:00:00Z
flags: ["important"]
text: "朝会で A と B を共有した"
```

**Find**: `A` / **Replace with**: `X` / **Regex**: OFF / **Case sensitive**: OFF

**Apply 後の起動 log**

```
id: 01HZ...A                  ← 不変
createdAt: 2026-04-16T01:00:00Z   ← 不変
flags: ["important"]          ← 不変
text: "朝会で X と B を共有した"   ← text のみ置換
```

他 log は一切触れない。Save 押下で `COMMIT_EDIT` により永続化、Cancel で破棄。

---

### 9.2 regex on の安全な例

**起動 log**

```
text: "ID: req-123, ID: req-456 を確認"
```

**Find（regex ON）**: `req-(\d+)` / **Replace with**: `R-$1` / **Case sensitive**: ON

**Apply 後**

```
text: "ID: R-123, ID: R-456 を確認"
```

regex match scope は **この 1 log の text に閉じている** ため、複数 log を跨いだ意図しない一括書き換えは構造的に起こらない（§4.5）。

他 log の text に同様の `req-NNN` 文字列があっても、本 dialog セッションの対象外。

### 9.3 危険だが v1 で禁止される例

**想定される誤用**

> 「全部の log の `important` フラグを外したい。`flags: ["important"]` を `flags: []` に regex 置換すれば速い」

**v1 の回答**: 不可能。理由は以下：

1. dialog の対象は `log.text` のみ（textarea.value）であり、`flags` は別経路（flag checkbox）で管理されている
2. textarea には JSON の構造（`flags: [...]`）が現れない（read-only span / hidden field 経由）
3. 対象は **起動 log 1 件のみ** なので、そもそも「全 log」を一括処理できない

flag を一括解除したい場合は、各 log の flag checkbox を 1 件ずつ操作するか、将来の v2 で別 UI（一括 flag toggle 等）を待つ。

**もう 1 つの誤用**

> 「日付を後ろにずらしたい。`2026-04-16` を `2026-04-17` に regex 置換すれば全 log 動くはず」

**v1 の回答**: text 内に偶然含まれる `2026-04-16` 文字列は **書き換わるかもしれない**（本文の一部なので）。
しかし `log.createdAt` は不変（§5.1）。日付メタを変えたいなら edit/delete + 新規 append が正規ルートで、replace の責務ではない。

---

## 10. 関連ドキュメント

| ドキュメント | 関係 |
|------------|------|
| `docs/spec/textlog-replace-feasibility-and-minimum-scope.md` | 本書の出発点、粒度比較と v1 推奨方針 |
| `docs/spec/find-replace-behavior-contract.md` | TEXT body v1.1 contract、姉妹 spec |
| `docs/development/completed/textlog-foundation.md` | textlog 全体仕様、`TextlogBody` / `TextlogEntry` schema |
| `docs/development/archived/singletons/text-replace-current-entry.md` | TEXT 側の実装 dev doc、層分離パターンの参考 |
| `src/features/text/text-replace.ts` | 共有可能な pure helper 群 |
| `src/features/textlog/textlog-body.ts` | textlog 永続モデル |
| `src/adapter/ui/textlog-presenter.ts` | viewer / editor / collectBody の実装 |

---

## 11. 位置づけサマリ

- **状態**: v1 として固定（current log only / metadata 不変 / Selection only 非搭載）
- **更新条件**: breaking 契約変更があれば本書を bump（v1.1 / v2）、additive 拡張は本書を部分追記で吸収
- **本書の読者**: 次に textlog-replace 実装テーマを担当する Claude セッション、および仕様レビュアー
- **本書が守るもの**: 「current log textarea only」境界、log metadata 不変、JSON shape 不変、TEXT contract / textlog 既存 UI への non-interference
- **次のステップ**: 本 contract を出発点に textlog-replace v1 (current line only) の実装テーマへ
