# Internal Representation(IR)Migration Plan — reform-2026-05 Phase 3 Block C

**Status**: 設計確定(2026-05-12、user direction「migration approach、可換世界をしっかり広げる」)
**実装 PR**: PR-2Y(parse)/ PR-2Z(render)/ PR-2AA(migration)/ PR-2BB(canonicalize + export)
**Skeleton 着地済**: `src/core/ast/index.ts`(PR-2I、2026-05-10、19 inline + 14 block kinds)

---

## 0. 設計哲学

reform-2026-05 で確立した 3 doctrines を IR で具現化する:

1. **simple-first / formal-as-serializer**(Phase 1)→ IR が serialize 経路の正規
2. **Postel's Law(寛容に accept、厳密に send)**(PR-2L)→ IR が canonical form を保持
3. **Diff friendliness**(PR-2I §0.2.5)→ IR の syntax 表現が deterministic

IR は **markdown ↔ HTML の N:M 関係を解く** ための中間表現で、PKC2 を「HTML 専用 renderer」から **「format-agnostic な書誌情報 container」** へ拡張する基盤。

---

## 1. なぜ Migration approach か

user direction(2026-05-12)で **Additive layer(並列追加)ではなく Migration(置換)** を選択。理由:

| Additive | Migration(採用)|
|---------|---------------|
| 既存 renderMarkdown はそのまま | renderMarkdown 内部を IR 経由に置換、public API 不変 |
| IR は別経路で「あるけど使われない」状態 | IR が常時 hot path、品質保証も hot |
| 可換性(Word/PPT/PDF export)を後から追加 | 可換性 entry point が最初から確立 |
| regression risk 低 | equivalence test で完全 guard、API 不変 |

**可換世界拡大**:IR を介すことで、HTML 以外の出力経路(Pandoc filter / Word / PPT / PDF / LaTeX / ePub)を **同じ IR から分岐** できる。これが PKC2 v2.3 以降の核。

---

## 2. AST 構造(PR-2I 着地済)

`src/core/ast/index.ts` で定義済(public API、変更不可):

```ts
interface AstDocument {
  kind: 'document';
  globals: { writing?, direction?, align?, layout? };  // R-2A
  vars: Record<string, string>;                         // M-7
  children: AstBlock[];
  warnings: PkcWarning[];                               // PR-2I
}

type AstBlock =
  | { kind: 'heading'; level: 1..6; children: AstInline[]; attrs?; pos? }
  | { kind: 'paragraph'; children: AstInline[]; attrs?; pos? }
  | { kind: 'quote'; author?; year?; source?; children: AstBlock[]; pos? }  // R-D
  | { kind: 'list'; ordered: boolean; items: AstBlock[][]; pos? }
  | { kind: 'table'; rows: AstInline[][][]; align?; pos? }
  | { kind: 'code-block'; lang?; info?; content: string; pos? }
  | { kind: 'code-render'; content: string; pos? }                    // PR-2M
  | { kind: 'break'; kind_: 'page'|'rule'; role?; pos? }              // R-2H
  | { kind: 'figure'; id?; children: AstBlock[]; caption?; pos? }     // L-7
  | { kind: 'section'; role: string; children: AstBlock[]; pos? }     // R-2F
  | { kind: 'if-block'; format: string; children: AstBlock[]; pos? }  // R-F
  | { kind: 'comment-block'; pos? }                                   // R-2G
  | { kind: 'blank'; count: number; pos? }                            // L-8
  | { kind: 'math-block'; content: string; pos? };

type AstInline =
  | { kind: 'text'; content: string }
  | { kind: 'strong'; children: AstInline[] }
  | { kind: 'emphasis'; children: AstInline[] }
  | { kind: 'strike'; children: AstInline[] }
  | { kind: 'inline-code'; content: string }
  | { kind: 'mark'; color?; children: AstInline[] }      // L-2-a
  | { kind: 'em-dot'; children: AstInline[] }            // L-2-c
  | { kind: 'ruby'; base: AstInline[]; reading: string }
  | { kind: 'sup'; children: AstInline[] }
  | { kind: 'sub'; children: AstInline[] }
  | { kind: 'span'; attrs; children: AstInline[] }
  | { kind: 'link'; href; title?; children: AstInline[] }
  | { kind: 'card'; target; variant?; raw: string }      // pkc-card
  | { kind: 'embed'; target; pos? }
  | { kind: 'image'; src; alt; title? }
  | { kind: 'auto-ref'; id: string }                     // [@id] / R-2D
  | { kind: 'var'; key: string; defined: boolean }       // M-7
  | { kind: 'math-inline'; content: string }
  | { kind: 'comment-inline' };
```

