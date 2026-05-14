/**
 * PR-2GG(2026-05-12、reform Phase 3 Block F):AST 公開 API。
 *
 * user direction(2026-05-12):「AST の実装が着弾したら、AST の取得を可能に
 * して他の AI にも使ってみたい」。
 *
 * Block C で着地した IR(`AstDocument`)を **window.PKC** namespace から
 * 公開、他の AI(DevTools console / iframe / postMessage の caller)が
 * markdown text を AST に変換して読める経路を確立。
 *
 * 公開 surface(window.PKC.ast):
 *   - `parseMarkdown(text, opts?)` → AstDocument
 *   - `renderHtml(ast, opts?)` → HTML 文字列
 *   - `canonicalize(ast)` → 正規化済 AstDocument
 *   - `toPandocJson(ast)` → Pandoc Native JSON
 *
 * Layer:adapter で window 経由の expose を担当(features は browser API 不可)。
 */
import { parseMarkdownToAst, type ParseOptions } from '@features/ast/parse';
import { renderAstToHtml, type RenderOptions } from '@features/ast/render-html';
import { canonicalize } from '@features/ast/canonicalize';
import { astToPandocNative } from '@features/ast/export-pandoc';
import {
  renderAstToMarkdown,
  type RenderMarkdownOptions,
} from '@features/ast/render-markdown';
import { semanticHash } from '@features/ast/semantic-hash';
import { parseHtmlToAst } from '@features/ast/parse-html';
import type { AstDocument } from '@core/ast/index';

export interface PkcAstApi {
  /** markdown text → AstDocument。 */
  parseMarkdown(text: string, opts?: ParseOptions): AstDocument;
  /** AstDocument → HTML 文字列。 */
  renderHtml(ast: AstDocument, opts?: RenderOptions): string;
  /** AstDocument → 正規化済 AstDocument(idempotent)。 */
  canonicalize(ast: AstDocument): AstDocument;
  /** AstDocument → Pandoc Native JSON(pandoc --from json で消費可能)。 */
  toPandocJson(ast: AstDocument): unknown;
  /** AstDocument → Markdown 文字列(GFM 標準 / 正規 PKC MD)。 */
  renderMarkdown(ast: AstDocument, opts?: RenderMarkdownOptions): string;
  /** 1 step convenience:markdown text → Pandoc JSON。 */
  markdownToPandoc(text: string, opts?: ParseOptions): unknown;
  /**
   * AstDocument → semantic hash 文字列。`semanticHash(A) === semanticHash(B)`
   * のとき A と B は **意味的同一**。round-trip stability の根拠 test に使う。
   *
   * ChatGPT review(2026-05-13)推奨で v1.2.0 で公開。
   */
  semanticHash(ast: AstDocument): string;
  /**
   * HTML 文字列 → AstDocument の **reverse parser**(PR-V7、v1.3.0 で公開)。
   *
   * commonmark + GFM core + PKC HTML output 表現をそのまま AST に戻す。
   * 未知 tag は `AstOpaqueInline` / `AstOpaqueBlock` として lossless preserve。
   * `parseHtml(renderHtml(ast)) === ast`(semantic 等価、`semanticHash` で
   * 数値証明)を満たす。
   */
  parseHtml(html: string): AstDocument;
  /** API version(将来の breaking change 検出用)。 */
  readonly version: string;
}

const API: PkcAstApi = {
  parseMarkdown: (text, opts) => parseMarkdownToAst(text, opts),
  renderHtml: (ast, opts) => renderAstToHtml(ast, opts),
  canonicalize: (ast) => canonicalize(ast),
  toPandocJson: (ast) => astToPandocNative(ast),
  renderMarkdown: (ast, opts) => renderAstToMarkdown(ast, opts),
  markdownToPandoc: (text, opts) =>
    astToPandocNative(parseMarkdownToAst(text, opts)),
  semanticHash: (ast) => semanticHash(ast),
  parseHtml: (html) => parseHtmlToAst(html),
  version: '1.3.0',
};

/**
 * `window.PKC.ast` namespace に AST API を設置する。
 *
 * main.ts の boot path で 1 回だけ呼ばれる。複数 boot で上書きしないよう
 * idempotent(`window.PKC` が無ければ作成、`ast` が無ければ設置)。
 */
export function exposeAstApi(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    PKC?: { ast?: PkcAstApi };
  };
  if (!w.PKC) {
    w.PKC = {};
  }
  if (!w.PKC.ast) {
    w.PKC.ast = API;
  }
}

/** Test 用に API object を直接 export。 */
export function getAstApi(): PkcAstApi {
  return API;
}
