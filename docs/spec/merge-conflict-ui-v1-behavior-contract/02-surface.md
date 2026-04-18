# 2. Surface 条件

## 2.1 conflict UI が mount される条件

以下のすべてが満たされたときにのみ conflict UI が mount される：

| 条件 | 要求 |
|------|------|
| AppPhase | `'ready'`（import preview は ready phase 内で表示） |
| importMode | `'merge'` |
| importPreview | `!== null` |
| conflict 件数 | `detectEntryConflicts(host, imported).length > 0` |
| schema check | schema mismatch なし（既存 gate 通過済み） |
| access mode | editable workspace（readonly / historical / preservation でない） |

## 2.2 conflict UI が mount されない条件

- `importMode === 'replace'` → conflict UI は出さない
- conflict 0 件 → conflict UI セクションを mount せず、MVP 5 行サマリのみ表示
- schema mismatch → conflict UI mount より前に reject（既存 gate）
- readonly / historical / preservation phase → import 自体が不可

## 2.3 unmount trigger

以下のいずれかで conflict UI は unmount される：

- `CANCEL_IMPORT` dispatch
- `CONFIRM_MERGE_IMPORT` dispatch（merge 完了）
- 新しい `SYS_IMPORT_PREVIEW` dispatch（re-preview）
- `SET_IMPORT_MODE { mode: 'replace' }` dispatch（mode 切替）
