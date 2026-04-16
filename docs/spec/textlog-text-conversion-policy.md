# TEXTLOG → TEXT 変換ポリシー

Status: ACCEPTED
Created: 2026-04-16
Category: B. Conversion Specs / Provenance
Related: docs/spec/text-textlog-provenance.md, docs/development/textlog-text-conversion.md, docs/spec/data-model.md §5, docs/spec/schema-migration-policy.md
Supersedes: —
Scope: TEXTLOG → TEXT の単方向変換ポリシー固定（補助 spec）

---

## 1. 目的とスコープ

### 1.1 目的

TEXTLOG entry を TEXT entry へ変換する際の

- 変換単位
- 非可逆境界（保持 / 損失）
- 来歴（provenance）の扱い
- v1 で採用する canonical rendering 方式

を補助仕様として固定する。

本書は **H-8 `docs/spec/text-textlog-provenance.md` の逆方向視点** である。
H-8 が TEXT ↔ TEXTLOG 双方向の provenance 設計を canonical に定めたのに対し、
本書は TEXTLOG → TEXT の **変換ポリシーの焦点** を詰める補助文書と位置付ける。
H-8 を吸収・統合するものではない。

### 1.2 スコープ

**本書が対象にすること (v1)**

- TEXTLOG entry からの **copy / export / derived view 目的の TEXT 生成**
- 既存実装（Slice 4 = `src/features/textlog/textlog-to-text.ts`）が依拠する仕様の明文化
- H-8 の provenance 設計 (§4) を TEXTLOG → TEXT 側から具体化

**本書が対象にしないこと (v1)**

- TEXTLOG の代替としての TEXT 化 — 変換後の TEXT は独立 entry で、ソース TEXTLOG は不変
- TEXT → TEXTLOG の逆方向仕様（H-8 §3.1 / `textlog-text-conversion.md §3` を参照）
- 双方向同期 (edit sync)
- ラウンドトリップ log id 安定性
- partial restore（特定セクションのみ元 TEXTLOG に差し戻す）
- flags の TEXT 側エンコーディング
- TEXTLOG の destructive transform（= 元を書き換えて TEXT 化）

## 2. 変換単位

### 2.1 単位

変換単位は **log 単位**（`log.id` 単位）である。

- viewer 上で選択された複数 log の集合が 1 回の変換の入力
- **選択は log id ベース** なので viewer の sort mode（desc / asc）には依存しない
- 未選択 log は変換後 TEXT body に現れない（= 明示的に捨てられる）
- 選択 0 件の変換は禁止（UI 側で guard）
- 空 log（`text` が空白のみ）はスキップされ、対応 heading も出さない

### 2.2 TEXTLOG 要素 → TEXT 要素の写像

| TEXTLOG 側 | TEXT 側の行き先 | 方針 |
|-----------|----------------|------|
| `entry.title` | `entry.title` の prefix 部 | `<src title> — log extract <YYYY-MM-DD>` |
| `entry.lid` | backlink URI | `entry:<lid>` / `entry:<lid>#log/<log.id>` として body 内に埋め込み |
| `log.text` | `entry.body` 内の章節本文 | **verbatim**（markdown 原文） |
| `log.createdAt` | `entry.body` 内の章節 heading | `## YYYY-MM-DD` と `### HH:mm:ss — slug` の形で表層保持 |
| `log.id` | backlink URI の fragment | `[↩ source log](entry:<lid>#log/<log.id>)` |
| `log.flags` | — | **写像しない**（v1 では TEXT 側に flags 概念なし） |
| TEXTLOG 側の将来メタ（tags / source_url 等） | — | v1 では写像しない（仕様未定義のため保守的に drop） |
| viewer の sort mode / selection order | — | 出力は常に **時系列昇順に正規化** |

v1 は「単純連結」でも「時刻付き整形文字列化」でもなく、
**markdown heading 構造化方式** を採用する（§6 に固定）。

