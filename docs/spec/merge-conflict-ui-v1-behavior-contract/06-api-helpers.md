# 6. API / pure helper

## 6.1 detectEntryConflicts

```ts
// features/import/conflict-detect.ts（新規）
export function detectEntryConflicts(
  host: Container,
  imported: Container,
): EntryConflict[];
```

- pure / deterministic / O(H+I)
- DOM / AppState / dispatcher 非依存（I-MergeUI10）
- cross-archetype match を発火しない

## 6.2 applyConflictResolutions

```ts
export function applyConflictResolutions(
  plan: MergePlan,
  resolutions: Record<string, Resolution>,
  conflicts: EntryConflict[],
): { plan: MergePlan; provenance_relations: Relation[] };
```

- pure / deterministic
- `keep-current` / `skip` → 該当 imported entry を plan から除外
- `duplicate-as-branch` → plan に残す + provenance relation を生成
- 既存 `applyMergePlan` は無変更

## 6.3 normalizeTitle

```ts
// features/import/conflict-detect.ts 内 or export
export function normalizeTitle(title: string): string;
```

- NFC 正規化 + trim + 連続空白圧縮
- §4.1 の pseudocode に準拠

## 6.4 bodyPreview

```ts
export function bodyPreview(body: string): string;
```

- §4.6 の規則に準拠
- 200 code points slice + 改行 → `↵` + ellipsis

## 6.5 パイプライン

```
(host, imported)
  → planMergeImport → MergePlan0（MVP 出力）
  → detectEntryConflicts → EntryConflict[]
  → UI でユーザーが resolution を選択
  → applyConflictResolutions(MergePlan0, resolutions, conflicts) → MergePlan1
  → CONFIRM_MERGE_IMPORT(MergePlan1) → 既存 applyMergePlan 経路
```

既存 `applyMergePlan` は無変更。新規 pure helper と reducer 拡張のみで v1 が成立する。
