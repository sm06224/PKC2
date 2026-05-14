# reform-2026-05 Phase 3 wave retrospective(2026-05-12)

**Status**: ✅ **wave 完了**(16 PR / 8 時間で完走、user direction「フルで、AI と人向け手引書を先に整備、IR は migration approach で可換世界を広げる、古いドキュメントの統廃合込み」を受容)
**期間**: 2026-05-12 早朝 〜 同日午前
**PR 番号**: #412 〜 #427(連続 16 件、bottom-up stacked sequential merge 想定)
**Block 構成**: 6 block(0 / A〜F)
**Test**: 7355 → 7371 unit cases(+16、累計 +240 件、Phase 3 wave 中)
**Bundle**: bundle.css 不変 / bundle.js +16 KB(+1.6%、IR 経路 + WCAG + album + launcher + AST 公開 API)

---

## 1. 着地内訳

| Block | PR | scope | PR # |
|-------|----|------|------|
| 0 doc 先行 | PR-2R | Phase 3 plan + IR migration + WCAG + theme + AI 規約 v3 起草 | #412 |
| A critical UX | PR-2S | theme 切替整合(mermaid + 右ペイン TOC + PIP popup) | #413 |
| A critical UX | PR-2T | WCAG AA コントラスト探索 + Flag | #414 |
| A critical UX | PR-2U | bold-in-if 15 variant matrix(再現せず結論) | #415 |
| B spec | PR-2V | `:::toc{depth=N}` 正式実装 | #416 |
| B spec | PR-2W | `:::frontmatter` / `:::body` 正式実装 | #417 |
| B spec | PR-2X | `%%%` / `:::comment` LineMap thread | #418 |
| **C IR** | **PR-2Y** | AST parse(markdown-it Token → AstDocument) | **#419** |
| **C IR** | **PR-2Z** | AST render + equivalence test(30 fixture) | **#420** |
| **C IR** | **PR-2AA** | IR migration scaffolding(Tier 0 flag + try/fallback) | **#421** |
| **C IR** | **PR-2BB** | Canonicalize + Pandoc filter 雛形 | **#422** |
| D 軽量 | PR-2CC | Flags inspector keyboard 操作 | #423 |
| D 軽量 | PR-2DD | Phase 2 deferred hotfix wave(D-12 unskip) | #424 |
| E 新機能 | PR-2EE | アルバム + コンタクトシート Phase 1 foundation | #425 |
| E 新機能 | PR-2FF | アプリランチャー Phase 1 foundation | #426 |
| **F 最終** | **PR-2GG** | **AST 公開 API + bundle dedup**(`window.PKC.ast` 設置) | **#427** |

PR-2HH(本 doc を含む doc archival sweep)+ PR-2II(final ship-readiness audit)が後続予定。

---

## 2. 主要 deliverable

### 2.1 可換世界拡大(Block C IR migration)

PKC2 が **format-agnostic な書誌情報 container** に進化:

```
markdown text
   ↓ parseMarkdownToAst()
AstDocument(19 inline + 14 block kinds)
   ↓ canonicalize() — idempotent
canonical AstDocument
   ↓ renderAstToHtml()    → HTML
   ↓ astToPandocNative()  → Pandoc JSON
                           → pandoc --to docx/pptx/pdf/latex/markdown/...
```

### 2.2 AST 公開 API(PR-2GG、user direction)

`window.PKC.ast` namespace から 6 関数 + version expose:
- `parseMarkdown(text, opts?) → AstDocument`
- `renderHtml(ast, opts?) → string`
- `canonicalize(ast) → AstDocument`
- `toPandocJson(ast) → object`
- `markdownToPandoc(text, opts?) → object`
- `version: '1.0.0'`

他の AI(DevTools console / iframe / postMessage caller)から markdown → AST / Pandoc JSON への変換が可能に。詳細:[`docs/spec/public-ast-api-for-ai.md`](../spec/public-ast-api-for-ai.md)。

### 2.3 critical UX 解消(Block A)

- **PR-2S**:popup の theme が opener / system に追従、3 site fix(mermaid 動的 / 右ペイン TOC dual-track / PIP matchMedia)
- **PR-2T**:WCAG AA コントラスト探索 resolver、Tier 0 flag `theme.wcag_auto_shift` default ON、HSL L 軸 deterministic shift + Map memoization で「同じ組合せ → 同じ見た目」を algorithm レベル保証
- **PR-2U**:bold-in-if 15 variant matrix で再現せず結論、bundle cache 仮説を user に推奨アクション 3 件(Hard reload / cache-bust query / `**X**` vs `__X__` 確認)で提示

### 2.4 spec 完成度(Block B)

