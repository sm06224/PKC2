# Merge Conflict UI v1 — Pure/Data Slice 実装メモ

Created: 2026-04-17
Commit: bbf8003

## 実装範囲

`src/features/import/conflict-detect.ts` に pure helper 4 関数と型を追加。

| export | 種別 | 概要 |
|--------|------|------|
| `normalizeTitle` | helper | NFC + trim + 空白圧縮 |
| `contentHash` | helper | body + archetype → FNV-1a-64 hex（title 除外） |
| `bodyPreview` | helper | 200 code points + `↵` + `...` |
| `detectEntryConflicts` | helper | C1/C2/C2-multi/C3 分類、O(H+I) |
| `applyConflictResolutions` | helper | plan 絞り込み + provenance data 生成 |
| `ConflictKind` / `Resolution` / `EntryConflict` | type | conflict UI 共通型 |
| `ProvenanceRelationData` / `ConflictResolutionResult` | type | resolution 適用結果 |

## 設計判断

1. **ProvenanceRelationData 型を独立定義**: core `Relation` 型に `'provenance'` kind や `metadata` field がないため、構造データとして出力。Relation への変換は reducer wiring slice の責務
2. **applyConflictResolutions の戻り値**: contract の `{ plan, provenance_relations }` を `ConflictResolutionResult` に拡張。`suppressedByKeepCurrent` / `suppressedBySkip` を分離記録（I-MergeUI2）
3. **host_lid は常に string**: contract では `string | null` だが、multi-host でも代表を必ず選定するため実質 non-null

## この slice の invariant 保証範囲

| invariant | 保証方法 |
|-----------|---------|
| I-MergeUI1 | host 書き込み経路なし。テスト #14 で host entry 不変を検証 |
| I-MergeUI2 | keep-current と skip の plan 出力同一。テスト #11 で検証 |
| I-MergeUI4 | provenance direction from=imported, to=host。テスト #12 で検証 |
| I-MergeUI10 | DOM/AppState import なし。同一入力 → 同一出力。テスト #13 で検証 |

## この slice で未検証

- I-MergeUI7（multi-host + keep-current の reject）→ reducer wiring slice
- event payload 分離（suppressed_by_*）→ reducer wiring slice

## 次 slice

reducer / AppState wiring（`SET_CONFLICT_RESOLUTION` / `BULK_SET_CONFLICT_RESOLUTION` / lifecycle）
