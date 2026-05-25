/**
 * PKC AST(Abstract Syntax Tree)skeleton(reform-2026-05 Phase 2 PR-2I、
 * ChatGPT 提案 #2 受容)。
 *
 * 設計目標(`docs/development/notation-redesign-2026-05/08-ir-mapping.md`):
 *   - simple 形と formal 形が **同じ AST ノードに正規化** される(可換性)
 *   - AST から各 format(HTML / Word / PPT / PDF / LaTeX / Org / Pandoc / Anki)
 *     への射影が成立(format 横断 lossless)
 *   - 不変条件(node kind / attrs / 階層 / cap)を type-level で固定
 *
 * 本 PR は **type 定義のみ**(skeleton)、実装(parse / render integration /
 * canonicalize 関数 / Pandoc filter export 等)は post-reform Phase Z で IR
 * persist と同期して着手。
 *
 * core/ layer:browser API なし、pure type definition。
 */

// ── Common types ────────────────────────────────────────

/** Pandoc-style attrs。`#id` `.class` `key=value` `flag` を分解。 */
export interface AstAttrs {
  id?: string;
  classes: readonly string[];
  kvs: Readonly<Record<string, string | boolean>>;
}

/** Position in source(line / column 1-based)。 */
export interface AstPosition {
  line: number;
  column?: number;
  /** end position(任意)。multi-line node の終端。 */
  endLine?: number;
  endColumn?: number;
}

/**
 * Layout hint(`AstNodeBase.layout`)— PR-V3 で追加(Gemini review 2026-05-13
 * 推奨「Word 変換器を作る際 layout 属性が AST レベルで必要」)。
 *
 * core AST は **semantic 中心** のまま、layout 指示は分離した layout 名前空間
 * に持つことで attrs(semantic id / classes / kvs)との衝突を避ける。Word /
 * PPT / PDF / LaTeX 直接出力時に各 target lowering が消費する。
 *
 * Phase 1:基本 hint(columns / float / pageBreakRole / textAlign 等)のみ
 * を提供、PPT slide layout 等の format 固有指示は Phase 2 以降。
 */
export interface AstLayoutHint {
  /** 段組数(1〜N)。1 / undefined は通常 1 段。 */
  columns?: number;
  /** float 配置(`left` / `right` / `none`)。figure / image / sidebar 用途。 */
  float?: 'left' | 'right' | 'none';
  /** 改ページ semantic role(`cover` / `section` / `appendix` / `bibliography` 等)。 */
  pageBreakRole?: string;
  /** Word / PPT で region anchor(本文 / sidebar / header / footer 等)を指定。 */
  region?: string;
  /** Text alignment(段落 align とは別、wrap context での text-align)。 */
  textAlign?: 'left' | 'right' | 'center' | 'justify';
  /** PPT slide layout 名(`title-content` / `two-content` / 等)。Phase 2。 */
  slideLayout?: string;
}

/** すべての AST node の base type。 */
export interface AstNodeBase {
  /** Discriminator。switch case / 型絞り込みに使う。 */
  kind: string;
  /** Pandoc-style attrs。formal 形の `{...}` から正規化。 */
  attrs?: AstAttrs;
  /** Source 位置(parser が stamp、renderer は無視可)。 */
  pos?: AstPosition;
  /** Layout hint(PR-V3、target lowering 用)。 */
  layout?: AstLayoutHint;
}

// ── Inline nodes ────────────────────────────────────────

export interface AstText extends AstNodeBase {
  kind: 'text';
  value: string;
}

export interface AstStrong extends AstNodeBase {
  kind: 'strong';
  children: readonly AstInline[];
}

export interface AstEmphasis extends AstNodeBase {
  kind: 'emphasis';
  children: readonly AstInline[];
}

export interface AstStrike extends AstNodeBase {
  kind: 'strike';
  children: readonly AstInline[];
}

export interface AstInlineCode extends AstNodeBase {
  kind: 'inline-code';
  /** plain text(commonmark inline code は内部 markup 効かない)。 */
  value: string;
}

export interface AstMark extends AstNodeBase {
  kind: 'mark';
  children: readonly AstInline[];
  /** `==[red]text==` の color 指定。 */
  color?: string;
}

export interface AstEmDot extends AstNodeBase {
  kind: 'em-dot';
  children: readonly AstInline[];
  /** style 指定(default `dot`)。 */
  style?: 'dot' | 'circle' | 'filled-dot';
}

export interface AstRuby extends AstNodeBase {
  kind: 'ruby';
  base: string;
  rt: string;
}

