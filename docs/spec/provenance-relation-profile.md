# Provenance Relation Profile

Status: ACCEPTED
Created: 2026-04-16
Category: B. Conversion Specs / Provenance
Related: docs/spec/text-textlog-provenance.md, docs/spec/textlog-text-conversion-policy.md, docs/spec/data-model.md §5, docs/spec/schema-migration-policy.md
Supersedes: —
Scope: `RelationKind = 'provenance'` Relation の v1 payload profile を補助 spec として固定

---

## 1. 目的と位置づけ

### 1.1 目的

PKC2 の `Relation.kind = 'provenance'`（H-8 で additive 追加）の
**payload profile（最小必須 / 推奨 / 任意 / v1 非対象）** を補助仕様として固定する。

H-8 `text-textlog-provenance.md` が「TEXT ↔ TEXTLOG 変換での来歴設計」を canonical に定めたのに対し、
本書は **provenance Relation それ自体の profile** を変換種別を横断して明文化する補助 spec である。
本書は H-8 を吸収・統合するものではない。

### 1.2 他仕組みとの役割差

| 仕組み | 記録対象 | scope |
|-------|---------|-------|
| `Revision.prev_rid` / `content_hash`（H-6） | 同 `entry_lid` 内の **時系列版管理** | 1 entry の履歴 chain |
| `provenance` Relation（H-8 + 本書） | **別 entry 間**の派生来歴 | cross-entry derivation lineage |
| meta log（body 先頭 blockquote） | 人間向け来歴記述 | 1 変換結果 entry の body 内 |

- **Revision chain は同じ entry_lid 内で閉じる**（linear history）
- **provenance Relation は複数 entry を跨いで張られる**（派生のグラフ）
- 両者は **補完関係**であり、どちらか一方で他方を代替しない

### 1.3 v1 での想定用途

- `semantic conversion`: TEXT ↔ TEXTLOG 変換（H-8 / `textlog-text-conversion-policy.md`）
- `derivation`（将来）: 1 entry から複数派生（例: todo → report summary entry）
- `import lineage`（将来）: 外部由来 entry にソース container / 外部識別子を記録

v1 で canonical なのは最初の 1 件のみ。将来の 2 件は「profile が破綻しないこと」を確認するためのスケール先として記載する。

---

## 2. v1 profile

### 2.1 Relation top-level フィールド（H-8 / `data-model.md §5` で既定済み）

`provenance` Relation も他の RelationKind と同一の schema を使う。
本書は top-level フィールドを**再定義しない**。

| フィールド | 役割 | 本 profile での扱い |
|-----------|-----|--------------------|
| `id` | Relation の rid | 通常通り一意採番 |
| `from` | 派生元 entry の `lid` | §3 参照（canonical 向き） |
| `to` | 派生先 entry の `lid` | §3 参照 |
| `kind` | `'provenance'` 固定 | — |
| `created_at` / `updated_at` | Relation 作成時刻 | 他 kind と同じ |
| `metadata?` | 来歴 payload | §2.2 以降で profile 固定 |

### 2.2 metadata の v1 profile

`Relation.metadata?: Record<string, string>`（H-8 §7.1 additive 追加）に
以下の方針で key を格納する。**すべての値は string**。

#### 2.2.1 最小必須属性（required）

| key | 内容 | 例 |
|-----|------|----|
| `conversion_kind` | 来歴の種別識別子 | `'text-to-textlog'` / `'textlog-to-text'` / `'import-derived'`（将来） |
| `converted_at` | 変換 / 派生実行時刻の ISO 8601 | `'2026-04-16T00:00:00.000Z'` |

この 2 key が **揃わない Relation は provenance として妥当でない**。
UI / クエリは両 key の存在を前提に書いてよい。

#### 2.2.2 推奨属性（recommended）

| key | 内容 | 例 |
|-----|------|----|
| `source_content_hash` | ソース entry 本文の fingerprint | `fnv1a64Hex(source.body)`（16-char lowercase hex） |

- **推奨**の意味: conversion 実装が populate **すべき**だが、欠けていても Relation は有効とみなす
- hash アルゴリズムは H-6 `src/core/operations/hash.ts` の FNV-1a-64 に合わせる
- cryptographic commitment ではない（`data-model.md §6.2.1` の契約を踏襲）
- 将来強い hash を併用したくなったら `source_content_hash_sha256` 等の別 key を additive に追加する（アルゴリズム差し替えは禁止）

#### 2.2.3 任意属性（context-specific / optional）

conversion_kind 毎に意味が確定する key。profile 側では列挙のみ行う。

| key | 対象 conversion_kind | 内容 |
|-----|---------------------|------|
| `split_mode` | `'text-to-textlog'` | `'heading'` / `'hr'` |
| `segment_count` | `'text-to-textlog'` | 生成された log 数（string） |
| `selected_log_count` | `'textlog-to-text'` | 選択された log 数（string） |
| `source_container_cid` | `'import-derived'`（将来） | ソース container の cid |

