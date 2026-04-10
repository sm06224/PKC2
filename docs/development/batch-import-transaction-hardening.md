# Batch Import Transaction Hardening

## 1. 概要

batch import (folder structure restore 含む) の failure-atomic 保証を
**app-state レベルで厳密化する**。

現状の問題:
- `main.ts` が ~20+ 回の逐次 dispatch (`CREATE_ENTRY` → `COMMIT_EDIT` → `CREATE_RELATION` …)
  を行うため、途中で 1 回でも dispatch が失敗すると container が **中途半端に変異** する
- folder graph の validation が不十分（cycle, 重複 LID, 不明 parent 等が未検査）
- planning ロジックが main.ts の click handler 内に混在している

---

## 2. Import phases

| Phase | 責務 | 副作用 |
|---|---|---|
| **parse** | ZIP / manifest の構文解析。`importBatchBundleFromBuffer()` | なし |
| **validate** | folder graph の整合性検証 | なし |
| **plan** | import plan の組み立て (folder 作成順、relation、entry list) | なし |
| **apply** | plan を container に一括適用 | container mutation (1 回のみ) |

parse → validate → plan は全て **pure function** であり、
失敗時は container state を変異しない。

apply は **1 つの reducer action** (`SYS_APPLY_BATCH_IMPORT`) で
plan 全体を一括適用する。途中失敗 = state 変異なし。

---

## 3. Failure-atomic contract

| 条件 | 結果 |
|---|---|
| parse 失敗 | mutation なし。`{ ok: false, error }` を返却 |
| validate 失敗 | mutation なし。plan が生成されない |
| plan 失敗 | mutation なし。plan が生成されない |
| apply 不可 (readonly / container null) | mutation なし。reducer が blocked |
| apply 成功 | container に plan 全体を一括適用 |

**部分的 import は発生しない。**

---

## 4. Malformed metadata policy

**Conservative rejection + flat fallback**:

| 条件 | 動作 |
|---|---|
| 旧 bundle (`folders` なし) | flat import (従来動作) |
| `folders` あり + 正常 | folder structure restore |
| `folders` あり + malformed | **flat import fallback** + warning |

malformed の定義:
- duplicate folder LID
- folder の `parent_lid` が `folders` 配列内に存在しない (root の `null` 以外)
- cyclic folder graph (parent 辿りが循環)
- entry の `parentFolderLid` が `folders` 配列内に存在しない
- self-parent (folder の `parent_lid` が自分自身)

malformed 検出時は **import 全体を拒否せず**、
folder restore のみ無効化して flat import に fallback する。
理由: content entry 自体は正常であり、ユーザが body を失う必要はない。

---

## 5. Folder graph validation rules

Pure function `validateFolderGraph()`:

```typescript
interface FolderGraphValidation {
  valid: boolean;
  warnings: string[];
}
```

検査項目:

| Rule | 検出 | 動作 |
|---|---|---|
| duplicate folder LID | `Set` で重複検出 | invalid → flat fallback |
| missing parent LID | parent_lid が folders に不在 | invalid → flat fallback |
| self-parent | lid === parent_lid | invalid → flat fallback |
| cycle | visited set で循環検出 | invalid → flat fallback |
| entry unknown parent | parentFolderLid が folders に不在 | invalid → flat fallback |
| empty folders array | 長さ 0 | valid (flat import) |

---

## 6. Ordering policy

**Sibling order is determined by manifest array order.**

- folder の作成順序: topological sort (parent → child)
- 同一 parent 内の content entry 順序: manifest `entries[]` の配列順
- この仕様で十分。explicit ordering metadata は不要。

---

## 7. Apply boundary

### 7.1 新規 SystemCommand

```typescript
| { type: 'SYS_APPLY_BATCH_IMPORT'; plan: BatchImportPlan }
```

### 7.2 BatchImportPlan (pure data)

```typescript
interface BatchImportPlan {
  /** Folders to create, in topological order (parent first). */
  folders: { originalLid: string; title: string; parentOriginalLid: string | null }[];
  /** Content entries to create. */
  entries: {
    archetype: 'text' | 'textlog';
    title: string;
    body: string;
    parentFolderOriginalLid?: string;
    assets: Record<string, string>;
  }[];
  /** Source filename. */
  source: string;
  /** Format string. */
  format: string;
  /** Whether folder structure is being restored. */
  restoreStructure: boolean;
}
```

