# PKC2 Versioning Policy

## 1. 目的

PKC2 は **単一 HTML / ローカルファースト / 長期使用ツール** という特殊な配布形態を持つ。利用者は多くの場合、ネットワーク越しに配布サーバを再訪せず、手元にある `pkc2.html` をそのまま使い続ける。そのため、**About 画面の version 表示** が、利用者にとって最も信頼できる "この HTML で何ができるか" の手がかりになる。

本 policy は、**user-visible version / changelog / About 表示 が常に一致する**ことを担保するための運用ルールを固定する。

過去に v2.0.0 のまま多数の可視機能(W1 Tag wave / Link system foundation / Storage Profile 等)を足してしまい、ユーザーが「何が変わったのか分からない」状態を作った(Phase 3 で v2.1.0 に修正)。本 policy はその再発を防止する。

---

## 2. Version 番号の意味

PKC2 の semver は `<major>.<minor>.<patch>` 形式。

### 2.1 Major(breaking)— 例: 2.x → 3.0.0

**発生条件のいずれか**:

- **Container schema の breaking change**(`schema_version` を bump する変更)
- 既存 container を **手動 migration なしでは** 開けなくなる変更
- 公開 API / embed protocol の非互換変更
- 既存保存データが失われる可能性のある変更

**ルール**:
- 必ず migration 手順(または tool)を同梱する
- Known data loss は CHANGELOG に明記
- About の Known limitations に "breaking from vN.x to vN+1.0" を残す

### 2.2 Minor(additive feature wave)— 例: 2.0.0 → 2.1.0

**発生条件のいずれか**:

- **ユーザーに見える新機能** が 1 つ以上着地(UI コマンド / 新導線 / 新種 entry など)
- **複数の UX / data correctness 修正** がまとまって reviewable な塊になった
- 新 action / 新 data 属性が既存 body / container に additive で追加された
- **spec 固定のみ** でも、それが後続 minor の Known limitations に載る規模なら minor bump 可

**ルール**:
- `docs/release/CHANGELOG_v<version>.md` を必ず作成
- About の `release.highlights` と `release.knownLimitations` を必ず更新
- `schema_version` は **bump しない**(additive のみ)

### 2.3 Patch(bugfix / internal)— 例: 2.1.0 → 2.1.1

**発生条件のいずれか**:

- bugfix のみで新機能なし
- 依存パッケージ更新のみ
- tests / docs / internal refactor のみ(ユーザー可視変化なし)

**ルール**:
- CHANGELOG は **既存の minor doc の patch section に追記**(新規ファイル必須ではない)
- About highlights は不変、known limitations のみ必要に応じて更新
- 数が貯まれば次 minor に繰り上げて切り直しても良い

### 2.4 Docs-only / build-only

- version 非 bump、CHANGELOG 追記も不要
- ただし **既存 user-visible 文言**(manual、About 内の highlight テキスト、UI ラベル)を更新する場合は **最低 patch 相当** に昇格させて記録する

---

## 3. 必須同期(3 点同時更新)

**minor bump または major bump のとき**、以下 3 点は **同じ PR で必ず同時に更新する**:

### 3.1 Source of truth(3 箇所)

1. `package.json` の `"version"` フィールド
2. `src/runtime/release-meta.ts` の `VERSION` 定数
3. `build/about-entry-builder.ts` の `RELEASE_SUMMARY[<version>]` エントリ(新 version key を追加)

### 3.2 Changelog

- `docs/release/CHANGELOG_v<version>.md` を新規作成(minor / major)
- または既存 patch section に追記(patch)
- Highlights / Known limitations / Migration 注意 を必ず含める

### 3.3 About surface

- `build/about-entry-builder.ts` の `RELEASE_SUMMARY` が About 表示の source of truth
- highlights / knownLimitations を user-facing な短い 1 行で
- 詳細は CHANGELOG への pointer に任せる

### 3.4 dist rebuild

- `npm run build:bundle` + `npm run build:release` を実行
- `dist/bundle.js` / `dist/bundle.css` / `dist/pkc2.html` を **必ず同じ PR に含める**
- `dist/pkc2.html` の version が古いまま commit されることを避ける(CI だけでなくローカル build verify 必須)

---

## 4. Build integrity との関係

PKC2 は ReleaseMeta に `code_integrity: sha256:<hex>` を埋め込んでいるが、これは **改ざん検知用の hash** であって **user-visible version ではない**。

ユーザーは `code_integrity` を見ない前提で UX を設計する:

