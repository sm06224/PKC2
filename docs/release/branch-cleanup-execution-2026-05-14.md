# Branch cleanup execution audit(C2、2026-05-14、PR-V16)

**Context**:v2.3.x stack PR の C2 deliverable「branch cleanup script + 実行」
の **実行 phase** を本 doc で audit + 手動実行手順として残す。

## 状況

- `scripts/close-stack-prs-v2.sh` は PR-V9 で着地済(`--prs` / `--from-pattern`
  / `--prune-stale-branches` + dry-run default)
- 本 session の git 環境は ローカル proxy 経由で remote 接続しており、
  `git push origin --delete <branch>` が `fatal: the remote end hung up
  unexpectedly` で reject される
- MCP github tool に `delete_branch` API 相当が存在しない(`create_branch`
  / `delete_file`(ファイル削除のみ)/ `update_pull_request` は揃うが branch
  そのものの削除は無い)
- **結論**:script は完成 + delete 候補は audit 済、**実行は user 環境**で必要

## 削除候補 branch(13 件、いずれも PR #432 squash merge 経由で main に統合済)

| Branch | 由来 PR / wave | 状態 |
|--------|--------------|------|
| `claude/phase3-2aa-ir-migration` | PR #419 | closed via #432 squash |
| `claude/phase3-2cc-flags-keyboard` | PR #423 | closed via #432 squash |
| `claude/phase3-2ff-app-launcher` | PR #426 | closed via #432 squash |
| `claude/phase3-2hh-doc-archival` | PR #428 | closed via #432 squash |
| `claude/phase3-2s-theme-switching` | PR #413 | closed via #432 squash |
| `claude/phase3-2u-bold-in-if-investigation` | PR #415 | closed via #432 squash |
| `claude/phase3-2w-frontmatter-body-formal` | PR #417 | closed via #432 squash |
| `claude/phase3-2x-hotfix-inline-code-mask` | PR #430 | closed via #432 squash |
| `claude/phase3-2y-ast-parse` | PR #419 | closed via #432 squash |
| `claude/phase2-bold-in-if-investigation` | wave-phase2 | superseded by PR-2U |
| `claude/m7-followup-split-view-fix` | wave-m7 followup | merged via earlier wave |
| `claude/m7-followup-yaml-natural-extension` | wave-m7 followup | merged via earlier wave |
| `claude/pkc2-caret-preview-sync-pr206` | PR #206 paused | archived(spec doc `docs/development/archived/pr-findings/pr-206-paused.md`)|

## 保持 branch(2 件)

- `main`(default、protected)
- `claude/v23-stack-2026-05-14`(本 stack の active branch、PR #433)

## 手動実行手順

GitHub Web UI で:
1. Repository → Branches タブ
2. 上記 13 件を 1 つずつ "Delete" button で削除
3. 各 branch の commit は PR #432 経由で main に存在するため、削除しても履歴は失われない

または `gh` CLI(authenticated)で:
```bash
for b in phase3-2aa-ir-migration phase3-2cc-flags-keyboard phase3-2ff-app-launcher \
         phase3-2hh-doc-archival phase3-2s-theme-switching \
         phase3-2u-bold-in-if-investigation phase3-2w-frontmatter-body-formal \
         phase3-2x-hotfix-inline-code-mask phase3-2y-ast-parse \
         phase2-bold-in-if-investigation m7-followup-split-view-fix \
         m7-followup-yaml-natural-extension pkc2-caret-preview-sync-pr206; do
  gh api -X DELETE "repos/sm06224/pkc2/git/refs/heads/claude/$b"
done
```

または `scripts/close-stack-prs-v2.sh`(authenticated 環境)で:
```bash
# claude/v23-stack-2026-05-14 が squash merge された後で実行
bash scripts/close-stack-prs-v2.sh --aggregate 433 --prune-stale-branches --stale-days 0 --apply
```

(`--stale-days 0` で「全 closed PR 由来の claude/* を削除候補」)

## audit completion

- ✅ script(PR-V9)
- ✅ audit(本 doc)
- ⚠️ **実行は user 環境**(本 session の git proxy では reject されたため、
  上記手順のいずれかで user 側で実行)

C2 deliverable は spec / script / audit の 3 piece が揃った状態。実行 only が
残置。

https://claude.ai/code/session_019f6gJmFz2pLU7Q455n2f4N