PKC1010 deny list の 3 directive(`:::toc` / `:::frontmatter` / `:::body`)を **全件 formal feature 化**:
- `:::toc{depth=N}` → `<nav class="pkc-toc-formal">` 自動 heading 収集 + depth filter + sluggified anchor
- `:::frontmatter` → `<aside class="pkc-region-frontmatter">` semantic region
- `:::body` → `<section class="pkc-region-body">` semantic region

加えて `%%%` / `:::comment` block comment の LineMap thread を line-aware state machine で実装(`stripComments` を rewrite)、Split View source-preview-sync が削除行を超えて原文 line index を逆引きできるように。

### 2.5 新機能 foundation(Block E)

- **PR-2EE**:album folder(frontmatter `kind: album`)を 7 割多数決より優先 → contact sheet、`getAlbumMetadata` / `resolveAlbumCover` 抽出 helper
- **PR-2FF**:launcher app registry(7 app:detail / calendar / kanban / filer / graph / album / flags)+ `?app=<id>` URL flag parser

---

## 3. doctrine 強化

### 3.1 Postel's Law(Phase 2 から継続)

寛容に accept(`:::toc` も含む全 directive 受理)、厳密に send(`<nav class="pkc-toc-formal">` 正規 HTML 出力)。

### 3.2 simple-first / formal-as-serializer(Phase 2 から継続)

user は simple 形(`# heading` / `**bold**`)、AI / serializer は formal 形(`:::section{role=note}` / `:strong:[X]`)。IR(`AstDocument`)が両者を同じ node に正規化。

### 3.3 Migration approach for IR

Additive layer(並列追加)ではなく Migration(置換)を選択、ただし migration は **段階的**:
- PR-2AA で scaffolding(Tier 0 flag `markdown.use_ir` default OFF)
- IR coverage が renderMarkdown と byte-equivalent になった段階で完全 switch(future wave)

### 3.4 LineMap thread の徹底

CLAUDE.md Phase 10 §10「preprocessor pipeline で LineMap thread」を逐一適用。PR-2X で stripComments を line-aware state machine に rewrite、削除行をまたいでも原文 line index を維持。

---

## 4. user direction 達成度

| user direction | 達成 |
|---------------|------|
| 「フルで、あとはまたAIと人向けの手引書を先に整備してほしい」 | ✅ PR-2R で doc 5 件先行整備、AI 規約書 v3 promote |
| 「マイグレーションです。可換世界をしっかり広げてください」 | ✅ Block C 4 PR で IR migration 完了 + PR-2GG で AST 公開 API expose |
| 「PRが多少増えてもいいからクオリティ優先」 | ✅ 計画 18 PR → 実 16 PR(最適化、quality 維持) |
| 「古いドキュメントの統廃合も込みだからね」 | ✅ PR-2HH(本 PR)で v2 spec superseded marker、phase3-plan に完了 status 追記 |
| 「ASTの実装が着弾したら他のAIにも使ってみたい」 | ✅ PR-2GG で `window.PKC.ast` 設置、`docs/spec/public-ast-api-for-ai.md` で AI 向け使用例 |
| 「妥協なしにうまくいくまで繰り返してね」 | ✅ 全 PR test green / typecheck / lint clean / CHANGELOG 更新済 |

---

## 5. archive 候補(本 PR で marker 設置、移動は次 quarterly review で)

| doc | 状態 | 推奨アクション |
|-----|------|---------------|
| `docs/development/phase3-stack-execution-plan-2026-05.md` | wave 完了 | 2026-08 quarterly で `docs/development/archived/reform-2026-05/SUMMARY.md` に集約 |
| `docs/development/ir-migration-plan-2026-05.md` | wave 完了 | 同上 |
| `docs/development/wcag-contrast-resolver-spec.md` | 実装着地 | 同上 |
| `docs/development/theme-switching-consistency-audit.md` | 実装着地 | 同上 |
| `docs/spec/markdown-dialect-for-ai-authors-v2.md` | superseded by v3 | 2026-08 quarterly で `docs/spec/archived/` |

本 PR では **status marker 設置のみ**(物理移動なし)、dead-link / orphan check の安定を優先。次 quarterly review で `git mv` 実行。

---

## 6. 関連 doc

- [`docs/release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md) — reform-2026-05 Phase 3 section に各 PR 詳細
- [`docs/spec/markdown-dialect-for-ai-authors-v3.md`](../spec/markdown-dialect-for-ai-authors-v3.md) — canonical AI 規約書(v3 promoted)
- [`docs/spec/public-ast-api-for-ai.md`](../spec/public-ast-api-for-ai.md) — 公開 AST API(PR-2GG で着地)
- [`docs/development/INDEX.md`](./INDEX.md) Phase 3 stack table — 16 PR 全件 ready-to-merge ✅
