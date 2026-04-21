# TEXT ↔ TEXTLOG 変換 — 非可逆境界と来歴設計

Status: ACCEPTED
Created: 2026-04-16
Category: B. Conversion Specs / Provenance
Related: docs/development/textlog-text-conversion.md, docs/spec/data-model.md §5

---

## 1. 目的

TEXT ↔ TEXTLOG 相互変換における情報損失の境界を公式仕様として固定し、
変換来歴（provenance）を Container 内に保持するための設計を記述する。

現実装（Slice 4 / Slice 5）はすでに変換ロジックとして完成しているが、
「何が失われるか」「どこに来歴を残すか」の仕様が分散していた。
本ドキュメントはその統合 canonical spec である。

---

## 2. スコープ

| スライス | 方向 | 実装ファイル |
|---------|------|------------|
| Slice 4 | TEXTLOG → TEXT | `src/features/textlog/textlog-to-text.ts` |
| Slice 5 | TEXT → TEXTLOG | `src/features/text/text-to-textlog.ts` |

本ドキュメントが対象とするのは上記 2 スライスで確定した v1 仕様のみ。
将来スライスが追加された場合は本ドキュメントを改訂する。

---

## 3. 非可逆境界（Lossiness Boundary）

### 3.1 TEXT → TEXTLOG

| データ要素 | 変換後の状態 | 備考 |
|-----------|------------|------|
| `Entry.title` | 保持（TEXTLOG title に反映） | `<src title> — log import yyyy-mm-dd` |
| `Entry.body`（テキスト内容） | 保持（各 `log.text` に分割格納） | `split_mode` に依存 |
| `Entry.archetype` | 変換先で `textlog` に変更 | ソース archetype は meta log に埋め込み |
| `Entry.lid` | 保持（meta log の backlink として参照） | `entry:<lid>` URI |
| `Entry.created_at` | **失われる** | 変換時刻で上書きされる |
| `Entry.updated_at` | **失われる** | 変換時刻で上書きされる |
| `log.id` | 新規生成 ULID | ソース TEXT には log id が存在しない |
| `log.createdAt` | 変換時刻 + offset | ソースの構造上の timestamp に対応するものなし |
| `log.flags` | `[]`（空） | TEXT にはフラグ概念なし |
| 見出し階層（`####` 以深） | 保持（body 内テキストとして） | `#` / `##` / `###` は split 境界になる場合あり |
| リンク / 画像 / コードブロック | 保持（verbatim） | `log.text` は markdown のまま格納 |

**結論**: TEXT → TEXTLOG は実質的に構造分割操作である。
テキスト内容は保持されるが、元の Entry の時刻メタデータと log id は生成されない。

### 3.2 TEXTLOG → TEXT

| データ要素 | 変換後の状態 | 備考 |
|-----------|------------|------|
| `log.text` | 保持（TEXT body に埋め込み） | `### HH:mm:ss — slug\n\n<text>` 形式 |
| `log.createdAt` | 部分保持（見出し時刻 + blockquote range として） | 完全な ISO 文字列は保持されない |
| `log.id` | 参照リンクとして保持 | `[↩ source log](entry:<lid>#log/<id>)` |
| `log.flags`（`important` 等） | **失われる** | TEXT に対応概念なし |
| TEXTLOG の `entry.lid` | backlink として保持 | `[title](entry:<lid>)` |
| 未選択の log | **失われる**（選択外） | 選択的エクスポートの仕様による |
| log 選択順序 | 日付昇順に正規化される | viewer の表示順（降順）とは異なる |
| TEXTLOG `entry.title` | 保持（TEXT title prefix として） | `<src title> — log extract yyyy-mm-dd` |

**結論**: TEXTLOG → TEXT は閲覧文書生成操作である。
`log.text` は保持されるが、flags と正確な ISO 秒精度タイムスタンプは失われる。

---

## 4. 許容される損失理由

### 4.1 設計上の意図

- TEXT と TEXTLOG は異なるデータモデルを持つ独立した archetype である
- 変換は「コピー / 再構築」であり「移動」ではない — ソースは変更されない
- 変換後の entry は独立した lifecycle を持つ（元と同期しない）

