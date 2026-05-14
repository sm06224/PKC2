/**
 * PR-2GG(2026-05-12、reform Phase 3 Block F 1/3):HTML escape の共有 helper。
 *
 * Block C(AST migration)で導入された `src/features/ast/render-html.ts` の
 * `escapeHtml` / `escapeAttr` を centralize、複数 module に散らばっていた
 * 同等 implementation を 1 ヶ所に統合する起点。
 *
 * legacy(`src/features/markdown/markdown-render.ts` 等 7 ファイル)の
 * escape は本 module 移行せず、それぞれの test 範囲で検証済の挙動を維持
 * (移行 risk 高、future wave で順次置換予定)。本 PR は **AST module 限定**
 * の dedup。
 *
 * core/ layer:browser API なし、pure 関数のみ。
 */

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * HTML text content として safe にするための escape。
 *
 * 5 文字(`&` `<` `>` `"` `'`)を entity 化、それ以外は素通し。
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/**
 * HTML attribute value として safe にするための escape。
 * 現状は `escapeHtml` と同じ実装(5 文字 entity 化)。attr / text で
 * 同じセットを覆うため、将来分岐する余地を残して別 export。
 */
export function escapeAttr(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}
