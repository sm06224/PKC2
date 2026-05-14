#!/usr/bin/env bash
# Close stack PRs after PR #432 squash merge
# ============================================================================
#
# PR-2JJ v2 final 着地後、stack 元の中間 PR(#412 〜 #431 + 関連)を
# 一括 close するための codespaces 向け script。
#
# 前提:
#   - 集約 PR #432(claude/phase3-visual-audit → main)が squash merge 済
#   - merge 後、stack の中間 PR は同じ tree state を持つので自動 close 候補
#   - GitHub UI で「Merged via #432」と判定されなかった PR は手動 close 必要
#
# 動作:
#   - 対象 PR 番号 list を順に `gh pr close --delete-branch` で close
#   - --delete-branch で remote branch も一緒に削除
#   - 既に closed / merged な PR は skip(冪等)
#   - dry-run mode(`--dry-run`)で実行前確認可能
#
# 使い方(codespaces / local どちらでも):
#   $ bash scripts/close-stack-prs-after-squash-merge.sh --dry-run  # 確認
#   $ bash scripts/close-stack-prs-after-squash-merge.sh            # 実行
#
# 認証:
#   gh CLI が認証済み(`gh auth status` で確認)。codespaces なら
#   GITHUB_TOKEN 環境変数で自動認証されることが多い。
#
# 対象 PR 範囲は本 script 上部の `PRS` 配列で固定。
# 着地後に増減する場合は配列を編集してから実行。

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────

# PR-2JJ v2 final wave で stack に積まれていた中間 PR 番号(2026-05-13 時点)
# 集約 PR #432 を squash merge した後、これらは redundant になるので close。
PRS=(
  # Block 0 doc 先行
  412
  # Block A critical UX (3 PR)
  413 414 415
  # Block B spec 完成度 (3 PR)
  416 417 418
  # Block C IR migration 可換世界拡大 (4 PR)
  419 420 421 422
  # Block D 軽量改善 (2 PR)
  423 424
  # Block E 新機能 foundation (2 PR)
  425 426
  # Block F 最終 audit + 公開 API + doc (3 PR)
  427 428 429
  # Hotfix
  430 431
)

# 集約 merge 先 PR(本 PR を除外、自身は close しない)
MAIN_PR=432

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "🟡 DRY RUN — 実際の close は行いません"
  echo
fi

# ── Pre-flight ──────────────────────────────────────────────────────────────

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI が見つかりません。https://cli.github.com/ からインストールしてください。"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh CLI が未認証です。"
  echo "   codespaces:GITHUB_TOKEN env を設定するか、\`gh auth login\` を実行"
  echo "   local:\`gh auth login\` を実行"
  exit 1
fi

# 集約 PR が merged か確認(誤発火防止)
MAIN_STATE=$(gh pr view "$MAIN_PR" --json state --jq .state 2>/dev/null || echo "ERR")
if [[ "$MAIN_STATE" != "MERGED" && "$MAIN_STATE" != "CLOSED" ]]; then
  echo "⚠️  集約 PR #$MAIN_PR が MERGED 状態ではありません(現:$MAIN_STATE)。"
  echo "   先に PR #$MAIN_PR を squash merge してから本 script を実行してください。"
  exit 1
fi

echo "✅ 集約 PR #$MAIN_PR は $MAIN_STATE です。stack PR の close を開始します。"
echo

# ── Close loop ──────────────────────────────────────────────────────────────

CLOSED=0
SKIPPED=0
FAILED=0

for pr in "${PRS[@]}"; do
  STATE=$(gh pr view "$pr" --json state --jq .state 2>/dev/null || echo "MISSING")
  case "$STATE" in
    "MERGED")
      echo "  ✓ PR #$pr は既に MERGED — skip"
      SKIPPED=$((SKIPPED + 1))
      ;;
    "CLOSED")
      echo "  ✓ PR #$pr は既に CLOSED — skip"
      SKIPPED=$((SKIPPED + 1))
      ;;
    "OPEN")
      if [[ $DRY_RUN -eq 1 ]]; then
        echo "  🟡 [dry-run] PR #$pr を close + branch delete する予定"
      else
        echo "  → PR #$pr を close + branch delete"
        if gh pr close "$pr" --delete-branch \
            --comment "PR-2JJ v2 final 集約 PR #$MAIN_PR の squash merge により superseded。本 PR を close + branch を削除します。$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null 2>&1; then
          CLOSED=$((CLOSED + 1))
        else
          echo "    ❌ close 失敗"
          FAILED=$((FAILED + 1))
        fi
      fi
      ;;
    "MISSING")
      echo "  ⚠️  PR #$pr が見つかりません — skip"
      SKIPPED=$((SKIPPED + 1))
      ;;
    *)
      echo "  ⚠️  PR #$pr 不明状態 ($STATE) — skip"
      SKIPPED=$((SKIPPED + 1))
      ;;
  esac
done

# ── Summary ─────────────────────────────────────────────────────────────────

echo
echo "==== Summary ===="
echo "  Closed: $CLOSED"
echo "  Skipped: $SKIPPED"
echo "  Failed: $FAILED"
echo

if [[ $FAILED -gt 0 ]]; then
  echo "⚠️  一部の PR で close に失敗しました。GitHub Web UI で個別確認してください。"
  exit 2
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "🟡 DRY RUN 完了。実際に close するには --dry-run なしで再実行してください。"
fi