### 4.2 保持できない理由の分類

| 失われる要素 | 理由 |
|------------|------|
| `log.flags` | TEXT archetype に flags 概念が存在しない |
| `log.id`（新規生成） | TEXT には log id 概念がない；round-trip で安定させる仕様なし |
| Entry の時刻メタデータ | 変換後 entry は新規作成扱い；ソース時刻継承は別途仕様化が必要 |
| 正確な ISO タイムスタンプ（TEXT→TEXTLOG） | ソース TEXT にはセクション単位の timestamp がない |

### 4.3 v1 での意図的非サポート

以下は v1 では意図的にサポートしない（将来仕様化の余地あり）：

- 双方向同期（edit sync）
- ラウンドトリップ log id 安定性
- partial restore（特定セクションのみ戻す）
- flags の TEXT 側エンコーディング

## 5. 来歴設計（Provenance Design）

### 5.1 要件

変換が実行されたという事実を Container 内に保持し、後から「この entry はどこから来たか」を
たどれるようにする。

要件優先度：
- **P0**: 変換元 entry の lid を来歴として残す（最小限 — meta log が担う）
- **P1**: 変換 Relation を `Container.relations` に格納し、機械可読にする
- **P2**: Relation に変換メタデータ（`split_mode`, `content_hash` 等）を付与する

v1 では P0 は実装済み（meta log / backlink）。P1 / P2 が本仕様の新規設計対象。

### 5.2 Relation による来歴記録

変換実行時に、ソース entry → 生成 entry の間に `kind: 'provenance'` Relation を作成する。

```
source entry ──[provenance]──► generated entry
```

- `from`: 変換元 entry の lid
- `to`: 変換で生成された entry の lid
- `kind`: `'provenance'`（新規 RelationKind — §6 参照）
- `metadata`: 変換コンテキスト（§7 参照）

### 5.3 既存 meta log との役割分担

| 仕組み | 形式 | 主な用途 |
|--------|------|---------|
| meta log（既存） | `log.text` 内 markdown テキスト | ヒューマンリーダブルな来歴表示 |
| provenance Relation（新規） | `relations[]` の構造化データ | 機械可読な来歴クエリ / UI でのリンク表示 |

両者は補完関係にある。meta log は変換後 TEXTLOG の先頭に置かれる人間向け記録、
Relation は Container レベルの構造化来歴。

---

## 6. RelationKind の拡張

### 6.1 変更内容

`src/core/model/relation.ts` の `RelationKind` 型に `'provenance'` を追加する（additive）。

```ts
export type RelationKind =
  | 'structural'   // folder membership
  | 'categorical'  // tag classification
  | 'semantic'     // meaning-based reference
  | 'temporal'     // time-based ordering
  | 'provenance';  // conversion / derivation origin  ← NEW
```

### 6.2 後方互換性

既存 Container データには `kind: 'provenance'` の Relation は存在しない。
追加は additive — 既存データは一切変更されない。

---

## 7. Relation.metadata? フィールドと来歴ペイロード

### 7.1 Relation 型の拡張

```ts
export interface Relation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, string>;  // ← NEW (optional, additive)
}
```

`metadata` を `Record<string, string>` とする理由：
- JSON シリアライズが自明
- スキーマ検証が不要（key/value とも string）
- 将来フィールド追加が additive — breaking change なし

### 7.2 来歴ペイロード（provenance Relation の metadata）

TEXT → TEXTLOG 変換時：

```json
{
  "conversion_kind": "text-to-textlog",
  "split_mode": "heading",
  "source_content_hash": "<fnv1a64hex of source.body>",
  "converted_at": "2026-04-16T00:00:00.000Z",
  "segment_count": "3"
}
```

TEXTLOG → TEXT 変換時：

```json
{
  "conversion_kind": "textlog-to-text",
  "selected_log_count": "5",
  "source_content_hash": "<fnv1a64hex of source.body>",
  "converted_at": "2026-04-16T00:00:00.000Z"
}
```

