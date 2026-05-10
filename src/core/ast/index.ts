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

/** すべての AST node の base type。 */
export interface AstNodeBase {
  /** Discriminator。switch case / 型絞り込みに使う。 */
  kind: string;
  /** Pandoc-style attrs。formal 形の `{...}` から正規化。 */
  attrs?: AstAttrs;
  /** Source 位置(parser が stamp、renderer は無視可)。 */
  pos?: AstPosition;
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
  | AstCommentInline;

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
  | AstMathBlock;

// ── Document root ───────────────────────────────────────

/** Document root。frontmatter から抽出した globals + body の AST tree。 */
export interface AstDocument {
  kind: 'document';
  /** frontmatter から抽出した globals(writing / direction / align)。 */
  writing?: 'horizontal' | 'vertical';
  direction?: 'ltr' | 'rtl';
  align?: 'left' | 'right' | 'center' | 'top' | 'bottom';
  /** frontmatter `notation: pkc-markdown-1.0` 等の profile。 */
  notation?: string;
  /** frontmatter vars(本文 `{{vars.x}}` で展開)。 */
  vars?: Readonly<Record<string, string>>;
  /** body の block 列。 */
  children: readonly AstBlock[];
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
