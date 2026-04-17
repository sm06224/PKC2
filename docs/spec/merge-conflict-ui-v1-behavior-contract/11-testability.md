# 11. Testability

## 11.1 テスト範囲概要

| 層 | 件数目安 | 対象 |
|----|---------|------|
| pure helper | ~12 件 | detectEntryConflicts / applyConflictResolutions / normalizeTitle / bodyPreview |
| reducer | ~6 件 | SET_CONFLICT_RESOLUTION / BULK_SET_CONFLICT_RESOLUTION / reset on cancel/confirm/re-preview |
| UI/DOM | ~7 件 | mount / badge rendering / radio interaction / bulk buttons / gate disable/enable / unmount |
| **合計** | **~25 件** | |

## 11.2 pure helper テスト詳細

| # | テスト | 検証内容 |
|---|-------|---------|
| 1 | C1 検出（content-equal） | archetype + title + contentHash 一致 → kind='content-equal' |
| 2 | C2 検出（title-only） | archetype + title 一致、contentHash 不一致、host 1 件 → kind='title-only' |
| 3 | C2-multi 検出（title-only-multi） | host 候補 2 件以上 → kind='title-only-multi' + host_candidates |
| 4 | C3 判定（no-conflict） | archetype or title 不一致 → 空配列 |
| 5 | multi-host 代表選定 | updatedAt 最新が host_lid に設定される |
| 6 | multi-host tie-break | updatedAt 同一 → array index 昇順（先頭）が代表 |
| 7 | normalizeTitle: NFC + trim + 空白圧縮 | `"  Hello  World  "` → `"Hello World"` |
| 8 | normalizeTitle: 大文字小文字区別 | `"ABC"` ≠ `"abc"` |
| 9 | bodyPreview: 200 code points 未満 | ellipsis なし |
| 10 | bodyPreview: 200 code points 以上 | `...` 付加 |
| 11 | bodyPreview: 改行置換 | `\n` → `↵` |
| 12 | applyConflictResolutions: keep-current / duplicate / skip の各分岐 | plan 除外 / plan 維持 + provenance / plan 除外 |

## 11.3 reducer テスト詳細

| # | テスト | 検証内容 |
|---|-------|---------|
| 1 | SET_CONFLICT_RESOLUTION | 指定 lid の resolution が更新される |
| 2 | BULK_SET_CONFLICT_RESOLUTION（keep-current） | C2-multi は skip される（I-MergeUI7） |
| 3 | BULK_SET_CONFLICT_RESOLUTION（duplicate） | 全 conflict に適用される |
| 4 | CANCEL_IMPORT で reset | mergeConflictResolutions が undefined になる |
| 5 | CONFIRM_MERGE_IMPORT で reset | mergeConflictResolutions が undefined になる |
| 6 | re-preview（SYS_IMPORT_PREVIEW）で reset | mergeConflictResolutions が {} になる |

## 11.4 UI/DOM テスト詳細

| # | テスト | 検証内容 |
|---|-------|---------|
| 1 | conflict UI mount | `[data-pkc-region="merge-conflicts"]` が存在する |
| 2 | C1 バッジ表示 | `[data-pkc-conflict-kind="C1"]` が表示される |
| 3 | C2 バッジ表示 | `[data-pkc-conflict-kind="C2"]` が表示される |
| 4 | radio interaction | radio click → SET_CONFLICT_RESOLUTION dispatch |
| 5 | bulk button | bulk click → BULK_SET_CONFLICT_RESOLUTION dispatch |
| 6 | gate disable/enable | C2 未 resolve → Confirm disabled、全 resolve → enabled |
| 7 | unmount on cancel | CANCEL_IMPORT → conflict UI が消える |
