# Normalize PKC links — Link migration tool v1 (docs-first)

## 1. Purpose / Status

本 spec は、既存 body に残った **legacy / mixed PKC link forms** を、preview 付きの user-approved migration として正本 Internal Markdown Dialect(spec §5.7)に寄せるための **Normalize PKC links** tool の契約を固定する。

- **docs-first、実装未着手**
- **自動 rewrite はしない**:user が明示的に Tools → Normalize PKC links を開き、preview を確認し、approval した候補のみ apply される
- **破壊的書き換えなし**:apply は immutable container update、changed entries は新 revision を記録(既存 revision policy を踏襲)
- Phase 0 audit(`../development/link-system-audit-2026-04-24.md`)§10 の方針を **実装契約レベルまで詳述** した第 1 版
- link spec 本体(`pkc-link-unification-v0.md`)§11.6 に記されていた "Normalize PKC links" の予約を具体化する

本 tool が解決する範囲:

- Phase 1 で新規 emit は正本に寄せたが、**既存 body にはまだ legacy 形式が残っている**
- Phase 2 はその残存分を **opt-in + preview 付き** で整理する手段を提供する
- 完全に適用すれば Internal Markdown Dialect の単一正本化が達成され、card / embed(Phase 4)の前提が揃う

本 tool が扱わないこと:

- ordinary URL / Office URI scheme / `obsidian:` / `vscode:` / 未知 scheme(§4 非干渉契約)
- cross-container `pkc://<other>/...`(解決不能、保持)
- card / embed presentation の導入(本 spec は link 正規化に主眼、§2 参照)
- 自動バックグラウンド実行(全て user-initiated)

参照(先行 docs):

- `../development/link-system-audit-2026-04-24.md` — 4 surface 棚卸し、gap list G1-G7、Migration policy §10
- `./pkc-link-unification-v0.md` — Link 正本 spec、§5.7 Internal Markdown Dialect、§11.6 Migration tool 方針予約
- `./data-model.md` — Entry / Container schema、revision 契約
- `./schema-migration-policy.md` — additive / breaking 変更の分類基準
- `./attach-while-editing-insert-internal-link-v1-behavior-contract.md` — 内部リンク挿入 UX 文脈

---

## 2. Scope

### 2.1 含める(v1 対象)

- **legacy PKC link forms の検出 + 正本化候補の生成**(§3)
- **preview-first UI flow**(§7)
- **user-approved apply**(§8)
- **revision 連携**(§8.2)
- **code block / inline code / fenced block 非干渉**(§4)
- **archetype ごとの scan 対象**(§5.3)
- **safety level 分類**(§9)

### 2.2 含めない(v1 非対象)

- **ordinary URL / Office URI scheme の rewrite**(絶対に触らない、§4)
- **cross-container portable reference の internal 化**(container_id 不明、§3.6)
- **non-empty user label の強制上書き**(ユーザー意図を優先、§3.6)
- **future dialect(clickable-image / card / `[![]](target)`)の生成**(§14)
- **card / embed grammar の migration**(本 tool は **link 正規化 v1** が主軸、card / embed は future migration tool v2 で別契約)
- **attachment metadata 系 migration**(body.name / mime 等、スコープ外)
- **raw HTML 内の PKC link 解釈**(security surface が広すぎる、future option)
- **自動バックグラウンド migration / boot-time auto-apply**
- **cross-entry bulk semantic transformations**(entry を folder に昇格する等、migration tool v1 の責務外)

### 2.3 Invariants(本 tool が壊さない前提)

- 既存 `Entry` / `Container` / `Relation` / `Revision` schema は **不変**
- `schema_version` を bump しない(additive optional operation)
- legacy link forms の **読み込み互換は完全維持**(apply しない場合は 現行挙動どおり)
- apply 後の body は markdown 互換のまま
- body 内の **code block / inline code は完全無改変**(§4)
- non-PKC URI(http/https/file/mailto/ftp/ms-*/onenote/obsidian/vscode 等)は **完全無改変**
- apply は entry 単位で atomic、部分更新で中間状態を晒さない

---

## 3. Current canonical + Candidate legacy forms

### 3.1 Current canonical form(v1 migration の到達点)

spec §5.7 Internal Markdown Dialect の該当部を正本として再掲:

**Target(body に書かれる target URI)**:
- `entry:<lid>`
- `entry:<lid>#log/<logId>`
- `entry:<lid>#day/<yyyy-mm-dd>`
- `entry:<lid>#log/<logId>/<slug>`
- `asset:<key>`

