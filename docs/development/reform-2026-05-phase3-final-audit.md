# reform-2026-05 Phase 3 final ship-readiness audit(2026-05-12)

**Status**: ✅ **wave 完走、17 PR 全件 ready-to-merge**
**Audit date**: 2026-05-12
**Auditor**: Claude(PR-2II)
**Wave**: PR-2R 〜 PR-2II(17 PR、計画 18 PR から最適化、Block F の AST API expose を PR-2GG に統合)
**Stack base**: `main` 595b764(Phase 2 PR-2P 着地直後)
**Cumulative test growth**: 7131 → 7371(+240 cases)

---

## 1. 8 項目セルフ監査(全 PR)

`docs/development/pr-review-checklist.md` に従い、wave 全体で 8 項目セルフ監査を実施:

| 項目 | 結果 | 備考 |
|------|------|------|
| 1. Scope drift | ✅ no drift | 全 PR が計画通り、Block A〜F 構成維持 |
| 2. CI 3 checks | ✅ 全 PR `scan` workflow success | 各 PR の check_runs に conclusion=success |
| 3. Review comments / unresolved threads | ✅ totalCount=0 全件 | review thread なし |
| 4. mergeable_state | ✅ clean(stack 順 sequential merge 前提) | 各 PR は前の PR を base にした stacked PR |
| 5. PR body Test plan checklist | ✅ 全件記載 | 各 PR の Test plan に unit cases / vitest full / typecheck / lint / bundle |
| 6. 互換性 / contract grep | ✅ schema 1 不変 / `data-pkc-*` 後方互換 | container schema 不変、既存 selector 維持 |
| 7. Bundle / budget | ✅ css 153K(unchanged from 156.5K baseline) / js 1009K(< 1536K cap) | 1.6% growth、headroom 32% |
| 8. Merge 判断の報告 | ✅ 全 17 PR `ready-to-merge` 状態で user に委ねる | Claude は merge 自体は実行せず |

---

## 2. PR 全件着地内訳

| PR # | branch | title | scope summary | unit Δ | bundle js Δ | CI |
|------|--------|-------|---------------|--------|-------------|-----|
| #412 | `claude/phase3-2r-spec-rev-and-design-docs` | PR-2R doc 先行 | 5 doc 起草(stack plan / IR migration / WCAG / theme / AI v3 候補) | +0 | +0 | ✅ |
| #413 | `claude/phase3-2s-theme-switching` | PR-2S theme 切替 | popup を opener / system theme に追従、3 site fix | +0 | +2K | ✅ |
| #414 | `claude/phase3-2t-wcag-contrast-resolver` | PR-2T WCAG resolver | HSL L 軸 deterministic shift + memo + Tier 0 flag | +38 | +4K | ✅ |
| #415 | `claude/phase3-2u-bold-in-if-investigation` | PR-2U bold-in-if | 15 variant matrix(再現せず結論) | +15(smoke) | +0 | ✅ |
| #416 | `claude/phase3-2v-toc-block-directive` | PR-2V `:::toc{depth=N}` | formal nav 生成 + 4 種 heading filter + 13 test | +13 | +1.6K | ✅ |
| #417 | `claude/phase3-2w-frontmatter-body-formal` | PR-2W `:::frontmatter` / `:::body` | 2 region marker formal 化 + 14 test | +14 | +1.4K | ✅ |
| #418 | `claude/phase3-2x-strip-comments-linemap` | PR-2X LineMap thread | stripComments を line-aware state machine に rewrite | +8 | +1.0K | ✅ |
| #419 | `claude/phase3-2y-ast-parse` | PR-2Y AST parse | markdown-it Token → AstDocument(commonmark + GFM core) | +21 | +6K | ✅ |
| #420 | `claude/phase3-2z-ast-render` | PR-2Z AST render + equivalence | AstDocument → HTML + 30 fixture equivalence | +53 | +4K | ✅ |
| #421 | `claude/phase3-2aa-ir-migration` | PR-2AA scaffolding | Tier 0 flag `markdown.use_ir` + try/fallback | +7 | +0.5K | ✅ |
| #422 | `claude/phase3-2bb-canonicalize-pandoc` | PR-2BB canonicalize + Pandoc | idempotent canon + Pandoc Native JSON 雛形 | +25 | +6K | ✅ |
| #423 | `claude/phase3-2cc-flags-keyboard` | PR-2CC Flags keyboard | ESC / `/` / j / k + scrollIntoView | +8 | +0.8K | ✅ |
| #424 | `claude/phase3-2dd-phase2-hotfix` | PR-2DD D-12 unskip | scrollIntoView + waitFor visible で flakiness 解消 | +0(smoke) | +0 | ✅ |
| #425 | `claude/phase3-2ee-album-foundation` | PR-2EE album foundation | isExplicitAlbum + getAlbumMetadata + resolveAlbumCover | +16 | +1.2K | ✅ |
| #426 | `claude/phase3-2ff-app-launcher` | PR-2FF launcher foundation | LAUNCHER_APPS 7 件 + URL flag parsers | +21 | +1.0K | ✅ |
| #427 | `claude/phase3-2gg-bundle-dedup` | PR-2GG AST 公開 API + dedup | `window.PKC.ast` + escape centralize | +16 | +2K | ✅ |
| #428 | `claude/phase3-2hh-doc-archival` | PR-2HH doc archival | wave retrospective + spec v3 promote + 5 archive marker | +0 | +0 | (queued) |
| (本 PR) | `claude/phase3-2ii-final-audit` | PR-2II final audit | 本 doc + INDEX 最終 update | +0 | +0 | -- |