### 7.3 Reducer の apply ロジック

1. container の immutable copy を作成
2. folders を topological 順で addEntry → oldLid→newLid mapping 構築
3. entries を順に addEntry → updateEntry (body 設定) → mergeAssets
4. structural relations を一括生成 (folder↔folder, folder↔entry)
5. 全成功したら新 state を返却
6. phase を `ready` に戻す

**point**: 全操作は純粋な container mutation 関数 (`addEntry`, `updateEntry`, `addRelation`, `mergeAssets`) の連鎖。
DOM / async / side-effect は一切ない。

---

## 8. Pure planning extraction

### 8.1 配置

`features/batch-import/import-planner.ts` (新規)

features layer: pure function のみ、browser API なし。

### 8.2 API

```typescript
export function buildBatchImportPlan(
  importResult: BatchImportSuccess,
  selectedIndices: Set<number>,
): BatchImportPlanResult;

type BatchImportPlanResult =
  | { ok: true; plan: BatchImportPlan }
  | { ok: false; error: string; fallbackPlan: BatchImportPlan };
```

- `ok: true` → folder structure restore 含む plan
- `ok: false` → folder graph が invalid。`fallbackPlan` は flat import plan。
  error message を warning として表示可能。

### 8.3 内部ステップ

1. folder graph validation (`validateFolderGraph`)
2. selected entries の ancestor folder 計算
3. topological sort
4. plan 構築
5. flat fallback plan 構築 (validation 失敗時)

---

## 9. User-visible behavior

| 状態 | Preview 表示 | Confirm 結果 |
|---|---|---|
| 正常な folder restore | 「フォルダ構造: N folders — 復元されます」 | folder + relation 復元 |
| malformed metadata | 「フォルダ構造: 復元不可 — フラットにインポートされます」 | flat import |
| 旧 bundle (metadata なし) | 「フォルダ構造は復元されません — エントリはフラットに追加されます」 | flat import |
| 非 folder-export | (表示なし) | flat import |

---

## 10. Operation sequence

1. ユーザが Batch ボタンで ZIP を選択
2. `previewBatchBundleFromBuffer()` で preview 抽出
3. preview panel に summary + entry list + folder restore 情報を表示
4. ユーザが entry を選択/解除
5. Continue クリック
6. `importBatchBundleFromBuffer()` で full parse
7. `buildBatchImportPlan()` で validation + plan 構築
8. `SYS_APPLY_BATCH_IMPORT { plan }` を dispatch
9. reducer が一括適用 → 成功 or blocked
10. 成功: ログに結果出力。失敗: `SYS_ERROR` dispatch。

---

## 11. Layering

| Layer | File | 変更 |
|---|---|---|
| features | `features/batch-import/import-planner.ts` | **新規**: pure planning |
| core/action | `core/action/system-command.ts` | `SYS_APPLY_BATCH_IMPORT` 追加 |
| adapter/state | `adapter/state/app-state.ts` | `SYS_APPLY_BATCH_IMPORT` reducer case 追加 |
| adapter/platform | `adapter/platform/batch-import.ts` | plan types export |
| adapter/ui | `adapter/ui/renderer.ts` | malformed metadata 時の preview 表示 |
| runtime | `main.ts` | confirm handler を plan → dispatch に書き換え |

---

## 12. Intentionally やらないこと

| 項目 | 理由 |
|---|---|
| import 先 folder 指定 | scope 外 |
| merge / overwrite | always-additive |
| undo UI | scope 外 |
| DRY 共通化 | scope 外 |
| asset preview | scope 外 |
| preview 時の folder graph validation | ~~confirm 時で十分~~ → §15 で実装済 |
| partial success | failure-atomic contract に反する |

---

## 13. テスト要件

### Planning / validation
1. valid nested folder restore plan が生成される
2. selective import で必要 ancestor のみ含まれる
3. duplicate folder LID → invalid + fallback plan
4. missing parent LID → invalid + fallback plan
5. cycle → invalid + fallback plan
6. self-parent → invalid + fallback plan
7. unknown parentFolderLid → invalid + fallback plan
8. 旧 bundle → flat plan (ok: true, restoreStructure: false)

