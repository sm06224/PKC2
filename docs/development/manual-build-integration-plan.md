# PKC2 Manual Build Integration Plan

**Status**: active — 2026-04-19 recovery + architecture pass.
**Scope**: Make `pkc2-manual.html` generation an officially managed PKC2 build artifact. Document current state, identify breakage, propose architecture, implement minimum safe recovery.

## 1. サマリ

- `pkc2-manual.html` は既に PKC2 の正規成果物として `npm run build:manual` / `build/manual-builder.ts` に組み込まれている
- `.github/workflows/release.yml` は tag push 時に `pkc2-manual.html` をビルドして GitHub Release の artifact に同梱する構成
- **ただし生成物の JSON が壊れていた**。原因は system-entry と無関係の純 JS バグ (`String.prototype.replace` の `$&` 特殊展開)
- 本 PR で 1 行規模の最小修正を適用。manual HTML の `pkc-data` が正しく parse できるようになった
- ci.yml (PR / push 検証) には `build:manual` が含まれていない — 次 PR で追加推奨

## 2. 現状棚卸し

### 2.1 Build pipeline (既存)

| Stage | Script | 出力 | Trigger |
|-------|--------|------|---------|
| 1 | `npm run build:bundle` = `vite build` | `dist/bundle.{js,css}` | dev / ci / release |
| 2 | `npm run build:release` = `tsx build/release-builder.ts` | `dist/pkc2.html` (single HTML) | dev / release |
| 3 | `npm run build:manual` = `tsx build/manual-builder.ts` | `PKC2-Extensions/pkc2-manual.html` | release only |
| 1+2 | `npm run build` | dist 完全版 | standard |
| 1+2+3 | `npm run build:all` | + manual | full release |

### 2.2 関連成果物

- `docs/manual/00..09_*.md` — chapter markdown (manual 生成の主素材)
- `docs/manual/images/*.png` — chapter に挿入する screenshot
- `docs/planning/18_運用ガイド_export_import_rehydrate.md` — chapter 08 の実体 (placeholder substitution)
- `build/shell.html` — release-builder の HTML テンプレート
- `build/about-entry-builder.ts` — release-builder が `__about__` entry を生成するヘルパ

### 2.3 CI / Release 運用

- `.github/workflows/ci.yml` — PR / push で `typecheck + lint + test + build:bundle + size-budget`。**`build:manual` を含まない**
- `.github/workflows/release.yml` — `v*` tag push で `build:bundle + build:release + build:manual` 実行、両成果物を GitHub Release に添付
- `.github/workflows/smoke.yml` — Playwright smoke test (app-launch.spec.ts のみ、manual 非対象)

### 2.4 配布責務 (public repo / GitHub Pages)

本 repo (PKC2) は **生成** と **release artifact 公開** を責務とする。public repo / GitHub Pages 側は **配布 (hosting)** を責務とし、artifact は PKC2 Release からダウンロード or Git submodule / workflow_run 連携で取得する設計が自然。境界は本 PR のスコープ外だが、責務分離は明文化する (本 doc §6)。

## 3. 破綻点の特定

### 3.1 真因: `String.prototype.replace` の `$&` 特殊展開

`build/manual-builder.ts` (修正前):

```ts
let output = template.replace(
  /<script id="pkc-data" type="application\/json">[\s\S]*?<\/script>/,
  `<script id="pkc-data" type="application/json">${pkcDataJson}</script>`,
);
```

第 2 引数 (replacement string) では `$&`, `$n`, `$<name>` が JS 仕様で特殊パターンとして扱われる:
- `$&` → マッチした全体文字列 (= 元 template の pkc-data)
- `$<name>` → named capture (存在しないので literal 残存)
- `$1` → capture group 1 (存在しないので literal 残存)

`docs/manual/09_トラブルシューティングと用語集.md:199` の markdown は:

> 置換文字列（Replace with）で `$1` / `$&` / `$<name>` などの back-reference を使うには…

この説明文の `$&` が markdown body として pkc-data JSON 内部文字列値に入った時、replace 実行時に **"マッチした元 template" へ置換される**。結果、生成 HTML の pkc-data JSON が壊れて parse 不能になっていた。

確認:
- 修正前 HTML: `$&` と `$<name>` + `$1` の混在 / `JSON.loads` が line 126 column 6448 で "Expecting ',' delimiter" エラー
- 修正後 HTML: 正常 parse、`container_id = pkc2-manual-v1` / entries 29 / assets 7

### 3.2 system-entry と本破綻の関係

当初 "system-entry 導入で manual が壊れた" と推定されていたが、実調査では **system-entry の導入は本破綻の直接原因ではない**。以下は **独立した改善機会** として記録:

