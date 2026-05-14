#!/usr/bin/env bash
# Close stack PRs after squash merge — v2
# ============================================================================
#
# v2(2026-05-14、v2.3.x stack PR-V9 / C2)で v1 から汎用化:
#   - PR 番号 list を CLI 引数(`--prs 412 413 414`)で受ける
#   - `--aggregate <N>` で集約 PR を指定(MERGED 確認用)
#   - dry-run は **default**(誤発火防止)、実行は `--apply` 明示が必要
#   - 並行して `--prune-stale-branches` でローカル / remote の stale な
#     `claude/*` branch(closed PR + 7 日以上更新無し)を suggest / 削除
#   - `--from-pattern '<commit-message-fragment>'` で実 commit の trailer に
#     合致する PR を **動的検出**(マニュアル PR list 管理を不要にする)
#
# 使い方:
#   $ scripts/close-stack-prs-v2.sh --aggregate 445 --prs 433 434 435
#   $ scripts/close-stack-prs-v2.sh --aggregate 445 --from-pattern 'PR-V'
#   $ scripts/close-stack-prs-v2.sh --aggregate 445 --prune-stale-branches --apply
#
# 認証:gh CLI(`gh auth status`)済を前提。

set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────────

AGGREGATE_PR=""
PR_LIST=()
FROM_PATTERN=""
PRUNE_BRANCHES=0
APPLY=0
STALE_DAYS=7

