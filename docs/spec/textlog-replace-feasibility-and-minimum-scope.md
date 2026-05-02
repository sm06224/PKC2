# TEXTLOG Replace — Feasibility & Minimum Scope

Status: ACCEPTED (feasibility study)
Created: 2026-04-16
Category: B. Editor UX / Feasibility
Related: docs/spec/find-replace-behavior-contract.md, docs/development/archived/singletons/text-replace-current-entry.md, docs/development/completed/textlog-foundation.md, docs/development/textlog-viewer-and-linkability-redesign.md, src/features/textlog/textlog-body.ts, src/adapter/ui/textlog-presenter.ts
Supersedes: —
Scope: textlog 向け限定 replace の可否調査と v1 候補の最小仕様を固定する補助 spec

---

## 1. 目的と位置づけ

### 1.1 なぜ別テーマに分けるか

current-entry Find & Replace（S-26 + S-27、v1.1 behavior contract で固定済み）は **TEXT archetype の body** を対象にしている。次の自然な拡張先は textlog だが、**TEXT と textlog は前提が根本的に異なる** ため、同じ契約で扱うことはできない。

本書は **docs-only の feasibility 調査** であり、実装に進む前に

- textlog の何が TEXT と違うか
- replace を textlog に持ち込むと何が壊れうるか
- もし v1 を作るなら最小安全粒度は何か
- まだ進むべきでないなら、その理由

を明文化する。実装はここでは行わない。

### 1.2 TEXT body replace との差分（sumary）

| 観点 | TEXT body | TEXTLOG body |
|-----|----------|-------------|
| body 形式 | plain markdown 文字列 | **JSON**（`{ entries: [...] }`）|
| 編集 UI | 単一 `textarea[data-pkc-field="body"]` | **log ごとの複数 textarea**（`data-pkc-field="textlog-entry-text"`、各々 `data-pkc-log-id` 付き）|
| 1 単位 | entry.body 全体 | log entry (`{ id, text, createdAt, flags }`) |
| メタデータ | なし（free-text） | **timestamp / flags / id** を log ごとに保持 |
| 順序 | 文字列の先頭→末尾 | storage は昇順、**viewer 表示は降順** |
| 検索・置換の「対象」 | 1 本の文字列 | **複数本の文字列 + メタ** |
| selection snapshot | textarea の `selectionStart/End` 1 組 | 複数 textarea のどれを対象にするか、そもそも定義が別物 |

これらの差は option semantics・range semantics・state interaction のすべてに影響するため、
TEXT 側の v1.1 contract を **textlog にそのまま適用することはできない**。

## 2. 現状の textlog 特性

### 2.1 データモデル

`src/features/textlog/textlog-body.ts` の定義：

```ts
export type TextlogFlag = 'important';

export interface TextlogEntry {
  id: string;          // ULID
  text: string;        // plain text or markdown
  createdAt: string;   // ISO 8601
  flags: TextlogFlag[];
}

export interface TextlogBody {
  entries: TextlogEntry[];
}
```

Container 上は `entry.body` に `JSON.stringify(TextlogBody)` が入る。
**log 単位でメタデータが分離**しており、body 文字列を単純置換すると id / createdAt / flags の JSON 構造そのものが壊れる危険がある。

### 2.2 UI 構造

**Viewer**（`textlogPresenter.renderBody`）：

- 日付ごとに `<section class="pkc-textlog-day">` でグルーピング
- 各 log は `<article class="pkc-textlog-log" data-pkc-log-id=...>`
- 各 log は header（★フラグ・timestamp・🔗 anchor）と `<div class="pkc-textlog-text">` で構成
- 表示順は **`desc`**（新→古）

**Editor**（`renderEditorBody`、編集モード）：

- log ごとに `<div class="pkc-textlog-edit-row">` を配置
- 各行: timestamp（read-only）/ flag checkbox / delete button / **`<textarea data-pkc-field="textlog-entry-text" data-pkc-log-id=...>`**
- 表示順は viewer と同じ **desc**
- Hidden `<input data-pkc-field="body">` を 1 つ持つ（collectBody 用フォールバック）

**Append area**（viewer 常駐）:

- `<textarea data-pkc-field="textlog-append-text">` と `+ Add` ボタン
- `Ctrl+Enter` で新規 log を append
- 編集 UI の一部ではなく、ready phase からの quick update

### 2.3 storage order と display order

- **storage order**: `entries` 配列は **昇順**（古→新）で保存される（`collectBody` が `createdAt` 昇順に sort し直す）
- **display order**: viewer / editor は **降順** で表示（`[...entries].reverse()`）
- この「保存は昇順、表示は降順」という非対称は、viewer の sort mode を切り替える余地を残しつつ、永続表現を安定させるための設計判断