### 2.3 並び順と fenced block

- 出力順: **log.createdAt の昇順**（古 → 新）に正規化する
- viewer 側の sort state（desc / asc）には影響されない
- 同一 `createdAt` の複数 log は配列順を維持（stable sort）
- `log.text` 内の fenced code block（```` ``` ```` / `~~~`）はそのまま verbatim 保持される — TEXT 側で markdown として再レンダリングされる
- `log.text` 内に既に `##` / `###` heading がある場合も verbatim に残す。外側で付与される `##` / `###` とネストし文書構造が乱れうる点は §6 の alternative 却下理由と合わせて扱う

## 3. 非可逆境界

### 3.1 失われる情報

TEXTLOG → TEXT 変換で **保証なく失われる** ものを列挙する。
これらは本変換を何回繰り返しても復元できない。

| カテゴリ | 失われるもの | 備考 |
|---------|------------|------|
| 構造 | 個別 log 行の独立 record | 変換後は markdown body 内の章節として埋没 |
| 時刻 | `log.createdAt` の完全な ISO 文字列（秒未満・TZ offset 情報） | heading は `HH:mm:ss` 単位までの表層表示のみ |
| 識別 | `log.id` の round-trip 安定性 | backlink URI として保持はされるが、**再変換で別 id が再生成される** |
| フラグ | `log.flags`（`important`、将来の TextlogFlag） | TEXT archetype に flags 概念なし、意図的に drop |
| metadata | snippet / 表示統計 / viewer 派生情報 | viewer 限定の derived 値、archetype 境界の外 |
| 操作文脈 | viewer の sort mode / selection order / manual order | UX 側の状態、data model 不変条件に含めない |
| 選択外 | **未選択 log** | 明示選択された log のみ出力、選択外は変換時点で落ちる |
| 将来拡張 | 現在未定義の構造化属性（将来追加される `log.metadata` 等） | 仕様未定義のため保守的に drop |

### 3.2 保持される情報

変換後の TEXT から **機械的 / 人間的に参照可能** な形で残るもの。

| カテゴリ | 保持される形 | 参照手段 |
|---------|------------|---------|
| 本文 | `log.text` の markdown 原文 | TEXT body 内の章節本文（verbatim） |
| 由来 entry | 元 TEXTLOG の `entry.lid` | body 内 blockquote / backlink URI `entry:<lid>` |
| 由来 log | `log.id` の URI 参照 | 各章節末尾 `[↩ source log](entry:<lid>#log/<log.id>)` |
| 時刻の表層 | `log.createdAt` の日付 / 時刻文字列 | `## YYYY-MM-DD` heading + `### HH:mm:ss — slug` heading |
| 由来 title | 元 TEXTLOG の `entry.title` | 派生 TEXT の `entry.title` prefix 部 |
| 来歴（provenance） | §4 の `provenance` Relation + 先頭 blockquote meta log | `Container.relations[]` と body 冒頭 |
| 件数・期間 | 選択 log 数 / 期間 | body 冒頭 blockquote の front matter 相当記述 |

### 3.3 lossless / lossy まとめ

| 項目 | 判定 | 備考 |
|-----|-----|-----|
| `log.text` の markdown 原文 | **lossless** | verbatim 保持 |
| 元 `entry.lid` | **lossless** | URI として保持 |
| 元 `entry.title` | **lossless（prefix として）** | 本文中にも blockquote で残る |
| `log.createdAt` 表層（YYYY-MM-DD / HH:mm:ss） | **lossy** | ISO 完全復元は保証しない |
| `log.createdAt` ISO 完全文字列 / TZ offset | **lossy** | 往復保証なし |
| `log.id` | **lossy（round-trip）** | backlink URI としては残るが、再変換で id は再生成される |
| `log.flags` | **lossy** | v1 では drop |
| 未選択 log | **lossy** | 選択外は変換時点で消える |
| viewer state（sort / order） | **lossy** | 意図的に drop |