usage() {
  cat <<EOF
Usage: $0 --aggregate <PR#> [--prs <#> <#> ...] [--from-pattern <fragment>]
          [--prune-stale-branches] [--stale-days <N>] [--apply]

Required:
  --aggregate <PR#>         集約 PR 番号(MERGED 確認用)

Source of PRs to close(いずれか少なくとも 1 つ):
  --prs <#> <#> ...         明示的な PR 番号 list
  --from-pattern <frag>     commit message に含まれる文字列で動的検出
                            (例:'PR-V' で本 stack の全 PR-Vn を拾う)

Optional:
  --prune-stale-branches    closed PR の claude/* branch を削除候補に
  --stale-days <N>          stale 判定の日数(default: $STALE_DAYS)
  --apply                   実行する(default は dry-run のみ)
  --help                    本 help を表示

例:
  $0 --aggregate 445 --prs 433 434 435
  $0 --aggregate 445 --from-pattern 'PR-V'
  $0 --aggregate 445 --prune-stale-branches --apply
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --aggregate) AGGREGATE_PR="$2"; shift 2 ;;
    --prs)
      shift
      while [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]]; do
        PR_LIST+=("$1")
        shift
      done
      ;;
    --from-pattern) FROM_PATTERN="$2"; shift 2 ;;
    --prune-stale-branches) PRUNE_BRANCHES=1; shift ;;
    --stale-days) STALE_DAYS="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$AGGREGATE_PR" ]]; then
  echo "❌ --aggregate is required"
  usage
  exit 1
fi

if [[ ${#PR_LIST[@]} -eq 0 && -z "$FROM_PATTERN" && $PRUNE_BRANCHES -eq 0 ]]; then
  echo "❌ At least one of --prs, --from-pattern, or --prune-stale-branches is required"
  usage
  exit 1
fi

if [[ $APPLY -eq 0 ]]; then
  echo "🟡 DRY RUN (default) — 実際の close / delete は行いません。実行は --apply"
  echo
fi

# ── Pre-flight ──────────────────────────────────────────────────────────────

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI が見つかりません。https://cli.github.com/ からインストールしてください。"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh CLI が未認証です。\`gh auth login\` を実行してください。"
  exit 1
fi

# 集約 PR が merged か確認(誤発火防止)
MAIN_STATE=$(gh pr view "$AGGREGATE_PR" --json state --jq .state 2>/dev/null || echo "ERR")
if [[ "$MAIN_STATE" != "MERGED" && "$MAIN_STATE" != "CLOSED" ]]; then
  echo "⚠️  集約 PR #$AGGREGATE_PR が MERGED/CLOSED ではありません(現:$MAIN_STATE)。"
  echo "   先に PR #$AGGREGATE_PR を merge してから再実行してください。"
  exit 1
fi
echo "✅ 集約 PR #$AGGREGATE_PR は $MAIN_STATE。"

# ── PR list dynamic resolution(--from-pattern)──────────────────────────────

if [[ -n "$FROM_PATTERN" ]]; then
  echo "🔍 --from-pattern '$FROM_PATTERN' でマッチする open PR を検索..."
  # gh pr list で OPEN な PR の中から title に pattern を含むものを抽出
  DYNAMIC_PRS=$(gh pr list --state open --limit 200 --json number,title \
    --jq ".[] | select(.title | contains(\"$FROM_PATTERN\")) | .number")
  if [[ -n "$DYNAMIC_PRS" ]]; then
    while IFS= read -r pr; do
      [[ "$pr" == "$AGGREGATE_PR" ]] && continue   # 集約 PR 自身は除外
      PR_LIST+=("$pr")
    done <<< "$DYNAMIC_PRS"
  fi
  echo "   → 検出: ${#PR_LIST[@]} 件"
fi

# ── Close loop ──────────────────────────────────────────────────────────────

CLOSED=0
SKIPPED=0
FAILED=0

if [[ ${#PR_LIST[@]} -gt 0 ]]; then
  echo
  echo "==== PR close 対象 (${#PR_LIST[@]} 件) ===="
  for pr in "${PR_LIST[@]}"; do
    STATE=$(gh pr view "$pr" --json state --jq .state 2>/dev/null || echo "MISSING")
    case "$STATE" in
      MERGED|CLOSED)
        echo "  ✓ PR #$pr は既に $STATE — skip"
        SKIPPED=$((SKIPPED + 1))
        ;;
      OPEN)
        if [[ $APPLY -eq 0 ]]; then
          echo "  🟡 [dry-run] PR #$pr を close + branch delete する予定"
        else
          echo "  → PR #$pr を close + branch delete"
          if gh pr close "$pr" --delete-branch \
              --comment "集約 PR #$AGGREGATE_PR の merge により superseded。本 PR を close + branch 削除。$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null 2>&1; then
            CLOSED=$((CLOSED + 1))
          else
            echo "    ❌ close 失敗"
            FAILED=$((FAILED + 1))
          fi
        fi
        ;;
      MISSING)
        echo "  ⚠️  PR #$pr が見つかりません — skip"
        SKIPPED=$((SKIPPED + 1))
        ;;
      *)
        echo "  ⚠️  PR #$pr 不明状態 ($STATE) — skip"
        SKIPPED=$((SKIPPED + 1))
        ;;
    esac
  done
fi

# ── Stale branch pruning(remote のみ)──────────────────────────────────────

PRUNED=0
PRUNE_SKIPPED=0

if [[ $PRUNE_BRANCHES -eq 1 ]]; then
  echo
  echo "==== Stale claude/* branch pruning ($STALE_DAYS 日以上更新無 + closed PR) ===="
  # remote refs を最新化
  git fetch --prune origin >/dev/null 2>&1 || true
  CUTOFF_TS=$(date -u -d "$STALE_DAYS days ago" +%s 2>/dev/null \
              || date -u -v "-${STALE_DAYS}d" +%s)
  # remote claude/* branches で commit-date が cutoff 以前のものを列挙
  REMOTE_BRANCHES=$(git for-each-ref --format='%(refname:lstrip=3) %(committerdate:unix)' \
    'refs/remotes/origin/claude/*' || true)
  while IFS=' ' read -r branch ts; do
    [[ -z "$branch" || -z "$ts" ]] && continue
    if [[ "$ts" -gt "$CUTOFF_TS" ]]; then continue; fi
    # branch に紐づく PR がまだ open なら skip
    PR_FOR_BRANCH=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
    if [[ -n "$PR_FOR_BRANCH" ]]; then
      echo "  ⏸  $branch — open PR #$PR_FOR_BRANCH 紐付き、skip"
      PRUNE_SKIPPED=$((PRUNE_SKIPPED + 1))
      continue
    fi
    if [[ $APPLY -eq 0 ]]; then
      echo "  🟡 [dry-run] $branch を remote から削除する予定(stale)"
    else
      echo "  → $branch を remote から削除"
      if git push origin --delete "$branch" >/dev/null 2>&1; then
        PRUNED=$((PRUNED + 1))
      else
        echo "    ❌ delete 失敗"
        FAILED=$((FAILED + 1))
      fi
    fi
  done <<< "$REMOTE_BRANCHES"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo
echo "==== Summary ===="
echo "  PR Closed: $CLOSED"
echo "  PR Skipped: $SKIPPED"
echo "  Branch Pruned: $PRUNED"
echo "  Branch Skipped (open PR): $PRUNE_SKIPPED"
echo "  Failed: $FAILED"
echo

if [[ $FAILED -gt 0 ]]; then
  echo "⚠️  一部の操作で失敗しました。GitHub Web UI で個別確認してください。"
  exit 2
fi

if [[ $APPLY -eq 0 ]]; then
  echo "🟡 DRY RUN 完了。実際に close / delete するには --apply 付きで再実行してください。"
fi