`isCanonical(node)` placeholder も AST module にあり、PR-2BB で実装。

---

## 3. Phase 3 Block C の 4 PR

### PR-2Y — AST parse 実装

**ファイル**: `src/features/ast/parse.ts`(NEW)

```ts
export function parseMarkdownToAst(text: string, opts?: ParseOptions): AstDocument
```

**実装**:
1. `parseFrontmatter(text)` → `globals` + `vars` + `warnings`
2. `md.parse(body, env)` → markdown-it Token[](既存 renderMarkdown と同じ前処理 pipeline 適用済)
3. Token 走査 → AstBlock[](`heading_open` / `paragraph_open` / `bullet_list_open` 等を AstBlock に変換)
4. 各 block の `inline` token を AstInline[] に展開(`text` / `strong_open` / 等)
5. PKC 固有 token(`em_dot_open` / `mark_open` / `pkc_card` 等)を専用 AstInline kind にマップ
6. position info(`token.map`)を `pos.line` に転記

**test**: 既存 markdown-render の test fixture を `parseMarkdownToAst` に通し、`AstDocument` structure を JSON snapshot で固定。30+ ケース matrix(simple + formal + edge + nested)。

---

### PR-2Z — AST render 実装 + 等価性 test

**ファイル**: `src/features/ast/render-html.ts`(NEW)

```ts
export function renderAstToHtml(ast: AstDocument, opts?: RenderOptions): string
```

**実装**:
1. AstDocument を再帰的に traverse
2. 各 kind を HTML element にマップ(`heading` → `<h1>…<h6>`、`section` → `<section class="pkc-section-callout">` 等)
3. globals を `data-pkc-*` attr で root に転記
4. vars 未定義は `<span class="pkc-variable-undefined">` で warning visible
5. position を `data-pkc-source-line` attr に転記(`opts.sourceLineAnchors` 有効時のみ)

**equivalence test**(critical):
- `tests/features/ast/equivalence.test.ts`(NEW)
- 既存 `renderMarkdown(text)` vs `renderAstToHtml(parseMarkdownToAst(text))` の byte-equivalent を 50+ fixture で assert
- diff 出たら fail。test pass を `migration` 着手条件にする

---

### PR-2AA — renderMarkdown migration(可換世界拡大)

**変更点**:
- `src/features/markdown/markdown-render.ts` の `renderMarkdown()` 内部を IR 経由に置換
- public API(signature / return type / options)は **完全に不変**
- equivalence test が green であることを **着手条件**

```ts
// Before(PR-2AA 前):
export function renderMarkdown(text: string, opts?: RenderMarkdownOptions): string {
  // ... 既存 preprocessor pipeline + markdown-it + postprocess
}

// After(PR-2AA 後、internal だけ置換):
export function renderMarkdown(text: string, opts?: RenderMarkdownOptions): string {
  const ast = parseMarkdownToAst(text, opts);
  return renderAstToHtml(ast, opts);
}
```

**risk mitigation**:
1. equivalence test 50+ ケース pass を migration 前提
2. 全 vitest(7100+ ケース)pass で regression 完全 guard
3. Playwright smoke 全 200+ ケース pass(visual parity)
4. bundle size 増減 ≦ +5 KB cap(超過時 dedup 必要)

**この PR の意義**:**IR が常時 hot path** になり、品質保証経路に組み込まれる。可換世界拡大(Pandoc / Word / PPT)の前提条件。

---

### PR-2BB — Canonicalize + Pandoc filter export 雛形