**一般原則**: `log.text` の markdown 文字列は lossless、それ以外の構造情報は概ね lossy。

## 4. provenance 方針

### 4.1 H-8 との整合

本変換における来歴は **H-8 `docs/spec/text-textlog-provenance.md` の設計をそのまま適用** する。
再設計や拡張はしない。

- 新しい RelationKind は作らない — **`'provenance'`** をそのまま使う
- `Relation.metadata?`（型 `Record<string, string>`）をそのまま使う
- H-8 §7.2 で規定された TEXTLOG → TEXT の metadata payload 形状を本書が継承する
- meta log（先頭 blockquote）と Relation の役割分担も H-8 §5.3 の通り保つ

### 4.2 来歴 Relation のペイロード（TEXTLOG → TEXT）

変換実行時に **1 件の Relation** を `Container.relations[]` に追加する。

- `from`: 元 TEXTLOG entry の `lid`
- `to`: 新規生成された TEXT entry の `lid`
- `kind`: `'provenance'`
- `metadata`:

```json
{
  "conversion_kind": "textlog-to-text",
  "selected_log_count": "5",
  "source_content_hash": "<fnv1a64hex of source.body>",
  "converted_at": "2026-04-16T00:00:00.000Z"
}
```

| キー | 必須 | 内容 |
|-----|------|------|
| `conversion_kind` | ✓ | 固定値 `'textlog-to-text'` |
| `selected_log_count` | ✓ | 選択された log 数（数値の **string 表現**） |
| `source_content_hash` | 推奨 | `fnv1a64Hex(source.body)`（H-6 `src/core/operations/hash.ts` を流用） |
| `converted_at` | ✓ | 変換時刻の ISO 8601 |

`metadata` はすべて string 値。H-8 §7.1 の契約に従う。

### 4.3 meta log と Relation の役割分担

| 仕組み | 格納先 | 主な用途 | 可読性 |
|--------|-------|---------|-------|
| meta log（= body 先頭 blockquote） | `entry.body` の markdown 内 | ヒューマンリーダブルな来歴表示 | 人間向け |
| provenance Relation | `Container.relations[]` | 機械可読な来歴クエリ / 将来の来歴 UI | 機械向け |

これは H-8 §5.3 と同じ分担であり、**本変換でも両方を併走** させる。

- meta log は body の一部なので export / embed / clone 時に自然に持ち運ばれる
- Relation は Container レベルで保持され、backlinks / provenance graph 系 UI の足場になる

両者の情報は **補完関係** にあり、片方だけでは満たせない用途が存在する：

- body が切り出されて export された場合でも meta log は残る
- Container レベルのグラフ解析では Relation のみが機械可読で有効

## 5. migration policy との整合

### 5.1 semantic conversion であって schema migration ではない

本変換は **semantic conversion** に分類される：

- 1 entry（TEXTLOG）を入力に **新しい独立 entry**（TEXT）を生成する
- **元 entry は一切変更されない**（非破壊、read-only）
- ソース entry に対する型変更（`archetype`）を行わない
- Container 全体の構造（`schema_version` / entry schema / relation schema）は変わらない

したがって本変換は `docs/spec/schema-migration-policy.md` の対象外であり、
同書の lazy / eager 判定（§6）や migration hook 箇所（§7）の対象にならない。

### 5.2 schema_version の不変性

- `SCHEMA_VERSION` は現在 `1`（`src/runtime/release-meta.ts`）
- 本変換は `schema_version` を bump しない
- 本変換が使う Relation 型（`kind: 'provenance'` / `metadata?`）はすべて H-8 で **additive に追加済み** の要素のみ
- 新 field / 新 enum は本書では **追加しない**

`schema-migration-policy.md §4` の昇格判定フローで言えば、本変換は

- 新しい optional field? → 無し（H-8 で済）
- 新しい archetype? → 無し
- 新しい Relation.kind? → 無し（H-8 で済）

のすべてに該当しないため、**bump 不要** のまま確定する。