export interface AstSup extends AstNodeBase {
  kind: 'sup';
  children: readonly AstInline[];
}

export interface AstSub extends AstNodeBase {
  kind: 'sub';
  children: readonly AstInline[];
}

export interface AstSpan extends AstNodeBase {
  kind: 'span';
  children: readonly AstInline[];
}

export interface AstLink extends AstNodeBase {
  kind: 'link';
  href: string;
  /** kind: external / entry / asset / permalink. */
  linkKind: 'external' | 'entry' | 'asset' | 'permalink';
  children: readonly AstInline[];
  /**
   * pgc-243:CommonMark `[text](url "title")` の title attribute、
   * HTML `<a title>` と双方向可換に保持。未指定なら省略。
   */
  title?: string;
}

export interface AstCard extends AstNodeBase {
  kind: 'card';
  ref: string;
  children: readonly AstInline[];
}

export interface AstEmbed extends AstNodeBase {
  kind: 'embed';
  ref: string;
  /** seamless(展開)or quote(引用)。 */
  mode: 'seamless' | 'quote';
  children: readonly AstInline[];
}

export interface AstImage extends AstNodeBase {
  kind: 'image';
  src: string;
  alt: string;
  /**
   * pgc-243:CommonMark `![alt](src "title")` の title attribute、
   * HTML `<img title>` と双方向可換に保持。未指定なら省略。
   */
  title?: string;
}

export interface AstAutoRef extends AstNodeBase {
  kind: 'auto-ref';
  /** figure / table / equation の id 参照。 */
  id: string;
}

export interface AstVar extends AstNodeBase {
  kind: 'var';
  /** dot path(`vars.x`)。 */
  path: string;
}

export interface AstMathInline extends AstNodeBase {
  kind: 'math-inline';
  src: string;
}

export interface AstCommentInline extends AstNodeBase {
  kind: 'comment-inline';
  /** hidden=true は render に出ない、visibility=footnote は本文末 footnote。 */
  visibility: 'hidden' | 'footnote';
  /** label / id(footnote 用)。 */
  id?: string;
  children: readonly AstInline[];
}

/**
 * Footnote reference(`[^id]` 形式の本文参照)。
 *
 * **Gemini review(2026-05-13)推奨**:学術 / 技術文書で必須。
 * Pandoc / LaTeX への変換時に link 代用ではセマンティクスが壊れるため
 * 独立 node に。本文末の `[^id]: 本文` は AstDocument.footnotes に保持。
 */
export interface AstFootnoteRef extends AstNodeBase {
  kind: 'footnote-ref';
  /** 参照 id(本文末 `[^id]: ...` と対応)。 */
  id: string;
}

/**
 * Opaque inline(未知 / 他 format 由来の inline 構文 preserve)。
 *
 * **ChatGPT review(2026-05-13)推奨**:LaTeX `\textcolor{red}{...}` /
 * Word OOXML inline / HTML `<data-*>` 等、semantic IR に自然還元できない
 * inline 構文を **lossless preserve** する逃げ道。drop すると lossless
 * 性が死ぬので raw を持つ。
 */
export interface AstOpaqueInline extends AstNodeBase {
  kind: 'opaque-inline';
  /** 由来 format(`'latex'` / `'html'` / `'docx'` / `'unknown'` 等)。 */
  sourceFormat: string;
  /** Raw source text(再構築のため reconstructable な原文)。 */
  original: string;
}

/**
 * Citation(学術 / 書誌的参照)— PR-V2 で **AstQuote.citation 属性から
 * 専用 node に格上げ**(Gemini review 2026-05-13 推奨)。
 *
 * BibTeX / docx export / Pandoc citation processor 連携の起点。Pandoc は
 * `Cite { citationId, citationPrefix, citationSuffix, citationMode, ... }`
 * を持つので、本 node はそれに対応する semantic 表現を最小限抱える。
 *
 * 既存 `AstQuote.citation: Record<string, string>` は backward-compat の
 * ため維持(block-level の attribution chip 用)、本 node は inline-level
 * 参照(本文中の `[@smith2020]` 等)に使う。
 *
 * 入力 syntax:`[@id]` を `AstAutoRef` ではなく `AstCitation` に振り分け
 * るかは canonicalize で判定(`id` が `figure-` / `table-` プレフィックス
 * を含まない場合は citation 扱い)。
 */