**新規**:
1. `src/features/ast/canonicalize.ts` — simple → canonical formal の写像実装
2. `src/features/ast/export-pandoc.ts` — `AstDocument` → Pandoc Native JSON

#### Canonicalize

`docs/development/notation-redesign-2026-05/11-canonicalization-spec.md`(PR-2I)の 1:1 写像表を実装:

```ts
export function canonicalize(ast: AstDocument): AstDocument
```

idempotent contract:`canonicalize(canonicalize(x)) === canonicalize(x)`(deep equal)

semantic round-trip:
- `parseMarkdownToAst(serializeFromAst(canonicalize(ast)))` で semantic 等価
- syntax は保証外(`==X==` ↔ `:::mark[X]` のような equivalent forms は片方向に正規化される)

#### Pandoc filter 雛形

```ts
export function astToPandocNative(ast: AstDocument): PandocAstNode
```

PandocAstNode は Pandoc Native JSON 構造(`Pandoc` / `Meta` / `Block` / `Inline`)に従う。これにより `pandoc --from json --to docx` 等で Word / PPT / PDF / LaTeX export 可能。

実装は雛形(最頻使用 kind のみ網羅)、完全実装は future wave。

---

## 4. equivalence test design

`tests/features/ast/equivalence.test.ts`(PR-2Z で新設):

```ts
import { renderMarkdown } from '@features/markdown/markdown-render';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderAstToHtml } from '@features/ast/render-html';

const FIXTURES: { name: string; markdown: string }[] = [
  { name: 'L-1 section break', markdown: '+++' },
  { name: 'L-2 highlight', markdown: '==text==' },
  { name: 'L-2 em-dot 新形', markdown: '^^text^^' },
  // ... L-3 〜 L-9 / M-7 / R-C 〜 R-F / R-2A 〜 R-2H / PR-2L tolerant alias 群
  // 計 50+ fixture
];

for (const { name, markdown } of FIXTURES) {
  it(`AST round-trip equivalence: ${name}`, () => {
    const direct = renderMarkdown(markdown);
    const viaAst = renderAstToHtml(parseMarkdownToAst(markdown));
    expect(viaAst).toBe(direct);
  });
}
```

byte-equivalent が **PR-2AA migration 着手の green light**。

---

## 5. migration 後の可換世界

PR-2BB 着地後の export 経路:

```
markdown text
    ↓ parseMarkdownToAst
AstDocument
    ↓ canonicalize
canonical AstDocument
    ↓ 分岐
    ├─ renderAstToHtml      → HTML(既存)
    ├─ astToPandocNative    → Pandoc JSON → docx / pptx / pdf / latex / epub
    ├─ astToOrgMode         → org-mode(future)
    └─ astToMarkdownSerial  → canonical markdown(round-trip 用、future)
```

**v2.3 以降の foundation** — IR が hub、各 format renderer は spoke。

---

## 6. 開放問題(future wave)

| OQ | 内容 | 対応 wave |
|----|-----|----------|
| OQ-IR-1 | `parseMarkdownToAst` を markdown-it preprocessor の各 pass(L-1 / L-8 等)とどう統合するか?token 後 vs source 前 vs 並列 | PR-2Y で検証、最適経路を確定 |
| OQ-IR-2 | `serializeFromAst`(AstDocument → markdown)を作るか? | 必要性次第、PR-2BB 後 evaluate |
| OQ-IR-3 | IR persist(container 内に AST を保存)するか?body は markdown のまま vs AST 二重持ち | future wave(性能 trade-off + storage cost)|
| OQ-IR-4 | Pandoc filter は npm dep `pandoc-types` を引くか?自前 type? | bundle size と保守性 trade-off、PR-2BB で確定 |

---

## 7. 関連 doc

- AST skeleton:`src/core/ast/index.ts`(PR-2I)
- Canonicalization spec:`docs/development/notation-redesign-2026-05/11-canonicalization-spec.md`(PR-2I)
- Warning code 体系:`src/features/notation/warnings.ts`(PR-2I)
- Phase 3 stack 全体:`docs/development/phase3-stack-execution-plan-2026-05.md`(PR-2R)