### 5.3 自動 upgrade/downgrade との関係

- 本変換は **自動 upgrade の対象ではない** — user が明示的に起動する UI アクション
- 本変換は **自動 downgrade の対象ではない** — そもそも downgrade は提供されない（`schema-migration-policy.md §3.2` 契約 6）
- pre-H-8 container（= `provenance` Relation や `Relation.metadata` を想定しないもの）でも、
  本変換を実行した瞬間から **新しい Relation が additive に加わるだけ** で、既存データの意味論は変わらない
- 旧 reader が pre-H-8 container に書き戻した場合、未知の `kind: 'provenance'` は **unknown kind として drop or ignore** される想定（`data-model.md §5.3` の「未知 kind は未規定」契約の範囲内）

**one-generation compatibility policy は本書で一切変更しない。**

## 6. v1 decision

### 6.1 採用する canonical rendering

v1 では以下の **markdown heading 構造化方式** を唯一の canonical rendering として採用する。

````markdown
# <元 TEXTLOG title> (log extract)

> Source: [<元 title>](entry:<源 lid>)
> Extracted: <ISO 8601>
> Logs: N entries from YYYY-MM-DD to YYYY-MM-DD

## YYYY-MM-DD

### HH:mm:ss — <slug>

<log.text>

[↩ source log](entry:<源 lid>#log/<log.id>)

### HH:mm:ss — <slug>

...
````

採用理由：

1. **log と段落の対応が視覚的に明らか** — 各章節が 1 log に対応し、backlink が流れに沿って読める
2. **TOC / search sub-location との整合性** — 既存の TEXT 向け TOC（A-3）/ 検索 sub-location（A-4）が heading 単位で動作するため、追加実装なしに機能する
3. **markdown として安全** — H-8 §3.2 の「部分保持」項目（見出し時刻 / source backlink / entry backlink）を自然に表現できる
4. **実装既存** — Slice 4 `src/features/textlog/textlog-to-text.ts` が既にこの形式を出力しており **新実装を要しない**

### 6.2 退けた代替案

以下は v1 では採用しない：

| 代替案 | 退ける理由 |
|-------|-----------|
| **単純連結**（`[YYYY-MM-DD HH:mm:ss] <log.text>\n\n[...]`） | heading 構造がなく TOC が機能しない。検索 sub-location も使えない。長文で可読性が劇的に落ちる |
| **ログ末尾に Source logs section を一括配置** | 長い extract でスクロール距離対応が取れない（`textlog-text-conversion.md §2.6` で既に却下） |
| **1 log = 1 paragraph + `---` 区切り** | 区切りが弱く、ユーザが再 `---` split を試みたとき（TEXT→TEXTLOG 側）と衝突する |
| **JSON frontmatter + markdown body のハイブリッド** | TEXT archetype の body 契約（`body-formats.md §2`）は plain markdown。本書の範囲でハイブリッド化する合意は存在しない |
| **heading level を `#` / `####` で柔軟化** | TOC / search 実装は現行 `##` / `###` 前提。柔軟化は別テーマで要議論 |

これらは v1 では **実装仕様ではなくポリシー** として退ける。実装詳細には踏み込まない。

## 7. Examples

以下は **概念例** であり、実装の入出力そのものではない。セルフコンテインな理解用。

### 7.1 単純ログ（1 件）

**入力 TEXTLOG（概念例）**

```
title: "朝会メモ"
logs:
  - id: 01HZ...A
    createdAt: 2026-04-16T01:00:00Z
    flags: []
    text: "今日のタスクは X と Y。"
```

**選択**: log `01HZ...A` 1 件

**出力 TEXT（概念例）**

```markdown
# 朝会メモ (log extract)

> Source: [朝会メモ](entry:lid-001)
> Extracted: 2026-04-16T02:00:00.000Z
> Logs: 1 entry on 2026-04-16

## 2026-04-16

### 10:00:00 — 今日のタスクは X と Y

今日のタスクは X と Y。

[↩ source log](entry:lid-001#log/01HZ...A)
```

**生成 Relation**:
`from=lid-001, to=<new TEXT lid>, kind='provenance'`、
`metadata.conversion_kind="textlog-to-text"`、`metadata.selected_log_count="1"`。

**失われたもの**: `flags: []`（空なので実害なし）。

### 7.2 flags 付きログ

**入力 TEXTLOG（概念例）**

```
title: "リリースメモ"
logs:
  - id: 01HZ...B
    createdAt: 2026-04-10T09:00:00Z
    flags: ["important"]
    text: "!!! 本番 DB のバックアップ前に停止確認すること !!!"
```

**出力 TEXT（概念例）**

```markdown
# リリースメモ (log extract)

> Source: [リリースメモ](entry:lid-002)
> Extracted: 2026-04-16T02:00:00.000Z
> Logs: 1 entry on 2026-04-10

## 2026-04-10

### 18:00:00 — !!! 本番 DB のバックアップ前に停止確認すること !!!

!!! 本番 DB のバックアップ前に停止確認すること !!!

[↩ source log](entry:lid-002#log/01HZ...B)
```

**失われたもの**: `flags: ["important"]`（§3.1 方針通り意図的に drop）。

**補足**: `important` の視覚強調は TEXTLOG viewer 固有であり、TEXT archetype へは持ち込まない。
重要度の復元が必要になった場合、`provenance` Relation の `metadata` に別キーで拡張する余地はあるが、
v1 では **意図的に drop** する（§3.3）。

### 7.3 並び順差異のあるログ

**入力 TEXTLOG（概念例、viewer は desc 表示中）**

```
title: "作業ログ"
logs:
  - id: 01HZ...C  createdAt: 2026-04-12T01:00:00Z  text: "[12日] A を実施"
  - id: 01HZ...D  createdAt: 2026-04-13T01:00:00Z  text: "[13日] A の結果を確認"
  - id: 01HZ...E  createdAt: 2026-04-14T01:00:00Z  text: "[14日] B に着手"
```

viewer 表示は desc（新→古）のため user は `E → D → C` の順で checkbox を押したとする。

**出力 TEXT（概念例）**

- 出力は **常に時系列昇順** に正規化されるため、body 内の並びは `C → D → E`
- viewer での選択順序は保持されない（§2.3、§3.1 の drop 項目）

```markdown
## 2026-04-12
### 10:00:00 — [12日] A を実施
...
## 2026-04-13
### 10:00:00 — [13日] A の結果を確認
...
## 2026-04-14
### 10:00:00 — [14日] B に着手
...
```

**補足**: viewer の表示順 / 選択順が意味を持つ運用（例えば「最後に押した log を強調」等）は本変換では復元できない。
そうした文脈依存の情報は **TEXTLOG を原本として** 運用で担保すべきであり、
TEXT 側に持ち込む仕様は v1 では提供しない。

---

## 8. 関連ドキュメント

| ドキュメント | 関係 |
|------------|------|
| `docs/spec/text-textlog-provenance.md` | H-8 canonical spec。`provenance` RelationKind と `Relation.metadata?` の原定義。本書が依拠する |
| `docs/development/textlog-text-conversion.md` | Slice 4 / Slice 5 の変換実装仕様。§2 TEXTLOG→TEXT の実装ディテール |
| `docs/spec/data-model.md §5` | Relation / RelationKind の正規定義 |
| `docs/spec/schema-migration-policy.md` | schema migration と semantic conversion の区別（§5.1） |
| `docs/planning/HANDOVER_FINAL.md §6.3` | 非可逆変換の課題リスト（H-8 で解消済みマーカー） |
| `src/features/textlog/textlog-to-text.ts` | 本ポリシーを実装している pure function（既存、v1） |
| `src/core/operations/hash.ts` | `source_content_hash` の計算関数（H-6） |
