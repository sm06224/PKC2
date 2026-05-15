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

### v2.3.x stack follow-up wave(精度向上 wave、2026-05-15、PR-W1〜W5)

PR #433 の simplify reuse agent 指摘 + Phase 3 wave doc lifecycle 整理を 5 PR stack で着地予定:

- **PR-W1 docs reconcile**(2026-05-15、PR #434):reform-2026-05 Phase 3 wave 20 PR は #432 で main 着地済、v2.3.x stack PR-V1..V24 + hardening は #433 で main 着地済の状況を INDEX に反映(`### IN-PROGRESS` → `### COMPLETED` section 移動 + PR-2II / PR-2JJ v2 final / docs(release)の row 追加 + AST commutative IR canonical refs 追加)。Last updated を 2026-05-15 に更新、CHANGELOG の「着地予定」表現を「着地、PR #433」に修正。docs-only(src / dist / bundle / test 不変、7711/7711 pass 維持)。
- **PR-W2 docx↔pptx 共通 helper 抽出**(2026-05-15):`src/features/ast/export-runs-common.ts`(NEW)に `isInternalLink` / `extractEntryLidFromHref` / `detectTaskState` / `stripTaskPrefix` / `base64ToUint8Array` / `resolveImageData` の 6 helper を集約。docx 側で `imageRunForAssetSrc` の asset 解決部分を共通 helper の `resolveImageData` + `buildImageRun` の 2 段構成にリファクタ、pptx 側で `resolveImageSrc` → `resolveImageData` import に置換。bit-identical 振る舞いを保証(全 7711 test pass)、新 helper の case matrix unit test 55 件(`tests/features/ast/export-runs-common.test.ts`、wave 規律 §4 の 10 件以上を 5 系統で satisfy)。**bundle.js 1849 → 1848 KB**(差は minify 後で微小、source line は docx -92 + pptx -66 = -158 行削減)。drift gap が今は閉じていても将来 PDF / LaTeX / ePub export 追加時に同じ helper をコピペする誘因を構造的に阻止。

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