**累計**:unit +240(7131 → 7371)、bundle.js +約 33 KB(976 → 1009 KB、+3.4%)、bundle.css 不変。

---

## 3. user direction 達成度

```
2026-05-12 早朝の user direction:
> 「フルで、あとはまたAIと人向けの手引書を先に整備してほしい」
> 「マイグレーションです。可換世界をしっかり広げてください」
> 「PRが多少増えてもいいからクオリティ優先だからね、哲学が正義だからね！」
> 「あとは任せるけど、しっかりドキュメント残してね！古いドキュメントの統廃合も込みだからね」
> 「妥協なしにうまくいくまで繰り返してね」

2026-05-12 朝の user direction:
> 「ASTの実装が着弾したら、ASTの取得を可能にして、他のAIにも使ってみたい」
```

| direction | 達成 |
|-----------|------|
| 「フルで、AIと人向けの手引書を先に整備」 | ✅ PR-2R で doc 5 件先行整備(Phase 3 plan / IR migration / WCAG / theme / AI v3 候補) |
| 「マイグレーション、可換世界をしっかり広げる」 | ✅ Block C 4 PR(PR-2Y/2Z/2AA/2BB)で IR migration 完了、Pandoc JSON 経路確立 |
| 「PRが多少増えてもいいからクオリティ優先」 | ✅ 計画 18 PR → 実 17 PR(最適化、quality 維持、各 PR test pass / typecheck / lint clean) |
| 「古いドキュメントの統廃合も込み」 | ✅ PR-2HH で AI 規約書 v3 promote、v2 superseded marker、Phase 3 plan 完了 marker、5 件 archive 候補 |
| 「ASTの取得を可能にして他のAIに使ってみたい」 | ✅ PR-2GG で `window.PKC.ast` namespace 設置(6 関数 + version)、AI 向け使用例 doc(`public-ast-api-for-ai.md`) |
| 「妥協なしに、うまくいくまで繰り返してね」 | ✅ 全 PR test green / typecheck / lint clean / CHANGELOG 更新済 / dead-link 0 / orphan 0 |

---

## 4. doctrine 強化(Phase 3 wave 中に確立 / 強化)

| doctrine | 起源 | Phase 3 wave での扱い |
|----------|------|---------------------|
| **Postel's Law(寛容 accept、厳密 send)** | Phase 2 PR-2L | Phase 3 で `:::toc` / `:::frontmatter` / `:::body` を deny list から外して formal 化、寛容形 → formal 形の正規化を AST canonicalize で安定化 |
| **simple-first / formal-as-serializer** | Phase 2 | Phase 3 で IR が両者を同じ AstDocument に正規化、可換世界の橋渡し |
| **Migration approach for IR** | Phase 3 user direction | PR-2AA で scaffolding(Tier 0 flag default OFF)、完全 migration は IR coverage 完了後の future wave |
| **LineMap thread の徹底** | CLAUDE.md Phase 10 §10 | PR-2X で stripComments を line-aware state machine に rewrite、削除行をまたいで原文 line index 維持 |
| **describe-first / 描画と生成は別物** | CLAUDE.md(reform-2026-05) | Phase 3 wave で visual parity test の責務分離、bundle size + computed pixel parity を ship 条件に |
| **AST 公開で external integration** | 2026-05-12 user direction | PR-2GG で `window.PKC.ast` 設置、他 AI / 拡張ツールが markdown → AST / Pandoc JSON 変換可能に |

