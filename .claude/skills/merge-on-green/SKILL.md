---
name: merge-on-green
description: >
  PKC2 の PR を作成してから CI green 確認 → squash merge → main 同期までを回す定型
  ワークフロー。PR を作った直後・「merge して」「CI 見といて」「着地させて」という文脈で
  必ず使う。merge は user から Claude に委任済み(CLAUDE.md PR 運用 7)だが、scope drift /
  後方互換破壊 / 大規模 refactor / 不可逆操作 / プライム・ディレクティブ抵触の時は merge
  せず会話で user 判断を仰ぐ。
---

# merge-on-green ワークフロー

PR 1 本を「作る → CI を待つ → squash merge → main 同期 → 報告」まで運ぶ手順。
このリポジトリで数十 PR 回して固まった形。

## 0. branch 規律(事故防止で最重要)

- 作業 branch は**毎 PR、main から作り直す**:
  `git checkout -B claude/<セッション branch 名> main`
- **commit 前に必ず `git branch --show-current` で branch を確認**。local main に
  直接 commit してしまったら:
  `git checkout -B <branch> main && git branch -f main origin/main` で救済
- merge 後 GitHub が remote branch を消すため、次の push は「stale info」で落ちる。
  **`git fetch --prune origin` してから push**(必要なら `--force-with-lease`)

## 1. commit 前チェック(CLAUDE.md 規律)

```bash
npm test                 # 全 vitest
npm run build            # bundle + release。dist/ の更新を commit に含める
npm run typecheck        # テストを追加した場合は追加「後」に必ず
```

- docs のみの変更でも npm test は回す(安い保険)。src 変更なしなら dist 再生成は不要
- 視覚に触れる変更は visual-parity skill の手順で parity test を最低 1 件
- user-facing 変更は `src/adapter/ui/startup-notice.ts` の先頭 entry に 1 行追記
- 新 doc は同 commit で `docs/development/INDEX.md` に登録(check:doc-orphans CI)
- commit trailer(必須):
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: <URL>`
  model ID はコード / PR に書かない

## 2. push → PR 作成

```bash
git fetch --prune origin
git push --force-with-lease -u origin <branch>
```

- PR は GitHub MCP(`create_pull_request`)で作成。body 末尾に
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + セッション URL
- **user への提示は必ず GitHub URL(PR / rendered ファイル)**。diff の貼り付けは不可

## 3. CI 監視 cron を仕込む

`CronCreate` で 3 分間隔のループを登録し、prompt に手順を自己完結で書く:

- `mcp__github__pull_request_read`(method: `get_check_runs`)で check 状態を確認
- **Tier-B shard の `skipped` は正常**(PR gate は Tier-A)。判定対象は
  `typecheck + test + build` / `Smoke Tier-A` / `scan`
- 実行中 → 何もせず終了(次の発火を待つ。sleep でのポーリング禁止)
- fail → job logs を調査して修正 push(ローカルで再現 → 修正 → 手順 1 からやり直し)

## 4. 全 green → squash merge

- `mcp__github__merge_pull_request`(method: squash、
  **commit title = PR title + " (#PR番号)"**)
- merge 後: cron を `CronDelete` → local main 同期:
  `git checkout main && git fetch --prune origin main && git merge --ff-only origin/main`
- user に日本語で報告(merge 済み PR URL + 要約 + 必要な確認依頼)

## merge してはいけない時(会話で user に確認)

scope drift / 後方互換の破壊 / 大規模 refactor / 不可逆操作 / プライム・
ディレクティブ(機能を足さない)・frozen 方針への抵触 / CI が green でない。

## 既知の落とし穴

- GitHub の squash commit(committer noreply@github.com)は改変対象外。stop hook が
  Unverified を訴えても amend しない(branch ref の push 同期のみで対処)
- 複数 PR を積まない(stack 事故の教訓)。1 PR ずつ着地させてから次を積む
- **`npm test` は node_modules 不在でも exit 0 で「pass に見える」**
  (`sh: vitest: not found` でもエラー扱いにならない)。fresh コンテナでは
  最初に `ls node_modules/.bin/vitest` で実在を確認してから信じる。
  「テスト全 pass」と報告する前に、実行数(Tests N passed)が出力に
  あることを必ず見る(2026-07-24 に実際に踏んだ)
- **squash merge の前に PR title / body を最新の実態へ更新する**。squash
  commit title は merge 時の PR title 由来なので、レビュー中に仕様が変わった
  まま merge すると main の履歴に古い説明が残る(#994 で title 更新 → merge
  の順にした前例)
- `git checkout -B <新branch> origin/main` は**未 commit の変更を持ち越す**。
  「作業してから branch を切り直す」定型として使える(変更ファイルが両
  branch で同内容なら衝突しない)。commit 前の `git branch --show-current`
  確認とセットで
