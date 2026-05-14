# v2.3.x stack PR(2026-05-14、PR-V1 … PR-V10 集約)

**Branch**: `claude/v23-stack-2026-05-14`
**Aggregate from**: 11 commits(PR-V1..V10 + dist update)
**Base**: `main`

## Summary

v2.3.0 リリース直後の deferred 項目を 10 PR の stack で着地。Block U(user-visible
UX)4 件 + Block A(architecture)2 件 + Block C(cleanup / hygiene)4 件 の構成。
PR-V1〜V10 を以下の順序で stack。

## Stack 内訳

| # | Block | Topic | 主な内容 |
|---|-------|-------|---------|
| PR-V1 | C1 | doc archive | reform-2026-05 Phase 3 完了 doc 7 件を `docs/development/completed/` に移動、cross-link 修正、SUMMARY 表登録 |
| PR-V2 | A1 | AstCitation 専用 node | Gemini review §12.2 着地。`[@id]` を figure/table/eq prefix で `AstAutoRef`、他は `AstCitation`(Pandoc / BibTeX 互換)に分岐。`[prefix @id, suffix]` 形式も認識、HTML / Pandoc Cite export 経路含む |
| PR-V3 | A2 | AstLayoutHint | semantic / layout attrs 名前空間分離。`columns` / `float` / `pageBreakRole` / `region` / `textAlign` / `slideLayout` の 6 key を `AstNodeBase.layout?` に。HTML は `data-pkc-layout-*`、PKC MD は round-trip 保持、GFM は drop、semanticHash 組み込み |
| PR-V4 | U6 | B-3 quote-assist 完成(S-17) | Slice β:空 `> ` 行 + Enter → exit blockquote / 選択範囲 + Mod+Shift+. で `> ` prefix 一括 toggle。Slice γ:entry-window child 側 mirror 着地。S-17 完全完了 |
| PR-V5 | U5 | App Launcher icon image | `AttachmentBody.app_icon_asset_key` を追加、container 内 image attachment を icon に。emoji fallback 継続、editor の image attachment dropdown hydration |
| PR-V6 | U7 | revision-branch-restore v1.x | C-1 v1.x §9.2「branch 関係の一覧表示」着地。元 entry の meta pane に `data-pkc-region="derived-branches"` を新設、provenance を逆引きして派生 branches を list 表示 |
| PR-V7 | A4 | HTML → AST reverse parser | `parseHtmlToAst(html): AstDocument` 新設、`window.PKC.ast.parseHtml` v1.3.0 公開。block 13 種 + inline 16 種 cover、未知 tag は AstOpaqueInline/Block で lossless preserve |
| PR-V8 | U1+U2 | TEXTLOG TOC viewport highlight | textlog-viewer-and-linkability-redesign §8 future enhancement 着地。IntersectionObserver で article / day を観測し、最上位可視要素に対応する TOC ボタンを `data-pkc-toc-current="true"` で highlight |
| PR-V9 | C2+C3 | branch cleanup script v2 + audit | `scripts/close-stack-prs-v2.sh` で hardcoded list から `--from-pattern` + `--prune-stale-branches` 経路に汎用化、HANDOVER §3.5 / §3.6 の trigger 再評価(11 項目すべて deferred 継続を確認、2026-05-14 audit 行追記) |
| PR-V10 | C4 | format panel persistence | × close button の dismiss 状態を `localStorage['pkc2.formatPanelDismissed']` に persist、次 session でも閉じたまま維持。`resetFormatPanelDismiss()` export + `_resetFormatPanelForTests` の localStorage 再読込で fresh load を simulate |

## 数値

- **vitest**:7636 件 全 pass(v2.3.0 baseline 7519 から +117 = PR-V2 AstCitation 10 件 + PR-V3 Layout 12 件 + PR-V4 quote-assist β/γ 18 件 + PR-V5 launcher icon 11 件 + PR-V6 derived-branches 8 件 + PR-V7 parse-html 41 件 + PR-V8 TOC viewport 7 件 + PR-V10 panel persistence 3 件 - 既存改修分)
- **typecheck**:clean
- **bundle**:CSS 162.81 KB(cap 512 KB ✅)/ JS 1095.69 KB(cap 4608 KB ✅)、v2.3.0 baseline からの増分は CSS +5.6 KB / JS +48.7 KB
- **dist**:更新済(`dist/bundle.{css,js}` + `dist/pkc2.html`)
- **production touch**:0 schema 変更、0 breaking change(`AstNodeBase.layout?` / `AttachmentBody.app_icon_asset_key?` / `AstCitation` / `AstFootnoteRef` /
  `parseHtml` API 関数追加はすべて optional / additive)

## Reform-2026-05 反省の適用

- **§6 視覚 parity test**:該当する視覚機能 PR(PR-V5 launcher icon、PR-V6
  derived-branches、PR-V8 TOC viewport)はいずれも `data-pkc-*` selector ベース
  parity test で動作確認。`elementFromPoint` / `page.mouse.click(x,y)` ベースの
  実 OS event parity は本 stack では追加せず(中央 pane render の static 構造
  なため、pixel-level parity を要する hover/drag は無し)
- **§8 順序性 test**:format panel persistence(PR-V10)は `boot → close click →
  localStorage write → 次 mount で sessionClosed=true で hide` の chain を
  test で覆う(state mutation → consumer behavior change)
- **doc lifecycle**:PR-V1 で Phase 3 完了 doc を archive、PR-V9 で trigger
  audit 行を追加、すべての PR で関連 spec doc に着地マーカー(取消線 + 「PR-Vn
  で着地」)を attach
- **CHANGELOG**:`CHANGELOG_v2.3.0.md` の Known limitations セクションに 「v2.3.x
  stack PR」section を追記(PR-V2 / PR-V3 完了マーカー + PR-V4 / PR-V5 / PR-V6
  / PR-V7 / PR-V8 / PR-V9 / PR-V10 を v2.3.x stack で着地と明記)

## Test plan

- [x] `npm run typecheck` clean
- [x] `npm test` 7636/7636 pass
- [x] `npm run build:bundle` succeed + within budget
- [x] `npm run build` 単一 HTML 生成 OK
- [ ] Playwright smoke(本 PR では CI に委ねる、手元 smoke は次 wave で実行)
- [ ] user 実機確認(PR merge 後)

## Merge 判断

CI green + Claude self-audit 通過後、user judgement で merge。集約 PR が squash
merge された後は `scripts/close-stack-prs-v2.sh --aggregate <#> --from-pattern 'PR-V'`
で stack 中間 PR(本 stack では中間 PR は無い:claude/v23-stack-2026-05-14 単独
push、なので close 不要)を整理。

https://claude.ai/code/session_019f6gJmFz2pLU7Q455n2f4N