### Atomicity
9. invalid metadata で container state が変異しない
10. plan 構築失敗で container state が変異しない
11. SYS_APPLY_BATCH_IMPORT で一括適用される

### Renderer / preview
12. malformed metadata 時の表示変更

### Regression
13. mixed import が影響を受けない
14. backward compatibility が維持される

---

## 14. 次 Issue への示唆

- import 先 folder 指定
- DRY 共通化 (export builder / import planner のパターン統一)
- lint / CLAUDE.md 整理

---

## 15. Preview-time folder graph validation

### 15.1 動機

§12 では「preview 時の folder graph validation は confirm 時で十分」としていたが、
これでは preview が「復元されます」と表示した後に confirm で flat fallback する
**surprise fallback** が発生しうる。

UX contract として、preview 表示と confirm 結果は一致しなければならない。

### 15.2 Preview-time validation contract

preview 段階で folder graph の構造妥当性を検査し、bundle を 3 つに分類する:

| 分類 | 条件 | preview 表示 |
|---|---|---|
| **restore-available** | folder-export + folders 存在 + graph valid | `フォルダ構造: N folders — 復元されます` |
| **malformed-fallback** | folder-export + folders 存在 + graph invalid | `フォルダ構造に問題があります — フラットにインポートされます` |
| **no-metadata** | folder-export + folders 不在 / 非 folder-export | `フォルダ構造は復元されません — エントリはフラットに追加されます` (folder-export 時のみ) |

### 15.3 Validation の再利用

`validateFolderGraph()` (features layer) を preview path でも呼ぶ。
validation ロジックは複製しない。

preview path では:
1. `manifest.folders` を `PlannerFolderInfo[]` に変換
2. `manifest.entries[].parent_folder_lid` を entry reference として抽出
3. `validateFolderGraph(folders, entryRefs)` を呼ぶ (folder graph + entry reference を検査)
4. valid なら `canRestoreFolderStructure: true`
5. invalid なら `canRestoreFolderStructure: false` + `folderGraphWarning` を設定

**重要**: preview と confirm は `validateFolderGraph` に同じ検査粒度の入力を渡す。
folder graph のみの検査では entry reference 不整合を preview で見落とし、
confirm で flat fallback する surprise が残る。

### 15.4 Preview data model の拡張

`BatchImportPreviewInfo` に以下を追加:

```typescript
/** Folder graph validation failed → will fall back to flat import. */
malformedFolderMetadata?: boolean;
/** Human-readable reason (from validateFolderGraph warnings). */
folderGraphWarning?: string;
```

**型統一**: `BatchImportPreviewInfo` と `BatchImportPreviewEntry` は
`core/action/system-command.ts` で定義し、adapter layer は core から import する。
adapter 内のローカル重複定義は削除する。

### 15.5 Consistency contract

| Phase | Classification | 動作 |
|---|---|---|
| preview: restore-available | confirm: restore | 一致 |
| preview: malformed-fallback | confirm: flat fallback | 一致 |
| preview: no-metadata | confirm: flat import | 一致 |

confirm が preview と異なるモードになるのは、parse/runtime failure (ZIP 破損等) のみ。

**保証の根拠**:
- preview と confirm の両方が `validateFolderGraph(folders, entryRefs)` を呼ぶ
- 入力は同一 manifest から派生 → 同一 folder graph + 同一 entry reference
- `validateFolderGraph` は pure function → 同一入力に対して同一結果

entry reference 検査で不整合が発覚するケースも preview 段階で検出される。

### 15.6 テスト追加要件

15. preview: valid folder metadata → restore classification
16. preview: malformed metadata → flat fallback classification with warning
17. preview: no folder metadata → flat classification (no malformed warning)
18. preview: entry referencing unknown folder → flat fallback (preview/confirm 一致)
19. renderer: restore / malformed / no-metadata の各メッセージが正しく表示される
20. preview classification と confirm apply mode の一致
21. `BatchImportPreviewInfo` が core に一本化されている (adapter に重複定義なし)
