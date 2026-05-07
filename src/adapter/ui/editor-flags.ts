/**
 * Editor textarea behavior flags (PR-UUU 2026-05-07、修正指示7 #7
 * 「TAB → 半角スペース n 個(行頭限定)」).
 *
 * Tier 0 で Flags inspector / `?pkc-flag=` URL 経由で runtime 切替可能。
 */

import { defineFlag } from '../../core/flags';

const FLAG_CATEGORY = 'editor';

/**
 * 行頭で Tab を押したとき、`\t` の代わりに挿入する半角スペースの数。
 * default 2(npm/JSON 慣習)。0 で機能 off(従来通り `\t` 挿入)。
 *
 * 行頭以外の Tab は常に `\t` のまま(タブ揃え用法を尊重)。markdown
 * 互換 textarea の list-slot indent は editor-key-helpers の
 * `INDENT_UNIT = "  "` で別系統(常に 2 spaces)。
 */
export const editorTabIndentSpaces = defineFlag<number>(
  'editor.tab_indent_spaces',
  2,
  {
    range: [0, 8],
    category: FLAG_CATEGORY,
    description: '行頭 Tab を半角スペース n 個に展開(0=off で従来 \\t、行頭以外は常に \\t)',
    tier: 0,
  },
);