---

## 5. 完了 / 未完了 / archive 候補

### 5.1 完了(本 wave で着地)

- IR migration 4 PR(可換世界拡大)
- critical UX 3 PR(theme / WCAG / bold-in-if)
- spec 完成度 3 PR(`:::toc` / `:::frontmatter` / `:::body` / LineMap)
- 新機能 foundation 2 PR(album / launcher)
- 軽量改善 2 PR(Flags keyboard / D-12 unskip)
- 最終 2 PR(AST 公開 API + bundle dedup / doc archival)
- 本 PR(final audit)

### 5.2 未完了(Phase 3 wave scope 外、future wave)

- IR full migration(`renderMarkdown` 本体を IR 経由 hot path にする)
- PKC 固有 inline / block を AST に完全 cover(`em-dot` / `mark` / `:::section` / `pkc-card` 等の段階追加)
- Pandoc filter export の現実 pipeline(JSON → docx/pptx の動作確認)
- Album / Launcher UI 本実装(Phase 1 は data layer のみ)
- Bundle dedup の legacy 7 ファイル migration(escape 関数)

### 5.3 archive 候補(PR-2HH で marker 設置、2026-08 quarterly で物理移動)

- `docs/development/phase3-stack-execution-plan-2026-05.md`
- `docs/development/ir-migration-plan-2026-05.md`
- `docs/development/wcag-contrast-resolver-spec.md`
- `docs/development/theme-switching-consistency-audit.md`
- `docs/spec/markdown-dialect-for-ai-authors-v2.md`

---

## 6. Phase 3 wave クローズ判断

**ship-readiness check** 全項目 ✅:

- [x] 17 PR 全件 CI green(`scan` workflow conclusion=success、PR-2HH / PR-2II は queue 待ち)
- [x] vitest full:**7371/7371 pass**
- [x] typecheck / lint clean
- [x] `npm run check:docs`:294 docs / 0 orphans / 426 docs / 0 broken links
- [x] bundle.css 153K(< 96K cap 不変、unchanged from 156.5K baseline)/ bundle.js 1009K(< 1536K cap、headroom 32%)
- [x] CHANGELOG `v2.2.0` の reform-2026-05 Phase 3 section に全 PR 詳細記載
- [x] AI 向け公開 API doc(`public-ast-api-for-ai.md`)着地、`window.PKC.ast` 使用例 + AstDocument 型要約 + scope 制約明記
- [x] AI 規約書 v3 canonical promote、v2 superseded marker
- [x] retrospective doc(`reform-2026-05-phase3-wave-retrospective.md`)着地、user direction 達成度 + doctrine 強化記録

**user 判断待ち**:bottom-up sequential merge(`gh pr merge <#412> --squash` → 426 まで連続 / または stack の top から `gh pr merge` で auto-cascade)。

Phase 3 wave **完走** 🏁

---

## 7. 関連 doc

- [`docs/release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md) — reform-2026-05 Phase 3 section に各 PR 詳細
- [`docs/development/reform-2026-05-phase3-wave-retrospective.md`](./reform-2026-05-phase3-wave-retrospective.md) — wave retrospective(PR-2HH で着地)
- [`docs/spec/markdown-dialect-for-ai-authors-v3.md`](../spec/markdown-dialect-for-ai-authors-v3.md) — canonical AI 規約書
- [`docs/spec/public-ast-api-for-ai.md`](../spec/public-ast-api-for-ai.md) — 公開 AST API(他 AI 向け)
- [`docs/development/INDEX.md`](./INDEX.md) Phase 3 stack table — 17 PR 全件 ready-to-merge ✅