フィールド定義：

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `conversion_kind` | string enum | ✓ | `'text-to-textlog'` または `'textlog-to-text'` |
| `split_mode` | string | TEXT→TEXTLOG のみ | `'heading'` または `'hr'` |
| `selected_log_count` | string（数値） | TEXTLOG→TEXT のみ | 選択された log 数（`emittedCount`） |
| `source_content_hash` | string | 推奨 | `fnv1a64Hex(source.body)` |
| `converted_at` | ISO string | ✓ | 変換実行時刻 |
| `segment_count` | string（数値） | TEXT→TEXTLOG のみ | `nonEmpty` segments 数 |

注: metadata の値はすべて string。数値は文字列化する（`"3"` not `3`）。

## 8. 実装スライス

> **📌 As-of 2026-04-21 追補（実装 status）**
>
> | スライス | status | 実装箇所 |
> |---|---|---|
> | Slice A（本ドキュメント） | **DONE** | 本ファイル（commit 済み） |
> | Slice B（`RelationKind` に `'provenance'`） | **SHIPPED** | `src/core/model/relation.ts` — `'provenance'` が `RelationKind` union に含まれる |
> | Slice C（`Relation.metadata?` フィールド） | **SHIPPED** | 同上 — `metadata?: Record<string, unknown>` が Relation interface に追加済み。merge-import（`container-ops.ts` の `conversion_kind: 'revision-branch'`）と concurrent-edit（`dual-edit-safety.ts` の `conversion_kind: 'concurrent-edit'`）両経路で provenance Relation が実体として生成・保存されている |
> | Slice D（text/textlog 変換での provenance Relation 生成） | **未実装（意図的保留）** | `confirm-text-to-textlog` action は `CREATE_ENTRY` + `COMMIT_EDIT` 経由で TEXTLOG を新規作成し、provenance Relation は emit していない。来歴は従来どおり meta log（body 内 markdown）で保持。Slice B/C 実装は merge-import / concurrent-edit 側で先に効いたため、text/textlog 変換側の実装は需要待ち扱い |
>
> 結論: **本 spec の中核（Slice B + C）は shipped**。Slice D は `textToTextlog` / `textlogToText` 純粋関数の返り値拡張として残タスクであり、下記の当時の計画を参照可能なまま保存する。

### Slice A — 非可逆境界の仕様固定（本ドキュメント）

- 成果物: `docs/spec/text-textlog-provenance.md`（本ファイル）
- 実装変更なし（docs only）
- 完了条件: このドキュメントが commit されること

### Slice B — RelationKind `'provenance'` 追加

- 対象ファイル: `src/core/model/relation.ts`
- 変更内容: `RelationKind` 型への `'provenance'` 追加（1 行）
- テスト: 型チェック通過のみ（型の追加は runtime test 不要）
- 依存: Slice A 完了後

### Slice C — `Relation.metadata?` フィールド追加

- 対象ファイル: `src/core/model/relation.ts`（インターフェース拡張）
- 変更内容: `metadata?: Record<string, string>` フィールド追加
- テスト: 既存 Relation テストが引き続き pass すること
- 依存: Slice B 完了後

### Slice D — 変換関数での provenance Relation 生成

- 対象ファイル:
  - `src/features/text/text-to-textlog.ts`（result に `provenanceRelation` を追加）
  - `src/features/textlog/textlog-to-text.ts`（result に `provenanceRelation` を追加）
- 変更内容:
  - `textToTextlog()` の返り値に `provenanceRelation: Relation` を追加
  - `textlogToText()` の返り値に `provenanceRelation: Relation` を追加
  - 呼び出し元（adapter 層）が `Container.relations` に格納
- テスト: §9 参照
- 依存: Slice C 完了後

---

## 9. テスト戦略

### 9.1 Slice B テスト（RelationKind）

```ts
it('provenance is a valid RelationKind', () => {
  const kind: RelationKind = 'provenance';
  expect(kind).toBe('provenance');
});
```

### 9.2 Slice C テスト（metadata フィールド）

