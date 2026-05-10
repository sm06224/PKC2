/**
 * frontmatter から document globals(writing / align / direction)を抽出する
 * helper(reform-2026-05、Phase 2 PR-2A)。
 *
 * 仕様:`docs/development/notation-redesign-2026-05/02-frontmatter-and-globals.md` §2.3
 *
 * 各 key の意味:
 *   - writing:`horizontal | vertical`(default `horizontal`)
 *     CSS `writing-mode` を指定。vertical は `vertical-rl`(伝統的縦書き)を
 *     default、direction で `ltr` 指定すれば `vertical-lr`(蒙古文等)。
 *
 *   - direction:`ltr | rtl`(default `ltr`)
 *     CSS `direction` を指定。`rtl` は Arabic / Hebrew、横書き時に default
 *     align を right に shift。縦書き時は writing-mode と組み合わせ。
 *
 *   - align:`left | right | center | top | bottom`(default は writing による)
 *     文書全体の default text-align。writing と orthogonal:
 *       horizontal:left / right / center が valid
 *       vertical:top / bottom / center が valid
 *     不正組み合わせ(horizontal で top 指定等)は warning + default 復帰。
 *
 * 設計判断:
 *   - 全 key 省略可、defaultは inclusive horizontal LTR(西洋現代用法)
 *   - 直交概念は別 key で表現(CSS 同型、AI 生成 partial override 容易)
 *   - 不正値 / 不正組み合わせは silent skip + 構造化 warning(silent fail 回避)
 */

import { parseFrontmatter } from './frontmatter';

export type Writing = 'horizontal' | 'vertical';
export type Direction = 'ltr' | 'rtl';
export type Align = 'left' | 'right' | 'center' | 'top' | 'bottom';

export interface DocumentGlobals {
  /** writing-mode 指定。指定なし時 undefined(default の horizontal を意味する)。 */
  writing?: Writing;
  /** direction 指定。指定なし時 undefined(default の ltr を意味する)。 */
  direction?: Direction;
  /** text-align 指定。指定なし時 undefined(writing から導出される)。 */
  align?: Align;
  /** 不正値 / 不正組み合わせ検出時の構造化 warning(silent fail 回避)。 */
  warnings: GlobalWarning[];
}

export interface GlobalWarning {
  kind: 'invalid_value' | 'invalid_combo';
  key: string;
  detail: string;
}

const VALID_WRITING: ReadonlySet<Writing> = new Set(['horizontal', 'vertical'] as const);
const VALID_DIRECTION: ReadonlySet<Direction> = new Set(['ltr', 'rtl'] as const);
const VALID_ALIGN: ReadonlySet<Align> = new Set(['left', 'right', 'center', 'top', 'bottom'] as const);

const HORIZONTAL_ALIGNS: ReadonlySet<Align> = new Set(['left', 'right', 'center'] as const);
const VERTICAL_ALIGNS: ReadonlySet<Align> = new Set(['top', 'bottom', 'center'] as const);

/**
 * frontmatter から document globals を抽出。
 *
 * 例:
 *   ---
 *   writing: vertical
 *   direction: rtl
 *   align: top
 *   ---
 *   → { writing: 'vertical', direction: 'rtl', align: 'top', warnings: [] }
 *
 *   ---
 *   writing: horizontal
 *   align: top   # ✗ 不正組み合わせ
 *   ---
 *   → { writing: 'horizontal', align: undefined, warnings: [{ kind: 'invalid_combo', key: 'align', detail: '...' }] }
 *
 * frontmatter 不在 / 全 key 省略時:全 undefined + warnings: []。
 */
export function extractDocumentGlobals(body: string): DocumentGlobals {
  const result: DocumentGlobals = { warnings: [] };
  if (!body) return result;
  const fm = parseFrontmatter(body);
  if (!fm.found) return result;

  // writing 抽出 + 検証
  const writingRaw = fm.meta['writing'];
  if (typeof writingRaw === 'string') {
    if (VALID_WRITING.has(writingRaw as Writing)) {
      result.writing = writingRaw as Writing;
    } else {
      result.warnings.push({
        kind: 'invalid_value',
        key: 'writing',
        detail: `'${writingRaw}' は writing として無効。'horizontal' or 'vertical' のみ。`,
      });
    }
  }

  // direction 抽出 + 検証
  const directionRaw = fm.meta['direction'];
  if (typeof directionRaw === 'string') {
    if (VALID_DIRECTION.has(directionRaw as Direction)) {
      result.direction = directionRaw as Direction;
    } else {
      result.warnings.push({
        kind: 'invalid_value',
        key: 'direction',
        detail: `'${directionRaw}' は direction として無効。'ltr' or 'rtl' のみ。`,
      });
    }
  }

  // align 抽出 + 検証(値妥当性 → writing との組み合わせ)
  const alignRaw = fm.meta['align'];
  if (typeof alignRaw === 'string') {
    if (!VALID_ALIGN.has(alignRaw as Align)) {
      result.warnings.push({
        kind: 'invalid_value',
        key: 'align',
        detail: `'${alignRaw}' は align として無効。'left' / 'right' / 'center' / 'top' / 'bottom' のみ。`,
      });
    } else {
      const align = alignRaw as Align;
      const writing = result.writing ?? 'horizontal';
      const validForWriting = writing === 'horizontal' ? HORIZONTAL_ALIGNS : VERTICAL_ALIGNS;
      if (!validForWriting.has(align)) {
        result.warnings.push({
          kind: 'invalid_combo',
          key: 'align',
          detail: `writing='${writing}' で align='${align}' は不正(horizontal は left/right/center、vertical は top/bottom/center のみ)。default 復帰。`,
        });
      } else {
        result.align = align;
      }
    }
  }

  return result;
}

/**
 * DocumentGlobals を `data-pkc-*` attribute の record に変換。renderer が DOM に
 * 適用するときに使う(direction は HTML `dir` attr、writing は CSS class 経由)。
 */
export function globalsToDataAttrs(globals: DocumentGlobals): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (globals.writing) attrs['data-pkc-writing'] = globals.writing;
  if (globals.direction) attrs['data-pkc-direction'] = globals.direction;
  if (globals.align) attrs['data-pkc-doc-align'] = globals.align;
  return attrs;
}