replace の観点では：

- 保存データの順序は不変（log.id ベースの更新は順序を変えない）
- しかし「viewer に見えている順」と「実際の配列順」が逆なので、**visual-order に依存する置換**（例えば「今表示されている最初の 3 件」）は UX 上の期待と保存順で食い違う

### 2.4 replace 設計への影響まとめ

| 要素 | 影響 | 置換時の扱い |
|------|-----|-------------|
| `log.text` | 置換の本来の対象 | **書き換え対象**。ただし JSON 内部文字列としての扱いを守る |
| `log.id` | 個別 log の安定識別子 | **絶対不変**。replace で破壊すると backlink / selection-mode / export 経路が壊れる |
| `log.createdAt` | 時系列の正本 | **不変**。テキスト置換で ISO 文字列が壊れると日付グルーピング崩壊 |
| `log.flags` | viewer の強調・CSV round-trip 対象 | **不変**。text だけが対象 |
| entries の並び順 | viewer sort / 変換 / export の正順 | **不変**。並び替えは replace の責任ではない |
| `{ entries: [...] }` JSON 構造 | 永続形式の骨格 | **絶対不変**。body 文字列を直接 `String.replace` してはいけない |
| viewer の sort mode（display order） | UI 状態、ユーザの選択 | **replace の対象外**。replace は log 単位の text にしか触れない |
| append area の未送信文字列 | 未 commit の下書き | **対象外**。ready phase の独立 UI |
| 選択モード（TEXTLOG→TEXT 変換用） | 既存の select 系経路 | v1 replace が流用するか別途検討（§4） |

**結論**: textlog body を「1 本の文字列」として扱う素朴な実装は **禁忌**。
log 単位でパース → 各 log.text を pure 置換 → 再シリアライズ、という経路でなければ安全に閉じない。

## 3. 想定しうる replace 粒度の比較

textlog に対して replace を提供する場合、「何を対象にするか」の粒度は複数ありうる。ここで 4 候補を挙げ、利点・危険・UX コストを比較する。

### 3.1 粒度候補 A: current line only（現在 focus 中の 1 log のみ）

編集モードで focus が当たっている log entry の `textarea` のみを対象にする。

| 側面 | 評価 |
|-----|------|
| 利点 | TEXT body replace の contract をほぼそのまま流用できる（単一 textarea） |
| 利点 | 事故面が小さい（1 log のみ書き換わる） |
| 危険 | 「この log だけ」という粒度は、複数 log にまたがる日誌的な書き換え要求に応えられない |
| UX コスト | 「どの log が current か」をユーザが常に意識しないといけない。focus 遷移で対象が変わる |
| 実装コスト | 低（TEXT replace を log textarea に向けるだけ） |

### 3.2 粒度候補 B: selected lines only（選択モードで選んだ log のみ）

TEXTLOG→TEXT 変換で既に使っている `textlog-selection.ts` の選択モードを流用し、チェック済みの log 群だけを対象にする。

| 側面 | 評価 |
|-----|------|
| 利点 | 既存の selection UI を使える（ユーザの学習コストが小さい） |
| 利点 | viewer（ready phase）でも発動できる可能性がある（edit phase 限定を緩められる） |
| 利点 | 対象が明示的で範囲が見える |
| 危険 | selection は TEXTLOG→TEXT のための状態であり、二重用途化すると既存 conversion 経路と干渉する可能性 |
| 危険 | 選択 0 件 / 対象 0 log のときの UX が 2 モード分岐（TEXT 変換 / replace）で煩雑化 |
| UX コスト | ユーザが「まず選択モードに入り、log をチェックし、replace を起動する」3 ステップ |
| 実装コスト | 中（selection lifecycle との結合 / 既存 conversion modal との排他 UI が要る） |

### 3.3 粒度候補 C: whole textlog（編集中 textlog の全 log.text）

編集モードに入っている textlog entry の **全 log の `text`** をループで置換する。timestamp / flags / id には触れない。

| 側面 | 評価 |
|-----|------|
| 利点 | 粒度の意味が明快（「この日誌全体で置換」） |
| 利点 | UI が 1 つの Apply で完結する（複数 log への連続操作は不要） |
| 利点 | 対象が `body` JSON の中身に閉じるため、append area / selection mode / sort mode と干渉しない |
| 利点 | TEXT replace と対称な UX（「current entry の中身全部」）を保てる |
| 危険 | 日付の違う log にまたがる置換を一気にやってしまうため、誤 Apply の影響範囲が広い |
| 危険 | regex が複数 log にまたがって mach しないよう、log.text ごとに独立適用する必要がある |
| UX コスト | 低〜中（preview hit count が「N logs で M 件」のような集計になる） |
| 実装コスト | 中（log ごとに pure `replaceAll` を回す + ダイアログから全 log を駆動する） |

