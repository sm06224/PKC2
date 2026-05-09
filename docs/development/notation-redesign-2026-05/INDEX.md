# PKC2 記法整理 v2 設計書(2026-05-09 ドラフト)

**status**: draft、技術的レビュー / 運用的レビュー 待ち
**audience**: 他 AI(技術的 / 運用的レビュアー)+ User(意思決定)
**目的**: PKC2 全記法を simple-first 二層化(simple ↔ formal 可換、IR 経由)で再設計、その背景・理由・代替案を網羅的に提示する。

---

## 文書構成(章割)

| 章 | ファイル | 内容 | 推奨レビュー観点 |
|----|---------|------|---------------|
| 00 | [00-overview-and-principles.md](./00-overview-and-principles.md) | vision / 4 設計原則 / 用語定義 / 文書全体の reading guide | 全体方針の妥当性 |
| 01 | [01-notation-catalog.md](./01-notation-catalog.md) | 全 50+ 記法の simple / formal / IR node 対応表 + 設計理由 | 記法網羅性、衝突 check |
| 02 | [02-frontmatter-and-globals.md](./02-frontmatter-and-globals.md) | frontmatter 規格(writing / align / direction / vars / limits) | inclusive design、互換性 |
| 03 | [03-link-embed-card.md](./03-link-embed-card.md) | link / card / embed seamless / embed quote の 4 段階 spectrum | semantic 区別、UX |
| 04 | [04-comment-footnote-family.md](./04-comment-footnote-family.md) | comment 系 unified、可視性 attribute、label、inline-attached | primitive 統合の妥当性 |
| 05 | [05-math-and-system-bundle.md](./05-math-and-system-bundle.md) | 数式記法(KaTeX)+ system asset bundle architecture | bundle cost、offline 維持 |
| 06 | [06-code-block-ecosystem.md](./06-code-block-ecosystem.md) | Renderer Registry + 全 renderer spec(tree / dbschema / object viewer / query / cards / mindmap / etc.) | architecture 拡張性、PKC2 戦略性 |
| 07 | [07-security-stance.md](./07-security-stance.md) | HTML pass-through 完全 off + 全記法 hard cap + parser hardening | security 妥当性、抜け穴 |
| 08 | [08-ir-mapping.md](./08-ir-mapping.md) | IR AST 形 / simple ↔ formal ↔ IR 写像 / format 別射影 matrix | IR 互換性、可逆性 |
| 09 | [09-migration-roadmap.md](./09-migration-roadmap.md) | 破壊的変更カタログ / phase 計画 / 移行手順 | 運用面、breaking 影響範囲 |
| 10 | [10-open-questions.md](./10-open-questions.md) | 未決定事項リスト / 決定基準 / レビューチェックリスト | 議論点の網羅、優先順位 |

## 推奨 reading order

### A. 短時間レビュー(30 min):
00 → 01 → 09 → 10
(全体方針 + 記法カタログ + 移行計画 + 未決定点)

### B. 標準レビュー(2-3 hr):
00 → 01 → 02 → 03 → 04 → 06 → 07 → 09 → 10
(細部を一通り、math と IR mapping は飛ばす)

### C. 完全レビュー(半日):
全章順番に。05(math)と 08(IR)は深い理解が要るが影響範囲も広いため、必ず読む。

## 用語定義(全章共通)

| 用語 | 定義 |
|------|------|
| **simple 記法** | 人間が日常文書作成で使う、短い prefix / wrapping / 行頭 marker 主体の記法 |
| **formal 記法** | 機械(AI)が emit する、属性付き厳密形式 — `:::name{attrs}` block / `:role:[content]{attrs}` inline |
| **可換性 (commutativity)** | simple ↔ formal が同じ IR ノードに正規化される性質 |
| **IR (intermediate representation)** | PKC2 内部 AST、format export / 編集 UX / 検索の正規 source(10-3 wave で確定予定) |
| **canonical form** | IR 上の正規形 |
| **階層** | 記法の入力負荷ヒエラルキー: prefix/suffix > wrapping > indent block > wrapping block(左ほど低負荷) |
| **dual-render path** | 同じ source を center pane / Split View preview / Viewer popup / embed 等の複数 surface で render する経路 |
| **Renderer Registry** | code block 拡張のための plugin-like な architecture(本提案で導入) |
| **system asset bundle** | binary asset(KaTeX font 等)を base64 inline で単一 HTML に内包する仕組み |

## レビュー依頼事項

このドキュメント set を読んで、以下の観点で feedback ください:

1. **技術的妥当性**: 設計が成立しているか、抜け穴 / 矛盾はないか
2. **運用的妥当性**: 移行が実行可能か、user 影響は許容範囲か
3. **PKC2 哲学整合**: simplicity / single HTML / AI 第一級 / IR-native の 4 軸と合致しているか
4. **代替案**: 個別決定について、より良い案がありそうか
5. **欠落**: 議論されていない論点があるか
6. **優先順位**: phase 順序の見直し提案

## status

- 2026-05-09: draft 起こし
- (次):AI レビュー実施
- (次):User がレビュー結果を反映、実装方針確定
- (次):実装 wave 仕切り直し

## 既存関連 doc

本文書 set は以下既存 doc を **supersede / 統合 / 拡張** するものです。レビュアーは並行参照してよい:

- `docs/development/markdown-dialect-extensions-spec-2026-05.md` — wave-10-2 markdown 方言 spec(本文書 set で再構築)
- `docs/spec/markdown-dialect-for-ai-authors-v1.md` — AI 書き手向け規約書(本文書 set 確定後に v2 を起こす)
- `docs/development/intermediate-representation-audit.md` — IR audit(10-3 wave、参照のみ)
- `docs/development/notation-redesign-formal-simple-2026-05.md` — 私が先行で起こした draft(formal-first frame、本文書 set で **frame inversion 後に supersede**)
