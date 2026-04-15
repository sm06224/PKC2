# Release Automation + Size Budget + Smoke Baseline (Tier 3-2)

**Status**: COMPLETED — Tier 3-2（2026-04-14）
**Scope**: 3 つの運用自動化を 1 セッションで合併処理。
1. **Release automation**（D）— tag push で GitHub Release を自動作成し artifact を添付
2. **Bundle size budget**（C-1）— `dist/bundle.js` / `dist/bundle.css` の raw サイズ上限を CI が検証
3. **Playwright smoke baseline**（C-2）— 1 本の smoke test で「アプリが起動し、create Text で editing phase に遷移する」動作を CI で pin

本ドキュメントは 3 つに共通する運用判断を 1 箇所にまとめる。

---

## 1. Release automation（D）

### 1.1 ファイル
- `.github/workflows/release.yml`（新規）

### 1.2 動作
- トリガー: `v*` tag push（例: `v0.1.1`, `v0.2.0-rc.1`）
- ビルド: `build:bundle` → `build:release` → `build:manual`
- 成果物: `dist/pkc2.html` + `PKC2-Extensions/pkc2-manual.html`
- Release 作成: `gh release create <tag> --title <tag> --generate-notes <artifacts>`
- `-` 入り tag（例: `v0.2.0-rc.1`）は自動で prerelease 扱い

### 1.3 採用判断

| 判断 | 採用 | 理由 |
|-----|-----|-----|
| CI と分離 | **分離（別 workflow ファイル）** | トリガーが違う（tag vs push/PR）、責務が違う（produce vs verify）、失敗が独立して通知されるべき |
| changelog 自動生成 | `--generate-notes`（gh built-in） | semver / conventional-commits 前提の自動生成は Tier 3-3 以降。Tier 3-2 は「最低限配布できる」が目標 |
| artifact | `dist/pkc2.html` と `manual.html` の 2 本 | v0.1.0 handover で「single HTML + manual HTML の 2 本」が canonical artifact。ZIP は export 機能が吐くものであって release asset ではない |
| permissions | `contents: write` のみ | GitHub Token の最小権限原則 |

### 1.4 運用

```
git tag v0.1.1 && git push origin v0.1.1
→ GitHub Actions が自動で Release 作成 + artifact 添付
```

Tag message やハンドクラフト changelog は **Release 側で後編集する**
想定。docs/planning/CHANGELOG_*.md に追記しておけば、後で手動で
コピペする運用。

---

## 2. Bundle size budget（C-1）

### 2.1 ファイル
- `build/check-bundle-size.cjs`（新規、~60 行）
- `.github/workflows/ci.yml`（step 追加）
- `package.json` に `size-budget` npm script 追加

### 2.2 しきい値

| ファイル | baseline（Tier 3-1）| budget | 余白 |
|---------|-------------------|--------|------|
| `dist/bundle.js` | 491.03 KB | **615 KB** | 約 25%（125 KB） |
| `dist/bundle.css` | 70.61 KB | **90 KB** | 約 27%（20 KB） |

**raw バイト** で比較。gzip でないのは、ratio が content に
依存して安定しないため。**「コードが増えた」という純粋なシグナル**
が欲しい場面なので raw が正しい。

### 2.3 採用判断

| 判断 | 採用 | 理由 |
|-----|-----|-----|
| 扱い | **hard fail** | warning だと PR review 中に見落としやすい。超過時は理由とともに `maxBytes` を引き上げる commit が PR に含まれる形にする |
| 対象 | raw size（gzip 非対象） | ratio が content compressibility で揺れるので、純粋な「コードが増えた」シグナルを取りたい |
| しきい値の調整 | source コード内で定数管理 | 設定ファイル別出しは over-engineering。1 箇所の定数を書き換える PR が leave-on-review の材料になる |
| 非 hard-fail 候補 | 採らず | warning はノイズ化しやすい |

### 2.4 超過時の対応

`[size-budget] FAIL dist/bundle.js  680.12 KB / 615.00 KB (110.6%)` の
ようにサイズ超過が報告される。対応は 2 通り:

1. **意図した増加** — `build/check-bundle-size.cjs` の `maxBytes` を
   引き上げる単独 commit を PR に含める。commit メッセージで理由を
   明示（例: "bump bundle.js budget to 700 KB — added markdown-it
   plugin for Tier 3-N"）
2. **意図しない増加** — 依存追加 / dead code / wrong layer import を
   疑う。bundle analyzer（`vite-bundle-visualizer` 等）を一時導入
   するのが初手

### 2.5 例外運用

GitHub Actions の lint step と違い、size-budget は **continue-on-error
しない**。pre-existing な lint error と違い、サイズ超過は瞬時に調査
すべきシグナルのため。

---

## 3. Playwright smoke baseline（C-2）

### 3.1 ファイル
- `tests/smoke/playwright.config.ts`（新規）
- `tests/smoke/app-launch.spec.ts`（新規、1 件）
- `scripts/smoke-serve.cjs`（新規、~50 行の hand-rolled 静的サーバ）
- `.github/workflows/smoke.yml`（新規）
- `package.json` に `test:smoke` npm script 追加
- `.gitignore` に `test-results/` / `playwright-report/` を追加

### 3.2 シナリオ
**1 本に絞る** — 「boot + 1 user action」のみ:

