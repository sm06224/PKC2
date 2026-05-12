/**
 * PR-2AA(2026-05-12、reform Phase 3 Block C 3/4):IR migration scaffolding。
 *
 * 設計(`docs/development/ir-migration-plan-2026-05.md` §3 PR-2AA):
 *   - `renderMarkdownViaIR(text, opts)` を新規 export(`renderMarkdown` の
 *     IR 経由版)
 *   - Tier 0 flag `markdown.use_ir`(default OFF)で opt-in
 *   - 既存 `renderMarkdown` は touch しない(regression risk 0)
 *
 * 注:本 PR は **scaffolding 段階**。IR pipeline は commonmark + GFM core
 * のみ cover(PKC 固有 figure / quote / section / hallucination 寛容 parse 等
 * は未統合)、PR-2Y2 等の follow-up で順次追加していく。**default OFF** の
 * ため user 影響なし。
 *
 * 完全 migration(`renderMarkdown` 本体を IR 経由に switch)は IR coverage
 * が renderMarkdown と byte-equivalent になった段階で行う(future wave)。
 */
import { defineFlag } from '@core/flags';
import { parseMarkdownToAst, type ParseOptions } from './parse';
import { renderAstToHtml, type RenderOptions } from './render-html';

export const useIrPipeline = defineFlag<boolean>(
  'markdown.use_ir',
  false,
  {
    category: 'markdown',
    description:
      'markdown render を IR pipeline 経由で行う(experimental、commonmark + GFM core のみ cover)。' +
      'OFF で従来 renderMarkdown を使用(production default)。',
  },
);

export interface RenderMarkdownViaIROptions extends ParseOptions, RenderOptions {}

/**
 * `parseMarkdownToAst` + `renderAstToHtml` を 1 step で実行する convenience。
 * `renderMarkdown` の IR 経由版(commonmark + GFM core のみ cover、PKC 固有
 * 機能は未統合)。
 *
 * Flag `markdown.use_ir` が ON のときに `renderMarkdown` 内部で呼ばれる想定、
 * 直接 import して使う場合は **caller 責任で coverage 範囲を確認**。
 *
 * @param text 入力 markdown
 * @param opts ParseOptions + RenderOptions
 * @returns HTML 文字列
 */
export function renderMarkdownViaIR(
  text: string,
  opts: RenderMarkdownViaIROptions = {},
): string {
  const ast = parseMarkdownToAst(text, opts);
  return renderAstToHtml(ast, opts);
}
