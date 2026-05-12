# reform-2026-05 Phase 3 stack 実行計画(2026-05-12)

**Status**: ✅ **wave 全 16 PR 着地ready**(2026-05-12 朝、PR #412〜#427、stack 完走)
**Wave**: 16 PR stack(計画 18 件から最適化、Block F の AST API expose + bundle dedup を 1 PR に統合)
**Target main 着地**: bottom-up sequential merge(全 PR CI green / user 判断で merge)

**着地内訳**:
- Block 0 doc 先行:**PR-2R** / #412
- Block A critical UX:**PR-2S / 2T / 2U** / #413 / #414 / #415
- Block B spec 完成度:**PR-2V / 2W / 2X** / #416 / #417 / #418
- Block C IR migration(可換世界 4/4):**PR-2Y / 2Z / 2AA / 2BB** / #419 / #420 / #421 / #422
- Block D 軽量:**PR-2CC / 2DD** / #423 / #424
- Block E 新機能 foundation:**PR-2EE / 2FF** / #425 / #426
- Block F 最終:**PR-2GG**(AST 公開 API + bundle dedup 同時着地)/ #427、PR-2HH(本 PR)/ PR-2II が後続

詳細は [`docs/release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md) の reform-2026-05 Phase 3 section 参照。

実装結果は実 PR への移行で固まったため、**本計画 doc は archive 候補**(`docs/development/archived/reform-2026-05/SUMMARY.md` への移動を Phase 3 wave クローズ後に検討)。

---

## 0. 背景

Phase 2 wave(2026-05-10、PR-2A〜PR-2Q、計 17 PR)着地により、PKC2 markdown notation reform が **simple-first + formal-as-serializer** 構造 + **Postel's Law(寛容に accept、厳密に send)** で確立。AI hallucination signaling + 寛容 parse + canonical hint log(3 つ組:detected / interpretedAs / canonical)も整備済。

残る課題(Known limitations / user バグレポ / roadmap §領域 10):

1. **critical UX**:theme 切替不整合(mermaid galaxy + 右ペイン TOC + PIP)/ WCAG コントラスト探索 / bold-in-if 再現バグ
2. **spec 完成度**:`:::toc` / `:::frontmatter` / `:::body` 正式実装 / `%%%` LineMap thread
3. **内部 IR Phase Z**:AST parse + render + Canonicalize + Pandoc filter export(可換世界拡大)
4. **doc maintenance**:quarterly bulk archive 前倒し / AI 規約書 v3 candidate / bundle dedup

本 wave は user direction(2026-05-12 夜「フルで、AI 規約書も先に整備、IR は migration で可換世界拡大」)を受けて起こす。

---

## 1. Stack 順序(全 18 PR)

### Block 0:doc 先行(1 PR)

| # | PR | scope |
|---|----|------|
| 1 | **PR-2R**(本 PR)| AI 規約書 v3 + Manual ch12 / Phase 3 予告 + IR migration plan + WCAG / theme 設計 doc + 本 stack 実行計画 |

### Block A:critical UX(3 PR)

| # | PR | scope |
|---|----|------|
| 2 | **PR-2S** | theme 切替整合(mermaid theme dynamic + 右ペイン TOC `prefers-color-scheme` respect + PIP popup theme 継承)|
| 3 | **PR-2T** | WCAG AA コントラスト探索 + `theme.wcag_auto_shift` Tier 0 flag(default ON、同系色 shift で 4.5:1 保証)|
| 4 | **PR-2U** | bold-in-if 再現テスト充実 + 推定 root cause fix(PR-2L sentinel と `<strong>` flanking 干渉仮説検証)|

### Block B:spec 完成度(残 deny list 実装、3 PR)

| # | PR | scope |
|---|----|------|
| 5 | **PR-2V** | `:::toc{depth=N}` 正式実装(`renderStaticTocHtml` 流用、heading 自動採番)|
| 6 | **PR-2W** | `:::frontmatter` / `:::body` 正式実装(rich-copy / Pandoc export 用 region marker)|
| 7 | **PR-2X** | `%%%` block comment LineMap thread(Split View source-preview-sync 行ズレ解消)|

### Block C:内部 IR Phase Z(可換世界拡大、4 PR、user direction「migration approach」)

| # | PR | scope |
|---|----|------|
| 8 | **PR-2Y** | AST parse 実装(markdown-it Token → `AstDocument` 変換、`src/features/ast/parse.ts`)|
| 9 | **PR-2Z** | AST render 実装(`AstDocument` → HTML、existing renderMarkdown と等価性 test)|
| 10 | **PR-2AA** | **renderMarkdown migration**(IR 経由置換、public API 不変、可換世界拡大 entry point)|
| 11 | **PR-2BB** | Canonicalize 関数 + Pandoc filter export 雛形(`11-canonicalization-spec.md` 実装 + Pandoc JSON 経路)|

### Block D:軽量改善(2 PR)

| # | PR | scope |
|---|----|------|
| 12 | **PR-2CC** | Flags inspector keyboard 操作(Tab/Enter/Space/Shift+Tab + a11y aria-labels)|
| 13 | **PR-2DD** | Phase 2 deferred hotfix wave(backlog 集約)|

### Block E:新機能 foundation(2 PR、optional)

| # | PR | scope |
|---|----|------|
| 14 | **PR-2EE** | 領域 10-6 アルバム + コンタクトシート Phase 1 foundation |
| 15 | **PR-2FF** | 領域 10-7 アプリランチャー Phase 1(`?app=launcher` URL flag)|

### Block F:最終 audit + optimization + doc(3 PR、最後)

| # | PR | scope |
|---|----|------|
| 16 | **PR-2GG** | Bundle dedup pass(累計 +X KB の Phase 9 wave 再回収、156 KB → 150 KB 目標)|
| 17 | **PR-2HH** | Doc archival sweep(quarterly 前倒し、INDEX LIVE → archive folder、110 → 80 件目標、古 doc 統廃合込み)|
| 18 | **PR-2II** | **Final ship-readiness audit**(全 stack の 8 項目セルフ監査 + visual parity matrix + 関連 doc reconcile + release report)|

---

## 2. 各 PR の判断 / 設計メモ

### PR-2S — theme 切替整合

- **問題**:System dark↔light 切替時、(a) mermaid graph(galaxy theme で固定)、(b) 右ペイン TOC、(c) PIP popup(textlog 表 click 時)が theme 不一致
- **アプローチ**:
  - mermaid:`window.matchMedia('(prefers-color-scheme: dark)')` listener で theme 動的切替
  - 右ペイン TOC:CSS `prefers-color-scheme` media query で `--c-fg` / `--c-bg` を再定義
  - PIP popup:postMessage で parent theme を継承、または popup 内で `matchMedia` listen
- **詳細**:`docs/development/theme-switching-consistency-audit.md` 参照

### PR-2T — WCAG AA コントラスト探索

- **問題**:背景色 × 前景色の組合せが可読性を損なう(AI 生成 fixture で特に発生)
- **アプローチ**:
  - WCAG コントラスト計算(`getContrastRatio(fg, bg)`)を実装
  - default 4.5:1 未達なら同系色 shift で達成、deterministic(同色 → 同 shift)
  - Tier 0 flag `theme.wcag_auto_shift`(default `true`、Flag で OFF = 設定通り)
- **詳細**:`docs/development/wcag-contrast-resolver-spec.md` 参照

### PR-2Y/2Z/2AA/2BB — IR Phase Z migration(可換世界拡大)

- **背景**:PR-2I で AST skeleton 着地済(`src/core/ast/index.ts`、19 inline + 14 block kinds)、parse/render/canonicalize は post-reform Phase Z で実装予定だった
- **user direction**:Migration approach(可換世界拡大)、Additive layer ではなく全面置換
- **アプローチ**:
  - PR-2Y:markdown-it token → AstDocument 変換(parser layer)
  - PR-2Z:AstDocument → HTML(renderer layer)、既存 renderMarkdown と byte-equivalent
  - PR-2AA:renderMarkdown internal を IR 経由に置換、public API は不変、equivalence test で regression guard
  - PR-2BB:Canonicalize(simple → formal)+ Pandoc JSON export 雛形
- **詳細**:`docs/development/ir-migration-plan-2026-05.md` 参照

### PR-2HH — Doc archival sweep(古 doc 統廃合)

- **対象**:`docs/development/` LIVE 内で RESOLVED / SUPERSEDED な doc を archive folder に移動
- **基準**(`doc-archival-discipline.md` §6.1):
  - 実装完了 + CHANGELOG 反映済 → archive
  - SUPERSEDED(v1 → v2 等)→ archive
  - 1 wave 完結 + 後続 wave 参照なし → archive
- **目標**:LIVE 110 → 80 件(quarterly target を前倒し達成)
- **archive folder 整理**:reform-2026-05 / wave-10-X / Phase 2 系を group 化

---

## 3. doc 整備方針(本 wave の特徴)

user direction「AI と人向けの手引書を先に整備」+「古いドキュメントの統廃合も込み」を受け:

| 整備対象 | 方針 |
|---------|------|
| AI 規約書 v3 candidate | v2(2026-05-09 起草、Phase 1 反映)→ v3(Phase 2+3 反映、IR 連動、Pandoc 互換性向上)|
| Manual ch12 | §12.7 reform-2026-05 Phase 2 を充実、§12.8 Phase 3 予告セクション拡張 |
| dev doc IR plan | `ir-migration-plan-2026-05.md` で migration step / equivalence test / API contract を整理 |
| dev doc WCAG | `wcag-contrast-resolver-spec.md` で algorithm / Flag / 同系色 shift policy を整理 |
| dev doc theme | `theme-switching-consistency-audit.md` で問題分析 / アプローチ / 3 site fix を整理 |
| 古 doc 統廃合 | PR-2HH で実施、本 PR では archive 候補 list のみ提示 |

---

## 4. user review 想定

朝起きたら以下を順に見ると効率的:

1. **本 doc**(`phase3-stack-execution-plan-2026-05.md`):全体俯瞰
2. **PR-2R**:doc 整備内容を review
3. **PR-2S 〜 PR-2II**:各 PR の Summary / Test plan / Visual evidence を review
4. **merge 判断**:CI green 確認 + bottom-up sequential merge(`#PR-2R` から順)

各 PR は **stack で base が前 PR**、GitHub auto-retarget で順次 main 着地。

---

## 5. wave 完結時の達成状態(想定)

- ✅ Theme 切替が iOS / Windows / Mac で 3 site 整合
- ✅ WCAG AA(4.5:1)が default で達成、Flag で opt-out
- ✅ `:::toc` `:::frontmatter` `:::body` 正式実装(deny list 完全消化)
- ✅ Split View source-preview-sync の行ズレ解消(`%%%` 含む)
- ✅ 内部 IR layer 整備(`AstDocument` parse/render/canonicalize、Pandoc 経路雛形)
- ✅ AI 規約書 v3 + Manual ch12 + dev doc set 整備
- ✅ bundle.css 150 KB 程度 / bundle.js 安定
- ✅ doc LIVE 80 件 / archive 整理済

---

## 6. 関連 doc

- canonical AI 規約書:`docs/spec/markdown-dialect-for-ai-authors-v3.md`(本 PR で起草)
- IR migration plan:`docs/development/ir-migration-plan-2026-05.md`(本 PR で起草)
- WCAG resolver spec:`docs/development/wcag-contrast-resolver-spec.md`(本 PR で起草)
- Theme switching audit:`docs/development/theme-switching-consistency-audit.md`(本 PR で起草)
- Phase 2 完了 record:`docs/release/CHANGELOG_v2.2.0.md` reform-2026-05 Phase 2 section
- Phase 2 INDEX entry:`docs/development/INDEX.md` COMPLETED — reform-2026-05 Phase 2 wave