### 3.4 粒度候補 D: visible lines only（viewer の現在の sort / filter で見えている log のみ）

viewer の display order や日付フィルタに応じて「見えている log」のみを対象にする。

| 側面 | 評価 |
|-----|------|
| 利点 | UI 上「見えているものが消える」のでユーザ期待に一致する場面がある |
| 危険 | viewer の sort state / filter state は **揮発性の UI 状態** であり、body の永続データとは別物。どの log が「見えている」かは seam sensitive |
| 危険 | ready phase の viewer と edit phase の editor では display order が同じでも、visibility 概念が一致するとは限らない |
| 危険 | 「filter を変えたら直前まで変更対象だった log が突然範囲外になる」という未定義挙動を招きやすい |
| UX コスト | 高（何が見えているかの定義が揺れる） |
| 実装コスト | 高（viewer の状態を dialog 側から覗く API が必要。reducer / AppState coupling が発生しうる） |

**結論**: v1 では **採用しない**。display state に依存する粒度は事故の温床。

### 3.5 比較まとめ表

| 粒度 | 利点 | 危険 | UX コスト | 実装コスト | v1 での評価 |
|-----|------|------|-----------|-----------|-------------|
| A. current line only | 流用容易、事故面小 | 複数 log を跨ぐ要求に無力、focus 依存 | 中 | 低 | **検討余地あり**（もっとも安全） |
| B. selected lines only | 対象可視化、学習コスト小 | conversion selection と二重用途 | 中〜高 | 中 | **v1 ではまだ早い**（UI 統合の検討が別途必要） |
| C. whole textlog | 粒度が明快、Apply 1 回で完結 | 影響範囲が広い | 低〜中 | 中 | **最も自然だが影響大**（preview 件数表示で緩和可能） |
| D. visible lines only | UI 期待に一致する場面あり | display state 依存で事故多発 | 高 | 高 | **不採用** |

A と C が実用上の二択。次節で v1 候補を決める。

## 4. v1 候補

### 4.1 最小安全粒度

**粒度 A（current line only）を v1 候補とする**。

- 編集モード中に focus が当たっている log textarea を対象にする
- 事実上「log 1 件に対する TEXT replace」として振る舞う
- 既存の TEXT replace dialog をほぼそのまま流用可能
- 1 回の Apply で影響するのは 1 log の `text` のみ

理由：

- **事故面最小**: 複数 log を跨ぐ誤 Apply が原理的に起こらない
- **contract 流用**: v1.1 TEXT replace contract の option semantics / selection semantics / state interaction をほぼそのまま再利用できる
- **段階的拡張**: v1 で A を固めたあとで C（whole textlog）を additive に足せる

粒度 C（whole textlog）は価値が高いが、preview 件数表示 UI / log 単位の invariant guard / 誤 Apply の undo 戦略などの追加検討が必要で、v1 の scope には入らない。v2 テーマで再検討する。

### 4.2 regex を許可するか

**許可する**。ただし **log.text 1 本に閉じて評価する** 制約付き：

- `buildFindRegex` / `countMatches` / `replaceAll` は TEXT 側で既に pure helper として存在する（`src/features/text/text-replace.ts`）
- 同じ helper を log.text 文字列に直接適用すれば、log 跨ぎの複数行マッチは原理的に発生しない
- regex の `.` が改行を跨がないデフォルト挙動は v1 でも維持（multiline toggle は提供しない）
- invalid regex / 0 hit / empty query の gating は TEXT contract と同じ

**理由**: log.text は最大でも 1 log の本文に閉じているため、regex の危険性は TEXT replace と同水準。
複数 log をまたぐ置換が不可能な構造上の制約が、そもそもの安全ネットになる。

### 4.3 timestamp / flag / order の扱い

v1 候補（粒度 A）では、log のメタデータに **一切触れない**：

| メタ | v1 での扱い |
|-----|-------------|
| `log.id` | 絶対不変 |
| `log.createdAt` | 絶対不変。replace が `2026-04-12T10:00:00.000Z` のような ISO 文字列を本文内に含んでいても、text 側の偶然一致にすぎないので book-keeping は行わない |
| `log.flags` | 絶対不変。「important フラグ付き log だけ対象」のような filter は v1 では提供しない |
| entries の配列順 | 絶対不変。replace は配列の shape（length / order / id 列）を変更しない |
| viewer の sort mode | 絶対不変。replace は表示状態を変えない |

