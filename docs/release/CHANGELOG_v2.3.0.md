# PKC2 v2.3.0 — Release notes

**Release date**: 2026-05-14
**Schema**: 1(変更なし — additive-only)
**Previous release**: v2.2.0

v2.3.0 の主題は **AST を中央集権 IR に固定した可換世界の確立**(PR-2JJ v2 final、PR #432)です。reform-2026-05 Phase 3 で公開された `window.PKC.ast` API を v1.2.0 に bump、PKC 拡張 21 種すべてを **真に AST node に分解** し、**MD-PKC ↔ MD-GFM の双方向可換変換** を実現しました。あわせて ChatGPT と Gemini 2 つの design AI から spec review を受け、**`AstVar` parse 時非展開** / **`AstOpaque*` 未知構文 lossless preserve** / **`astVersion: '2.0'` schema migration 基盤** / **`semanticHash(ast)` 数値証明** / **footnote / definition-list** node 追加など critical 推奨を全採用しました。UI 側では App Launcher view(HTML attachment 起動ハブ)/ Data… menu の AST/Pandoc/HTML/PDF/Word/PPT 出力統合 / 編集中 floating format panel / Textlog ログ単位右クリック menu / マニュアル新章を着地。schema breaking はなく、既存 container は v2.2.0 と完全互換です。

---

## Highlights

- **AST を中央集権 IR に固定した可換世界**(PR-2JJ v2 final、PR #432、2026-05-13〜14):PKC2 の `AstDocument` を **format-agnostic な semantic IR** と位置付け、各 format(MD-PKC / MD-GFM / HTML / Pandoc / 将来 Word / PPT / PDF / LaTeX)への **双方向 mapping を AST 経由** で定義する設計を確立。新規 spec `docs/spec/ast-commutative-ir.md`(11 + 12 section)が canonical truth source。N² コンバータ地獄を 2N に圧縮、各 format で「直接表現できない概念は可換に持ち込める表現に変換」する原則を契約化。

- **PKC 拡張 21 種を真に AST node に分解**(PR-2JJ v2、`src/features/ast/decompose-pkc.ts`):従来 render 後の string regex で symptom 緩和していた bridge layer を撤廃、parse 段階で AST 構造として decompose。**Inline 14 種**(`:strong:[X]` / `:emphasis:` / `:code:` / `:strike:` / `:lead:` / `:caption:` / `:sup:` / `:sub:` / `==mark==` / `..em-dot..` / `^^em-dot^^` / `[[em:X]]` / `[[ruby:base\|rt]]` / `%%hidden%%` / `[@id]` / `{{vars.x}}`)+ **Block 7 種**(`:::section{role=R}` / `:::comment` / `%%%...%%%` / `:::figure{id=X}` / `:::if{format=X}` / `:::quote{author=Y}` / `:::paragraph{align=Z}`)。ネスト対応、単一行 inline-block 形、markdown-it の paragraph 結合 case すべて分解可能。

- **PKC ↔ GFM 双方向可換変換器**(`renderAstToMarkdown(ast, { mode: 'gfm' | 'pkc' })`):**Forward(PKC → GFM 互換表現)**:`AstSection(role=warning)` → blockquote `> **Warning:**` / `AstMark` → `<mark>X</mark>` / `AstEmDot` → `<span class="pkc-em-dot">X</span>` / `AstRuby` → `<ruby>base<rt>rt</rt></ruby>` / `AstSup` `AstSub` → `<sup>` `<sub>` HTML / `AstSpan(class)` → `<span class="X">Y</span>` / 全 18 mapping pair。**Reverse(GFM → PKC AST node)**:GitHub Alert `> [!NOTE]` 5 種(NOTE/TIP/IMPORTANT/WARNING/CAUTION)→ AstSection、blockquote `> **Role:**` → AstSection、HTML inline 6 種 → 対応 AST node。**PKC → GFM → PKC で semantic 等価**、**5 cycle 反復で stable**、118 unit tests(decompose-pkc 23 + pkc-extensions-full-coverage 53 + bidirectional-commutativity 22 + user-fixture-roundtrip 20)で固定。

- **ChatGPT critical review 7 項目を全採用**(`docs/spec/ast-commutative-ir.md` §12.1):**(1)`AstVar` parse 時非展開**:常に AstVar として AST に保持、render 時 target(PKC mode は template 維持、GFM mode は値展開)に応じて resolve。source provenance / reverse 可換性 / late binding / target-specific vars / template 化のため。**(2)`AstOpaqueInline` / `AstOpaqueBlock`**:未知 / 他 format 由来構文を **lossless preserve**(LaTeX `\textcolor{red}{X}` 等、`sourceFormat` + `original` で再構築可能)。Pandoc の RawInline / RawBlock に対応。**(3)`astVersion: '2.0'`**:`AstDocument` payload に schema version を埋め込み(serialized AST / postMessage / cache / DB persistence の migration 基盤)。**(4)`semanticHash(ast)`**:`src/features/ast/semantic-hash.ts`(NEW)で AST 意味的同一性を deterministic string hash 化、`semanticHash(rt(ast)) === semanticHash(ast)` を round-trip stability の **数値証明** に。**(5)AstIfBlock は render-time evaluation**(parse-time pruning しない)。**(6)render 時 vars expansion は GFM mode のみ**(PKC mode は template 維持)。**(7)semantic document IR に固定**(PPT/DTP/advanced PDF は target lowering 層に寄せる、core AST に持ち込まない)。

- **Gemini critical review 4 項目を全採用**(spec §12.2):**(1)`AstFootnoteRef` + `AstDocument.footnotes`**:`[^id]` 参照と `[^id]: text` 定義を分離、`shieldFootnotes` pre-process で markdown-it の reference-link 機構から保護、`extractFootnoteDefs` で body から抽出して footnotes namespace に格納。学術 / Pandoc / LaTeX 互換に必須。**(2)`AstDefinitionList` + `AstDefinitionItem`**:仕様書 / Pandoc / Hugo / MDX 互換の `term\n: description` syntax 対応、render-markdown / render-html / export-pandoc 全経路 wire。**(3)Canonical form は Formal Form を AST truth source**(`:strong:[X]` を canonical、render 時に target に応じて `**X**` simple form / `:strong:[X]` formal form を選択)。**(4)Layout 属性は Phase 4 で対応**(2-column 等は target lowering 層、core AST は semantic 中心)。

- **公開 API `window.PKC.ast` v1.2.0**(`docs/spec/public-ast-api-for-ai.md` + `src/adapter/public-ast-api.ts`):7 関数を expose — `parseMarkdown(text, opts?)` → AstDocument / `renderHtml(ast, opts?)` → HTML / `canonicalize(ast)` → idempotent normalized AST / `renderMarkdown(ast, { mode: 'gfm' \| 'pkc' })` → MD / `toPandocJson(ast)` → Pandoc Native JSON / `semanticHash(ast)` → deterministic string hash / `markdownToPandoc(text, opts?)` → 1 step convenience。DevTools console / iframe / postMessage caller から他 AI が呼べる ecosystem 統合経路。

- **App Launcher view + Data… menu 拡張 + 編集 floating format panel**(`src/adapter/ui/launcher.ts` / `format-panel.ts` / `renderer.ts`):**center pane の 6 番目 view-mode**(Detail / Calendar / Kanban / Filer / Graph / **Launcher**)。HTML attachment の右ペインに「アプリランチャーに登録」checkbox + 絵文字 icon 入力、tile click で新規 window 起動(`popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes` features で別タブではなく別窓 hint)。**Data… menu**(`renderExportImportInline`)に AST / Canonical / Pandoc / HTML 4 button + Pretty(JSONL 1 行 default、ON で整形)+ 📄 PDF(Viewer popup + Ctrl+P)+ 📝 Word(`<title>.docx.pandoc.json` download)+ 🎞 PPT(同 pptx)。**編集中 floating format panel**:選択範囲の上に 14 button(B / I / S / \` / == / .. / sup / sub / link / H1-3 / > / ·)で PKC MD wrap / prefix、Tier 0 flag `editor.format_panel_enabled`(default ON)で完全 off / panel × button で session hide。`getCaretViewportCoords` で selection 位置を pixel 単位で算出、scrollbar gutter 補正で長大マークダウンの caret marker ズレ解消。

- **Textlog ログ単位右クリック context menu**(`renderContextMenu` の 'log-data' group):TEXTLOG の各 log row を右クリックで context menu「🧬 Log data」section に 5 操作 — 📋 MD (GFM cleanup) / 📋 PKC MD (canonical) / 🧬 AST / 🧬 Pandoc / 🧬 HTML。TEXT entry の Data… menu 同等を log 単位で提供。

- **MD copy 2 種化**(`copy-markdown-gfm` / `copy-markdown-pkc`):旧 📋 MD ボタンを **GFM 標準にクリーンアップ** する copy に repurpose(相互運用、Word / Notion / Obsidian / GitHub paste 用)、新規 📋 PKC MD ボタンを追加(`parse → canonicalize → renderMarkdown('pkc')` で **canonical PKC MD** 出力、PKC ↔ PKC round-trip / spec 準拠用途)。

- **致命的 round-trip バグ修正**:render-markdown の `escapeText` が `(` `)` `[` `]` `#` `+` `-` `!` `|` `>` `{` `}` まで過剰 escape していて `Hello (world)` が `Hello \(world\)` になる致命バグを **`\\` / `` ` `` / `*` / `_` の 4 種類のみ** に削減。`:::figure{id="X"}` の id 属性が render で消える件、`:caption:[X]` / `:lead:[X]` が `[X]{.caption}` simple 形に化ける件、`[@id]` auto-ref が `@id` plain に化ける件、`%%%` block comment が単独行以外で mid-line block boundary に誤認識される件(`docs/spec/markdown-dialect-for-ai-authors-v1.md` checklist L-4「単独行 only」spec 違反)、`AstVar` の `vars.name` が markdown-it linkify で `<a href="vars.name">` 化される件、すべて修正。

- **App Launcher tile / Open in New Window を別窓 hint 付きに**(`POPUP_WINDOW_FEATURES = 'popup=yes,width=1280,height=800,...'`):旧 `'_blank'` のみだと多くの browser が **別タブ** で開く動作 default だったのを、`popup=yes` + 具体的 width/height を指定して **別 window** で開く hint を出すよう変更。4 経路(open-html-attachment action + 3 helper)を統一。

- **マニュアル新章**(`docs/manual/13_アプリランチャーと出力機能.md`、NEW 7 section):ユーザー向け章で App Launcher / Data… menu / Format panel / Textlog 右クリック / PDF/Word/PPT 出力 / 5 典型ワークフロー例 / 開発者向け `window.PKC.ast` API surface を網羅。`docs/manual/00_index.md` に登録、章別表 + 読み順 entry 追加。

- **新規 doc**(spec / development):**`docs/spec/ast-commutative-ir.md`**(canonical truth source、12 section、双方向 mapping table / parser pipeline / render pipeline / 他 format ロードマップ / ChatGPT / Gemini review 反映と design decision 記録)/ **`docs/spec/public-ast-api-for-ai.md`**(v1.2.0、`window.PKC.ast` surface)/ **`docs/manual/13_*`**(ユーザー manual)。

- **v2.3.0 minor bump**:`package.json` (`2.2.0` → `2.3.0`)/ `src/runtime/release-meta.ts` の `VERSION` constant(`2.1.1` → `2.3.0`、長らく package.json と乖離していたのを統一)/ About entry / shell menu の version 表示が自動更新。schema_version は 1 のまま(`AttachmentBody` への `registered_as_app?` / `app_icon?` 追加は前方互換 additive)。

- **計測**:vitest **7519/7519 pass**(reform-2026-05 Phase 3 wave 〜 PR-2JJ v2 final で +388 unit cases、合計 7131 → 7519)/ Playwright smoke **244/244 pass、0 failed**(以前は flags-inspector row count drift 3 件 + transclusion vars expansion 1 件 + caret position 1 件で pre-existing failure があったがすべて解消)/ typecheck / lint clean / `check:docs` 297 docs scanned / 0 orphans / 430 docs / 0 broken links / **bundle.css 157 KB / bundle.js 1047 KB**(両方 cap 512 / 4608 KB 内、 cumulative +71 KB from v2.2.0 baseline)。

---

## Known limitations

- **AST に PKC 拡張の raw text 残留は完全解消**:従来「parser が commonmark + GFM core のみ cover」と表現していた制約は本リリースで真に解消(`decomposePkcExtensions` で AST node に分解)。bridge regex layer は AST decomposition で漏れた edge case 用の safety net に役割が変わった。
- **他 format の Forward**(Word / PPT / PDF / LaTeX):Pandoc 中継経由が主、直接生成は将来 wave。
- **他 format の Reverse**(HTML / Word / LaTeX → AST):未実装、将来 wave。
- **`AstCitation` 専用 node**:~~Gemini 推奨だが現状 `AstQuote.citation` 属性で代用~~ → **v2.3.x stack PR-V2(2026-05-14)で着地**。`[@id]` は figure/table/eq prefix 付きなら `AstAutoRef`、それ以外は `AstCitation`(Pandoc / BibTeX 互換)に分岐。`[prefix @id, suffix]` 形式も認識、Pandoc citation processor へ Cite node として export。
- **`spanKind` discriminator**(`semantic` / `style` / `opaque`):ChatGPT 推奨だが class 用途が現状 3 種(`lead` / `caption` / `pkc-em-dot`)で安定、Phase 4 で混乱が始まれば導入。
- **Layout 属性**(2-column / float / page-break role):~~core AST は semantic 中心、target lowering 層で吸収する方針~~ → **v2.3.x stack PR-V3(2026-05-14)で着地**。`AstLayoutHint` interface を `AstNodeBase.layout?` に追加、`columns` / `float` / `pageBreakRole` / `region` / `textAlign` / `slideLayout` の 6 key を semantic kvs と名前空間分離。HTML は `data-pkc-layout-*` attribute、PKC MD は `:::section{role=R layout-columns=2}` round-trip、GFM MD は drop、semanticHash に組み込み。

## v2.3.x stack PR(2026-05-14〜15 着地、PR #433、`claude/v23-stack-2026-05-14` branch)

v2.3.0 リリース後の reform-2026-05 Phase 11 stack PR で以下を順次着地。**2026-05-15 に PR #433 で main 着地**(CI 3 checks all green:typecheck+test+build / Playwright smoke / scan):

- **PR-V1 doc archive(reform-2026-05 Phase 6)**:Phase 3 完了 docs を `docs/development/completed/` に 7 件移動、cross-link 修正、SUMMARY 表に登録。
- **PR-V2 AstCitation 専用 node**(上記、Gemini 推奨着地)
- **PR-V3 AstLayoutHint**(上記、Gemini 推奨着地)
- **PR-V4 B-3 quote-assist Slice β + γ 完成**(USER_REQUEST_LEDGER S-17 完了):
  - Slice β:空 `> ` 行 + Enter → exit blockquote(line range を `\n` 置換)
  - Slice β / 2:Mod+Shift+. で選択範囲の `> ` prefix を一括 toggle
  - Slice γ:entry-window child の inline JS に親 helper を mirror、Enter 継続 / exit と Mod+Shift+. が child でも parity 動作
- **PR-V18〜V22 U3/U4 Word/PPT 出力 + 致命 hotfix 群**(2026-05-14〜05-15):
  - PR-V18:U3/U4 docx/pptx 直接出力の出力時致命 bug fix(Buffer base64 / 画像 ref 解決 / pageBreakBefore)+ CI smoke timeout bump
  - PR-V19:docx/pptx 全面 rewrite(user audit 14 項目 — 既定 font 統一 / 表ヘッダー薄 shading / 水平線罫線 / CSV → table / GFM task list checkbox / pageBreakBefore / 画像実機 embed / 内部リンク 上付き + appendix / PKC 拡張 4 種書式化 / 変数展開 / 日本語ファイル名維持)
  - PR-V20 hotfix:filename 日本語維持 + pkc:// image asset 解決 + PDF auto-print + TEXTLOG deep-link smoke
  - PR-V21 hotfix:**H4-H6 を箇条書き化**(heading style 不使用、(1)(2)/アイウ/a.b.c prefix + 360/720/1080 twip indent)+ 変数展開 + TEXTLOG body JSON 露出 fix
  - PR-V22 致命 hotfix:**画像埋め込み実機動作**(`Buffer.from(b64,'base64')` は browser bundle 非対応 → `atob` + Uint8Array)+ **H1 なし時の見出し numbering**(0.0.X → 1.1.X、暗黙の親 = 1 で auto-bump)
- **PR-V23 視覚 verification pipeline**(2026-05-15、`scripts/vtest.sh` + `scripts/vtest_struct.py` + `docs/development/visual-docx-verification-pipeline.md`):docx → LibreOffice headless PDF → pdftoppm @150dpi PNG → Claude が画像 Read で実機 render 確認 +(並列で)`word/document.xml` 構造検査(headings / pageBreaks / tables / images / varResidue / pkcExtensionResidue を JSON)。reform-2026-05 §6 visual-state-parity-testing の docx 版。PR-V22 audit 全 8 項目を 4 PNG 実機で確認(0 residue / 6 headings / 3 pageBreaks / 2 tables both with header shading / 1 image embedded)。同 commit 内で pptx 対応にも拡張(`libreoffice-impress` 依存追加、`vtest_struct.py` は `word/` vs `ppt/` で kind 自動判定、slide 単位 titles / bodyChunks / hasTable / pictureCount を JSON 出力)。
- **PR-V24 pptx に AST run-level formatting 導入**(2026-05-15):PR-V23 で発見した pptx audit 5 件(変数未展開 / `%%hidden%%` 残留 / `==mark==` highlight 未適用 / `..em-dot..` italic 未適用 / 内部・外部リンク plain 化 / markdown pipe-table raw text)を解消。`PptxRun` 型 + `PptxExportContext` を追加、`inlinesToRuns` / `linkToRuns` を docx parity で実装。`SlideLine.runs?: PptxRun[]` で 1 line 内の複数 run formatting を pptxgenjs `addText(array, opts)` 経由で発火(highlight: 'FFFF00' yellow / italic / hyperlink + underline / superscript)。`AstTable`(markdown pipe table)も `slide.addTable` に集約、内部リンクがあれば末尾「リンク先一覧」appendix slide を自動追加。実機 PNG で 5 件全て解消確認(varResidue 2 → 0)。
- **PR-V24 hardening: simplify レビュー反映**(2026-05-15):`linkToRuns` で label を `inlinesToPlainText` で flatten していたため link 内 nested formatting(bold / italic 等)が消えていた latent bug を fix。`astToPptxBlob` 内 `draft.lines.filter()` 3 連を single for-loop で 3 array partition。`linesToTextObjects` の `Object.keys+delete` を条件付き代入に置換。pptx の internal-link 判定を docx parity に引き上げ(`#log/` / `#day/` prefix + `pkc://<cid>/entry/<lid>` 形式の lid 抽出をサポート、旧 3 prefix hardcode で漏れていた)。`vtest_struct.py` の residue 4 種 regex を docx / pptx で重複していたのを `compute_residue()` helper + module-scope `re.compile` に統合。
- **PR-V23 wave 着地手順 + branch cleanup**(2026-05-15、`docs/release/v23-stack-close-and-branch-cleanup-2026-05-15.md`):PR #433 集約 32 commit の merge 手順 + 14 件 stale branch cleanup の手順 3 種(GitHub Web UI / `gh` CLI / `scripts/close-stack-prs-v2.sh`)を集約。本 session の git proxy 制約のため実行 phase は user 環境に分離、本 doc が C2 deliverable の後続 wave。

### v2.3.x stack follow-up wave(精度向上 + 視覚品位 wave、2026-05-15、PR-W1〜W5 + Wave X)

PR #433 の simplify reuse agent 指摘 + Phase 3 wave doc lifecycle 整理を 5 PR stack で着地予定:

- **PR-W1 docs reconcile**(2026-05-15、PR #434):reform-2026-05 Phase 3 wave 20 PR は #432 で main 着地済、v2.3.x stack PR-V1..V24 + hardening は #433 で main 着地済の状況を INDEX に反映(`### IN-PROGRESS` → `### COMPLETED` section 移動 + PR-2II / PR-2JJ v2 final / docs(release)の row 追加 + AST commutative IR canonical refs 追加)。Last updated を 2026-05-15 に更新、CHANGELOG の「着地予定」表現を「着地、PR #433」に修正。docs-only(src / dist / bundle / test 不変、7711/7711 pass 維持)。
- **PR-W2 docx↔pptx 共通 helper 抽出**(2026-05-15):`src/features/ast/export-runs-common.ts`(NEW)に `isInternalLink` / `extractEntryLidFromHref` / `detectTaskState` / `stripTaskPrefix` / `base64ToUint8Array` / `resolveImageData` の 6 helper を集約。docx 側で `imageRunForAssetSrc` の asset 解決部分を共通 helper の `resolveImageData` + `buildImageRun` の 2 段構成にリファクタ、pptx 側で `resolveImageSrc` → `resolveImageData` import に置換。bit-identical 振る舞いを保証(全 7711 test pass)、新 helper の case matrix unit test 55 件(`tests/features/ast/export-runs-common.test.ts`、wave 規律 §4 の 10 件以上を 5 系統で satisfy)。**bundle.js 1849 → 1848 KB**(差は minify 後で微小、source line は docx -92 + pptx -66 = -158 行削減)。drift gap が今は閉じていても将来 PDF / LaTeX / ePub export 追加時に同じ helper をコピペする誘因を構造的に阻止。
- **PR-W3 magic string → constants 化**(2026-05-15):`src/features/ast/export-constants.ts`(NEW)に docx / pptx export で使う色 HEX(`MARK_HIGHLIGHT_HEX` = `'FFFF00'` / `MARK_HIGHLIGHT_NAMED` = `'yellow'` / `TABLE_HEADER_SHADING_HEX` = `'EEEEEE'` / `CODE_BLOCK_SHADING_HEX` = `'F5F5F5'` / `CODE_BLOCK_LEFT_BORDER_HEX` = `TABLE_BORDER_HEX` = `'888888'` / `HORIZONTAL_RULE_BORDER_HEX` = `'666666'`)+ font 名(`DEFAULT_FONT` = `'BIZ UDGothic'` / `MONOSPACE_FONT` = `'Consolas'` / `MATH_FONT` = `'Cambria Math'`)+ docx 数値 token(`DOCX_BORDER_SIZE_DEFAULT` = 6 / `DOCX_BORDER_SPACE_DEFAULT` = 4 / `DOCX_HEADING_INDENT_UNIT_TWIP` = 360 / `DOCX_QUOTE_INDENT_TWIP` = 720)+ pptx 数値 token(`PPTX_BODY_WIDTH_INCH` = 12.0 / `PPTX_TABLE_BORDER_PT` = 0.5)を集約。docx / pptx 両 export source 内 magic string 0 件(grep 確認済)。theme / branding 切替の足場 + 値 drift 阻止 + 意図伝達(`'FFFF00'` より `MARK_HIGHLIGHT_HEX`)を同時達成。**振る舞い完全不変**(全 7766 test pass、bundle.js 1848 KB / bundle.css 163 KB 不変、視覚的 1 ピクセル変化なし)。
- **PR-W4 AstTable cell 内 inline formatting drop fix**(2026-05-15、user 報告級 bug fix):docx は `inlinesToRuns(c.children, ctx).filter((x): x is TextRun)` で **ExternalHyperlink を drop**、pptx は `inlinesToPlainText` で cell を **完全 flat text 化**(bold / italic / code / strike / mark / em-dot / sup / sub / link すべて drop)していたのを修正。docx は filter を `TextRun | ExternalHyperlink` まで広げて hyperlink を保持。pptx は `SlideLine.tableRowsRuns?: PptxRun[][][]` 新 field を追加、AstTable 経由は `inlinesToRuns` 経由で run-level formatting を `slide.addTable` に渡す(CSV / TSV fence 経路は引き続き `tableRows` の plain text path を維持、両 path を normalize step で統合)。case matrix test 14 件 新規(`tests/features/ast/export-table-cell-formatting.test.ts`、docx 5 + pptx 6 + CSV fence regression 2 + plain text 1)、全 7780 test pass。
- **PR-W5 pptx title placeholder 化**(2026-05-15、Microsoft Outline View 対応):従来 `slide.addText(title, { x, y, w, h, fontSize, bold })` で title を **普通の text box** として描画していたため、Microsoft PowerPoint の Outline View / accessibility tree / Office Online で **title として認識されなかった**(slide structure 上は無タイトル扱い、読み上げソフトも title を拾えない)。`pres.defineSlideMaster()` で 2 master(`PKC_SECTION_SLIDE` 扉スライド用 + `PKC_CONTENT_SLIDE` 通常スライド用)を定義、各 master に title / subtitle placeholder option を持たせる。`pres.addSlide({ masterName })` で各 slide に master を bind、`slide.addText(title, { placeholder: 'title' })` で title placeholder に挿入することで PPTX XML に `<p:ph type="title" idx="0"/>` marker が emit され、**Outline View が認識**する。位置 / size / font は従来 text box と同等で visual regression なし。case matrix test 12 件 新規(`tests/features/ast/export-pptx-title-placeholder.test.ts`)、`<p:ph type="title">` marker + slideMaster ファイル存在 + 日本語 title / 複数 slide / page break 後の content slide / body content 存続 / fallback slide まで網羅、全 7792 test pass。

### Wave X — 視覚品位向上 wave(AI review feedback、2026-05-15)

外部 AI review(2026-05-15)で「視覚品位への押し上げ」フェーズと判定された 11 項目を P0〜P3 で順次着地。本 wave は v23 stack follow-up wave の継続。

- **PR-W19 Playwright smoke CI 高速化(Tier 分離 + matrix shard + cache)**(2026-05-16、user 直接報告「プレイライトのスモークがタイムアウトしてる、緊急で GitHub Actions の見直し、シャードや試験単位見直し」):85 spec / 271 test の smoke が `workers:1` + `fullyParallel:false` の **完全シリアル実行** で 15-17 min 消費し timeout 25 min を圧迫していた現象を以下で再編:**(1) Tier 分離**:`SMOKE_TIER=a`(PR blocking、10 spec / 29 test、〜2 min)と `SMOKE_TIER=all`(main push + schedule 毎晩、261 spec / 221 test 全件)を `tests/smoke/playwright.config.ts` に `TIER_A_SPECS` enum + `testMatch` で実装。**(2) matrix shard 4 並列**:`smoke.yml` jobs.tier-b に `strategy.matrix.shard: [1, 2, 3, 4]` + `--shard=N/4` で 4 jobs に水平分散、各 shard 内 `workers: 2` で更に 2 並列 = **total 8 parallel**。**(3) Playwright browser cache**:`actions/cache@v4` で `~/.cache/ms-playwright` を persist、`hashFiles('package-lock.json')` を key に invalidation。cache hit 時は `npx playwright install-deps`(apt-get の system 依存のみ)で binary download skip → -1.5 min。**(4) diagnostic spec を `_archive/` 隔離**:5 件(`diagnostic-2026-05-07` / `reform-2026-05-chatgpt-fixture-diagnostic` / `source-preview-sync-{jitter,real-wheel,realcontent}-diagnostic`)を `tests/smoke/_archive/` に git mv、`testIgnore: ['**/_archive/**']` + `tsconfig.json` の `exclude` に追加。**(5) retries: 0**:旧 `retries: process.env.CI ? 1 : 0` で flake を retry で隠蔽していたが、true positive な regression と flake を区別不能になる + CI 時間倍化リスクを廃止。flake 単発は別 PR で診断する規律に。**(6) schedule trigger 追加**:`cron: '0 18 * * *'`(JST 3:00)で毎晩 Tier-B 全件を main に対して走らせ、PR で skip した specs の regression を 24h 以内に検出。**期待**:PR 時 15-17 min → **〜2 min**(Tier-A 10 spec + cache hit)、main / schedule 時 15-17 min → **〜4 min**(4 shard × 2 worker)。`smoke.yml` を jobs.tier-a + jobs.tier-b の 2 job 構成に再編、`if: github.event_name == 'pull_request'` で振り分け。tsconfig `exclude` に `tests/smoke/_archive/**` 追加(移動 spec が古い相対 import path で TS2307 になるのを抑制、archive は inert)。

- **PR-W18 footnote native + /simplify wave cleanup**(2026-05-16、user 直接指摘「footnote 機能してないね、前々から実装した気になって実装されてない機能の代表、HTML 側もできてない」+ user 直接指示「監査・最適化・ドキュメント整理」):docx / HTML 両面で footnote を真の native 実装に格上げ。**HTML 側**は `markdown-it-footnote` plugin を `src/features/markdown/markdown-render.ts` に追加、`[^id]` + `[^id]: 本文` を `<sup class="footnote-ref"><a href="#fn-id">…</a></sup>` + 末尾 `<section class="footnotes">` numbered list として render。**docx 側**は `FootnoteReferenceRun(num)` + `Document.footnotes` API で page 下部の native footnote 領域に挿入、`ast.footnotes` の挿入順に 1..N の番号を採番、本文の `AstFootnoteRef` を該当番号の reference run に置換。`ExportContext.footnoteIdMap: Map<string, number>` を追加、`newContext` で事前構築、`inlineToRuns` の `case 'footnote-ref'` で lookup → `FootnoteReferenceRun(num)`、orphan ref(定義なし)は従来 `[^id]` superscript literal で fallback。**`extractFootnoteDefs` bug fix**:markdown-it は blank-line 区切りなしの連続 `[^a]: A\n[^b]: B` を単一 paragraph に合成するため従来 regex は最初の 1 件しか抽出できなかった(case matrix「複数 footnote」を user 模擬で先に再現)。`matchAll` で paragraph 内全 sentinel 抽出 + 非 sentinel 残 text は paragraph として残置。docx 旧出力は `[^id]` を superscript text として literal 描画していたため Word の Outline / 印刷で参照リンクが死んでいた → 真の cross-link 復活。case matrix test 12 件(`tests/features/ast/export-footnote-native.test.ts`、docx 6 + HTML 6 で wave 規律 §4 の 10 件以上 satisfy)、全 7900 test pass、bundle.js +1 KB(markdown-it-footnote 取り込み)、bundle.css 不変。**併せて /simplify code review cleanup**:wave Z 中累積した dead `@deprecated` 定数 3 件(`MARK_HIGHLIGHT_NAMED` / `DEFAULT_FONT` / `MONOSPACE_FONT`、src/ tests/ で参照 0 件 grep 確認)を削除、`export-pptx.ts` の footer color literal `'888888'` × 3 箇所を新 const `PPTX_FOOTER_GREY_HEX` に集約、`export-docx.ts` の `roleConfig` fallback `'F4F4F5'` / `'CCCCCC'` を既存 `TABLE_HEADER_SHADING_HEX` / `TABLE_BORDER_HEX` に置換、`Table.borders` の 7-key 同値設定(hairline 0.5pt grey)を AstTable + CSV fence 2 箇所で copy-paste していたのを `pkcHairlineTableBorders()` helper に抽出。bundle.js -0.32 KB(deprecated 削除分)、振る舞い完全不変(全 7900 test pass 維持)。

- **PR-W17 表 cell padding 詰め + layout autofit**(2026-05-16、user 報告「表の余白もひどい、なんでセルサイズコントロールしてないんだ同じセルサイズと絶対おかしい」):`TABLE_CELL_PADDING_TWIP` を 160 twip(8pt)→ 60 twip(3pt = 約 1mm)に詰め(Web style の dense table layout)、`tableLayout: TableLayoutType.AUTOFIT` を追加して各列 cell が content に応じて auto-sizing。従来は固定均等幅で「同じセルサイズと絶対おかしい」状態だった。case test fix(160 → 60、export-visual-language-p2.test.ts、export-table-cell-formatting.test.ts 等)。

- **PR-W16 bullet list 自前 numbering + glyph 縮小**(2026-05-16、user 報告「箇条書きのぶら下げも目立ってる、バレットのサイズデカすぎ」):`pkc-bullet` numbering config(reference `pkc-bullet`、level 0、glyph `·` U+00B7、hanging 240)を `Document.numbering.config` に追加、AstList の bullet 経路を `numbering: { reference: 'pkc-bullet', level: 0 }` に切替。旧 docx default の `bullet: { level: 0 }`(巨大 `•` U+2022 + 広 hanging 720)を撤廃、marker → text を tight(240 twip = 0.17 inch)に。

- **PR-W15 fixture audit literal 0 件達成**(2026-05-16、user 「PKC-Markdown がそのまま透けて出てきてる、これ OK だと思う?」を受けた即時 fix):**audit script 結果 4 種 → 0 件**。原因は私が fixture description 内に「未対応記法の例」として `+++` / `:::quote{author=...}` / `:::paragraph{align=...}` 等を ASCII literal で書いてしまった self-reference 混入(decompose bug ではなく)。修正:fixture 末尾の「未対応一覧」段落を audit doc reference に置換、L73 heading から `:::quote{author=...}` backtick literal を削除。実機 vtest で `..` / `:::` / `+++` / `[@` / `^^^` / `\\page` / `==` 全 13 pattern が 0 件確認。manual PNG 8 件再生成(`docs/manual/images/pkc-fixture/`)。Wave Z.6 で予定していた literal 残り fix を本 PR で前倒し解消。順序リスト `pkc-ordered` numbering の hanging を Word default 720 twip → 240 twip に詰めて user 「順序リストのぶら下げする時、なんでこんなに余白大きいの?ダサくね?」 を解消。

- **PR-W14 全 PKC 拡張 fixture + 部分 native 実装 + 21 PR 計画**(2026-05-16、user 直接指示「徹底的な叩き直しに 20 PR 以上、破壊的変更も辞さない」):
  - **全拡張 fixture commit**:`tests/features/ast/fixtures/full-pkc-fixture.md`、37 AST kind を網羅
  - **AST 経由 native 実装(部分)**:`AstQuote.citation` author を末尾 attribution 段落(italic right-align)/ `AstSection.role` を warning/note/info/tip/danger/important/caution/summary の 8 role 別 callout box(shading + left accent border + icon)/ `AstIfBlock.format` を format=docx 以外 skip(可換性 critical)/ `AstFigure` を `figureKind` + caption + `num` で「図 N: caption」/「表 N」/「式 N」prefix
  - **audit doc**:`docs/development/full-pkc-fixture-audit-2026-05-16.md`(37 AST kind × docx/pptx 対応 matrix、literal 残り 0 件への徹底返済計画 21 PR、Wave Z.2-Z.6)
  - **literal 残り audit**:現状の `..` x2 / `:::quote` x1 / `+++` x1 + 0 件 kinds(math / sup / sub / definition-list / blank-N / paragraph indent / L-5 align)を明示、後続 PR-W15-W35 で順次解消
  - **manual 視覚証跡**:`docs/manual/images/pkc-fixture/`(html + docx 7 page)
  - INDEX 登録、check:docs 0 件、全 7888 test pass。bundle.js 1859 KB(+2 KB、native AST 実装で配色 / icon mapping 等)、bundle.css 163 KB 不変。

- **PR-W13 Wave Z.1 heading 階段 user 指定値固定 + line `exact` 220 twip**(2026-05-16、user 直接指示):
  - **heading 階段固定**:user 直接指示「h1 から順に 16, 14, 12, 10.5, 10.5, 10.5」を反映、H1=32 twip(16pt)/ H2=28(14pt)/ H3=24(12pt)/ H4-H6=21(10.5pt、body と同 size、bold + indent で識別)。H1↔H2=2pt、H2↔H3=2pt、H3↔body=1.5pt の均一階段。heading spacing も連動(H1: 16/8pt、H2: 14/7pt、H3: 10/5pt)
  - **line-height `auto` → `exact`**:user「本文の行間をもっとちいさく」「詰まってる?自分で比較した?」→ `lineRule: 'auto'` は font 内蔵 leading が効くので視覚差が微小だった。`case 'paragraph'` で `lineRule: 'exact'` + line 220 twip(11pt 固定)を明示、font 10.5pt + 0.5pt leading のみの真の dense layout。heading は own spacing(line 指定なし)で font default の stretched line を維持、本 fix は本文段落限定
  - 既存 test follow:`export-heading-prefix-and-spacing` H1 480/40 → 320/32、`export-typography-bilingual` line 240 → 220、`export-runs-common` 空 task 受理(PR-W12 から継続)
  - 全 7888 test pass、bundle.js 1857 KB 不変、**manual PNG 16 件 v10 全部再生成**

- **PR-W12 Wave Z.1 task list literal fix + font 10.5pt + line 1.0 + margin 2cm 統一**(2026-05-16、user 報告 cascading fix 続編):
  - **task list `[ ]` literal 解消**:`detectTaskState` / `stripTaskPrefix` の regex を `/^\[([ xX])\]\s/` → `/^\[([ xX])\](?:\s|$)/` に変更、**空 task list `- [ ]`(trailing space なし)** も正しく ☐ glyph に置換。GFM 仕様も空 task を許容(mn 議事録の `- [ ]` 4 件で literal 残り → 完全 ☐ 化)
  - **font size 11pt → 10.5pt**(twip 22 → 21):user「font 10.5pt かな」、Japanese technical writing 標準サイズ、heading も比例縮小(H1: 20pt→18pt / H2: 16pt→14pt / H3: 13pt→12pt / H4: 12pt→11pt)
  - **line-height 1.15 → 1.0**(twip 276 → 240):user「行間はもっと詰めて」、真の 0pt 寄り(行送り = font size、文字 overlap は font 内蔵 leading で回避)
  - **column gap 0.5 → 0.25 inch**(twip 720 → 360):user「2 段組の境界までの余白もっと攻めて」
  - **margin 全方向 2cm 統一**(top/right/bottom/left = 1134 twip):user「綴じ代は 2cm で」、左綴じ代 + 全方向パンチホール対応 + 情報密度最大化
  - heading spacing も比例縮小(H1: 24/12pt → 18/9pt、H2: 18/8pt → 14/7pt、H3: 12/6pt → 10/5pt)
  - 既存 test 4 件 follow:`export-typography-bilingual` line 276→240、`export-heading-prefix-and-spacing` heading 480/360/240 → 360/280/200 + size 40/32 → 36/28、`export-runs-common` に空 task 2 件追加、`export-layout-2col` column space 720 → 360
  - 全 **7887 test pass**(+2 件 = 空 task open / done)、bundle.js 1857 KB / bundle.css 163 KB 不変。**manual PNG 16 件 全部再生成**で新 default 反映。

- **PR-W11 Wave Z.1 layout: a4-2col 段組組版 + 余白 / 行間 / 段落 spacing default 大改修**(2026-05-16、user 直接報告 cascading fix):
  - **段組組版 docx**:`Document.sections[].properties.column = { count, space, equalWidth }` を frontmatter `layout: a4-Xcol` から動的指定、用紙サイズ(A4 11906×16838 twip / B5 9979×14175 / Letter 12240×15840 / Legal 12240×20160)を `page.size` に反映。`<w:cols w:num="2">` で実機 2 段組が出る(従来 ignore で 1 段組のまま user 報告「2 段組じゃない」)
  - **段組組版 pptx**:slide body 領域を N column に水平 split、column gap 0.3 inch、各 column を独立 addText で配置(pptxgenjs は docx 同等の column API なしのため)
  - **AstDocument.layout field 追加**:`core/ast/index.ts` に optional string field、`parse.ts` の `extractFrontmatter` で抽出 + VALID_LAYOUTS 9 種 validation
  - **docx margin 非対称化**:user「左と上はホチキスや綴じ白を意識」を受けて top: 1440 (1.0 inch、ホチキス意識) / right: 1080 (0.75 inch) / bottom: 1080 / **left: 1440** (1.0 inch、綴じ代意識) の横書き default(縦書き対応は別 PR)
  - **pptx slide body 余白詰め**:`x: 0.5 / w: 12.0` → `x: 0.3 / w: 12.7` で 16:9 LAYOUT_WIDE(13.333 inch)を最大活用、コンテンツ比率を上げる
  - **line-height 1.5 → 1.15**:user「実際 web は 0pt に近い、読みやすさは行間でなく文章の構成で担保」doctrine、`BODY_LINE_HEIGHT_TWIP = 276`(Word default 1.15 と同等、dense web layout)
  - **段落間 spacing.before/after 全 0**:`case 'paragraph'` で明示 `spacing: { before: 0, after: 0 }`、Word default の暗黙 8pt after を完全消去、段落間は line-height のみで構成
  - **co template 本文長文化**:2 段組として認識される量に増やす(`layout: a4-2col` 前提)
  - case matrix test 16 件 新規(`tests/features/ast/export-layout-2col.test.ts`、`<w:cols num="2">` / `<w:pgSz>` 各用紙 / column space / `AstDocument.layout` field / pptx N column 等)、既存 `export-typography-bilingual.test.ts` の line height assertion を 360 → 276 に follow、全 7885 test pass、bundle.js 1857 KB / bundle.css 163 KB 不変。**manual PNG 16 件 全部再生成**(`docs/manual/images/templates/*` 一新、新 layout + 新 margin + 新 line-height + 新 spacing で密度 up)。

- **PR-W10 Wave X P4 layout template 集 + マニュアル新章**(2026-05-16、user 直接要望):テンプレートコマンド `/tmpXX`(`templates.entries` Tier 1 flag、`[a-z0-9]{2}` key、value = body string)の default を 6 → **14 件に拡張**:
  - **既存 6 件**(維持):`mt`(memo)/ `rt`(振り返り)/ `vd`(video)/ `au`(audio)/ `nv`(novel)/ `bk`(book)
  - **新規 8 件 layout 系**:`rp`(報告書、序論/本論/結論 + 章節項 auto-numbering)/ `pn`(プレゼン骨子、H1 章 + H3 通常スライド + データ表)/ `tc`(表中心、5×3 比較表)/ `mn`(議事録、アジェンダ + 決定事項 + 宿題 task list)/ `ln`(講義ノート、要点 + 詳細 + 練習問題)/ `cp`(比較対照、観点別 + 結論表)/ `co`(2 段組、`layout: a4-2col` frontmatter)/ `jl`(日報、ハイライト + 振り返り + 明日の予定)
  - 各 layout は **Wave X(PR-W6〜W9)で確立した docx/pptx 出力品位**(章番号 auto-numbering、bilingual font、accent border、3 layout master、running footer)に最適化された skeleton
  - **新マニュアル章 14**(`docs/manual/14_テンプレートコマンド集.md`、NEW):14.1 使い方(slash command + Flags inspector)/ 14.2 default 14 件一覧表 / 14.3 layout 系 8 件詳細(各 template に markdown コード + docx page 1 PNG + pptx slide 1 PNG)/ 14.4 自前 template 追加方法 / 14.5 既存 default の上書き / 14.6 PKC1 からの移行 / 14.7 関連章
  - **実機 PNG 16 セット**(`docs/manual/images/templates/` 配下、各 layout × docx/pptx、計 ~440 KB):vtest pipeline で各 template を実機 LibreOffice → PDF → 96dpi PNG 化、manual に inline 参照
  - case matrix test 14 件 新規(`tests/features/templates/template-flag.test.ts` 内 PR-W10 describe block):既存 default 6 件維持 + 新 8 key の存在 + 14 件以上 + rp/co/tc/mn の内容 invariant
  - 既存 `slash-menu.test.ts` 3 件 follow:fuzzy match で `date:` frontmatter を持つ layout template が `da` query で hit するため expected 2 → 6 に update
  - 全 7869 test pass(PR-W9 7854 から +15)、bundle.js 1855 KB(+3 KB、default template JSON が +1.8 KB minify 後 +3 KB)、bundle.css 163 KB 不変。`docs/manual/00_index.md` 全体目次 + 「レイアウト template を使いたい方」読み順 entry 追加。check:doc-orphans 0 件 / check:doc-deadlinks 0 件。

- **PR-W9 Wave X P3 layout templates**(2026-05-15、AI review P3 全件着地、Wave X 最終):
  - **P3-11 3 layout master 分化**:`PKC_SECTION_SLIDE`(扉、PR-W5 既存)+ `PKC_CONTENT_SLIDE`(本文、PR-W5 既存)+ **`PKC_TABLE_SLIDE`**(表中心、NEW)の 3 master。`splitIntoSlides` 後に **table-centric 自動判定**(slide が `tableRows`/`tableRowsRuns` を 1 件以上持ち、通常 text line が 0-1 件以内 = table が dominant content)で kind を `'content'` → `'table'` に格上げ。
  - **P3-12 表中心スライドの死に空間撲滅**:`table` layout で `tableTop = 1.1`(title 直下 0.1 inch separator)、`content` layout は従来通り `1.5`(separator スペース確保)。これで「表中心スライドでテーブルが中央に浮いて上半分が空っぽ」の AI review 指摘を解消。table-centric slide では title h を 0.7 に短縮して body 開始位置を上げる。
  - **P3-13 running footer**:全 layout master の `slideNumber` field に `{ x: 12.0, y: 6.8, w: 1.0, h: 0.3, fontSize: 10, color: '888888', align: 'right' }` で右下に subtle grey の slide 番号。`SlideDraft.chapterNum?: number` field 追加、H1 occurrence で 1 から bump、各 slide 描画時に `Chapter N` text(左下、`color: 888888`)を addText で挿入。chapterNum 0(H1 前 fallback slide)は footer text なし。
  - case matrix test 13 件 新規(`tests/features/ast/export-pptx-layout-templates.test.ts`、3 layout 判定 3 件 + table-centric layout 3 件 + running footer 6 件 + invariant 1 件)。全 7854 test pass(PR-W8 7841 から +13)。bundle.js 1852 KB / bundle.css 163 KB 不変。**実機 PNG 視覚検証**:扉スライド + Chapter footer、content slide で hybrid body+table、table-centric slide で title 直下から table 開始、task glyph 色化、全 layout で running footer 表示を pptx 6 slide で確認。

- **PR-W8 Wave X P2 visual language**(2026-05-15、AI review P2 全 4 件着地):
  - **P2-7 H2/H3 左 accent border**:`ACCENT_COLOR_HEX = '2F6FED'`(青)+ `HEADING_ACCENT_BORDER_SIZE = 24`(3pt)で docx の Paragraph.border.left に追加。H1 は pageBreakBefore で chapter separator が確保されるので不要、H2/H3 のみ accent line で階層識別を強化。`IParagraphOptions.border` は readonly のため `accentBorder` 変数を spread で構築する pattern。
  - **P2-8 表 padding + hairline border**:`TABLE_CELL_PADDING_TWIP = 160`(8pt)を TableCell.margins(top/bottom/left/right)に適用、`TABLE_BORDER_HEX = 'CCCCCC'` の hairline 0.5pt grey(border size 4 = 0.5pt)を Table.borders 6 方向すべてに適用、ヘッダー shading を `EEEEEE` → `F4F4F5` に統一(`INLINE_CODE_SHADING_HEX` と同色、AI review 指示)。AstTable + CSV fence table 両方で適用。
  - **P2-9 marker tone-down**:`MARK_HIGHLIGHT_HEX` を `'FFFF00'` → `'FFF3A0'`(soft yellow)に変更、docx は named highlight `'yellow'` から `shading.fill` hex 経路に切替(`InlineStyle.highlight` → `InlineStyle.mark: boolean` field 変更)、pptx は `PptxRun.highlight` の hex 値を新値に。「印刷物 / プレゼンで威圧的」AI review 指摘を解消。
  - **P2-10 task list glyph 色化**:`TASK_OPEN_GLYPH_COLOR_HEX = '888888'`(grey)/ `TASK_DONE_GLYPH_COLOR_HEX = '22C55E'`(green)を `InlineStyle.color` / `PptxRun.color` 経由で TextRun に適用、未完 ☐ が grey、完 ☑ が green で **状態の意味が色で伝わる**。
  - case matrix test 18 件 新規(`tests/features/ast/export-visual-language-p2.test.ts`、accent border 4 + table 4 + marker 3 + task 5 + invariant 2)、既存 test 4 件を新色に follow(EEEEEE → F4F4F5、FFFF00 → FFF3A0、yellow named → shading.fill hex)。全 7841 test pass(PR-W7 7823 から +18)。bundle.js 1851 KB(+1 KB)/ bundle.css 163 KB 不変。**実機 PNG 視覚検証**:H2/H3 左 accent border の青ライン、table cell padding + hairline 罫線、marker の soft yellow、task glyph の grey ☐ / green ☑ 色化を docx + pptx 両方で confirm。

- **PR-W7 Wave X P1 typography**(2026-05-15、AI review P1 全 3 件着地):
  - **P1-4 bilingual font stack**:`DEFAULT_FONT = 'BIZ UDGothic'` 単一指定 → docx の `IFontAttributesProperties` で `{ ascii: 'Inter', hAnsi: 'Inter', eastAsia: 'Noto Sans CJK JP', cs: 'Noto Sans CJK JP' }`(BILINGUAL_BODY_FONT)+ monospace は `{ ascii: 'JetBrains Mono', eastAsia: 'Source Han Code JP' }`(BILINGUAL_MONOSPACE_FONT)に分離。Word / LibreOffice が region に応じて欧文 / 和文を自動選択、受信環境に install が無い場合は font fallback。pptx は API 単一 `fontFace` のため `MONOSPACE_FONT_LATIN = 'JetBrains Mono'` 欧文主体で指定(CJK は PowerPoint / LibreOffice の自動 fallback)。
  - **P1-5 本文 line-height 1.5**:docx の default paragraph `spacing: { line: 360, lineRule: 'auto' }` を設定。twip 240 = 1.0、360 = 1.5。和文混在文書で読みやすさ向上。
  - **P1-6 inline code `#F4F4F5` shading**:docx は `applyStyle` で `code: true` の TextRun に `shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F4F5' }` を追加、pptx は `highlight: 'F4F4F5'` で灰色擬似ボックス化(mark `==X==` の `#FFFF00` yellow とは別 hex で意味分離)。新 constant `INLINE_CODE_SHADING_HEX` を `export-constants.ts` に追加、既存 `CODE_BLOCK_SHADING_HEX = 'F5F5F5'`(block の薄灰)と別管理。
  - case matrix test 14 件 新規(`tests/features/ast/export-typography-bilingual.test.ts`、bilingual font 5 + line-height 2 + docx inline code shading 3 + pptx inline code 4)、全 7823 test pass(PR-W6 7810 から +13、PR-V19 の `BIZ UDGothic` assertion + PR-W4 の `Consolas` assertion 計 3 件を新 font 名に follow)。bundle.js 1850 KB / bundle.css 163 KB 不変。**実機 PNG 視覚検証**:同 fixture を PR-W7 で出力、line-height 1.5 で行間が広がり、inline code の灰色擬似ボックス化、長 title の autoFit + wrap、扉スライドの中央寄せをすべて confirm。

- **PR-W6 Wave X P0 構造整流**(2026-05-15、AI review P0 全 3 件着地):
  - **P0-a 章番号二重表記**:従来 `nextHeadingPrefix` が機械的に "第1章 " / "1.1 " を prepend していたため、markdown 側に "# 第一章 …" / "## 1.1 …" を書くと「第1章 第一章 …」「1.1 1.1 …」の二重表記が出ていた。`hasExistingHeadingPrefix(text, level)` で L1〜L6 全段の manual prefix を検出(L1 = 第N章 / 第〇章 / Chapter N、L2 = N.N、L3 = N.N.N、L4 = (N) / (N)、L5 = カタカナ 1 字 + 空白、L6 = `a. ` 等)、auto-prefix を skip(counter は引き続き bump して後続 sub-heading の連番を保つ)。`bumpHeadingCounter` + `formatHeadingPrefix` の 2 関数に分離。
  - **P0-c 見出し spacing + size 階段強化**:H1 spacing before 480 / after 240 twip(24pt / 12pt)+ size 40(20pt)、H2 spacing before 360 / after 160(18pt / 8pt)+ size 32(16pt)、H3 spacing before 240 / after 120(12pt / 6pt)+ size 26(13pt 維持)。旧 H1 size 32 → 40、H2 size 28 → 32 で H1↔H2 差を 2pt → 4pt に広げ、階層が一目で読める。
  - **P0-b PPTX title autoFit + wrap + font-size 階段**:section title 44pt(旧 48pt)/ subtitle 36pt(旧 28pt)/ content title 28pt(旧 32pt)、各 title に `autoFit: true` + `wrap: true` を addText 呼出 options で指定(pptxgenjs の PlaceholderProps は autoFit を受け付けないため master でなく slide.addText 側に置く)、長 title が **意味境界で折り返し** + container 内 shrink で 2 行以内に収まる。section title 位置を y:2.5 → y:1.8 に移動して扉スライドの **上下 dead space を均す**、subtitle y:4.2 → y:4.0(title 直下に詰めて視線移動の断絶を消す)。content slide title h を 0.8 → 1.0、body 開始 y を 1.3 → 1.5 に下げて **title 直下の separator スペース確保**。
  - case matrix test 17 件 新規(`tests/features/ast/export-heading-prefix-and-spacing.test.ts`、章番号 7 + spacing 3 + autoFit 3 + invariant 4)、`docxXmlToText` helper で `<w:r>` 境界に分割された text を連結して assertion 簡素化、全 7810 test pass(PR-W5 7792 から +18)。**実機 PNG 視覚検証**:同 fixture を before/after で出力、章番号二重表記が解消(`第1章 第一章 …` → `第1章 …`)、pptx 扉スライドが中央配置、content slide で title-body separator が明確化されたことを confirm。

---

## Schema migration

不要。`SCHEMA_VERSION` は 1 のまま。v2.2.0 の container は v2.3.0 でそのまま動作。AttachmentBody 拡張(`registered_as_app?` / `app_icon?`)は **optional additive**、既存 attachment は読める。

`AstDocument.astVersion: '2.0'` は **AST schema** であって container schema ではない(window.PKC.ast 経由で serialize する場合のみ意味を持つ、container persistence には不参加)。

---

## Migration notes

v2.2.0 → v2.3.0 で **breaking change なし**。

- `window.PKC.ast.version`:`'1.1.0'` → `'1.2.0'`(`renderMarkdown` + `semanticHash` API 追加、既存 6 関数の signature は不変)
- `AstDocument.astVersion`:**未指定 = `'2.0'` 同等**(parser default で set、旧 serialized AST も `'2.0'` として解釈)
- `AttachmentBody.registered_as_app?` / `app_icon?`:未指定 → `false` / 未表示(既存 attachment に影響なし)
- `:::figure{id="X"}` の round-trip:今まで `id` が消えていた regression を修正、`id` が round-trip 保持されるように
- Markdown `[^id]` footnote:今まで markdown-it により reference-link 化されていたが、本リリースで `AstFootnoteRef` に正規認識

---

## Acknowledgements

ChatGPT と Gemini に design review いただき、AST IR の critical 設計判断(AstVar parse 時非展開 / Opaque preserve / astVersion / semanticHash / footnote / definition-list / canonical form)を確立できました。両 AI のレビューは `docs/spec/ast-commutative-ir.md` §12 に記録、Phase 4 以降の懸案(spanKind discriminator / attrs 3 分割 / AstCitation / layout hint / 3 層 IR 分離 / 他 format 直接 forward / reverse)も明文化しました。