追加 key は additive にのみ許され、既存 key の意味を変えてはならない。

#### 2.2.4 v1 では持たせない属性（out-of-scope）

以下は **v1 profile に含めない**。含めるべきという意見が出たら、それは次期 profile の議論対象であり、本書の更新で決める。

- **source / target archetype の複製**: `from` / `to` の entry から **derivable** なので `metadata` に複製しない（drift 回避）
- **lineage depth / chain hop**: 多段派生時に `depth="2"` 等を持たせない（必要なら grapf 側で算出）
- **cryptographic signature / commitment**: 認証用途は本書の scope 外
- **lossy / lossless フラグ**: 変換種別ごとに canonical spec で確定させる（`textlog-text-conversion-policy.md §3.3` 等）。Relation metadata には重複記録しない
- **undo payload / inverse conversion hint**: 変換 undo は v1 非サポート（H-8 §11）
- **provenance-specific reducer action / UI namespace**: 通常の Relation 追加経路で十分、専用 action を増やさない

---

## 3. source / derived の向き

### 3.1 canonical direction

```
from = source entry.lid  ─[provenance]─►  to = derived entry.lid
```

- **canonical**: 「元から派生先へ」— 矢印は派生の方向
- これは H-8 §5.2 の向きと一致する（本書はそれを明示的な profile 契約として昇格させる）
- TEXT → TEXTLOG 変換なら `from` = TEXT、`to` = TEXTLOG
- TEXTLOG → TEXT 変換なら `from` = TEXTLOG、`to` = TEXT
- import-derived（将来）なら `from` = 同 container 内の最も近いソース entry（存在すれば）、`to` = 派生 entry

### 3.2 逆向きを採らない理由

- **グラフクエリの単純化**: 「この entry の由来は？」= `relations.filter(r => r.kind === 'provenance' && r.to === lid)` の 1 式で済む
- **import lineage でのスケール**: 1 ソースから複数派生が出る場合、canonical 向きを固定しないと fan-out が `from` 側・`to` 側のどちらに現れるか揺れる
- **meta log との整合**: meta log は derived 側の body に置かれるため、対応する Relation は「source → derived」で記述する方が人間可読性と一致する

---

## 4. minimum required semantics

本章は「profile が満たすべき意味論的最低線」を明文化する。
いずれも §2.2 の keys に整理済み、ここでは**どこに置くか**を確定させる。

| 意味論 | v1 での配置 | 理由 |
|-------|------------|------|
| conversion kind | `metadata.conversion_kind`（required） | 種別識別子、クエリの主 key |
| source archetype / target archetype | **Relation に持たせない**、`from` / `to` entry から derivable | duplicate を避けて drift を防ぐ |
| lossy / lossless の別 | **Relation に持たせない**、conversion kind ごとの canonical spec で固定 | 複数種別で運用規約が揺れるのを防ぐ |
| timestamp / recorded_at | `metadata.converted_at`（required） | 表示・ソート・debug に必要 |
| source fingerprint | `metadata.source_content_hash`（recommended） | drift / 同一ソース検知の hint |

**結論**: top-level に新フィールドを導入せず、すべて `metadata` key として合意する。
required は 2 key のみ、推奨は 1 key、残りは context-specific。

---

## 5. Relation と meta log の役割分担

### 5.1 分担表

| 責務 | Relation（provenance） | meta log（body 先頭 blockquote） |
|------|----------------------|--------------------------------|
| 機械可読な来歴 | ✓ | ✗ |
| 人間可読な narrative | ✗ | ✓ |
| Container グラフ解析 | ✓ | ✗ |
| export 時に body に同梱される | 依存（Container 丸ごと export 時のみ） | ✓（body の一部として常に） |
| 変換時刻 / 種別 / hash 等の key-value | ✓ | 記述は自由、機械可読保証なし |
| 期間・件数の人間向けサマリ | 数値は metadata に入るが narrative は書かない | ✓ |

### 5.2 二重記録の回避方針

- Relation の `metadata` と meta log 本文は **同じ事実** を異なる粒度で記述する
- 両者の整合は **変換実行時の一発生成で担保** する（後続の手動編集で swing しても同期は保証しない）
- Relation 側の key を削除しても meta log を書き換えに行かない、逆もしない
- 「Relation は機械系の single source of truth、meta log は body 埋め込みの人間向け補助」と位置付ける
- 将来、両者の periodic 再同期を導入する場合は本書を改訂する

### 5.3 export / embed での扱い

- body 単体切り出し（例: `selected-entry-html-clone-export`）では Relation が失われうる — そのときは meta log が唯一の来歴となる
- Container 丸ごと export では両方が残る
- 本書は **両方が揃う場合のみ Relation を master、片方しか残らない場合は残った方で判断する** という弱い契約を採用する

---

## 6. migration policy との整合

### 6.1 profile 変更は schema migration ではない