export interface AstCitation extends AstNodeBase {
  kind: 'citation';
  /** Citation ID(BibTeX key 相当、例:`smith2020`)。 */
  id: string;
  /** 引用 prefix(例:「see also」)。 */
  prefix?: string;
  /** 引用 suffix(例:「p. 42」)。 */
  suffix?: string;
  /** Citation mode:`'normal'`(本文内)/ `'parenthetical'`(括弧)/ `'narrative'`(著者名のみ)。 */
  mode?: 'normal' | 'parenthetical' | 'narrative';
}

/** Inline union(parser 結果 / renderer 入力の中身)。 */
export type AstInline =
  | AstText
  | AstStrong
  | AstEmphasis
  | AstStrike
  | AstInlineCode
  | AstMark
  | AstEmDot
  | AstRuby
  | AstSup
  | AstSub
  | AstSpan
  | AstLink
  | AstCard
  | AstEmbed
  | AstImage
  | AstAutoRef
  | AstVar
  | AstMathInline
  | AstCommentInline
  | AstFootnoteRef
  | AstOpaqueInline
  | AstCitation;

// ── Block nodes ─────────────────────────────────────────

export interface AstHeading extends AstNodeBase {
  kind: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: readonly AstInline[];
}

export interface AstParagraph extends AstNodeBase {
  kind: 'paragraph';
  children: readonly AstInline[];
  /** 物理 align(formal-only)or logical(simple)。 */
  align?: 'left' | 'right' | 'center' | 'top' | 'bottom' | 'start' | 'end';
  /** 字下げ(L-9 indent)。 */
  indent?: number;
}

export interface AstQuote extends AstNodeBase {
  kind: 'quote';
  children: readonly AstBlock[];
  /** author / year / source 等の citation attrs(formal `:::quote{author=…}`)。 */
  citation?: Record<string, string>;
}

export interface AstList extends AstNodeBase {
  kind: 'list';
  listKind: 'bullet' | 'ordered' | 'task';
  start?: number;
  items: readonly AstListItem[];
}

export interface AstListItem extends AstNodeBase {
  kind: 'list-item';
  children: readonly AstBlock[];
  /** task list の checked 状態。 */
  state?: 'open' | 'done';
}

export interface AstTable extends AstNodeBase {
  kind: 'table';
  rows: readonly AstTableRow[];
  align?: ReadonlyArray<'left' | 'right' | 'center' | null>;
}

export interface AstTableRow extends AstNodeBase {
  kind: 'table-row';
  cells: readonly AstTableCell[];
  isHeader?: boolean;
}

export interface AstTableCell extends AstNodeBase {
  kind: 'table-cell';
  children: readonly AstInline[];
}

export interface AstCodeBlock extends AstNodeBase {
  kind: 'code-block';
  lang: string | null;
  code: string;
}

export interface AstCodeRender extends AstNodeBase {
  kind: 'code-render';
  /** lang(tree / dbschema / mindmap / mermaid / etc.)。 */
  lang: string;
  source: string;
}

export interface AstBreak extends AstNodeBase {
  kind: 'break';
  /** rule(commonmark hr)or page(section break)。 */
  breakKind: 'rule' | 'page';
  /** page break の semantic role(cover / section / appendix 等)。 */
  role?: string;
}

export interface AstFigure extends AstNodeBase {
  kind: 'figure';
  /** figure / table / equation。 */
  figureKind: 'figure' | 'table' | 'equation';
  children: readonly AstBlock[];
  caption?: readonly AstInline[];
  /** 自動採番。renderer / serializer が assign。 */
  num?: number;
}

export interface AstSection extends AstNodeBase {
  kind: 'section';
  /** semantic role(summary / warning / note / tip 等)。 */
  role: string;
  children: readonly AstBlock[];
}

export interface AstIfBlock extends AstNodeBase {
  kind: 'if-block';
  format: string;
  children: readonly AstBlock[];
}

export interface AstCommentBlock extends AstNodeBase {
  kind: 'comment-block';
  /** content(render に出ない、source dump にのみ)。 */
  source: string;
}

export interface AstBlank extends AstNodeBase {
  kind: 'blank';
  count: number;
  /** cap 超過時の表示用(visible 警告)。 */
  cappedFrom?: number;
}

export interface AstMathBlock extends AstNodeBase {
  kind: 'math-block';
  src: string;
}

/**
 * Definition list(`<dl>` 風 term + description ペア)。
 *
 * **Gemini review(2026-05-13)推奨**:仕様書 / 辞書的コンテンツで多用、
 * Pandoc / MDX 互換にも必要。
 *
 *   term1
 *   : description1
 *
 *   term2
 *   : description2
 */