1. `dist/pkc2.html` をロード
2. `#pkc-root` の `data-pkc-phase` が `ready` になるのを待つ
   （= IDB bootstrap が通った証拠）
3. `[data-pkc-action="create-entry"][data-pkc-archetype="text"]` をクリック
4. `data-pkc-phase` が `editing` に遷移し、`[data-pkc-field="title"]`
   が visible になるのを確認
5. ページ上で `console.error` / `pageerror` が 1 件も発生していないことを確認

### 3.3 採用判断

| 判断 | 採用 | 理由 |
|-----|-----|-----|
| shared CI か別 workflow か | **別 workflow（`smoke.yml`）** | 基本 CI は 1 分以下で済ませたい。Playwright は browser install で +1.5 分。常時走らせると dev tier の petit push に不釣り合い |
| トリガー | push to main + PR to main | `claude/**` 開発ブランチには走らせない（ci.yml で十分）。merge 前の gate として smoke を走らせる |
| シナリオ数 | **1 本のみ** | baseline は「死んでいない」を保証するもの。広範な flow は Tier 3-3 以降（C-3）の仕事 |
| ブラウザ | chromium 単体 | single-HTML が deliverable。Firefox / WebKit は cross-browser bug が出た時点で追加 |
| 静的サーバ | **自前 `scripts/smoke-serve.cjs`** | `npx http-server` は Playwright の readiness probe と race して 404 を返す現象を観測（ローカル再現可）。40 行の Node http でロバスト化 |
| URL 方式 | `http://` + 4173 | `file://` は Chromium の IndexedDB block policy で flaky。http は deterministic |
| retry | CI で 1 回、local で 0 回 | flakiness は retry でなく原因究明で対処する方針。ただし CI の cold-start race だけ 1 retry で吸収 |

### 3.4 flaky 耐性

- 絶対に増やさない: 複雑なシナリオ、assert 数、待機時間
- 追加 spec は **必ず別ファイル** に分けて、1 本あたりの責務を単純に保つ
- CI に乗らないテストは本書の対象外

### 3.5 Playwright 依存

- `@playwright/test@^1.56.1` を devDependency として追加
- Chromium browser は `npx playwright install --with-deps chromium`
  で CI 毎に取得（`actions/setup-node@v4` の cache はブラウザを含ま
  ないため別手順が必要）
- ローカル開発では `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` 等の
  環境変数で既存インストールを流用可能（Tier 1-2 の manual capture
  と同じ仕組み）

---

## 4. Tier 3-2 全体の採用判断サマリ

| 項目 | 採用 |
|-----|-----|
| release.yml を CI と分離 | Yes — トリガー / 責務の違いを尊重 |
| size budget を hard fail | Yes — レビュー時の見落とし防止 |
| Playwright を smoke 1 本に絞る | Yes — baseline の責務に徹する |
| Playwright を smoke 専用 workflow に | Yes — CI 速度を守る |
| smoke 用 static server を自前 | Yes — http-server の race を回避 |
| `@playwright/test` バージョン | `^1.56.1`（chromium 1194 と整合） |

---

## 5. 変更ファイル一覧

### 新規
- `.github/workflows/release.yml`
- `.github/workflows/smoke.yml`
- `build/check-bundle-size.cjs`
- `scripts/smoke-serve.cjs`
- `tests/smoke/playwright.config.ts`
- `tests/smoke/app-launch.spec.ts`
- `docs/development/release-automation-and-smoke-baseline.md`（本書）

### 変更
- `.github/workflows/ci.yml` — `Bundle size budget` step を追加
- `package.json` — `@playwright/test` devDep、`test:smoke` / `size-budget` script
- `.gitignore` — Playwright artifacts を除外

### 変更なし（意図通り）
- `src/**` — production code は 1 行も触らない
- `tests/{core,features,adapter,...}/**` — 既存 vitest は無変更
- `dist/**` — 再ビルドで更新されるのみ

## 6. 未対応 / intentionally not done

Tier 3-2 では **意図的に実装しない**:

- **広範 E2E（C-3）** — kanban / calendar / multi-select / merge import
  のような複合 flow。baseline が安定してから段階的に追加する
- **lint baseline 解消（C-4）** — `no-restricted-imports` の 80 件
  error。ESLint config が CLAUDE.md の層規則と矛盾している根治は
  別 PR の仕事
- **changelog 自動生成** — conventional commits / semantic-release 等
  の導入は Tier 3-3 以降で再評価
- **release artifact の署名** — GPG / cosign / SBOM は v1.x の大型
  テーマ
- **visual regression** — screenshot diff は将来の検討事項

## 7. 次の示唆

Tier 3-2 完了後の状態:

- ユーザーは `v0.1.1` タグを切れば配布物が自動で GitHub Release に
  乗る
- bundle size が急増した commit は merge 前に CI が止める
- smoke test 1 本で「boot + create の死に」を CI が検出する

次は **Tier 3-3 の再評価セッション**（実装ではなく選定）。候補は
`TIER3_PRIORITIZATION.md §4.3 / §6 Phase C`:

- B. archetype 拡張（spec 化先行）
- C-3. 広範 E2E
- C-4. lint baseline 解消
- E の一部（i18n? multi-cid?）

新たなユーザー要求 / 実害がどこから来るかを 1 セッション棚卸しして
から、Tier 3-3 に入るのが筋。

## 8. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版（Tier 3-2 実装と同時） |
