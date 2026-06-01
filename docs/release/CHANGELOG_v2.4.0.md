# PKC2 v2.4.0 — Release notes

**Release date**: 2026-05-25(draft、stack PR 13 着地で確定)
**Schema**: 1(変更なし — additive-only)
**Previous release**: v2.3.0

v2.4.0 の主題は **PKC Markdown v4 確立**(stack PR 1-13、計 13 PR)です。`:::format{...}` block 装飾箱 (catalog #60)を Tier 0 vocabulary / Tier 1 class chain / Tier 2 formal の 3 形式で実装、inline `:T:vocab:`(catalog #9)と完全対称な block 拡張を確立。Q7 separator policy 統一(comma / 空白 両許容)+ Q8 value-only 寛容パース(4 directive 限定)+ `:::section{}` 任意 role の CSS class 自動命名で **block 拡張の表現力と寛容性** を一段拡張。あわせて人間向け完全 spec v4(`pkc-markdown-complete-spec-v4.md`、97 項目 7 scope 分割)+ AI 規約書 v4(`markdown-dialect-for-ai-authors-v4.md`、v3 supersede)+ manual ch12 §12.11(dog-fooding embed)で **3 audience(AI / human dev / 末端 user)同 source 同期** を実現しました。schema breaking はなく、既存 container は v2.3.0 と完全互換です。

---

## Highlights

### PKC Markdown v4 ── block 装飾箱 3 形 + Q7 / Q8 寛容拡張(stack PR 1-13)

**起草 trigger**:user direction 2026-05-25「block 要素に CSS class / 属性を 1 行で適用したい」「インライン記法に近い簡単な記法を寛容パースでサポート」「`==text==` ハイライトマーカーとの対応」「カンマかスペースでの区切りを許容して寛容パースの仲間に」「sectionとかのrole変数名指定とかも寛容パースで変数名省略できるべき?」「マニュアルの前に人間向けにスペックを全部押さえた文書を書いて」「これで実装とドキュメント化もしてください、自律的にスタックPRを積んでいって」

**13 PR stack 内訳**:

| Stack PR | 内容 | branch |
|---------|------|--------|
| 1 | v4 spec promote(draft → candidate)+ manual §12.11 + INDEX + v3 marker | `claude/pkc-ir-block-format-roundtrip-9im5F` |
| 2 | Q7 splitAttrs 拡張(comma / 空白 両許容)+ tests 17 件 | `claude/pkc-md-v4-q7-separator` |
| 3 | `AstFormatBlock` AST type 追加 + 5 consumer no-op stub + tests 10 件 | `claude/pkc-md-v4-ast-format-block` |
| 4 | `:::format{...}` formal directive parser + render-html + tests 16 件 | `claude/pkc-md-v4-format-formal` |
| 5 | Tier 1 class chain `:::.cls.cls` 寛容 6 variation + tests 16 件 | `claude/pkc-md-v4-format-class-chain` |
| 6 | Tier 0 vocabulary `:::red,bg-yellow,1.2em`(Q3 priority、inline 対称)+ tests 20 件 | `claude/pkc-md-v4-format-vocabulary` |
| 7 | Q8 value-only 寛容パース 4 directive + section 任意 role CSS class + tests 20 件 | `claude/pkc-md-v4-q8-value-only` |
| 8 | render-markdown 逆経路(canonical Q6 formal 寄せ)+ tests 10 件 | `claude/pkc-md-v4-render-markdown-reverse` |
| 9 | parse-html 逆経路(HTML → AstFormatBlock 逆 parse)+ tests 10 件 | `claude/pkc-md-v4-parse-html-reverse` |
| 10 | 5 surface CSS + Viewer popup mirror | `claude/pkc-md-v4-format-block-css` |
| 11 | 4 経路 byte-equivalent round-trip parity test + classes ABC sort 修正 + tests 15 件 | `claude/pkc-md-v4-parity-test` |
| 12 | AI 規約書 v4 起草 + v3 Successor marker 更新 | `claude/pkc-md-v4-ai-spec` |
| 13 | CHANGELOG_v2.4.0 + final bundle build + ship-readiness audit | `claude/pkc-md-v4-changelog-final` |

### `:::format{...}` block 装飾箱(catalog #60、3 形式)

複段落を任意 class / id / inline style / indent / align でくくる装飾箱。`AstSection{role}` は **semantic 専用**(固定 CSS が当たる)で、`:::paragraph` は **単段落限定** だったため、catalog §1.2.5 にあった「装飾系 directive」 の空白を埋める。

#### Tier 0 vocabulary(`:::red,bg-yellow,1.2em`、Q3 priority、人間日常 typing 向け)

```markdown
:::red,bg-yellow,1.2em
複段落を赤文字 / 黄色背景 / 1.2em で。

第 2 段落も同装飾。リストも入る:
- item 1
- item 2
:::
```

→ `<div class="pkc-format-block" data-pkc-format-block style="background-color: yellow; color: red; font-size: 1.2em">…</div>`

inline `:text:red,bg-yellow,1.2em:`(catalog #9)と **完全対称な vocabulary**、CSS class 事前定義不要。

#### Tier 1 class chain(`:::.cls.cls`、user CSS 連携)

寛容 6 variation 全件正規化:
```markdown
:::.highlight.important              # packed(最短)
::: .highlight .important            # space 区切り
::: {.highlight .important}          # Pandoc fenced div 互換
::: highlight                        # 単 class、`.` 省略可
:::.highlight#myid                   # class + id packed
::: .highlight #myid                 # class + id space-separated
```

→ `<div class="pkc-format-block highlight important">…</div>`

#### Tier 2 formal(`:::format{...}`、AI emit canonical)

```markdown
:::format{.highlight .important #note-1 indent=2 align=center custom=value}
内容
:::
```

→ canonical HTML(attrs 順 ABC sort、`<div class="pkc-format-block highlight important" id="note-1" data-pkc-format-block data-pkc-indent="2" data-pkc-align="center" data-pkc-custom="value">…</div>`)

### Q7 separator policy 統一(inline + block 両方を comma / 空白 両許容)

v3 までの inline `splitAttrs` は **comma `,` 区切りのみ** accept だったが、v4 で **comma / 空白 / 混在 全部 accept** に寛容化:

| 形 | v3 | v4 |
|----|----|----|
| `:T:bold,red:`(comma) | ✅ | ✅ |
| `:T:bold, red:`(comma + space) | ✅ | ✅ |
| `:T:bold red:`(space-only) | ❌ | ✅ 寛容 accept |
| `:T:bold\tred:`(tab) | ❌ | ✅ |
| `:T:rgb(255, 0, 0):`(parens 内 separator) | ✅ | ✅(depth 保護) |

block 形も同 separator policy(`splitAttrs` 1 関数の改修で inline / block 同時に効く)。対称性原則 §1.1 / §11.1 を維持。

### Q8 value-only 寛容パース(4 directive 限定)

```markdown
:::section{intro}        → role=intro(任意 role 文字列)
:::section{appendix}     → role=appendix
:::if{html}              → format=html
:::if{markdown}          → format=markdown
:::toc{2}                → depth=2
:::quote{"夏目漱石"}     → author="夏目漱石"
```

**4 directive 限定**(section / if / toc / quote):新規 utility ありの directive のみ。`:::break` / `:::list` / `:::heading` / `:::code` / `:::blank` / `:::paragraph` は既存 simple 形(`+++` / `- T` / `## T` / ` ```ts ``` ` / `_3` / `__T`)で覆われ済のため対象外。

### `==highlight==` の block 対応(Q4 vocabulary 経路で吸収)

| inline | block |
|--------|-------|
| `==text==`(黄固定) | `:::bg-yellow\nbody\n:::` |
| `==[red]text==` | `:::bg-red\nbody\n:::` |

block 専用 `==block==` syntax は採用しない(setext h1 衝突回避、`:::` 統一原則維持)、vocabulary 経路で吸収。任意背景色を block で扱える(inline `==` の固定制約を解消)。

### `:::section{}` 任意 role の CSS class 自動命名(v4 §8.1.2)

`postProcessSectionSentinels` の `SECTION_KNOWN_ROLES.has(safeRole)` 条件を撤廃、**任意 role に `pkc-section-<role>` class を自動命名**。AST 経路(`render-html.ts:265`)と動作統一、user は任意 role を user-side CSS で装飾可能。

```markdown
:::section{role=intro}
独自 role、自動的に `.pkc-section-intro` class が当たる
:::
```

→ `<section class="pkc-section-callout pkc-section-intro" data-pkc-role="intro">…</section>`

### 3 audience 同 source 同期(v4 spec + AI 規約 v4 + manual ch12 §12.11)

| audience | doc | content |
|----------|-----|---------|
| **AI(LLM)** | `markdown-dialect-for-ai-authors-v4.md`(NEW、v3 supersede) | LLM emit 用 self-contained reference、v4 §12 block 装飾箱 / Q7 / Q8 / 任意 role CSS class 全網羅 |
| **human dev / 設計者** | `pkc-markdown-complete-spec-v4.md`(NEW、candidate)| 97 項目 7 scope 分割(I 28 / B 32 / F 10 / C 4 / 寛容 7 / 廃止 11 / future 5)、`:::section{}` 4 形態 + 全 directive 詳細 |
| **末端 user** | `docs/manual/12_マークダウン拡張記法.md` §12.11(NEW)| dog-fooding 流儀で v4 機能を embed、§12.9 v2.3.0 確定 snapshot からの増分明示 |

3 doc とも同 source(v4 spec)から派生、cross-reference + 同期保証。

### round-trip 4 経路 byte-equivalent

| 経路 | 検証 |
|------|------|
| MD → HTML | `processFormatBlocks` + `postProcessFormatBlockSentinels`(`src/features/markdown/markdown-render.ts`) |
| HTML → MD | `parseHtmlToAst` `case 'div':` `pkc-format-block` 認識(`src/features/ast/parse-html.ts`) + `renderAstToMarkdown` `case 'format-block':`(`src/features/ast/render-markdown.ts`) |
| MD → AST → MD stable | canonical attrs 順(classes ABC / styles ABC / kvs ABC)、idempotent |
| AST → HTML → AST stable | `renderHtml` / `parseHtml` で deep equal |

parity test 15 件(`tests/features/ast/format-block-roundtrip-parity.test.ts`)で全件 verify。

### Public API 影響(v1.2.0 → v1.3.0、additive only)

- `AstFormatBlock` AST node 追加(`src/core/ast/index.ts`)
- `parseTier0FormatOpen` / `parseTier1FormatOpen` / `inferQ8ValueOnlyKey` helper export(`src/features/markdown/block-directive-attrs.ts`)
- `parseMarkdown` / `renderHtml` / `canonicalize` / `parseHtml` / `renderMarkdown` の全 6 関数が `AstFormatBlock` 対応
- 既存 API は完全 backward compatible

---

## Post-release follow-ups(v2.4.0 stack 13 後の hotfix / 機能追補)

### markdown render の v4 寛容パターン強化(hotfix bug report 2026-05-27)

- `hasMarkdownSyntax` を v4 block 装飾箱(formal / Tier 0 vocab / Tier 1 class)+ Q8 4 directive value-only + Pandoc brace + space-separated vocabulary に対応(commit `2272223`)
- heading-fold を `pkc-format-block` の内側にも再帰適用(option b)(commit `b8b1b18`)

### PWA `<install>` 撤回(user feedback 2026-05-27)

- 窓の杜 2026-05-26 記事に倣って常駐 `<install>` 要素を追加(commit `b0b0cba`)後、user feedback「右下にホバーしてるアプリとして導入ボタンは邪魔」を受け常駐 install button + fallback を撤去(commit `d4fd70b`)、manifest 埋め込みのみ残置

### textlog 重い問題の二段解消(user bug 2026-05-27「遂行は絶対」)

- selection mode toggle で center pane 全体 re-render を回避する narrow render path 追加 + checkbox 常駐 + `[data-pkc-textlog-selecting]` CSS gate(commit `0694122`)
- TEXTLOG → TEXT 変換を Web Worker + chunk 進捗 + AbortController(50KB 閾値で sync / worker 分岐)(commit `d9103fa`)
- Playwright smoke で textlog log selection 開始の回帰防止(commit `6453ef5`)

### blob URL 含む markdown text の貼付で asset 化(user direction 2026-05-28)

- `rewriteBlobUrlsToAssets` 追加、貼付テキストの `![](blob:...)` を fetch + base64 + `PASTE_ATTACHMENT` dispatch + `asset:KEY` rewrite。同 URL 複数 occurrence dedup / fetch 失敗 fallback / 部分 success / alt text 保持を test 10 件 + smoke で確認(commit `fba4938`、PR #748)

### MW screenshot 貼付の asset 埋め込み bug fix(user bug 2026-05-28)

- entry-window(child window)の `<textarea>` で画像 paste しても main window と同じ asset 埋め込み(`![name](asset:KEY)`)にならない問題を解消
- `exposePasteApi(dispatcher)` で `window.PKC.pasteAttachment(payload)` を main window namespace に設置、entry-window 側の inline paste handler が `window.opener.PKC.pasteAttachment(...)` で parent dispatcher に `PASTE_ATTACHMENT` を投げる動線を確立
- idempotent(再呼出しでも既存 function を保持)+ 既存 `window.PKC.ast` namespace 非破壊

### 領域 10-4 spreadsheet archetype Phase 2 ── grid editor(user direction 2026-05-29「1 と 2 両方」)

Phase 1 の TSV textarea を cell-by-cell grid editor に拡張。`renderEditorBody` を grid 中心の UI に置換、TSV mode は toggle で残置(fallback)。

実装:
- `src/adapter/ui/spreadsheet-presenter.ts` リライト:
  - **toolbar**(`+ 行` / `+ 列` / `TSV ⇄ Grid` toggle、3 button)
  - **grid table**(`<table class="pkc-spreadsheet-grid">`、各 cell は `contenteditable` + `data-row` / `data-col`、空 body は seed として 1 行 × 2 列を提示)
  - **hidden textarea**(`<textarea data-pkc-field="body">`、grid → TSV の sync 先 + TSV mode で visible)
  - **mode toggle**:`data-pkc-spreadsheet-mode="grid|tsv"` で grid と textarea を CSS で mutually-exclusive 表示
- `wireGridEvents(wrapper)`:wrapper element に event listener を attach(presenter self-contained):
  - cell `input` → `syncGridToTextarea` → hidden textarea に TSV 書き込み + `input` event 発火(dirty / preview / commit 経路と統合)
  - Tab / Shift+Tab で水平 cell 移動(末尾超過で新 row 自動追加)
  - Enter / Shift+Enter で垂直 cell 移動(末尾超過で新 row 自動追加)
  - ArrowDown / ArrowUp で同列上下 cell 移動(複数行 cell では default に任せる)
  - `+ 行` button → 末尾に空 row 追加 + 先頭 cell focus
  - `+ 列` button → 全行に空 cell 追加
  - `TSV ⇄ Grid` toggle:goingToTsv 時は grid → textarea sync、goingToGrid 時は textarea → grid 再 build(双方向 single source of truth 切替)
- `collectBody` 拡張:grid mode 時は table DOM から直接 body を build、TSV mode 時は従来通り textarea から
- CSS:`.pkc-spreadsheet-toolbar` + cell `:focus` ハイライト + mode toggle 表示制御

test:
- `tests/adapter/spreadsheet-presenter-phase2-grid.test.ts`(23 件):markup / cell input sync / Tab+Enter navigation / 末尾超過時の自動 row 追加 / toolbar button(+ 行 / + 列 / TSV toggle)/ TSV ⇄ Grid 双方向 sync / collectBody round-trip / XSS safe
- `tests/adapter/spreadsheet-presenter.test.ts` Phase 1 tests 2 件を Phase 2 markup に合わせ更新(編集 hint → toolbar、空 body → 2 cell seed)
- 全 pass

Phase 3 以降:CSV / TSV paste import、xlsx I/O、formula sub-set。

bundle:bundle.js +5 KB(grid editor + event handler + helpers)、bundle.css +0.7 KB。

### タブ中クリックで閉じる(user 要望 2026-05-29)

> タブを中クリックで閉じたいとのこと

`tab-strip.ts` のコメントには「middle-click → close」と書かれていたが実装が抜けていたため補完。`action-binder.ts` に `auxclick`(button=1)+ `mousedown`(autoscroll 抑止)の handler を追加。

- `.pkc-tab` 内で中クリック → 内側の `[data-pkc-action="close-tab"]` button を プログラム的 click → 既存 close 経路(`recordTabClose` + persistTabState + dispatcher.dispatch)を通す
- pinned tab は close button を持たないので自動的に no-op(pin 解除を強制しない)
- mousedown(button=1)で `preventDefault()` してブラウザの autoscroll を抑止

test:`tests/adapter/tab-middle-click-close.test.ts` 8 件 case matrix(通常 close / pinned no-op / 左右クリック無関係 / autoscroll preventDefault / 左ボタンは preventDefault しない / tab 外無関係 / 子 element 内中クリックも tab に届く)。

bundle:bundle.js +0.4 KB(handler 2 件のみ)。

### 領域 10-4 spreadsheet archetype Phase 1(user direction 2026-05-28 #4)

新 archetype `'spreadsheet'` を導入。`{ rows: string[][] }` JSON body + TSV(tab-separated)textarea editor + read-only HTML table view の MVP scope。

実装:
- `src/core/model/record.ts`:`ArchetypeId` union に `'spreadsheet'` 追加
- `src/core/operations/container-ops.ts`:`KNOWN_ARCHETYPES` set に追加
- `src/features/spreadsheet/spreadsheet-body.ts`(新規):pure helpers ── `parseSpreadsheetBody` / `serializeSpreadsheetBody`(JSON I/O、不正値寛容 fallback、cell coerce)/ `parseTsvToBody` / `serializeBodyToTsv`(TSV ⇔ body round-trip、CRLF 正規化、trailing 空行 trim)/ `getColumnCount` / `getRowCount`
- `src/adapter/ui/spreadsheet-presenter.ts`(新規):`DetailPresenter` 実装
  - `renderBody`:read-only `<table class="pkc-spreadsheet">`、1 行目 `<thead>` + 残 `<tbody>`、ragged row は padding、空 body は placeholder caption、textContent 経由で XSS safe
  - `renderEditorBody`:TSV `<textarea data-pkc-field="body">` + 編集 hint `<p>`
  - `collectBody`:textarea TSV → JSON body round-trip
- `src/main.ts`:boot で `registerPresenter('spreadsheet', spreadsheetPresenter)`
- `src/adapter/ui/{card-hydrator,renderer}.ts`:ArchetypeId Record の completeness 維持(icon 🧮、label "Sheet")
- `src/styles/base.css`:`.pkc-spreadsheet-*` の最小 CSS(border / striping / TSV textarea monospace + tab-size 12)

Phase 2 以降の予定(未着手):cell-by-cell grid editor / column resize / row insert / CSV import / xlsx I/O / formula sub-set。

test:
- `tests/features/spreadsheet/spreadsheet-body.test.ts`(20 件):parse/serialize/TSV round-trip/edge case(空 / 不正 JSON / ragged / null cell / 数値 coerce / CRLF / trailing 空行 trim)
- `tests/adapter/spreadsheet-presenter.test.ts`(14 件):renderBody / renderEditorBody / collectBody の各 contract + XSS safe + ragged row padding + region attr + 編集 round-trip
- 全 10031 件 pass、1 skipped(既存)

bundle:bundle.js +3 KB、bundle.css +1 KB(presenter + body helpers + 最小 CSS)。

### 領域 10-3 IR 残:行レベル source-line を AST 経路に thread(user direction 2026-05-28 #3)

audit doc(`completed/render-surface-parity-audit-2026-05.md`)で残課題と marked されていた「IR(AST)経路にも markdown-it 経路と同じ精度で `data-pkc-source-line` を emit」を実装。AST 経路 render(`renderAstToHtml` + 4 経路 byte-equivalent round-trip + Word docx / PPT pptx export)が markdown-it 経路と同じ source-line anchor 精度になり、source-preview-sync が AST 経路でも機能する基盤が整備。

修正経路:
- `src/features/ast/parse.ts`:walkBlocks の `html_block` / 'inline'(bare inline)case で `tokenPos` を呼んで `pos` を stamp(従来は paragraph として push するも pos 無し)
- `src/features/ast/decompose-pkc.ts`:`buildBlockNode` に `pos?: AstPosition` 引数追加、`:::section` / `:::comment` / `:::figure` / `:::if` / `:::quote` / `:::paragraph` / `:::break` / `:::format` / default(unknown role)の 9 ブランチで `if (pos) node.pos = pos` を統一実装。call site 3 箇所(line 478 / 486 / 624)で opener paragraph の `block.pos` を thread。
- `:::format` 経路は cleanAttrs / layout / vocab / Tier 0 / Tier 1 のいずれの形でも pos 維持
- multi-line `%%%` open / close marker(L 448)+ single-line collapsed `%%% ... %%%` paragraph(L 578)の AstCommentBlock 構築でも opener pos 転記

test:`tests/features/ast/source-line-threading.test.ts` 12 件 case matrix。`:::section` / `:::figure` / `:::if` / `:::quote` / `:::format` / `%%%` の各 directive で pos が opener 行に転記 + render-html が `data-pkc-source-line="<line-1>"` を emit + sourceLineAnchors: false なら出ない opt-in 規約 + single-line collapsed 形 + 通常 paragraph/heading/list の pos 維持 + html_block の pos stamp。全 9997 件 pass。

bundle:bundle.js +0.3 KB(pos thread 経路のみ)。

### 領域 5 編集 command 拡充:command palette に 19 件追加(user 督促 2026-05-28、roadmap §領域 5 残)

`roadmap §領域 5` の「command 拡充」 残箇所を実装。Command Palette(Ctrl+Shift+P / F1)から編集中 body textarea に対して inline wrap + line-prefix snippet を発火できるようにする。既存 keyboard shortcut(Ctrl+B / I / S / `)と同じ `wrapInline` + `applySnippet` helper を共有、二重実装ゼロ。

追加 command:
- **inline wrap 5 件**:bold(**)/ italic(*)/ strike(~~)/ inline code(`)/ highlight(==)
- **line-prefix / block insert 14 件**:code block(``` ```)/ heading 1〜3 / quote(>)/ bullet list(-)/ section break(+++)/ align center(||)/ align right(|>)/ align left(<|)/ ruby([[ruby:...]])/ em-dot([[em:...]])/ comment(%% %%)/ simple inline(:text:attrs:)

仕様:
- 編集中 body textarea 取得は `activeElement` 優先 → fallback で `textarea[data-pkc-field="body"]` query
- 編集中の body textarea が無いと silent no-op + warn(palette 操作で「編集中でない」を user に知らせる)
- bold / italic / strike / code-inline は既存 keyboard shortcut の keybind hint を palette に保持

test:`tests/adapter/command-palette-editor-format.test.ts` 16 件 case matrix(各 wrap / snippet 動作 + activeElement 優先 + fallback query + 不在時 no-op + 全 19 command の registration)。全 pass。

bundle:bundle.js +3 KB(コマンド 19 件の meta + handler 分)。

### Flag always-on batch:13 件を default ON 化(2026-05-28、flag-inventory audit §2 反映)

`flag-inventory-audit-2026-05-24.md` §2 で **always-on 化推奨** とされた 13 件(shell 11 + text 2)を default OFF → ON。各機能は wave-α / wave-γ で着地後、長期間 stable 稼働 + user 体感 positive のため batch 切替:

- `shell.command_palette_enabled`(Ctrl+Shift+P / F1)
- `shell.quick_open_enabled`(Ctrl+P entry fuzzy launcher)
- `shell.keymap_registry_enabled`(declarative keymap)
- `shell.new_button_picker_enabled`(`+ New` 1 button picker)
- `shell.back_forward_in_breadcrumb_enabled`(breadcrumb の `⇐` `⇒` 統合)
- `shell.editor_footer_wordcount_enabled`(text/textlog 編集時 wordcount + read time)
- `shell.todo_overdue_indicator_enabled`(sidebar / filer の todo overdue ⚠ indicator)
- `shell.about_pkc_markdown_showcase_enabled`(About entry の PKC-Markdown showcase)
- `shell.meta_pane_references_clarify_enabled`(References tab heading に source suffix)
- `shell.format_panel_default_hidden_enabled`(format panel default 非表示 + 🎨 toggle)
- `shell.meta_pane_inspector_enabled`(meta pane Inspector tab strip 5 tab)
- `text.textlog_log_search_enabled`(textlog keyword search bar)
- `text.textlog_importance_filter_enabled`(textlog ⭐ importance-only filter toggle)

URL flag `?pkc-flag=<name>=0` で従来 OFF 動線維持(roll-back path 完備)。一定 wave 後の flag 削除 + コード簡素化は別 PR で実施予定。

test:既存 OFF 経路 assertion は `setFlag(false)` 経路で明示 `=0` を渡す pattern に更新(15 test files、合計 ~25 件の assertion)。全 9970 件 pass。

### Doc lifecycle catch-up(2026-05-28、user 指摘「すでに実装もしてるやつありそう」を受けた一括更新)

- roadmap doc 更新漏れ 5 件を一括反映:
  - 領域 1 履歴ナビゲーション → 完了マーク追加(PR #197 + pgc-54/55 で実装、`src/adapter/ui/nav-history.ts`)
  - 領域 3 .md/.txt 解決提案 → 完了マーク追加(`isTextConvertibleAttachment` + `convertAttachmentEntryToText` 着地済)
  - 領域 6 markdown 方言の現状一覧を reform-2026-05 着地反映表に更新(14 機能 / 全件 ✅)
  - 領域 10-3 内部中間表現(IR)導入 → 大半着地済反映(AST 13 ファイル + Word docx / PPT pptx export 直接出力)
- INDEX.md 更新:
  - `render-surface-parity-audit-2026-05.md` を `completed/` へ archive(Gap-1〜15 全件 RESOLVED、pgc-78〜211 で着地)
  - `inspector-ai-tab-roadmap-2026-05.md` の Status を「Phase 1 + Phase 2 全 8 機能着地済」に更新(A1-A8 = frontmatter / duplicate / broken link / abandoned / circular / outline lint / tag imbalance / archetype mismatch 全件 src/features/ai/ に implementation)
- `v3-unification-master-2026-05-24.md` の dead link を archive path に修正

### Edit-mode preview の post-markdown hydration 拡充(user direction 2026-05-28)

> プレビューにおいて負荷を増幅させずに HTML レンダーと mermaid レンダーを有効化できるなら実装して欲しい
> 現状はメインウィンドウの保存完了後のレンダリング表示とがでしか表示できないため、編集体験が悪い

- Split View edit preview(`updateTextEditPreview` in `action-binder.ts`)で `preview.innerHTML = renderMarkdown(...)` 後に `expandTransclusions` / `hydrateCardPlaceholders` / `applyHeadingFold` / `hydrateMermaidPlaceholders` を call。detail-presenter(S1)/ rendered-viewer(S2)/ entry-window(S4)と 3 surface parity 規約に揃える
- entry-window(MW)preview は `pkgcHydratePreviewMermaid(element)` を parent に exposed、child inline script の `renderMdInto(el, text)` helper が `innerHTML` 設定後に呼び cross-document mermaid hydrate を発火(pgc-203 wave-α' polish #24 の known limitation を解消)
- 負荷増幅対策:`mermaid-renderer.ts` 内に `(theme, source) → svg` cache(max 64 entries、LRU eviction、theme 切替で clear)。500ms / 100ms debounce 経由で同 source の placeholder が再 emit されても `mermaid.render` を skip して即 SVG inject
- HTML render iframe(` ```html-render`)は HTML 文字列に含まれて自己完結、別途 hydrate 不要

---

## Bundle / test

- **bundle.js**: 5,231-5,232 KB(v2.3.0 比 +4 KB、format-block parser + render + Q7/Q8 helper 分)
- **bundle.css**: 205-206 KB(v2.3.0 比 +1 KB、`.pkc-format-block` CSS rule 分)
- **test suite**: 120+ test files / 2,500+ tests pass(v2.3.0 比 +117 件追加、stack PR 2-11 で format-block 関連 117 件 + section role parity 2 件 update)
- **typecheck / lint**: clean
- **5 surface CSS parity**: center pane / Viewer popup / Split View preview / entry-window で `pkc-format-block` 動作確認

## Backward compatibility

- **schema**: v2.3.0 と同一(no breaking、additive only)
- **container 互換**: 既存 entry の body markdown は v2.3.0 と完全同一に render
- **format-block 未使用 entry**: 全く影響なし
- **既存 `:::section{role=X}`**: 同一動作(さらに任意 role でも `pkc-section-X` class が当たるようになった、user CSS で装飾可能)
- **既存 inline `:T:bold,red:`**: 同一動作 + 空白区切り `:T:bold red:` も新規 accept(Q7 寛容拡張)

## 関連 doc(v4 promote 後)

| 用途 | doc |
|------|-----|
| AI 向け規約書(canonical) | `docs/spec/markdown-dialect-for-ai-authors-v4.md` |
| 人間向け完全 spec | `docs/spec/pkc-markdown-complete-spec-v4.md` |
| 末端 user manual | `docs/manual/12_マークダウン拡張記法.md` §12.11 |
| block format wrapper 実装 spec | `docs/spec/pkc-block-format-attr-syntax-v1-minimum-scope.md` |
| AST 公開 API | `docs/spec/public-ast-api-for-ai.md` |
| 可換 IR | `docs/spec/ast-commutative-ir.md` |
| 設計議論 12 章 doc set | `docs/development/notation-redesign-2026-05/` |

## archive 候補(v4 canonical promote 同時)

- `docs/spec/markdown-dialect-for-ai-authors-v3.md` → `docs/development/archived/spec-versions/`(2026-08 quarterly review で `git mv`)
- `docs/spec/markdown-dialect-for-ai-authors-v2.md` / `v1.md`(既に v3 supersede 済、v4 promote で更に古くなる)

## 次 wave 候補

- block format wrapper の入れ子対応(`:::format` の nested、現状 stack PR 4 で skip 済 case 13、`:::section` 等も同 limitation)── depth tracker 化 PR
- AI 規約 v4 → manual 派生のさらなる充実(§12.12 「Q8 完全 patterns」 等)
- block format wrapper の Playwright visual parity test(現状 vitest + happy-dom だけで cover、実 browser screen は別 wave)
- 7 scope catalog の自動化(`:::format` を含む全 directive を doc-spec から自動生成)
