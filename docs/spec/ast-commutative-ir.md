# PKC AST as Commutative IR — 双方向可換変換器の中央集権設計

**Status**: ✅ canonical(2026-05-13 PR-2JJ v2 で着地)
**Owner**: PKC2 reform-2026-05 Phase 3 後継、可換世界の中央集権 IR 設計
**Audience**: 他 AI(ChatGPT / Gemini / 等)による設計レビュー、外部 tool 連携者

## 1. 設計思想

PKC2 の AST(`AstDocument`)を **可換世界の中央集権 IR**(Intermediate Representation)と位置付ける。各 format(MD-PKC / MD-GFM / HTML / Word / PDF / PPT / LaTeX / Pandoc JSON 等)への双方向 mapping は **すべて AST を介して** 定義する。

```
                    ┌──────────────────┐
                    │   AstDocument    │
                    │  (中央集権 IR)   │
                    └──────────────────┘
                    ↗ ↑    ↓ ↘
                   /  |    |  \
        parseMD──/   |    |   \──renderMD(pkc|gfm)
                /     |    |     \
      MD-PKC ───      |    |      ─── MD-GFM
                      |    |
        parseHTML─────|    |─────renderHtml
                      |    |
        Pandoc←-------|    |--→Pandoc-JSON
                      |    |
        (future)      |    |     (future)
        Word←─────────|    |─────→Word
        PPT←──────────|    |─────→PPT
        LaTeX←────────|    |─────→LaTeX
        PDF←──────────|    |─────→PDF
```

各 format との **双方向 mapping**(forward = AST → target、reverse = target → AST)を定義する。これにより:

1. 任意 format で書いた document が AST にいったん上がる → 別 format に下りる
2. 共通 IR を経由するので **N format 対応に N² ペアコンバータは不要**(代わりに N forward + N reverse 計 2N 個)
3. 各 format で「直接表現できない」概念は **可換に持ち込める表現に変換**(例:`:::section{role=warning}` ↔ GFM blockquote `> **Warning:**`)
4. AST を中央 IR にすることで、format 横断の lossless 変換が成立する範囲を最大化

## 2. AstDocument の構造

詳細は `src/core/ast/index.ts` を **truth source** として参照。本 doc では概要のみ。

### 2.1 Document root

```ts
interface AstDocument {
  kind: 'document';
  writing?: 'horizontal' | 'vertical';
  direction?: 'ltr' | 'rtl';
  align?: 'left' | 'right' | 'center' | 'top' | 'bottom';
  notation?: string;            // 例:'pkc-markdown-1.0'
  vars?: Readonly<Record<string, string>>;  // frontmatter から抽出
  children: readonly AstBlock[];
  warnings?: readonly PkcWarning[];
}
```

### 2.2 Inline node kinds(19 種)

```
text / strong / emphasis / strike / inline-code / mark / em-dot / ruby /
sup / sub / span / link / card / embed / image / auto-ref / var /
math-inline / comment-inline
```

### 2.3 Block node kinds(14 種)

```
heading / paragraph / quote / list / table / code-block / code-render /
break / figure / section / if-block / comment-block / blank / math-block
```

## 3. 双方向 mapping table(MD-PKC ↔ MD-GFM)

**Forward(PKC → GFM 互換表現)**:

| PKC AST node | GFM 表現 | Forward 設計意図 |
|---|---|---|
| `AstSection(role=R)` | `> **R:**\n> ...` blockquote | GFM 普遍の callout、role を太字 label として visible 保持 |
| `AstCommentBlock` | (削除) | コメントは consumer に出さない |
| `AstIfBlock(format=pdf)` | (削除) | GFM target で PDF 限定 content を含めない |
| `AstIfBlock(format=html/web)` | passthrough(中身展開) | format 互換 content |
| `AstFigure` | image + italic caption | GFM に figure はないので近似 |
| `AstMark` | `<mark>X</mark>` | GFM 認可 HTML inline |
| `AstEmDot` | `<span class="pkc-em-dot">X</span>` | reverse 認識 hint 兼用 |
| `AstRuby` | `<ruby>base<rt>rt</rt></ruby>` | 正規 HTML(GFM 認可) |
| `AstSup` / `AstSub` | `<sup>X</sup>` / `<sub>X</sub>` | GFM 認可 HTML |
| `AstSpan(class)` | `<span class="X">Y</span>` | class 維持で reverse 可能 |
| `AstStrong/Emphasis/Strike/InlineCode` | `**X**` / `*X*` / `~~X~~` / `` `X` `` | commonmark 標準 |
| `AstVar(path)` 定義済 | 値(展開済) | document.vars から expand |
| `AstVar(path)` 未定義 | `{{vars.path}}` literal | consumer 側で展開できない場合は plain |
| `AstAutoRef(id)` | `@id` plain | GFM 標準 mention 風 fallback |

**Reverse(GFM → PKC AST node)**:

| GFM 表現 | PKC AST node | Reverse 設計意図 |
|---|---|---|
| `> **Role:**` blockquote 先頭 | `AstSection(role=Role.toLowerCase())` | callout 表現を AST 構造として復元 |
| `> [!NOTE]` GitHub Alert(5 種) | `AstSection(role=note/tip/important/warning/caution)` | GitHub 標準 alert 形式を取り込む |
| `<mark>X</mark>` HTML | `AstMark` | |
| `<sup>X</sup>` / `<sub>X</sub>` | `AstSup` / `AstSub` | |
| `<ruby>base<rt>rt</rt></ruby>` | `AstRuby` | |
| `<span class="lead">X</span>` | `AstSpan(class=lead)` | class hint で意味復元 |
| `<span class="pkc-em-dot">X</span>` | `AstEmDot` | 特定 class を専用 node に昇格 |

### 3.1 可換性 contract

- **PKC → GFM → PKC** の往復で **semantic 等価な AST** に戻る
- **5 cycle 反復で stable**(destructive change なし)
- 失われる情報がある場合は **明示的に**(例:`:::section{role=warning}` の role 名は GFM blockquote の太字 label として復元できるが、`:::if{format=pdf}` 内容は GFM に出ない=明示的 drop)

### 3.2 Test 根拠

- `tests/features/ast/bidirectional-commutativity.test.ts`(22 cases)— forward 9 + reverse 8 + round-trip 4 + 他 format 土台 1
- `tests/features/ast/pkc-extensions-full-coverage.test.ts`(53 cases)— 全 21 PKC 拡張 × 2 mode × 5 反復 stability
- `tests/features/ast/decompose-pkc.test.ts`(23 cases)— AST decomposition の構造正確性
- `tests/features/ast/user-fixture-roundtrip.test.ts`(20 cases)— 実機 fixture(石狩変電所)で 5 反復 stable

## 4. parser pipeline

```
text(markdown 文字列)
  ↓
parseMarkdownToAst(text)
  ├─ extractFrontmatter:`---\n...\n---\n` を YAML mini parse、vars 抽出
  ├─ markdown-it.parse(body):commonmark + GFM core tokens
  └─ walkBlocks(tokens):Token → AstBlock[] 構築
  ↓
decomposePkcExtensions(ast)
  ├─ Phase 1:PKC formal 形(`:::role{...}` / `:role:[X]` / `==X==` / 等 21 種)を AST node に分解
  │   ├─ block:`:::section/comment/figure/if/quote/paragraph` + `%%%` を opener/closer ペア検出
  │   └─ inline:text node value を scanInlineMarkers で walk
  │
  └─ Phase 2:Reverse 認識(GFM 由来表現を PKC AST node に逆復元)
      ├─ block:`> **Role:**` blockquote / `> [!NOTE]` GitHub Alert → AstSection
      └─ inline:HTML inline(`<mark>` `<sup>` `<ruby>` `<span class>`)→ 対応 AST node
  ↓
canonicalize(ast)
  ├─ link href normalize / inline-code value trim / 空 text 除去 / 連続 text merge
  └─ idempotent contract(canonicalize(canonicalize(x)) === canonicalize(x))
  ↓
AstDocument(可換 IR)
```

