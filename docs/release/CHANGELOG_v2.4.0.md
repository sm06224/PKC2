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
