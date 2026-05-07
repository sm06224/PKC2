# Codespaces Merge Playbook — Wave 10-9 締め(2026-05-07)

**用途**: Wave 10-9 の 100 PR stack を GitHub Codespaces 上で安全に merge するための **コピペ実行用コマンド集**。
**実行者**: User(merge は Claude が実行しない。本書は user 用)。
**対象 repo**: `sm06224/PKC2`
**Top PR**: #363 / **Bottom**: #260 / **Top branch**: `claude/2026-05-10-9-filer-row-align-delta7`

---

## 0. 前提

Codespaces には `gh` CLI が pre-install されている。最初に auth + repo 状態を確認:

```bash
# 認証状態確認(login 済みなら "Logged in to github.com" が出る)
gh auth status

# repo に居ることを確認
gh repo view sm06224/PKC2 --json name,defaultBranchRef -q .

# 現在の main HEAD と top branch HEAD を比較(122 commits 先行のはず)
git fetch origin
git log --oneline origin/main..origin/claude/2026-05-10-9-filer-row-align-delta7 | wc -l
# 期待値: 122 前後
```

---

## 1. Option A — 単発 squash(推奨、~10 分)

**Top PR #363 を一気に main に squash-merge**。残 99 PR は GitHub が PR head 内容と main の diff を比較して "no diff" を検知 → **手動 close** で wave を締める。

### 1.1 Pre-flight

```bash
# CI green 確認(pass / fail のみ表示)
gh pr checks 363

# mergeable_state 確認
gh pr view 363 --json mergeable,mergeStateStatus -q '{m:.mergeable, s:.mergeStateStatus}'
# 期待: { "m": "MERGEABLE", "s": "CLEAN" }
# "BEHIND" / "BLOCKED" の場合は更に rebase / status 確認が必要
```

### 1.2 ⚠️ 必須:base を main に retarget(stacked PR の罠)

**Wave 10-9 で踏んだ事故**:`gh pr merge` は **PR の現在の base** に対して merge する。stacked PR の頂点 PR の base が中間 branch のままだと、squash しても **中間 branch に着地して main は更新されない**(2026-05-07 に実際に発生、recovery PR が必要になった)。

**top PR を main に squash する前に、必ず base を main に付け替える**:

```bash
# 現在の base を確認
gh pr view 363 --json baseRefName -q .baseRefName
# stacked の場合: claude/2026-05-10-9-graph-theme-color-time-delta6 等が出る

# base を main に retarget(GitHub UI の "Edit base branch" と等価)
gh pr edit 363 --base main

# retarget 後の確認
gh pr view 363 --json baseRefName -q .baseRefName
# 期待: main
```

**この 1 ステップを忘れると wave の全内容が中間 branch に閉じ込められる**。Option A の core risk なので、絶対に skip しない。

### 1.3 Squash merge

```bash
# title はデフォルトで PR title が入る。body は wave summary を渡す。
gh pr merge 363 \
  --squash \
  --delete-branch \
  --subject "feat(wave-10-9): stabilization wave Δ1〜Δ34 全件着地" \
  --body "$(cat <<'EOF'
Wave 10-9 stabilization の Δ1〜Δ34(122 commits / 100 PR の stack)を 1 squash で main に着地。

主な改修:
- filer: 行ズレ撃退 / column resize / multi-select bulk / 操作 UI 配置
- graph: aspect / node 過密 / Galaxy / Venn / region 楕円選択 / Ctrl+click / drag rubber band / 右クリック menu
- inline-calc: indent + list marker 対応(14 ケース matrix)
- ZIP import: streaming + progress + base64 chunked(OOM/hang 撃退)
- popup sync: caret indicator / split block sync / ⇄ toggle

詳細: docs/development/wave-10-9-stabilization-summary.md
残バグは known issue として持越し(同 doc §4)。
EOF
)"
```

### 1.4 残 99 PR を bulk close

```bash
# まずリストを保存(stack の bottom→top 順、欠番 352 を除外)
seq 260 363 | grep -v 352 | grep -v 363 > /tmp/pr-numbers.txt

# 各 PR を「superseded by #363 (squash-merged)」として close
while read pr; do
  gh pr close "$pr" --comment "Wave 10-9 締め:本 stack は #363 で squash-merge 済み。本 PR は重複のため close。詳細は docs/development/wave-10-9-stabilization-summary.md。"
done < /tmp/pr-numbers.txt
```

> **注**: 100 PR の close は 5〜10 分。途中で rate limit に当たったら `sleep 60` を挟む。