## 5. render pipeline

```
AstDocument
  ↓
renderAstToMarkdown(ast, { mode: 'gfm' | 'pkc' })
  ├─ block walker(switch on kind)
  ├─ inline walker(switch on kind)
  ├─ post-process bridge(残存 PKC marker の safety net):
  │   ├─ expandVarsInOutput
  │   ├─ stripPkcBlocksForGfm(GFM mode のみ)
  │   ├─ stripPkcInlinesForGfm(GFM mode のみ)
  │   └─ normalizePkcMarkersForPkcMode(PKC mode のみ)
  └─ 連続空行を 2 連続まで折り畳む
  ↓
出力 markdown text
```

別経路:
- `renderAstToHtml(ast)` → HTML 文字列
- `astToPandocNative(ast)` → Pandoc Native JSON
- 将来:`renderToWord(ast)` / `renderToPpt(ast)` / `renderToLatex(ast)` / `renderToPdf(ast)`

## 6. window.PKC.ast 公開 API(v1.1.0)

`docs/spec/public-ast-api-for-ai.md` を canonical 参照。本 doc では概要のみ。

```ts
window.PKC.ast.parseMarkdown(text, opts?): AstDocument
window.PKC.ast.canonicalize(ast): AstDocument
window.PKC.ast.renderHtml(ast, opts?): string
window.PKC.ast.renderMarkdown(ast, opts?): string  // mode: 'gfm' | 'pkc'
window.PKC.ast.toPandocJson(ast): object  // Pandoc Native JSON
window.PKC.ast.markdownToPandoc(text, opts?): object
window.PKC.ast.version: '1.1.0'
```

DevTools console / iframe / postMessage / 他 AI から呼べる。

## 7. 他 format への展開ロードマップ

| Target | Forward(AST → target) | Reverse(target → AST) | Phase |
|---|---|---|---|
| **HTML** | ✅ `renderAstToHtml` | future: HTML parser + ast-decompose | Phase 3(forward 完了) |
| **Pandoc Native JSON** | ✅ `astToPandocNative` | future: Pandoc → AST 逆 mapping | Phase 3(forward 完了) |
| **MD-PKC ↔ MD-GFM** | ✅ 本 commit 完了 | ✅ 本 commit 完了 | **本 PR で双方向達成** |
| **Word(docx)** | Pandoc 中継(現)/ 直接 docx.js | future: docx → AST | Phase 4 |
| **PPT(pptx)** | Pandoc 中継 | future: unzip + parse | Phase 4 |
| **PDF** | print dialog(browser native)/ typst | future: PDF text scan → AST | Phase 4 |
| **LaTeX** | Pandoc 中継 | future: latex parser | Phase 5 |
| **EPUB** | Pandoc 中継 | future: epub unpack → HTML → AST | Phase 5 |
| **Anki cards** | future: 専用 lowering | future: Anki text format → AST | Phase 6 |
| **Org-mode** | Pandoc 中継 | future: org parser | Phase 6 |

各 target で「可換に持ち込めるものは AST 経由」、独自表現が必要な部分のみ target 固有 lowering を入れる方針。

## 8. 設計原則

### 8.1 中央集権 IR としての不変条件

1. **AST は format-agnostic**:特定 format の用語(HTML tag 名 / Word OOXML 用語 / etc.)を AST node 名に持ち込まない。例外:`code-block` / `code-render` は markdown-it 由来だが widespread な用語
2. **AST は lossless**:可能な限り source representation の意味を保持。視覚 hint(`:spacing:{size=N}`)は AST node に変換、render 段階で各 format の表現に lower
3. **canonicalize は idempotent**:`canonicalize(canonicalize(x)) === canonicalize(x)`
4. **双方向 mapping は明示**:forward(AST → target)と reverse(target → AST)を対称的に定義、片方が lossy なら他方も同じ semantic で lossy

### 8.2 可換性の現実主義