export interface AstDefinitionList extends AstNodeBase {
  kind: 'definition-list';
  items: readonly AstDefinitionItem[];
}

export interface AstDefinitionItem extends AstNodeBase {
  kind: 'definition-item';
  term: readonly AstInline[];
  description: readonly AstBlock[];
}

/**
 * Opaque block(未知 / 他 format 由来の block 構文 preserve)。
 *
 * **ChatGPT review(2026-05-13)推奨**:`\begin{tikzpicture}...\end{tikzpicture}`
 * / Word floating anchors / docx comments 等を **lossless preserve**。
 * Pandoc が raw block を持っているのと同じ思想。drop すると lossless 性が死ぬ。
 */
export interface AstOpaqueBlock extends AstNodeBase {
  kind: 'opaque-block';
  /** 由来 format(`'latex'` / `'html'` / `'docx'` / `'unknown'` 等)。 */
  sourceFormat: string;
  /** Raw source text(再構築のため reconstructable な原文)。 */
  original: string;
}

/** Block union。 */
export type AstBlock =
  | AstHeading
  | AstParagraph
  | AstQuote
  | AstList
  | AstTable
  | AstCodeBlock
  | AstCodeRender
  | AstBreak
  | AstFigure
  | AstSection
  | AstIfBlock
  | AstCommentBlock
  | AstBlank
  | AstMathBlock
  | AstDefinitionList
  | AstOpaqueBlock;

// ── Document root ───────────────────────────────────────

/** Document root。frontmatter から抽出した globals + body の AST tree。 */
export interface AstDocument {
  kind: 'document';
  /**
   * AST schema version。**ChatGPT review(2026-05-13)推奨**:
   * 「serialized AST 保存 / postMessage / remote AI / cache / DB persistence
   * が始まると、AST schema migration が絶対発生する。document payload に
   * astVersion を埋め込んだ方がいい」。
   *
   * - `'2.0'`(2026-05-13、PR-2JJ v2 final):footnote / definition-list /
   *   opaque inline/block / 真 AstVar(parse 時非展開)導入版
   * - 旧 version は migration adapter で `'2.0'` に lift する
   *
   * 未指定 → `'2.0'` 同等(parser が default で書き込み)。
   */
  astVersion?: '2.0';
  /** frontmatter から抽出した globals(writing / direction / align)。 */
  writing?: 'horizontal' | 'vertical';
  direction?: 'ltr' | 'rtl';
  align?: 'left' | 'right' | 'center' | 'top' | 'bottom';
  /**
   * frontmatter `layout: a4-2col` 等の document layout 指定。
   *
   * PR-W11(2026-05-16):従来 HTML render(center pane + Viewer popup)では
   * PR-2N で支援していたが、docx / pptx export では ignore されていた user
   * 報告 fix。`a4-2col` 等を export 側でも読んで columns 構成に反映する。
   * Valid 値:`a4-1col` / `a4-2col` / `a4-3col` / `b5-1col` / `b5-2col` /
   * `letter-1col` / `letter-2col` / `legal-1col` / `legal-2col`。
   */
  layout?: string;
  /** frontmatter `notation: pkc-markdown-1.0` 等の profile。 */
  notation?: string;
  /** frontmatter vars(本文 `{{vars.x}}` で展開)。**ChatGPT review 推奨**で
   *  parse 時には展開せず、render 時に AstVar から resolve。これにより
   *  source provenance / reverse 可換 / late binding / template 化が可能。 */
  vars?: Readonly<Record<string, string>>;
  /** body の block 列。 */
  children: readonly AstBlock[];
  /** body 末尾の footnote 定義(`[^id]: 本文` form)。 */
  footnotes?: Readonly<Record<string, readonly AstBlock[]>>;
  /** parser が emit した structured warning(`PkcWarning`)。 */
  warnings?: readonly import('../../features/notation/warnings').PkcWarning[];
}

// ── Helper / contract test placeholder ──────────────────

/**
 * AST node が正規化されているか(canonicalization spec)。
 * Phase 2 PR-2I で skeleton のみ。実装は post-reform で。
 *
 * idempotent: canonicalize(canonicalize(x)) === canonicalize(x)
 * (詳細:`docs/development/notation-redesign-2026-05/11-canonicalization-spec.md`)
 */
export function isCanonical(_node: AstNodeBase): boolean {
  // TODO: implement in post-reform Phase Z
  return true;
}