```ts
it('Relation accepts optional metadata', () => {
  const r: Relation = {
    id: 'r1', from: 'e1', to: 'e2', kind: 'provenance',
    created_at: T0, updated_at: T0,
    metadata: { conversion_kind: 'text-to-textlog' },
  };
  expect(r.metadata?.conversion_kind).toBe('text-to-textlog');
});

it('Relation without metadata is still valid', () => {
  const r: Relation = {
    id: 'r1', from: 'e1', to: 'e2', kind: 'semantic',
    created_at: T0, updated_at: T0,
  };
  expect(r.metadata).toBeUndefined();
});
```

### 9.3 Slice D テスト（provenance Relation 生成）

```ts
// textToTextlog — provenanceRelation
it('textToTextlog emits provenanceRelation with correct fields', () => {
  const src = makeTextEntry('e1', 'My Note', '# H1\n\nBody');
  const result = textToTextlog(src, { now: new Date(T0) });
  const rel = result.provenanceRelation;
  expect(rel.from).toBe('e1');
  expect(rel.kind).toBe('provenance');
  expect(rel.metadata?.conversion_kind).toBe('text-to-textlog');
  expect(rel.metadata?.split_mode).toBe('heading');
  expect(rel.metadata?.converted_at).toBe(new Date(T0).toISOString());
});

// textlogToText — provenanceRelation
it('textlogToText emits provenanceRelation with correct fields', () => {
  const src = makeTextlogEntry('e2', 'My Log', serializedBody);
  const result = textlogToText(src, ['log-id-1'], { now: new Date(T0) });
  const rel = result.provenanceRelation;
  expect(rel.from).toBe('e2');
  expect(rel.kind).toBe('provenance');
  expect(rel.metadata?.conversion_kind).toBe('textlog-to-text');
  expect(rel.metadata?.converted_at).toBe(new Date(T0).toISOString());
});
```

---

## 10. スキーマ互換性

本仕様で定義する変更はすべて additive（追加のみ）であり、破壊的変更を含まない。

| 変更 | 種別 | SCHEMA_VERSION 更新要否 |
|------|------|----------------------|
| `RelationKind` に `'provenance'` 追加 | 型の拡張 | 不要 |
| `Relation.metadata?` フィールド追加 | optional フィールド追加 | 不要 |
| `TextToTextlogResult.provenanceRelation` 追加 | 純粋関数の返り値拡張 | 不要（Container 型変更なし） |
| `TextlogToTextResult.provenanceRelation` 追加 | 純粋関数の返り値拡張 | 不要 |

`SCHEMA_VERSION` は現在 `1`（`src/runtime/release-meta.ts`）。
本仕様のすべての変更は v1 範囲内で完結する。

---

## 11. 意図的に対象外とすること（v1）

- **双方向同期**: 変換後 entry の変更をソースに反映しない
- **ラウンドトリップ log id 安定性**: TEXT → TEXTLOG → TEXT で log id は再生成される
- **provenance グラフ UI**: 来歴可視化 UI（将来仕様 C-1 / C-2 の範囲）
- **flags の TEXT 側エンコーディング**: TEXT archetype に flags 概念を導入しない
- **複数ソースからのマージ**: 1 対 1 変換のみ
- **変換のアンドゥ**: 来歴 Relation は記録のみ；自動 undo は実装しない

---

## 12. 関連ドキュメント

| ドキュメント | 関係 |
|------------|------|
| `docs/development/textlog-text-conversion.md` | 変換実装仕様（Slice 4 / Slice 5 詳細） |
| `docs/spec/data-model.md §5` | RelationKind 正規定義 |
| `docs/spec/data-model.md §6` | Revision モデル（`prev_rid` / `content_hash`） |
| `docs/spec/schema-migration-policy.md` | スキーマ変更判断基準 |
| `docs/planning/HANDOVER_FINAL.md §6.3` | 非可逆変換の課題リスト（本仕様で解消） |
| `src/features/text/text-to-textlog.ts` | TEXT → TEXTLOG 実装 |
| `src/features/textlog/textlog-to-text.ts` | TEXTLOG → TEXT 実装 |
| `src/core/model/relation.ts` | `Relation` / `RelationKind` 型定義 |