完全な双方向 lossless 可換は **多くの場合で不可能**。本設計は:
- **構造を保持できる範囲で AST 経由 mapping**(`:::section` ↔ blockquote with label)
- **不可能な変換は明示的に drop / fallback**(`:::if{format=pdf}` は GFM target で drop、復元しない)
- **5 cycle 反復で stable** を最低要件(2 cycle 目以降同一 output、destructive change なし)

### 8.3 他 AI / 外部 tool への露出

`window.PKC.ast` 経由で 6 関数を公開。他 AI(ChatGPT / Claude / Gemini)が:
- DevTools console で `PKC.ast.parseMarkdown(...)` 呼んで AST を受け取る
- iframe / postMessage で AST を交換
- Pandoc 経由で docx / pptx / pdf / latex に展開

## 9. CHANGELOG / 着地履歴

- **PR-2Y(#419、2026-05-12)**:`parseMarkdownToAst` 着地、commonmark + GFM core 完全 cover
- **PR-2Z(#420)**:`renderAstToHtml` + 30 fixture equivalence test
- **PR-2AA(#421)**:IR migration scaffolding(Tier 0 flag `markdown.use_ir`)
- **PR-2BB(#422)**:`canonicalize` + `astToPandocNative`
- **PR-2GG(#427)**:`window.PKC.ast` 公開 API 着地、v1.0.0
- **PR-2JJ v2(本 PR、2026-05-13)**:
  - `decomposePkcExtensions` 着地:PKC 拡張 21 種を AST node に **真に decompose**
  - `renderAstToMarkdown(ast, { mode: 'gfm' | 'pkc' })` 着地、`window.PKC.ast.renderMarkdown` v1.1.0
  - PKC ↔ GFM 双方向可換変換器(forward + reverse 完備)
  - 22 + 53 + 23 + 20 = 118 unit tests で fix

## 10. 参考 doc

- [`src/core/ast/index.ts`](../../src/core/ast/index.ts) — AST type 定義(truth source)
- [`docs/spec/public-ast-api-for-ai.md`](./public-ast-api-for-ai.md) — `window.PKC.ast` API surface
- [`docs/spec/markdown-dialect-for-ai-authors-v3.md`](./markdown-dialect-for-ai-authors-v3.md) — PKC MD spec(AI 向け規約書)
- [`docs/development/notation-redesign-2026-05/`](../development/notation-redesign-2026-05/) — reform-2026-05 設計シリーズ
- [`docs/development/ir-migration-plan-2026-05.md`](../development/ir-migration-plan-2026-05.md) — IR migration plan
- [`docs/development/reform-2026-05-phase3-wave-retrospective.md`](../development/reform-2026-05-phase3-wave-retrospective.md) — Phase 3 wave 反省

## 11. 他 AI へのレビュー依頼ポイント

本 doc を ChatGPT / Gemini 等に渡すとき、以下に焦点をあててほしい:

1. **AST 型の completeness**:現 19 inline + 14 block で markdown / HTML / Word / PDF / PPT / LaTeX を表現できるか? 不足 node kind はあるか?(例:footnote / definition list / abbr)
2. **双方向 mapping の lossless 性**:現 PKC ↔ GFM table で意味を失う場面があれば指摘
3. **他 format 拡張時の design pattern**:Word / PPT / LaTeX で AST 経由 mapping が困難な構造は? 専用 lowering が必要な部分はどこか?
4. **canonical form の選び方**:simple form(`==X==`)と formal form(`:strong:[X]`)が併存するとき、AST canonical はどちらを source of truth とすべきか?
5. **vars / メタプログラミング**:`{{vars.x}}` は parse 時に展開すべきか、render 時に展開すべきか? 双方向 mapping への影響は?

---

**meta**: 本 doc は user direction 2026-05-13「スペック文書はどこ? 他の AI にも設計を確認してもらうから出して、一番筋のいい、努力的可換の究極を作り出す気概で作っていきましょう」を受けて起こしたもの。「努力的可換の究極」を目指す設計を他 AI からレビューしてもらうための spec として明示的に書いた。

---

## 12. AI review feedback と Design decision(2026-05-13)

ChatGPT と Gemini が §11 question に基づき review した結果と、それを受けた
PKC 側の design decision を記録。

### 12.1 ChatGPT review(critical 採用済)

> 「AST が syntax tree なのか semantic IR なのかをもっと明確に分離した方がいい」

**Decision**:本 IR は **semantic document IR** と位置付ける(`§8.1 中央集権 IR
としての不変条件` で明文化)。full publishing IR(PPT layout / DTP / advanced
PDF)には拡張せず、それらは target lowering 層に寄せる方針。3 層 IR
(Syntax Tree → Semantic IR → Target Lowering IR)の Lowering 層は
Phase 4 以降で必要に応じ導入。

> 「`AstSpan(class)` が闇属性化する」

**Decision**:現状は AstSpan に attrs.classes を持たせる方式で進める。class
hint の用途は **3 種類のみ厳格化**:
  - `lead` / `caption` → 専用 `:lead:[X]` / `:caption:[X]` formal 形に round-trip
  - `pkc-em-dot` → AstEmDot に昇格
  - その他 → AstSpan(class) のまま(reverse hint として活用)

class が増え過ぎたら、`spanKind: 'semantic' | 'style' | 'opaque'`
discriminator を Phase 4 で導入。

> 「**opaque node を最初から導入した方がいい**」(critical 推奨)

**Decision**:**採用**。`AstOpaqueInline` / `AstOpaqueBlock` を core/ast/index.ts
に追加。`sourceFormat: 'latex' | 'html' | 'docx' | 'unknown'` + `original`(raw)
を持つ。LaTeX `\command{a}{b}` 等を lossless preserve。render は `original`
そのまま emit、re-parse で AstOpaque に戻る。

> 「**AstVar は parse 時展開しない**」(critical 推奨)

**Decision**:**採用**。`decompose-pkc.ts` の `tryInlinePattern` で
`{{vars.x}}` を **常に AstVar として保持**(従来:定義済 → text 展開)。
理由:
  - source provenance 維持(再 parse で `{{vars.x}}` 復元可能)
  - reverse 可換性(GFM → PKC 経路で AstVar に戻せる)
  - late binding(AstDocument を渡したまま vars を差し替え可能)
  - target-specific vars(GFM target は展開、PKC target は template 維持)
  - template 化(複数パターン生成、宛名差し込み的 use case)

render 時の動作分岐:
  - **PKC mode**:`{{vars.x}}` literal を出力(template 維持、reverse 可換)
  - **GFM mode**:`ast.vars[x]` で展開(consumer は template 解釈できない)

> 「**semanticHash(ast)** を定義した方がいい」(critical 推奨)

**Decision**:**採用**。`src/features/ast/semantic-hash.ts` 新規。
normalize:空 text node 除去 / 連続 text merge / whitespace normalize /
attrs 順序 normalize / link href fragment lower-case。
`semanticHash(rt(ast)) === semanticHash(ast)` を round-trip stability の
**数値証明** として使う。

> 「**AstIfBlock は conditional compilation / macro system**」「parse-time
> pruning か render-time evaluation かを明確化」

**Decision**:現状は **render-time evaluation**(parser は AST に残す、
render-markdown.ts の `case 'if-block'` で `format` 評価して drop / passthrough)。
**parse-time pruning にはしない** ← AstVar と同じく source provenance 維持。

> 「**astVersion を document payload に埋め込め**」(critical 推奨)

**Decision**:**採用**。`AstDocument.astVersion: '2.0'` を必須化、parser が
default 設定。serialized AST 保存 / postMessage / cache / DB persistence
時に schema migration の基盤になる。

> 「**footnote / definition-list / task-list / page-break / raw-inline /
> raw-block** が不足候補」

**Decision**:
  - `AstFootnoteRef` + `AstDocument.footnotes` → **採用**(本 PR で着地)
  - `AstDefinitionList` + `AstDefinitionItem` → **採用**(本 PR で着地)
  - `task-list` → 既存 `AstListItem.state: 'open' | 'done'` でカバー済
  - `page-break` → 既存 `AstBreak(breakKind: 'rule' | 'page')` でカバー済
  - `raw-inline` / `raw-block` → `AstOpaqueInline` / `AstOpaqueBlock` で
    実現(命名は ChatGPT 提案を踏まえ "opaque" に統一)

> 「**attribute system** が semantic / presentational / foreign で混ざる」

**Decision**:現状は `AstAttrs = { id, classes, kvs }` の単一構造で進める。
Phase 4 で混乱が始まれば 3 種分離を導入する。

> 「PKC AST は **semantic document IR** に固定、PPT/DTP は target lowering
> に寄せる」

**Decision**:**採用**。PPT/DTP/advanced PDF は target lowering の責務、
core AST に持ち込まない。これにより AST は semantic に集中、cross-format
の意味的可換性を最大化。

### 12.2 Gemini review(critical 採用済)

> 「footnote / definition list / citation / page-slide break が不足候補」

**Decision**:footnote / definition-list は ChatGPT と同じく採用。
**citation** は AstQuote.citation で属性として表現済(spec §2.2 既出)、
専用 node に格上げするかは Phase 4 で判定。

> 「`> **Warning:**` の手動入力を意図せず AstSection に昇格させる懸念」

**Decision**:**仕様として許容**。意図せぬ昇格を避けたい場合は invisible
marker(`<!-- pkc:no-promote -->` 等)を提供する方向を Phase 4 で検討。
現時点では「明確な benefit(reverse 可換性)があり、稀な誤検出は許容」
の判断。

> 「Word 変換器を作る際、layout 属性(`2-column` 等)が AST レベルで
> 必要になる」

**Decision**:**Phase 4 で AstNodeBase.attrs に layout hint を拡張する**
方向。core AST は当面 semantic 中心、layout は target lowering で吸収。

> 「Canonical form は **Formal Form**(`:strong:[X]`)を AST truth source に」

**Decision**:**採用**。canonicalize は **formal form が source of truth**。
ただし render 段階で:
  - PKC mode → formal form(`:strong:[X]` / `:emphasis:[X]` 等)で出力
  - GFM mode → simple form(`**X**` / `*X*`)で出力(GFM consumer 互換)

これにより AST 上は曖昧さなし、render 時に target format に応じた表現選択。

### 12.3 着地一覧(PR-2JJ v2 final)

| 採用項目 | 実装ファイル | test |
|---|---|---|
| AstFootnoteRef + footnotes 抽出 | `decompose-pkc.ts` + `parse.ts` | `ai-review-feedback.test.ts` |
| AstDefinitionList / AstDefinitionItem | `core/ast/index.ts` + render-*.ts | (待) |
| AstOpaqueInline / AstOpaqueBlock | `core/ast/index.ts` + scanHtmlInlineForReverse | `ai-review-feedback.test.ts` |
| astVersion: '2.0' | `parse.ts` + `core/ast/index.ts` | `ai-review-feedback.test.ts` |
| AstVar parse 時非展開 | `decompose-pkc.ts` tryInlinePattern | `ai-review-feedback.test.ts` |
| render 時 vars expansion(GFM only) | `render-markdown.ts` | `ai-review-feedback.test.ts` |
| semanticHash 関数 | `semantic-hash.ts`(NEW) | `ai-review-feedback.test.ts` |
| `window.PKC.ast.semanticHash` 公開(v1.2.0) | `public-ast-api.ts` | `ai-review-feedback.test.ts` |

### 12.4 Phase 4 以降への懸案

- `spanKind` discriminator(class 用途が増えたら)
- `AstAttrs` の semantic / presentational / foreign 分離
- `AstCitation` 専用 node 格上げ
- `<!-- pkc:no-promote -->` invisible marker(意図せぬ昇格防止)
- layout hint(2-column 等)を AstNodeBase.attrs に
- 3 層 IR(Syntax Tree / Semantic IR / Target Lowering IR)分離
- Word docx / PowerPoint pptx / LaTeX の **直接 forward**(Pandoc 中継卒業)
- HTML / LaTeX / docx の **reverse**(target → AST)