この「メタ不変性」は v1 contract の核になるべき項目で、TEXTLOG→TEXT 変換（非可逆境界）や CSV 往復（H-4 flags 列拡張）と同じ原則に従う。

### 4.4 TEXT replace との共有・非共有

**共有できるもの**（`src/features/text/text-replace.ts`）：

- `buildFindRegex(query, options)`: regex 構築ロジック
- `countMatches(body, query, options)`: ヒット数カウント
- `replaceAll(body, query, replacement, options)`: 全置換
- `countMatchesInRange` / `replaceAllInRange`: 範囲限定版（Selection only）
- option semantics（Regex / Case sensitive / Selection only）
- Gating 契約（empty query / invalid regex / 0 hit → Apply 無効）

**共有できないもの**：

- **trigger 描画**: TEXT の `🔎 Replace` ボタンは action bar、textlog 側は log entry ごとの textarea 近傍が適切（UI 配置が違う）
- **target textarea**: TEXT は `data-pkc-field="body"` 1 本、textlog は `data-pkc-field="textlog-entry-text" data-pkc-log-id="..."` 複数本から対象を 1 本選ぶ必要がある
- **dialog state の範囲**: TEXT の Selection only は同一 textarea 内の範囲、textlog の場合は「どの log を対象にするか」が先に決まる必要がある
- **status 文言**: `in current entry.` → `in current log.` のような scope 表現の差
- **"current" の定義**: TEXT は entry が current、textlog は **log が current**（focus 中の textarea）

これらの差分は v1 実装時に新しいトリガー経路を用意する必要があることを意味する。pure helper は共有、dialog 層は **別モジュール** が望ましい（`text-replace-dialog.ts` とは別に `textlog-log-replace-dialog.ts` 等）。

## 5. 非対象と禁止事項

v1 では以下を **提供しない**。一部は意図的、一部は危険すぎて v1 scope 外：

### 5.1 orchestration の禁止事項

- **global replace**: 複数 textlog entry をまたぐ一括置換
- **cross-entry**: 複数の異なる entry（TEXT + textlog など）を同一 dialog で対象にする
- **cross-archetype**: 同じ dialog が TEXT と textlog 両方を切り替えて扱う
- **container-wide search-replace**: Container 全域を対象にする

### 5.2 data rewrite の禁止事項

- **timestamp rewrite**: replace で `log.createdAt` を書き換える（どんな option でも）
- **flag rewrite**: replace で `log.flags` を書き換える
- **id rewrite**: replace で `log.id` を書き換える
- **line split / merge**: 1 log を複数 log に割る、複数 log を 1 log に結合する高度変換

### 5.3 order / mode の禁止事項

- **sort mode をまたぐ暗黙挙動**: viewer の sort を勝手に切り替える、sort 結果を前提にする
- **filter 連動**: date filter / flag filter の結果を replace 対象にする（v1 では filter 機能そのものが未実装）
- **entries 配列の並び替え**: replace の副作用で entries の順が変わる

### 5.4 UI 拡張の非対象

- Replace next / Replace prev ナビゲーション
- Find の hit position ハイライト（log 間遷移）
- preview highlight（textlog viewer 内 `<mark>` 描画）
- slash command / command palette からの起動
- append area textarea への replace（未 commit の下書きは対象外）

### 5.5 外部連携の非対象

- CSV export / ZIP export 経路への影響（replace は body のみ触る、export は独立に動く）
- TEXTLOG→TEXT 変換 preview 中の replace（変換中は専用モーダル、replace は発動しない）

## 6. 推奨方針

### 6.1 結論

**v1 実装に進んで良い。ただし粒度 A（current log only）に限定する。**

- 粒度 A は TEXT replace contract を素直に流用でき、事故面が原理的に小さい
- 粒度 C（whole textlog）は価値が高いが preview UI / guard / undo 戦略で追加検討が必要 → v2 テーマ
- 粒度 B / D は v1 では採用しない

### 6.2 実装時に守るべき前提

1. **JSON 構造を絶対に壊さない**: body 文字列を直接 `String.replace` せず、必ず `parseTextlogBody` → 置換 → `serializeTextlogBody` で経由する
2. **pure helper は `features/text/text-replace.ts` を共有**: 新しい置換アルゴリズムを再発明しない
3. **dialog は別モジュール**: `text-replace-dialog.ts` とは別に textlog 用を作る（trigger・target・status 文言が別物のため）
4. **triggering は log 単位**: log entry ごとの textarea 近傍または編集モード中の log 行に `🔎 Replace` を配置する
5. **v1.1 TEXT contract を壊さない**: TEXT 側は一切変更せず、textlog 用の別 contract として v1 を記述する（本書が次の contract 作成の出発点）

