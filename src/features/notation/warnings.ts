/**
 * PKC notation warning code 体系(reform-2026-05 Phase 2 PR-2I、ChatGPT 提案 #4 受容)。
 *
 * 既存 `FrontmatterWarning` の string kind(`size_limit` 等)から、structured
 * `PKC<NNNN>` code 体系へ移行。AI repair / debug overlay / report dump で
 * code-based 対応が可能になる。
 *
 * code 体系:
 *
 *   PKC1xxx  parser warnings(syntax 不正、未定義 marker 等)
 *   PKC2xxx  semantic warnings(deprecated notation、ambiguous 等)
 *   PKC3xxx  renderer warnings(degradation、cap 適用等)
 *   PKC4xxx  export warnings(format 変換時 lossy 等、未来用)
 *   PKC5xxx  security warnings(XSS skip、unsafe attr drop 等)
 *
 * 関連:
 *   - `docs/development/notation-redesign-2026-05/07-security-stance.md` § warning taxonomy
 *   - frontmatter `FrontmatterWarning` も本 code に移行
 */

/** PKC warning category prefix(category 別の番号空間)。 */
export type WarningCategory = 'parser' | 'semantic' | 'renderer' | 'export' | 'security';

export const WARNING_CODES = {
  // ── PKC1xxx parser ──────────────────────────────
  PARSER_FRONTMATTER_SIZE_LIMIT: { code: 'PKC1001', category: 'parser' as WarningCategory },
  PARSER_FRONTMATTER_MALFORMED:   { code: 'PKC1002', category: 'parser' as WarningCategory },
  PARSER_FRONTMATTER_FORBIDDEN_KEY: { code: 'PKC1003', category: 'parser' as WarningCategory },
  PARSER_FRONTMATTER_DUPLICATE_KEY: { code: 'PKC1004', category: 'parser' as WarningCategory },
  PARSER_GLOBAL_INVALID_VALUE:    { code: 'PKC1005', category: 'parser' as WarningCategory },
  PARSER_GLOBAL_INVALID_COMBO:    { code: 'PKC1006', category: 'parser' as WarningCategory },
  PARSER_DIRECTIVE_UNCLOSED:      { code: 'PKC1007', category: 'parser' as WarningCategory },
  PARSER_DIRECTIVE_MALFORMED_ATTRS: { code: 'PKC1008', category: 'parser' as WarningCategory },
  // ── PKC2xxx semantic ─────────────────────────────
  SEMANTIC_DEPRECATED_NOTATION:   { code: 'PKC2001', category: 'semantic' as WarningCategory },
  SEMANTIC_PROFILE_UNKNOWN:       { code: 'PKC2002', category: 'semantic' as WarningCategory },
  SEMANTIC_VAR_UNDEFINED:         { code: 'PKC2003', category: 'semantic' as WarningCategory },
  SEMANTIC_REF_UNKNOWN_TARGET:    { code: 'PKC2004', category: 'semantic' as WarningCategory },
  // ── PKC3xxx renderer ─────────────────────────────
  RENDERER_BLANK_LINE_CAPPED:     { code: 'PKC3001', category: 'renderer' as WarningCategory },
  RENDERER_LIST_DEPTH_CAPPED:     { code: 'PKC3002', category: 'renderer' as WarningCategory },
  RENDERER_TABLE_SIZE_CAPPED:     { code: 'PKC3003', category: 'renderer' as WarningCategory },
  RENDERER_INLINE_NEST_CAPPED:    { code: 'PKC3004', category: 'renderer' as WarningCategory },
  RENDERER_CODE_FENCE_CAPPED:     { code: 'PKC3005', category: 'renderer' as WarningCategory },
  // ── PKC4xxx export(future)────────────────────────
  EXPORT_FORMAT_DEGRADATION:      { code: 'PKC4001', category: 'export' as WarningCategory },
  EXPORT_LOSSY_CONVERSION:        { code: 'PKC4002', category: 'export' as WarningCategory },
  // ── PKC5xxx security ─────────────────────────────
  SECURITY_HTML_PASSTHROUGH_OFF:  { code: 'PKC5001', category: 'security' as WarningCategory },
  SECURITY_UNSAFE_ATTR_DROPPED:   { code: 'PKC5002', category: 'security' as WarningCategory },
  SECURITY_URL_SCHEME_REJECTED:   { code: 'PKC5003', category: 'security' as WarningCategory },
} as const;

export type WarningCodeId = keyof typeof WARNING_CODES;

/** PKC warning(structured)。AI repair tool が code で対応可能。 */
export interface PkcWarning {
  /** PKCxxxx 形式の code。 */
  code: string;
  /** category(parser / semantic / renderer / export / security)。 */
  category: WarningCategory;
  /** 詳細な人間可読メッセージ。 */
  detail: string;
  /** 該当 source 位置(line / column)。任意。 */
  loc?: { line?: number; column?: number };
  /** 関連 markup 名 / id 等の context。任意。 */
  context?: Record<string, string | number | boolean>;
}

/** Helper:WARNING_CODES から code + category を取り、detail / loc / context を埋めて PkcWarning 作成。 */
export function makeWarning(
  id: WarningCodeId,
  detail: string,
  extras?: { loc?: PkcWarning['loc']; context?: PkcWarning['context'] },
): PkcWarning {
  const def = WARNING_CODES[id];
  return {
    code: def.code,
    category: def.category,
    detail,
    ...(extras?.loc ? { loc: extras.loc } : {}),
    ...(extras?.context ? { context: extras.context } : {}),
  };
}

/** Code から WarningCodeId を逆引き(debug overlay 用)。 */
export function findWarningCodeId(code: string): WarningCodeId | undefined {
  for (const [id, def] of Object.entries(WARNING_CODES)) {
    if (def.code === code) return id as WarningCodeId;
  }
  return undefined;
}
