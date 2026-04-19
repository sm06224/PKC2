# Merge Conflict UI v1 Contract — Consolidation Retire Note

Status: RETIRE-READY (implementation pending)
Created: 2026-04-19
Scope: `docs/spec/merge-conflict-ui-v1-behavior-contract/` directory（章別 13 ファイル）を retire する可否判定と、安全な retire 手順の合意メモ

---

## 1. Canonical の所在

**Canonical**: `docs/spec/merge-conflict-ui-v1-behavior-contract.md`（単一ファイル、775 行、commit `d61b954` で固定）

- 13 章（0〜12）をすべて含み、heading hierarchy は H1 = file title / H2 = 章 / H3 = 節 に統一
- Invariance I-MergeUI1〜I-MergeUI10 を §3 に保持（`grep -c 'I-MergeUI'` = 25 で定義 10 + 参照 15）
- Supervisor 確定事項 2 点（multi-host 代表 = `updatedAt` 最新 + tie-break array index 昇順 / `contentHash` 入力 = `body + archetype`）を §0.3 / §4.2 / §4.4 に明記
- CI green（commit `d61b954`: typecheck / lint / 4457 tests / bundle size すべて pass）

統合前の predecessor spec `docs/spec/merge-import-conflict-ui-minimum-scope.md:683` が既に以下を宣言しており、単一 `.md` が最終形態として計画されていた:

> behavior contract — API / UI / invariance / error / gating / state interaction を条項化（別 spec 1 本 `docs/spec/merge-conflict-ui-v1-behavior-contract.md`）

## 2. Superseded の所在

**Superseded**: `docs/spec/merge-conflict-ui-v1-behavior-contract/`（13 ファイル、2026-04-17 付）

```
00-positioning.md
01-scope.md
02-surface.md
03-invariance.md
04-conflict-detection.md
05-resolution-ops.md
06-api-helpers.md
07-state-interaction.md
08-ui-contract.md
09-gate.md
10-error-paths.md
11-testability.md
12-non-goal.md
```

これら 13 章の本文は統合版に欠落なく吸収済み（shell concat + sed heading shift による機械的 merge）。章 0 の重複 metadata と 0.4 章構成テーブルのみ consolidation 時に編集。

## 3. 参照残りの監査

`merge-conflict-ui-v1-behavior-contract/`（trailing slash 付き path、または直下 chapter file path）への参照を全 repo 検索した結果、以下 7 ファイル・9 箇所に参照が残存している。

| # | file | line | 参照形式 | 書換え方針 |
|---|------|------|---------|-----------|
| 1 | `docs/spec/dual-edit-safety-v1-minimum-scope.md` | 197 | dir 参照 `merge-conflict-ui-v1-behavior-contract/` | trailing slash 除去 → `.md` |
| 2 | `docs/spec/dual-edit-safety-v1-behavior-contract.md` | 40 | dir 参照 | 同上 |
| 3 | `docs/spec/dual-edit-safety-v1-behavior-contract.md` | 523 | dir 参照 | 同上 |
| 4 | `docs/development/merge-conflict-ui-v1-audit.md` | 6 | dir 参照（`(contract)` 脚注） | 同上 |
| 5 | `docs/planning/00_index.md` | 35 | dir 参照（`13 章分割` 表記含む） | 同上 + 「13 章分割」→「単一ファイル統合」 |
| 6 | `docs/planning/HANDOVER_FINAL.md` | 212 | dir 参照 | 同上 |
| 7 | `docs/planning/HANDOVER_FINAL.md` | 1191 | chapter file 個別参照（`00-positioning.md` 〜 `12-non-goal.md`） | 単一ファイル + 章番号範囲に置換 |
| 8 | `docs/planning/USER_REQUEST_LEDGER.md` | 75 | dir 参照 | 同上 |
| 9 | `docs/planning/USER_REQUEST_LEDGER.md` | 277 | dir 参照 | 同上 |

**リスク評価**:
- 全て docs / planning layer。実装コード・テストからの参照は **0 件**
- ほとんどが "trailing slash 付き path" 形式（`foo/` が `foo.md` に変わるだけ）で機械的置換可能
- 唯一複雑なのは `HANDOVER_FINAL.md:1191` の 13 章個別参照のみ（人手で章範囲表記に置換）

## 4. Retire 実施可否の結論

**結論**: retire 可。ただし **単独 `git rm -r` ではなく、参照書換えと同コミットで実施** すること。

**判定根拠**:
1. 内容重複: 章別 13 ファイルの本文は canonical に完全吸収済み（機械 merge で欠落なし）
2. 他文書からの参照: 7 ファイル 9 箇所 — いずれも機械的または局所的に書換え可能
3. 実装・テストからの参照: 0 件 — 削除で build / CI に影響なし
4. 情報設計: 単一 `.md` が sibling spec（`addressbar-paste-fallback-v1-behavior-contract.md` 等）と整合する命名パターン
5. 歴史保全: git 履歴に 13 ファイルの content は完全保存され、将来 `git log -- docs/spec/merge-conflict-ui-v1-behavior-contract/` で参照可能

**可否分岐**:
- 参照書換え **を同コミットに含める** → retire 可（推奨）
- 書換えを **後回し** → retire 不可（stale link が 7 ファイルに残る）

## 5. Retire する場合の安全な次手

**Phase 2 コミット内容の提案**:

1. **参照書換え（7 ファイル）** — §3 の表の書換え方針に従い、機械置換 + `HANDOVER_FINAL.md:1191` の章別参照を章番号範囲（§0〜§12）に置換
2. **`git rm -r docs/spec/merge-conflict-ui-v1-behavior-contract/`** — 13 ファイル削除
3. **CI 確認** — typecheck / lint / test / build:bundle が全て green
4. **commit message 案**:
   ```
   docs(spec): retire merge-conflict-ui v1 contract chapter files
   
   Consolidated into single docs/spec/merge-conflict-ui-v1-behavior-contract.md
   at d61b954. Chapter content is fully preserved in that file and in git
   history. Update 7 references across docs/spec/ and docs/planning/ to
   point at the consolidated file.
   ```

**やってはいけないこと**:
- 参照書換えなしに `git rm -r` 単独実行（stale link 7 箇所が発生）
- amend による f3ab830 / d61b954 への追記（別 commit にすべき）
- 章別 file の意味的修正と retire を同コミットに混ぜる（history の atomicity が失われる）

**Go / No-Go の最終判断**: supervisor 決裁に委ねる。本 note は retire 実施の前提情報を揃えるのみで、destructive 操作は行っていない。

---

**Memo drafted 2026-04-19.**