### 6.3 先に固定すべき v1 contract（実装前の追加 docs-only）

実装に入る **前** に、本書をベースに以下を 1 本で固定するのが望ましい：

- textlog-replace v1 behavior contract（= TEXT 側の `find-replace-behavior-contract.md` に相当するもの）
- 対象・非対象・option semantics・state interaction・intentionally unsupported を textlog 側の語彙で記述

この contract が fix したあとで、初めて production code に入る。

## 7. Examples

以下は概念例。実装の入出力そのものではない。

### 7.1 単純な line text 置換（v1 候補 A で可能）

**入力 log（focus 中）**

```
id: 01HZ...A
createdAt: 2026-04-16T01:00:00Z
flags: ["important"]
text: "朝会で A と B を共有した"
```

**Find**: `A`, **Replace with**: `X`

**出力 log**

```
id: 01HZ...A                ← 不変
createdAt: 2026-04-16T01:00:00Z   ← 不変
flags: ["important"]        ← 不変
text: "朝会で X と B を共有した"   ← text のみ置換
```

他の log は一切触らない。

---

### 7.2 regex が危険になりうる例（v1 は安全側に閉じる）

**入力 log 2 件（同 textlog）**

```
[#1] text: "2026-04-16 作業開始"
[#2] text: "2026-04-17 続き"
```

**Find（regex ON）**: `^\d{4}-\d{2}-\d{2}`, **Replace with**: `(日付削除)`

v1（粒度 A）では **focus 中の 1 log のみ** が対象のため、`#1` を選んで Apply すると `#1` だけが書き換わる：

```
[#1] text: "(日付削除) 作業開始"   ← 変更
[#2] text: "2026-04-17 続き"        ← 不変
```

もし将来の v2 で「whole textlog」粒度を実装する場合、この regex は 2 件とも hit させる可能性があり、preview で「2 logs で 2 件ヒット」のような集計表示と user への明示が必要。v1 では粒度 A に閉じて回避する。

### 7.3 order / sort に絡む事故例（v1 では不可能）

**想定される誤解**

> 「viewer で desc 表示（新→古）にしているから、Find 時の『N 件目』もその順に対応するだろう」

**v1 での回答**: 粒度 A（current log only）なので「N 件目」という概念がそもそも存在しない。replace は常に 1 log 内で完結し、配列順序（昇順）と viewer sort mode（降順）の差は一切ユーザに見えない。

もし将来 v2 の「whole textlog」粒度に進んだ場合、preview の N 件表示は必ず **配列順（= 昇順）** に固定し、viewer の sort mode とは独立した順序で示すことが推奨される。これは TEXTLOG→TEXT 変換（`textlog-text-conversion-policy.md §2.3`）が既に採用している原則と同じ。

---

## 8. 関連ドキュメント

| ドキュメント | 関係 |
|------------|------|
| `docs/spec/find-replace-behavior-contract.md` | TEXT body v1.1 contract。本書が参照する対称仕様 |
| `docs/development/archived/singletons/text-replace-current-entry.md` | TEXT 側の実装 dev doc。pure helper と dialog の層分離パターンを示している |
| `docs/development/completed/textlog-foundation.md` | textlog 全体構造の解説 |
| `docs/development/textlog-viewer-and-linkability-redesign.md` | `TextlogDoc` 共通表現の出典、log fragment URI 仕様 |
| `docs/spec/textlog-text-conversion-policy.md` | textlog → TEXT 変換の非可逆境界。order / sort の扱い原則を流用 |
| `src/features/textlog/textlog-body.ts` | `TextlogBody` / `TextlogEntry` の pure model |
| `src/adapter/ui/textlog-presenter.ts` | viewer / editor / collectBody の実装 |

---

## 9. 位置づけサマリ

- **本書の性質**: feasibility + 最小仕様の方針提示（docs-only）
- **次のステップ**: 本書を出発点に textlog-replace v1 behavior contract を別 doc で 1 本起草 → その後に実装テーマへ入る
- **結論**: v1 実装は **粒度 A（current log only）** に限定して進めて良い
- **v2 候補**: 粒度 C（whole textlog）、preview highlight、Replace next、broader scope
- **絶対禁止**: 粒度 D（visible lines only）、global replace、timestamp / flag / id rewrite、sort mode への暗黙依存