### 1.5 Verify

```bash
# main HEAD が wave 全部を含むことを確認
git fetch origin main
git log --oneline -1 origin/main
# 期待: 1a3a53b 系 hash の squash commit が HEAD

# 残 open PR が 0 件
gh pr list --state open --limit 200 | wc -l
# 期待: 0(他 wave PR が無ければ)
```

---

## 2. Option B — 順次 bottom-up squash(~30〜60 分)

**個別 PR 履歴を git log に保存したい場合**。GitHub は base PR が merge されると次の PR の base を自動 retarget するため、bottom から順に squash していけば事故なく全件 merge できる。

### 2.1 順序確定

main 起点で 4 系統に分かれる:

| 系統 | PR 範囲 | base |
|------|---------|------|
| Phase 1-5(filer) | #260 → #275(16 件) | main → 順次 |
| wave-docs-manual | #276(単発) | main |
| Review fixes | #277 → #344 | main → 順次 |
| Mobile-fixes 側枝 | #345 → #346(2 件、base=#344) | #344 着地後 main |
| Review fixes 続き | #347 → #363(欠 #352、16 件) | main → 順次 |

### 2.2 自動 merge スクリプト

```bash
# 推奨順序の PR 番号配列(主鎖 + 側枝処理)
PRS=(
  # Phase 1-5 chain
  260 261 262 263 264 265 266 267 268 269 270 271 272 273 274 275
  # wave-docs-manual
  276
  # Review fixes (主鎖 base=main)
  277 278 279 280 281 282 283 284 285 286 287 288 289 290 291 292 293 294 295 296 297 298 299 300 301 302 303 304 305 306 307 308 309 310 311 312 313 314 315 316 317 318 319 320 321 322 323 324 325 326 327 328 329 330 331 332 333 334 335 336 337 338 339 340 341 342 343 344
  # Mobile-fixes 側枝(#344 着地直後にここで合流)
  345 346
  # Review fixes 続き(#347 以降、欠 #352)
  347 348 349 350 351 353 354 355
  # Δ1〜Δ7 chain
  356 357 358 359 360 361 362 363
)

# Sequential squash merge with progress
for PR in "${PRS[@]}"; do
  echo ""
  echo "════════════════════════════════════════"
  echo "  Merging PR #$PR ($(date +%H:%M:%S))"
  echo "════════════════════════════════════════"

  # Pre-check mergeable state
  STATE=$(gh pr view "$PR" --json mergeStateStatus -q .mergeStateStatus)
  if [ "$STATE" != "CLEAN" ]; then
    echo "⚠️  PR #$PR mergeStateStatus=$STATE — 5 秒待って retry"
    sleep 5
    STATE=$(gh pr view "$PR" --json mergeStateStatus -q .mergeStateStatus)
  fi

  if ! gh pr merge "$PR" --squash --delete-branch; then
    echo "❌ FAIL on PR #$PR — 中断します。手動で確認してください"
    break
  fi

  echo "✅ #$PR merged"
  # GitHub の auto-retarget を待つ(2 秒)
  sleep 2
done
```

### 2.3 Verify

```bash
# 全 PR が merged 状態であることを確認
for PR in "${PRS[@]}"; do
  STATE=$(gh pr view "$PR" --json state -q .state)
  if [ "$STATE" != "MERGED" ]; then
    echo "⚠️  PR #$PR state=$STATE"
  fi
done
echo "Done verify"

# main の commit 数を確認
git fetch origin main
git log --oneline origin/main | head -110 | wc -l
```

---

## 3. Option C — Phase chain 分割(~20 分)

中間で local integration check を入れたい場合。`npm test` / `npm run build` を chain 切れ目で挟む。

```bash
# Chain 1: Phase 1-5
for PR in 260 261 262 263 264 265 266 267 268 269 270 271 272 273 274 275; do
  gh pr merge "$PR" --squash --delete-branch
  sleep 1
done

git fetch origin main && git checkout main && git pull
npm ci && npm test && npm run build:bundle
echo "✅ Chain 1(Phase 1-5)integration check passed"

# Chain 2: wave-docs-manual
gh pr merge 276 --squash --delete-branch

# Chain 3: Review fixes 〜 #344
for PR in $(seq 277 344); do
  gh pr merge "$PR" --squash --delete-branch
  sleep 1
done
git pull && npm test
echo "✅ Chain 3(Review fixes 〜 #344)passed"

# Chain 4: Mobile-fixes 側枝
gh pr merge 345 --squash --delete-branch
gh pr merge 346 --squash --delete-branch

# Chain 5: Review fixes 続き
for PR in 347 348 349 350 351 353 354 355 356 357 358 359 360 361 362 363; do
  gh pr merge "$PR" --squash --delete-branch
  sleep 1
done
git pull && npm test && npm run build
echo "✅ Wave 10-9 全件着地完了"
```

