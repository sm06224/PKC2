#!/usr/bin/env bash
# 視覚監査 before/after の比較 HTML を作る(playwright-visual skill)。
#
#   ./scripts/visual-compare.sh <baseline-commit>
#
# baseline commit の build を worktree で作り、dist を差し替えながら
# 同じ操作を 2 回撮って canvas absdiff の比較表を書き出す。
#   出力: test-results/compare/visual-audit-before-after.html(自己完結 HTML)
set -euo pipefail

BASE_REF="${1:?usage: visual-compare.sh <baseline-commit>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/pkc2-visual-baseline"
cd "$ROOT"

eval "$(node scripts/resolve-pw-chromium.cjs --export)"

echo "==> 現行 build を用意"
npm run build >/dev/null
cp dist/pkc2.html "$WORK-after.html"

echo "==> baseline($BASE_REF)を worktree で build"
git worktree remove --force "$WORK" 2>/dev/null || true
rm -rf "$WORK"
git worktree add -f --detach "$WORK" "$BASE_REF" >/dev/null
ln -sfn "$ROOT/node_modules" "$WORK/node_modules"
( cd "$WORK" && npx vite build >/dev/null && npx tsx build/release-builder.ts >/dev/null )
cp "$WORK/dist/pkc2.html" "$WORK-before.html"

echo "==> before 撮影"
rm -rf test-results/compare
cp "$WORK-before.html" dist/pkc2.html
PKC_SHOT_DIR=test-results/compare/before \
  npx playwright test --config=tests/smoke/playwright.demo.config.ts audit-compare-capture

echo "==> after 撮影"
cp "$WORK-after.html" dist/pkc2.html
PKC_SHOT_DIR=test-results/compare/after \
  npx playwright test --config=tests/smoke/playwright.demo.config.ts audit-compare-capture

echo "==> 比較 HTML 生成"
npx playwright test --config=tests/smoke/playwright.demo.config.ts audit-compare-report

git worktree remove --force "$WORK" 2>/dev/null || true
rm -f "$WORK-before.html" "$WORK-after.html"
echo "==> test-results/compare/visual-audit-before-after.html"