本 profile は **semantic contract**（意味論規約）であり、
`docs/spec/schema-migration-policy.md` が扱う **schema migration**（型 / 列挙 / 必須性の変更）とは別のレイヤに属する。

具体的には：

- `Relation.metadata` の型（`Record<string, string>`）は H-8 で固定済み、本書では変更しない
- 新しい `metadata` key の追加は **ただの文字列 key 追加** であり、`schema-migration-policy.md §4` の昇格判定フローのいずれにも該当しない
- 未知 key は `data-model.md §5.3` の「未知 kind は未規定」と同様に、reader 側で無害に無視される

### 6.2 自動 upgrade / downgrade 対象ではない

- 本 profile は **user が明示的に起動する変換** で populate される
- lazy migration も eager migration も対象にしない（= 既存 Relation を読み返して metadata を補填しない）
- `schema-migration-policy.md §3.2` 契約 6（downgrade 非提供）は本書でも維持

### 6.3 one-generation compatibility policy を壊さない

- 旧 reader（H-8 以前）が本 profile の Relation を見た場合、`kind = 'provenance'` は未知 kind として drop / ignore される（`data-model.md §5.3`）
- 旧 writer は `metadata` を生成しない — profile は新 writer のみが満たす
- これらはすべて H-8 で既に整理済みの事項であり、本書は **profile 固定に伴う新しい互換性問題を生まない**

---

## 7. Examples

以下は概念例であり、実装の入出力そのものではない。

### 7.1 TEXT → TEXTLOG

```json
{
  "id": "rel-001",
  "from": "lid-text-src",
  "to":   "lid-textlog-new",
  "kind": "provenance",
  "created_at": "2026-04-16T00:00:00.000Z",
  "updated_at": "2026-04-16T00:00:00.000Z",
  "metadata": {
    "conversion_kind": "text-to-textlog",
    "converted_at":    "2026-04-16T00:00:00.000Z",
    "source_content_hash": "abcd1234ef567890",
    "split_mode":    "heading",
    "segment_count": "3"
  }
}
```

- required: `conversion_kind` / `converted_at`
- recommended: `source_content_hash`
- context-specific: `split_mode` / `segment_count`

### 7.2 TEXTLOG → TEXT

```json
{
  "id": "rel-002",
  "from": "lid-textlog-src",
  "to":   "lid-text-new",
  "kind": "provenance",
  "created_at": "2026-04-16T02:00:00.000Z",
  "updated_at": "2026-04-16T02:00:00.000Z",
  "metadata": {
    "conversion_kind": "textlog-to-text",
    "converted_at":    "2026-04-16T02:00:00.000Z",
    "source_content_hash": "0fedcba987654321",
    "selected_log_count": "5"
  }
}
```

- `textlog-text-conversion-policy.md §4.2` と一致する形

### 7.3 import 由来の派生（将来、v1 では未実装）

```json
{
  "id": "rel-003",
  "from": "lid-import-source",
  "to":   "lid-derived-local",
  "kind": "provenance",
  "created_at": "2026-05-01T00:00:00.000Z",
  "updated_at": "2026-05-01T00:00:00.000Z",
  "metadata": {
    "conversion_kind": "import-derived",
    "converted_at":    "2026-05-01T00:00:00.000Z",
    "source_container_cid": "urn:pkc2:container:xyz"
  }
}
```

- `conversion_kind` が将来値 `'import-derived'` になっても profile 構造は変わらない
- 追加 key（`source_container_cid`）は additive — v1 profile と non-conflicting

---

## 8. 意図的に対象外とすること（v1）

- provenance グラフ可視化 UI
- 多段派生の自動 chain 解決（depth 計算 / 循環検出）
- Relation.metadata の Object 型化（現状 `Record<string, string>` のまま）
- cryptographic signature / commitment
- undo / inverse derivation
- provenance 専用 reducer action / user action
- 他 RelationKind (`structural` / `categorical` / `semantic` / `temporal`) への metadata profile 拡張

---

## 9. 関連ドキュメント

| ドキュメント | 関係 |
|------------|------|
| `docs/spec/text-textlog-provenance.md` | H-8 canonical。`provenance` RelationKind と `Relation.metadata?` の原定義。本書が依拠する |
| `docs/spec/textlog-text-conversion-policy.md` | TEXTLOG→TEXT 側の変換ポリシー。§4.2 が本書の例 7.2 と一致 |
| `docs/spec/data-model.md §5` | Relation / RelationKind の正規定義 |
| `docs/spec/data-model.md §6.2.1` | Revision の `prev_rid` / `content_hash`（本書 §1.2 の役割差で参照） |
| `docs/spec/schema-migration-policy.md` | schema migration と semantic contract の境界（§6.1 で参照） |
| `src/core/operations/hash.ts` | `source_content_hash` の計算関数（H-6） |
| `src/core/model/relation.ts` | `Relation` / `RelationKind` 型定義 |