**Presentation(link 系、本 tool の主対象)**:
- link: `[<label>](<target>)` — **label は非空必須**
- embed(asset 画像): `![<alt>](asset:<key>)`
- card: `@[card](<target>)` — future(v1 migration 対象外)

### 3.2 Candidate A — Empty label links

| Before | After |
|---|---|
| `[](entry:<lid>)` | `[<Entry Title>](entry:<lid>)` |
| `[](entry:<lid>#log/<logId>)` | `[<Entry Title> › <log snippet>](entry:<lid>#log/<logId>)` |
| `[](asset:<key>)` | `[<Asset Name>](asset:<key>)` |

label 合成ルールは `link-paste-handler.ts` の `resolveLabel` と一致(#147 / Phase 1 step 3 でテスト済みの動的 label 合成を再利用):
- entry → `entry.title`、空なら `(untitled)`
- asset → `attachment.body.name`、空なら entry.title、なお空なら `(untitled)`
- log fragment → `<entry.title> › <log snippet>`、snippet が無ければ `<entry.title> › Log`

**safety level**: **safe**(target は完全保持、label だけ可視化)

### 3.3 Candidate B — Legacy TEXTLOG log fragment

| Before | After |
|---|---|
| `[<label>](entry:<lid>#<logId>)` ※ `log/` プレフィックスなし | `[<label>](entry:<lid>#log/<logId>)` |

**判定条件**:
- fragment が `parseEntryRef` で `kind: 'legacy'` として認識される(token 形 `[A-Za-z0-9_-]+` で、かつ `log/` で始まらない)
- かつ、対象 entry の archetype が `textlog`
- かつ、fragment 値が対象 TEXTLOG の row id と一致する

**label は既存のまま保持**(非空ならユーザー意図を尊重)。空の場合は Candidate A と合成適用。

**safety level**: **safe-with-match**(上記 3 条件全一致時のみ safe、row id 不一致は candidate 化せず無視)。`kind: 'legacy'` と判定されても row id 不一致は誤検知リスクがあるため除外。

### 3.4 Candidate C — Same-container Portable PKC Reference

| Before | After |
|---|---|
| `[<label>](pkc://<self>/entry/<lid>)` | `[<label>](entry:<lid>)` |
| `[<label>](pkc://<self>/entry/<lid>#log/<logId>)` | `[<label>](entry:<lid>#log/<logId>)` |
| `[<label>](pkc://<self>/asset/<key>)` | `[<label>](asset:<key>)` |
| `[](pkc://<self>/entry/<lid>)` 空 label | `[<Entry Title>](entry:<lid>)`(Candidate A と合成) |

**判定条件**:
- `parsePortablePkcReference(href)` が成功
- `parsed.containerId === currentContainerId`

**safety level**: **safe**(target は同一意味、表現だけ shorten)

### 3.5 Non-candidate — Already canonical

以下は **candidate を生成しない**(既に正本):

```
[<label>](entry:<lid>)                      # 非空 label
[<label>](entry:<lid>#log/<logId>)          # canonical log fragment
[<label>](asset:<key>)                      # 非空 label(非 image MIME は resolver が chip 化)
[<label>](entry:<lid>#day/<yyyy-mm-dd>)
[<label>](entry:<lid>#log/<logId>/<slug>)
![<alt>](asset:<key>)                       # 現行 canonical image embed(data URI 展開)
![<alt>](entry:<lid>)                       # 現行 canonical transclusion
@[card](entry:<lid>)                        # future presentation(v1 対象外、§14)
[![<alt>](<target>)](<target>)              # future clickable-image(v1 対象外、§14)
```

`![<alt>](asset:<key>)` は **asset resolver が `data:` URI に展開して `<img>` を emit している現行 canonical**。scanner v1 は **touch しない**。

Spec の旧版(Phase 2 step 1 初稿)には「Candidate D — Legacy asset image embed」節として `![<alt>](asset:<key>)` を `[![<alt>]](asset:<key>)` に wrap するオプションがあったが、harbor 原則(§14)と 2026-04-24 audit で **削除**:
- 字面どおりの `[![<alt>]](asset:<key>)` は markdown-it 上 literal `![]` label の anchor に落ちる(clickable image にならない)
- 意図を汲んだ `[![<alt>](asset:<key>)](asset:<key>)` は標準 CommonMark の clickable-image 形だが、現行 PKC2 renderer の `SAFE_URL_RE` allowlist に `asset:` が無いため、外側 link が reject されて literal 漏れが起きる
- どちらの解釈でも v1 で apply すると body を壊す。scanner v1 は future dialect を生成しない(§14)

### 3.6 Candidate にならないが触れない(user 意図保護)

- `[<non-empty-label>](entry:<lid>)` の label は **上書きしない**(user が明示的に書いた可能性)
- unknown fragment(`#experimental` など)は保持
- malformed markdown は修正しない

---

## 4. Non-interference(絶対に触らない)

### 4.1 URI scheme allowlist(非干渉)

PKC 専用処理は `entry:` / `asset:` / `pkc://` / `<base>#pkc?` に **限定**(spec §12 既決)。以下は migration tool が **一切読まず、一切書かない**:

```
https:      http:       file:       ftp:
mailto:     tel:
ms-word:    ms-excel:   ms-powerpoint:
ms-visio:   ms-access:  ms-project:
ms-publisher: ms-officeapp:
ms-spd:     ms-infopath:
onenote:    obsidian:   vscode:
web+*:      その他未知の syntactically valid URI scheme
```

検出: scanner は link href を見て PKC scheme(`entry:` / `asset:` / `pkc://`)で始まらないものは即座に skip。

### 4.2 Cross-container PKC reference は触らない

- `pkc://<other>/entry/<lid>` / `pkc://<other>/asset/<key>` は **candidate にしない**(container mismatch、解決不能)
- External Permalink 形(`<base>#pkc?container=<other>&entry=<lid>`)も同様
- これらは renderer の portable-reference-placeholder badge(#143)で可視化されている

### 4.3 Markdown 内の触らない領域

scanner は markdown を **conservative に scan**(v1 は full AST 必須ではない)し、以下を **除外**:

- **fenced code block**: ``` ``` … ``` `` / ``` ~~~ … ~~~ `` 内部
- **indented code block**: 行頭 4 スペース以上 / タブ始まり
- **inline code**: `` ` `` で囲まれた範囲
- **raw HTML**: `<script>` / `<style>` / `<template>` 等の内部は v1 対象外(parsing coverage が未確定)
- **link reference definitions**: `[ref]: entry:<lid>` 形式は v1 対象外(現状 markdown-it で使用例が乏しく、false positive リスクが高い)

### 4.4 label / fragment の保護

- **non-empty label**: 原則保持(Candidate A の空 label のみ合成、Candidate B-C は既存 label を受け継ぐ)
- **unknown fragment**: 保持(`entry:<lid>#custom-hash` などは、`log/` / `day/` / `log/../../` のいずれにも一致しないため candidate 化しない)
- **malformed pkc:// / malformed entry:**: candidate にしない(parser が null を返すので skip)

### 4.5 Body 種別による範囲制限

§5.3 の scan 対象表で明示。

---

## 5. Scanner design

### 5.1 Conservative scanner 方針(v1)

v1 scanner は **full markdown AST(remark / micromark 等)を要求しない**。理由:
- bundle size への影響回避(markdown-it は既に乗っているが migration 専用 AST は過剰)
- false positive を最小化しながら safety を担保する方針は、v1 scope で conservative regex + minimal context tracking で十分達成可能
- full AST は future migration v2 で card / embed / heading 系が入ったとき導入検討

### 5.2 Scan 手順(擬似コード)

```
function scanEntryBody(entry, container):
  text = extractRelevantText(entry)        # §5.3 に従い archetype 別
  masked = maskNonTargetRegions(text)      # §4.3(code block / inline code)
  candidates = []
  for match in findMarkdownLinks(masked):  # [label](href) / ![alt](href)
    href = match.href
    if not isPkcScheme(href): continue     # §4.1
    parsed = parsePkcHref(href)            # entry: / asset: / pkc:// parsers
    if parsed === null: continue           # malformed は skip
    candidate = classifyCandidate(entry, container, match, parsed)
    if candidate !== null:
      candidates.push(candidate)
  return candidates
```

- `maskNonTargetRegions` は code block / inline code の範囲を空白等で上書きし、後段の link パーサで誤検出を防ぐ(実装 slice で具体化)
- `findMarkdownLinks` は `[label](href)` と `![alt](href)` を拾う最小正規表現(既存 `extract-entry-refs.ts` の pattern を参考にする)
- `parsePkcHref` は href の prefix を見て `parseEntryRef` / asset prefix / `parsePortablePkcReference` / `parseExternalPermalink` に dispatch
- `classifyCandidate` は §3 の A-C 判定を行い、非該当は null を返す

### 5.3 Archetype 別 scan scope

| archetype | v1 scan 対象 | future |
|---|---|---|
| `text` | body 全文 | — |
| `textlog` | 各 log row の `text` フィールド個別 | day 見出し / log metadata 内 link |
| `folder` | body(description 文字列)| — |
| `todo` | body 内 markdown 部分(現状 text description) | — |
| `form` | body 内 markdown 部分(form schema 定義フィールド) | — |
| `attachment` | **対象外**(body は JSON metadata で markdown body を持たない) | — |
| `system-*` / `__about__` / `__settings__` | **対象外**(system-reserved、触らない) | — |
| `generic` / `opaque` | **対象外**(本文形式未定義) | — |

TEXTLOG は特殊: `body` は JSON 全体なので、scanner は `parseTextlogBody` で分解して **各 row.text を個別に scan** する。row.id は candidate の location に記録(§6)。

### 5.4 parse 用 helper の再利用

grammar 二重実装を避けるため、以下の既存 helper を再利用する:

- `src/features/entry-ref/entry-ref.ts` — `parseEntryRef` / `formatEntryRef`
- `src/features/link/permalink.ts` — `parsePortablePkcReference` / `formatPortablePkcReference` / `parseExternalPermalink`
- `src/adapter/ui/link-paste-handler.ts` の `resolveLabel` ロジックを features 層へ昇格(必要なら実装 slice で抽出)

scanner 自体も features 層 pure function として実装(`src/features/link/migration-scanner.ts` など)、adapter は preview model を組み立てて UI に渡すだけ。

### 5.5 性能特性

- scan 対象は container.entries × body size に比例(最悪でも 10^5 文字 × 100 entries = 10 MB、regex で数百 ms オーダー)
- user-initiated 前提なので同期実行で支障なし
- 将来 10k entry クラスで遅延する場合は web worker 化を検討(v1 範囲外)

---

## 6. Preview model

### 6.1 Candidate shape(実装 slice での type 目安)

```typescript
export type LinkMigrationCandidateKind =
  | 'empty-label'                        // §3.2
  | 'legacy-log-fragment'                // §3.3
  | 'same-container-portable-reference'; // §3.4

export type LinkMigrationLocation =
  | { kind: 'body'; start: number; end: number }
  | { kind: 'textlog'; logId: string; start: number; end: number };

export interface LinkMigrationCandidate {
  /** Entry that owns the link text being rewritten. */
  readonly entryLid: string;
  /** Archetype for UI grouping + archetype-specific apply paths. */
  readonly archetype: string;
  /** Exact span inside body / log.text (inclusive start, exclusive end). */
  readonly location: LinkMigrationLocation;
  /** Which classification this candidate falls under. */
  readonly kind: LinkMigrationCandidateKind;
  /** The raw substring that will be replaced. */
  readonly before: string;
  /** The substring that replaces `before` on apply. */
  readonly after: string;
  /** Safety class(§9)— UI defaults affect this. */
  readonly confidence: 'safe' | 'review';
  /** Short human-readable explanation for the preview UI. */
  readonly reason: string;
}
```

この type 定義は **docs 上の目安**で、実装時に最小限で正確に書き直してよい(ただし必要な情報は欠落させない)。

### 6.2 Preview summary

scan 完了時に **集計レポート** を返す:

```typescript
export interface LinkMigrationPreview {
  readonly candidates: readonly LinkMigrationCandidate[];
  readonly summary: {
    readonly totalCandidates: number;
    readonly safeCandidates: number;
    readonly reviewCandidates: number;
    readonly byKind: Record<LinkMigrationCandidateKind, number>;
    readonly entriesAffected: number;
  };
  readonly scanSkipped: {
    /** count of links intentionally skipped per non-interference rule. */
    readonly nonPkcScheme: number;
    readonly crossContainer: number;
    readonly nonEmptyLabel: number;
    readonly unknownFragment: number;
    readonly codeBlockGuard: number;
    readonly malformedPkc: number;
  };
}
```

scanSkipped は **可視化しない**(UI に出すとノイズ)が、debug / logging 目的で preview 結果に含める。

### 6.3 Preview determinism

- 同じ container state に対し scanner を 2 回走らせると **identical preview** を返す(candidates 順も一致)
- container.entries の順序 → entries の body / log.entries 順 → 各 body 内 start offset 昇順、で安定
- これは後続実装の scanner unit test で pin する(§10)

---

## 7. UI flow

### 7.1 Entry point

- 場所: **Tools menu**(Shell menu / command palette 等、既存 UI 階層と整合する位置を実装 slice で確定)
- label: `🔧 Normalize PKC links`(暫定、実装時に UI 再レビュー)
- user-initiated only、boot / 自動 trigger なし

### 7.2 Flow 全体

```
1. User triggers: Tools → Normalize PKC links
2. Scanner runs(scan 中は busy indicator)
3. Preview dialog 表示:
     - candidates の件数 summary(safe / review)
     - candidates リスト(entry title / kind / before / after / reason)
     - 各項目に select checkbox
     - Apply all safe / Apply selected / Cancel ボタン
4. User 選択 → Apply 押下:
     - editing phase 中ならブロック(§8.3)
     - readonly / light mode は Apply ボタン自体を disabled
5. Apply 実行:
     - 各 entry ごとに atomic 更新
     - revision 作成(§8.2)
6. Result toast / summary:
     - 「N candidates applied across M entries」
     - 失敗があれば失敗内訳
```

### 7.3 Preview 表示仕様

candidate 1 件の表示例:

```
Entry: Meeting Notes(text)
Kind:  Empty label (safe)
Reason: label が空のため、entry title から補完します

Before: [](entry:e1)
After:  [Meeting Notes](entry:e1)
```

TEXTLOG の log row level candidate:

```
Entry: Work Log(textlog / log: log-1744)
Kind:  Legacy log fragment (safe)
Reason: `#<logId>` を canonical `#log/<logId>` に整理します

Before: [first note](entry:tl1#log-1744)
After:  [first note](entry:tl1#log/log-1744)
```

### 7.4 Selection affordances

- **Apply all safe**(推奨 default): `confidence === 'safe'` の candidate のみ一括 apply
- **Apply selected**: user が checkbox で選んだもののみ apply(safe / review 混在可)
- **Select by kind**: kind 別全選択(実装 slice で UX 判断)
- **Cancel**: dialog 閉じる、state 無変更

### 7.5 Accessibility / keyboard

- dialog は既存 modal pattern(text-replace-dialog と同等)を踏襲
- Escape で close
- Enter で Apply(all safe)
- Tab で候補間ナビゲーション

### 7.6 Dry-run 原則

Preview は **完全な dry-run**:
- scan 後、user が Cancel すれば container に一切変更なし
- Apply を押すまで clipboard / localStorage / IDB への書き込みなし
- この原則は §8 で再確認

---

## 8. Apply semantics

### 8.1 Atomicity

- **entry 単位で atomic**:1 entry 内の複数 candidate は 1 回の body 更新にまとめる
- **複数 entry は順次**:1 entry ずつ順に apply、途中失敗があれば残りを stop(UI で「M 件成功 / N 件未処理」を表示)
- container レベル transaction は提供しない(複雑度に対し価値が低い、v1 scope 外)

### 8.2 Revision 連携

- apply された entry は **既存 revision policy に従って新 revision を記録**
- revision メタデータ:
  - `operation: 'link-migration'` 的な識別子を追加(実装 slice で action type 確定)
  - 変換件数 / kind 内訳を metadata に残して監査可能に
- これにより apply 後の **undo は既存 revision restore UX で可能**
- apply でも user action 履歴に残す(reducer dispatch として記録、silent update にしない)

### 8.3 Phase guard

- **editing phase 中はブロック**(候補が編集中 body と衝突するリスクを排除)
  - user は editing を commit / cancel してから Tools → Normalize を開き直す
- **readonly / light mode / view-only mode は apply 禁止**(preview 表示は許容してよいが Apply ボタン disable)
- **import preview / batch import preview 中はブロック**(container state が中間状態)

### 8.4 Conflict handling

- dual-edit conflict(FI-01)が parked 中の entry は **apply 対象から除外**(safety)
- system-reserved entries(`__about__` / `__settings__` 等、lid が `__*__` 形)は **常に skip**

### 8.5 Action naming(予約、実装時確定)

- `OPEN_LINK_MIGRATION_PREVIEW`(scanner 起動)
- `APPLY_LINK_MIGRATION` — payload は適用する candidate の id list(全体ではなく選択されたもの)
- `CANCEL_LINK_MIGRATION_PREVIEW`
- 具体的な action type 名は実装 slice の最小 PR で確定

### 8.6 Partial rewrite safety

- **hidden partial rewrite なし**: preview に表示されなかった link を apply で書き換えない
- apply 実行時点で scanner を再走させ、preview と diff を再検証(candidates が編集中に変わった場合の gate)
  - 差分があれば「preview 後に変更されたため再 scan が必要」と表示して apply を中断(data-race 防止)

---

## 9. Safety levels

### 9.1 Confidence 分類表

| kind | confidence | default selected in "Apply all safe" | 理由 |
|---|---|---|---|
| empty-label(A) | safe | ✅ | label を補完するだけ、target 不変、可視化のみ |
| same-container-portable-reference(C) | safe | ✅ | target 意味は同一、href shorten のみ |
| legacy-log-fragment(B) | **safe** only if row id matches | ✅ with match / 除外 without match | row id 一致時のみ semantics 保証、不一致は candidate 化しない |
| canonical `![<alt>](asset:<key>)` / `![<alt>](entry:<lid>)` | N/A | 常に — | 現行 canonical なので touch しない(§3.5、regression で pin) |
| future `[![<alt>](<target>)](<target>)` / `[![]](<target>)` / `@[card](…)` | N/A | 常に — | future dialect、renderer 対応前は migration しない(§14) |
| non-empty label rewrite | N/A | — | candidate にしない(§3.6) |

### 9.2 "Apply all safe" の意味

- `confidence === 'safe'` かつ non-optional の candidate のみ選択
- optional(D)は含めない
- user は個別 checkbox で review/optional を手動で add 可能

### 9.3 Confidence 評価の根拠

- **safe**: 変換前後で **link 解決先が同一 lid / asset_key** に確実に到達、label の可視性が向上するだけ、または target 表現が shorten されるだけ
- **review**: presentation の意味が変わる可能性、または未確定の future grammar への前倒し(D のみ)

---

## 10. Required tests(後続実装 PR 用)

本 spec は docs-only だが、後続 scanner / apply 実装 PR で **最低限 cover すべきテスト** を列挙する。

### 10.1 Scanner unit tests(features 層)

- **Candidate A**: 空 label link 検出
  - `[](entry:e1)` → candidate、before/after 一致、confidence `safe`
  - `[](asset:a1)` → 同上
  - `[](entry:e1#log/xyz)` → log-snippet 合成後の label 一致
- **Candidate B**: legacy log fragment(row id match 時のみ)
  - `[x](entry:tl1#log-abc)` + tl1 に `log-abc` row 存在 → candidate
  - `[x](entry:tl1#log-ghost)` + row 不在 → **candidate 化しない**
  - `[x](entry:e1#log-abc)` + e1 は text archetype → **candidate 化しない**
- **Candidate C**: same-container portable reference
  - `[x](pkc://<self>/entry/e1)` → candidate
  - `[x](pkc://<other>/entry/e1)` → **candidate 化しない**(cross-container)
  - `[x](pkc://<self>/asset/a1)` → candidate
  - malformed `pkc://<self>/entry/` → **candidate 化しない**
- **Canonical(非候補、regression で pin)**: `![<alt>](asset:<key>)` / `![<alt>](entry:<lid>)` は既に現行 canonical なので v1 では一切 touch しない(§3.5)。standard CommonMark の clickable-image `[![alt](<target>)](<target>)` と literal `[![]](<target>)` も **v1 では before / after 両方で生成・検出しない**(§14 future dialect)

### 10.2 Non-interference tests

- **ordinary URL**:
  - `[site](https://example.com)` → candidate 化しない
  - `[email](mailto:user@example.com)` → 同上
- **Office URI**:
  - `[open](ms-word:ofe|u|https://...)` → 同上(§4.1 の 12 scheme 全網羅)
- **obsidian / vscode**:
  - `[note](obsidian://open?vault=x)` → 同上
  - `[code](vscode://file/...)` → 同上
- **未知 scheme**: `[x](foo://bar)` → 同上(allowlist 外は全て非干渉)
- **non-empty label 保護**:
  - `[Custom Label](entry:e1)` → label 上書き candidate 化しない
- **unknown fragment 保護**:
  - `[x](entry:e1#experimental-hash)` → 既存 canonical / legacy どれにも該当しないため candidate 化しない
- **cross-container External Permalink**:
  - `[x](https://host/pkc2.html#pkc?container=<other>&entry=e1)` → 同上

### 10.3 Code block 非干渉

- **fenced code block**: ` ```markdown [](entry:e1) ``` ` → candidate 化しない
- **tilde fence**: `~~~ [](entry:e1) ~~~` → 同上
- **inline code**: `` `[](entry:e1)` `` → 同上
- **indented code block**: 行頭 4 スペース + `[](entry:e1)` → 同上
- fence 内の link に対する candidate が 0 件であることを `scanSkipped.codeBlockGuard` で確認可能

### 10.4 Preview determinism

- 同じ container を 2 回 scan → candidates 配列が同一(順序 + 内容)
- entries 順 → body 内 start offset 昇順 で安定

### 10.5 Apply tests

- **revision 記録**: apply 後の entry に新 revision が追加されている
- **operation metadata**: revision metadata に `link-migration` 識別子が記録される
- **atomicity**: 1 entry 内の複数 candidate が 1 つの body 更新にまとまる(中間 snapshot なし)
- **undo**: revision restore で apply 前の body が完全復元される

### 10.6 Phase / mode guard

- **editing phase 中**: Apply ボタン disabled + dispatch したとしても reducer が block
- **readonly / light mode**: preview 表示可、Apply ボタン disabled
- **import preview / batch import preview 中**: apply block
- **dual-edit conflict parked entry**: apply 対象から除外される

### 10.7 TEXTLOG row scan

- TEXTLOG body 内の個別 `row.text` が scan される
- candidate.location.kind === `'textlog'` かつ `logId` が正しい
- 複数 row に candidate がある場合、row ごとに個別 candidate 生成
- 同一 row 内に複数 link candidate があれば、start offset 昇順

### 10.8 Apply 直前の re-scan

- preview 表示 → 別経路で body が変更される → Apply 押下 → 自動 re-scan → 差分検出 → apply を abort して user に通知
- これは §8.6 の data-race 防止

---

## 11. Implementation slices(後続 PR 分割)

### Slice 1 — Pure scanner + preview model(features 層)

**Scope**:
- `src/features/link/migration-scanner.ts`(新規): scan + candidate 生成 + preview summary
- candidate / preview 型定義(§6)
- §5.3 の archetype 別 scan 対応
- §10.1-§10.4, §10.7 のテスト(unit)

**Acceptance**:
- container を入力して preview を返す pure function
- DOM / state に触らない
- 既存 entry-ref / permalink parser を再利用(二重実装なし)
- npm test green、typecheck / lint clean

**想定 PR サイズ**: ~400 LOC(実装)+ ~600 LOC(tests)

### Slice 2 — Preview UI dialog(adapter 層)

**Scope**:
- `src/adapter/ui/link-migration-dialog.ts`(新規):modal dialog、text-replace-dialog と同等 UX
- Shell menu / command palette への entry point 追加
- AppState に `linkMigrationPreview?: LinkMigrationPreview` を additive 追加(optional field)
- Slice 1 の scanner を dispatch から呼び出して preview を格納
- Apply all safe / Apply selected / Cancel のボタン
- §10.6 の phase / mode guard
- integration tests(happy-dom 経由)

**Acceptance**:
- user が Tools → Normalize PKC links を開ける
- preview dialog が candidates を列挙
- checkbox 選択 + apply ボタンで後続 slice の action を dispatch(実装は slice 3 で)
- Cancel で state 無変更

**想定 PR サイズ**: ~500 LOC + ~400 LOC(tests)

### Slice 3 — Apply reducer + revision 連携

**Scope**:
- `APPLY_LINK_MIGRATION` action + reducer(§8.5)
- apply 対象 candidate list を受け取り、entry 単位で body 書き換え + revision 記録
- §8.6 の pre-apply re-scan guard
- §10.5 の apply tests

**Acceptance**:
- apply 後の container に新 revision が記録される
- user が revision restore で元の body に戻せる
- 編集中 / readonly は block される

**想定 PR サイズ**: ~300 LOC + ~500 LOC(tests)

### Slice 4 — Manual / troubleshooting update

**Scope**:
- `docs/manual/05_日常操作.md` に Tools → Normalize PKC links の導線追加
- `docs/manual/09_トラブルシューティングと用語集.md` に FAQ 追加:
  - "Normalize PKC links を実行したら何が変わる?"
  - "Apply したけど undo したい → revision restore"
  - "cross-container の pkc:// は対象外なのは何故?"
- `PKC2-Extensions/pkc2-manual.html` 再ビルド

**Acceptance**:
- manual から user が migration tool を発見・使用できる
- トラブルシューティングが十分

**想定 PR サイズ**: docs-only、~200 行

### Slice 5(optional)— Scanner 高速化 / Web Worker 化

- 10k entry クラスの container で UI ブロックが発生する場合のみ着手
- v1 scope 外、§5.5 のとおり defer

### 順序

**Slice 1 → Slice 2 → Slice 3 → Slice 4**。Slice 1 が pure function で閉じるので並列化はせず順次。Slice 5 は必要になったら差し込む。

---

## 今回やらないこと

本 PR(Phase 2 step 1)での **非実装項目**:

- scanner code / preview model 実装(Slice 1)
- UI dialog(Slice 2)
- apply reducer / revision 連携(Slice 3)
- manual 反映(Slice 4)
- card / embed presentation migration(future v2)
- cross-container resolver / P2P(Phase 4 以降)
- OS protocol handler / 自動 URL 登録(対象外、別 wave)
- Version / Changelog / About 更新(Phase 3、本 spec 完了後)
- attachment metadata migration
- raw HTML 内 PKC link 処理
- 自動バックグラウンド実行

---

## 14. Future dialect reservations(v1 scanner 対象外)

2026-04-24 audit(Harbor Philosophy + Markdown standard compatibility)で確定。scanner v1 は以下の form を **一切生成しない**。将来 renderer / resolver 改修とセットで migration tool v2 が検討する。

### 14.1 Clickable-image `[![<alt>](<target>)](<target>)`

- **標準 CommonMark**: `<a href="target"><img src="target" alt="alt"></a>` にネスト展開される well-known form(README バッジ等で普及)
- **現行 PKC2**: `SAFE_URL_RE` に `asset:` が無いため、外側 link の `asset:` が validateLink で reject され、`[` `]` `(asset:...)` が literal text として漏れる(2026-04-24 probe で実測)。`entry:` 版は anchor 自体は動くが `<a>` が `<div class="pkc-transclusion-placeholder">` を囲む構造になり HTML semantics が不正
- **future dialect 予約**: renderer 側で (a) `asset:` を `SAFE_URL_RE` に追加、(b) resolver の link 形 pass を outer bracket にも効かせる、(c) click 先を download chip に demote する、の 3 点が揃ってから migration v2 で昇格
- **v1 scanner 契約**: `[![<alt>](<target>)](<target>)` を **before にも after にも使わない**。scanner が出会っても候補化しない(regression test で pin)

### 14.2 Bracket-wrapped empty label `[![]](<target>)`

- markdown-it は `<a href="target">![]</a>`(label が literal text `![]` の anchor)として token 化。clickable image では **ない**
- harbor 入港 / 出港 / 定泊 / graceful degrade のいずれの観点でも価値が無い
- scanner v1 は **after として emit しない**(spec 旧版 Candidate D が字面で示していた形、2026-04-24 削除)

### 14.3 Card presentation `@[card](<target>)` / `@[card:<variant>](<target>)`

- spec `pkc-link-unification-v0.md` §6.3 が future presentation として予約
- 現行 renderer hook 無し → `<p>@<a href="target">card</a></p>` になる
- Phase 4 での renderer 実装とセットで migration 検討(migration v2 対象)
- v1 scanner は **生成しない / 検出もしない**

### 14.4 共通原則

- v1 scanner の責務は **「既存の壊れかけた legacy 形を現行 canonical に寄せる」** のみ
- 現行 renderer が dock できない future dialect を生成することは harbor 原則違反
- future dialect を採用するときは、必ず renderer / resolver / paste-conversion / action-binder の整合を先に取る

### 14.5 Renderer integration design(別 audit doc)

Clickable-image を PKC 方言として受け入れる renderer / asset-resolver / action-binder 変更範囲、および migration v1 / v2 境界の詳細は別 audit doc に集約:

→ **`../development/clickable-image-renderer-audit.md`**(2026-04-24 docs-only audit)

本節の 3 点整備(SAFE_URL_RE / resolver pass / action-binder 分岐)を具体化し、Option A(Phase 2 Slice 2 UI dialog 先行)と Option B(clickable-image renderer 先行)の trade-off を harbor 4 層で比較している。

---

## 関連

- Link audit(現在地): `../development/link-system-audit-2026-04-24.md`
- Link spec 本体: `./pkc-link-unification-v0.md`(§5.7 Internal Markdown Dialect / §11.6 Migration policy 予約)
- Phase 1 の実装履歴: INDEX #150-#153
- Revision 機構: `./data-model.md` + revision-branch-restore 系 docs
- TEXTLOG linkability: `../development/textlog-viewer-and-linkability-redesign.md`
- 内部 link 挿入 UX: `./attach-while-editing-insert-internal-link-v1-behavior-contract.md`
- Migration 分類基準: `./schema-migration-policy.md`

---

**Status**: docs-only、Normalize PKC links tool v1 draft(2026-04-24)。Phase 2 step 1 として設計固定。実装は Slice 1(Pure scanner)から順次別 PR。Phase 1(新規 emit の正本化)が完了したので、Phase 2 で **既存 body の legacy 形を opt-in + preview + revision 連携で正本化** する土台を用意。これが固まることで Phase 3(Version / Changelog / About v2.1.0)の Known limitations に「Link migration tool は設計済み・未実装、Slice 1-4 で順次実装予定」と正確に書ける。card / embed(Phase 4)は migration v2 の題材で本 spec は扱わない。