---

## 4. 失敗時の rollback

万一途中で merge が conflict / CI fail で詰まった場合:

```bash
# 1. 直近 N 件の merge commit を一覧
git log origin/main --oneline -20

# 2. 特定 commit を revert(merge を取り消す)
git revert -m 1 <merge-commit-sha>

# 3. push して revert PR 化(rare、まず local で確認)
git push origin main  # ← 通常は禁止、emergency 時のみ
```

> **重要**: main への直接 push は通常禁止。Conflict の場合は **問題 PR を rebase or close → 続行** が原則。

---

## 5. Post-merge cleanup(全 option 共通)

### 5.1 Local main を sync

```bash
git fetch --prune origin
git checkout main
git pull origin main
git log --oneline -5
```

### 5.2 Branches 削除確認

```bash
# Remote の wave-10-9 系 branch が全部消えていることを確認
git branch -r | grep "claude/2026-05-10-" | head -20
# 期待: 0 件、または既知の other-wave branch のみ
```

### 5.3 Version bump 検討

CHANGELOG `v2.2.0` に Δ5〜Δ34 を追記後、必要なら patch bump:

```bash
# patch bump(v2.2.0 → v2.2.1)
npm version patch --no-git-tag-version
# その後 docs/release/CHANGELOG_v2.2.1.md を起こすか、v2.2.0 に追記継続するか判断
```

> 本 wave は機能追加 + bugfix の混在。**patch (v2.2.1) で wave 締めとして起こす** 案を推奨。CLAUDE.md §「CHANGELOG 更新も同時必須」参照。

### 5.4 Doc archive

`doc-archival-discipline.md` §6.1 に従い、wave で resolved になった spec を `docs/development/archived/` に移動:

```bash
# 候補(本 wave で fully resolved)
git mv docs/development/wave-10-7-ux-evaluation-*.md docs/development/archived/  # あれば
git mv docs/development/wave-10-6-ux-evaluation-2026-05.md docs/development/archived/
# wave-10-9-stabilization-summary.md は LIVE 維持(release 後 1 wave で archive 候補)
```

---

## 6. 想定所要時間と注意事項

| Option | 所要時間 | リスク | 個別履歴 |
|--------|---------|--------|---------|
| **A** 単発 squash | ~10 分 | 最低 | ❌(1 commit に集約) |
| **B** 順次 bottom-up | ~30〜60 分 | 中(API rate limit) | ✅(100 commit) |
| **C** Phase chain 分割 | ~20 分 | 低(中間 verify) | ✅(100 commit、check-point 入り) |

**推奨**: Wave 締めの user 判断が「複雑 history 不要、bug 持越し許容」なら **Option A**。後で git log を綺麗に追いたい / audit 必要なら **Option B**。実機テストを途中で挟みたい / 不安なら **Option C**。

### Rate limit 対策

GitHub API は authenticated user で 5000 req/h。`gh pr merge` 1 件で ~5 req 消費 → 100 PR で ~500 req、十分余裕。ただし bulk close は **PR view + close で 2 req/件**、5000 req は 2500 close まで持つ。本 wave 範囲では問題なし。

### CI green 必須か?

CLAUDE.md §「Merge 判断 — 全 OK で『ユーザー側で merge 判断してよい状態です』」に従う。本 wave は user が「いくつかのバグ挙動はあるものの締める」判断済み → CI 失敗 PR があっても **user の責任で push merge OK**。`gh pr merge --squash` は `--admin` フラグで status check skip 可能(repo の branch protection 次第):

```bash
gh pr merge 363 --squash --delete-branch --admin  # admin override
```

---

## 関連 doc

- [`wave-10-9-stabilization-summary.md`](./wave-10-9-stabilization-summary.md) — wave の改修一覧 + 残バグ
- [`pr-review-checklist.md`](./pr-review-checklist.md) — 8 項目自己監査(merge 前の最終 check)
- [`doc-archival-discipline.md`](./doc-archival-discipline.md) — RESOLVED doc archive 規約
- [`../release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md) — release notes(merge 後に Δ5〜Δ34 追記要)