- release-builder は `__about__` entry を `buildAboutEntry()` で注入するが、manual-builder は同等の注入を持たない
- `__settings__` entry は FI-Settings で導入されたが manual では不要 (RESTORE_SETTINGS は container に `__settings__` が無ければ no-op)
- 結果: 現状の manual HTML は `__about__` を持たないため About ダイアログに PKC2 本体と同じ情報が表示されない

### 3.3 CI で検知されなかった理由

- `ci.yml` が `build:manual` を実行しない。破綻は tag push (release workflow) でしか発火せず、`$&` を含む chapter 09 が追加された時点で次の release で初めて pkc-data が壊れる挙動になっていた
- 破綻しても manual-builder.ts は exit 0 / "✓" 出力のため、生成物内容の正しさを script 自体は検証しない

## 4. 目標アーキテクチャ

### 4.1 Responsibility boundary

| 責務 | 所在 | 根拠 |
|------|------|------|
| Source (markdown + images) | PKC2 repo `docs/manual/` | 本体と一貫するバージョン管理 |
| Build | PKC2 repo `build/manual-builder.ts` + `package.json` scripts | 既存。release-builder と同一 pipeline |
| Validation (CI) | PKC2 repo `.github/workflows/ci.yml` / `release.yml` | 本 PR で ci.yml 拡張を提案 |
| Artifact output | PKC2 repo (commit された `PKC2-Extensions/pkc2-manual.html` or GitHub Release) | 既存 |
| 配布 (hosting) | public repo / GitHub Pages | PKC2 Release から取得 |

### 4.2 Build command structure

```
build/
├── shell.html              (release-builder が使う HTML template)
├── about-entry-builder.ts  (release-builder の system entry 生成)
├── release-builder.ts      ← Stage 2: dist/pkc2.html
├── manual-builder.ts       ← Stage 3: PKC2-Extensions/pkc2-manual.html
├── git-stamp.ts            (shared helper)
└── check-bundle-size.cjs   (size budget)

package.json scripts:
- build:bundle   → Stage 1 (vite)
- build:release  → Stage 2
- build:manual   → Stage 3 (depends on Stage 2 output)
- build          → Stage 1 + 2
- build:all      → Stage 1 + 2 + 3  (← CI / release で推奨)
```

依存関係: **`build:manual` は `dist/pkc2.html` を入力に取る** (manual-builder.ts:30 `TEMPLATE = dist/pkc2.html`)。従って `build:all` で順序を保つか、手動で `build` → `build:manual` の順に実行。

### 4.3 CI/CD 組み込み方針

**本 PR のスコープ外だが、次 PR 推奨**:

1. `ci.yml` の verify job に step を追加:
   ```
   - name: Build manual HTML
     run: npm run build:manual
   ```
   これで PR / main push 時に manual build 成立を検証。failure は release 時まで隠れず即 surface する。

2. manual HTML の pkc-data を JSON parse できることを CI で assert (tiny shell or tsx script)。破綻 3.1 を regression 防止する。

3. 将来的に Playwright smoke でも manual を navigate check する (`tests/smoke/app-launch.spec.ts` に parallel spec)。

### 4.4 Publishing boundary

- 現状: `release.yml` が `pkc2.html` + `pkc2-manual.html` を GitHub Release artifact に添付
- 別 public repo / GitHub Pages が artifact を取得する方法:
  - (A) GitHub API で最新 Release asset 取得 (simple, タグ連動)
  - (B) workflow_run trigger で PKC2 Release 完了を感知して pull (少し複雑)
  - (C) 定期 submodule update (手動 / schedule)
- **本 PR は (A) を推奨** として明記する。実連携は public repo 側 PR で別途実施。

## 5. 実装した最小回復ステップ

### 5.1 manual-builder.ts の `$&` 回避

`build/manual-builder.ts` の `template.replace(regex, replacementString)` を `template.replace(regex, () => newScriptTag)` に変更。function replacer は戻り値が verbatim で扱われるため `$&` 等の特殊展開が発生しない。

JSDoc に背景を明記し、本 doc §3.1 への cross-link を残した。

### 5.2 検証

修正後:
- `npm run build:manual`: ✓
- 生成 HTML size: 1692.3 KB → **1687.9 KB** (~4 KB 減、`$&` で複製されていた template pkc-data が除去)
- pkc-data JSON: **正常 parse** (container_id = `pkc2-manual-v1` / entries 29 / relations 17 / assets 7)

### 5.3 本 PR で実施しないこと

- `__about__` entry の manual への注入 → Phase 3 改善として別 PR (consistency improvement、挙動変更あり)
- ci.yml への `build:manual` step 追加 → 次 PR (CI policy change)
- Playwright smoke の manual 対応 → Phase 3
- public repo / GitHub Pages 連携実装 → 別 repo 側

## 6. Migration steps (段階的実施計画)