- About 画面に表示されるのは `version`(`2.1.0` 等の semver)
- 技術者・開発者のみが code_integrity / source_commit / build_at を参照
- つまり **semver を更新しないままで dist rebuild すると、user からは「何も変わっていないように見える」**

このため:
- build timestamp が変わっても version は変わらない
- source_commit が変わっても version は変わらない
- **code_integrity を user-visible version の代替として扱わない**

---

## 5. About は最も重要な release surface

単一 HTML 配布の性質上:

- ユーザーは GitHub や公式サイトに毎回アクセスしない
- manual の HTML は別 bundle(`PKC2-Extensions/pkc2-manual.html`)なので本体 HTML と分離している
- CI / automation に依存しない「手元の HTML に焼き込まれた情報」だけが **オフラインでも信頼できる release 情報源**

したがって About の Release block は:

1. **必須** — v2.1.0 以降、`RELEASE_SUMMARY` が無い version は docs-only dev build と解釈する
2. **self-contained** — 外部 fetch に依存しない
3. **short bullets** — 詳細は changelog 参照

---

## 6. 具体的な bump フロー

次に user-visible release を切るときの checklist:

```
1. 着地した変更を棚卸し(INDEX.md の last N エントリ)
2. Changes を分類:
   - ユーザー可視?          → minor 候補
   - schema breaking?       → major 候補
   - bugfix のみ?           → patch 候補
   - 規模と UX 影響の組合せで最終判断
3. 新 version を決定(例: 2.1.0)
4. 同じ PR で更新:
   - package.json "version"
   - src/runtime/release-meta.ts VERSION
   - build/about-entry-builder.ts RELEASE_SUMMARY に新 key を追加
     - highlights: 6-8 個、ユーザーが認識できる塊で 1 行 50 文字以内
     - knownLimitations: 4-8 個、現実の未実装 / 既知制約を正直に
     - changelog: "docs/release/CHANGELOG_v<version>.md" を指す
5. docs/release/CHANGELOG_v<version>.md を作成(または追記):
   - Highlights / Link / Tag / Storage / UI continuity / Data correctness /
     Relation / UX polish 等のカテゴリ分け
   - Known limitations を正直に列挙
   - Migration 注意
   - 参照 docs pointer
6. npm test / typecheck / lint / build:bundle / build:release を実行
7. dist/ を commit に含める
8. CHANGELOG 本文と About RELEASE_SUMMARY の bullet が矛盾しないことを目視確認
9. INDEX.md に release entry を追加
10. PR 本文に "v<version> release" と明記
```

---

## 7. Link system 3 層用語との整合(参考)

Release note / About / Changelog を書くときは **必ず Link system 3 層用語を守る**(spec `docs/spec/pkc-link-unification-v0.md` §3):

- **External Permalink** = `file/http(s) + #pkc?...`(外部アプリでクリック可能)
- **Portable PKC Reference** = `pkc://...`(PKC 内部 / 間 identifier、外部ブラウザ不可)
- **Internal Reference** = `entry:` / `asset:`(同一 PKC 本文用)

誤記禁止:
- ❌ `pkc://...` を "permalink" と呼ぶ
- ❌ `pkc://...` を "shareable URL" と呼ぶ
- ❌ `<base>#pkc?...` を "internal link" と呼ぶ

CHANGELOG / About / manual の全てでこの用語統一を維持する。

---

## 8. 非目標

- semver 厳密な勧告(semver.org の major-breaking 厳密適用を ユーザー判定より優先しない)
- 自動 version bump CI(人間判断を優先)
- Release ブランチ / tag 運用の厳密化(現状のフラット main 運用を前提にする)
- marketing 寄りの "release theme" naming(v2.1 "Link foundation" 等、好みで付けても良いが必須ではない)

---

## 9. 参照

- `docs/spec/release-builder-commit-stamp.md` — build stamp / source_commit の仕組み
- `docs/development/release-automation-and-smoke-baseline.md` — release automation / CI baseline
- `docs/spec/pkc-link-unification-v0.md` §3 — Link system 3 層用語
- `docs/release/CHANGELOG_v<version>.md` — 各 release 詳細
- `src/runtime/release-meta.ts` — version / schema / capabilities 定数
- `build/about-entry-builder.ts` — About payload build-time 構築

---

**Status**: v2.1.0(2026-04-24)時点の policy draft。次 release 準備時にフローが noisy / restrictive と感じたら本 doc を更新して簡素化する。ただし「About と package.json と CHANGELOG が同期している」の invariant は絶対に崩さない。