| Phase | タスク | 成果 |
|-------|--------|------|
| **Phase 1** (PR #48) | 棚卸し + 最小回復 | design doc + `$&` fix、manual HTML 正常生成 |
| **Phase 2** (PR #49) | ci.yml に `build:manual` + `check:manual` step 追加 | PR / main push で manual breakage が即検知 |
| **Phase 3** (本 PR) | manual-builder が `__about__` entry を注入 (release-builder と parity) | manual の About ダイアログが本体と一致、release provenance (version / commit / build.timestamp) が正しく反映 |
| Phase 4 (任意) | Playwright smoke で manual HTML も navigate check | 描画レベルの regression 防止 |
| Phase 5 (public repo 側) | PKC2 Release asset → Pages 連携 (上記 §4.4 A 方式) | 配布自動化 |

### Phase 3 実装メモ (本 PR)

- `buildAboutEntry(pkg, buildAt, sourceCommit)` を `build/about-entry-builder.ts` から共有使用
- manual-builder は `aboutBuildAt = new Date().toISOString()` / `aboutCommit = computeGitStamp()` を渡す (BUILD_TIMESTAMP 固定値ではなく **実 build 時刻 / git 状態** を使用)。理由: About 表示は **release provenance** であり "この artifact がいつ / どの commit で作られたか" を示すのが本務。chapter 本文エントリは従来通り BUILD_TIMESTAMP で reproducible
- About Entry は `entries[]` の先頭に prepend (release-builder の挙動と対称)
- `about-entry-builder.ts` の `AboutEntry.archetype` 型を `string` → `'system-about'` リテラルに narrowing (manual-builder が typed `Entry[]` に push するため必要。release-builder の型推論には影響なし)

## 7. Rollback / Safety

- 本 PR の src 変更は `build/manual-builder.ts` の 1 箇所 (regex replace の第 2 引数形式を string → function に変更 + JSDoc)。runtime には無関係。`git revert` 1 コミットで完全復元可能
- 既存 `PKC2-Extensions/pkc2-manual.html` は bundle 再生成の度に git diff に出るが、本 PR では commit しない (artifact は次 CI / release 側で生成)
- `.github/workflows/release.yml` は本 PR で touch しない (将来の機能拡張とは独立)

## 8. Maintenance guidance (将来 manual を触る人向け)

### 8.1 chapter markdown 追加 / 変更

- `docs/manual/<NN>_<title>.md` を追加または編集
- manual-builder の `CHAPTER_TO_FOLDER` map (manual-builder.ts:57-67) で対応する sidebar folder を指定
- 新 folder が必要なら `FOLDERS` 配列 (manual-builder.ts:44-50) に追加

### 8.2 screenshot 追加 / 更新

- `docs/manual/images/*.png` に配置
- markdown から `![alt](asset:<file-basename-without-ext>)` で参照
- `manual-builder.ts` は PNG を base64 化して container.assets に自動収録
- 画像の MIME 解決は attachment entry (`manual-img-<key>`) 経由で行われる

### 8.3 manual build の動作検証手順 (local)

```sh
npm run build        # Stage 1+2: dist/pkc2.html
npm run build:manual # Stage 3: PKC2-Extensions/pkc2-manual.html

# 手動 parse check:
node -e "const html = require('fs').readFileSync('PKC2-Extensions/pkc2-manual.html','utf8');
 const m = html.match(/<script id=\"pkc-data\" type=\"application\\/json\">([\\s\\S]*?)<\\/script>/);
 JSON.parse(m[1]); console.log('pkc-data JSON OK');"
```

### 8.4 markdown 執筆時の注意

- `$&` / `$<name>` / `$1` 等の正規表現 back-reference 例を markdown 本文で書く場合は、本 doc §3.1 の fix が入った manual-builder で問題なく扱える (function replacer によって保護される)
- とはいえ、将来 template substitution が増えたとき同種のバグを再発させないため、**`String.prototype.replace` の第 2 引数には原則 function replacer を使う** ことを codebase 慣習として推奨

### 8.5 system-entry 整合 (Phase 3 で対応予定)

- release-builder は `build/about-entry-builder.ts` の `buildAboutEntry()` で `__about__` entry を注入する
- manual-builder は現在同等の注入を行っていない
- 将来 consistency 改善で `buildAboutEntry()` を共有 helper として呼び出す構造にするのが自然 (本 PR の scope 外)

## 9. 関連

- `src/main.ts:75-504` — boot sequence が pkc-data を読む経路
- `docs/development/boot-initialization-order.md` — boot order 全体像
- `build/release-builder.ts` — release の参考構造
- `.github/workflows/release.yml:67-68` — 現 release で `build:manual` が走る step
- `.github/workflows/ci.yml` — Phase 2 で `build:manual` を追加する対象
- `docs/manual/09_トラブルシューティングと用語集.md:199` — `$&` をトリガーした markdown の実例箇所
