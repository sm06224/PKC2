/**
 * frontmatter `notation` field から PKC Markdown profile を抽出する helper
 * (reform-2026-05、Phase 1 PR-B)。
 *
 * 普通 user は frontmatter を触らないため、`notation` 省略時は
 * `DEFAULT_PROFILE`(`pkc-markdown-1.0`)に fallback。明示指定があれば
 * そちらを使う。未知 profile name は `resolveProfile` 側で warning + default
 * fallback される(silent fail 回避)。
 *
 * 設計詳細:`docs/development/notation-redesign-2026-05/02-frontmatter-and-globals.md` §2.2。
 *
 *   user input(frontmatter)
 *      ↓
 *   parseFrontmatter → meta.notation: string | undefined
 *      ↓
 *   extractNotationProfile → profile name (string)
 *      ↓
 *   runtime/notation-profiles.ts:resolveProfile(name) → NotationFeatures
 */

import { parseFrontmatter } from './frontmatter';
import { DEFAULT_PROFILE, type NotationProfileName } from '../notation/profiles';

/**
 * frontmatter から `notation` field を抽出。string でなければ default。
 *
 * 例:
 *   `---\nnotation: pkc-markdown-1.0\n---` → 'pkc-markdown-1.0'
 *   `---\nnotation: gfm\n---`              → 'gfm'
 *   `---\ntitle: Foo\n---`                  → DEFAULT_PROFILE
 *   ``(frontmatter なし)                  → DEFAULT_PROFILE
 *   `---\nnotation: 12345\n---`            → DEFAULT_PROFILE(non-string fallback)
 */
export function extractNotationProfile(body: string): NotationProfileName {
  if (!body) return DEFAULT_PROFILE;
  const result = parseFrontmatter(body);
  if (!result.found) return DEFAULT_PROFILE;
  const notation = result.meta['notation'];
  if (typeof notation !== 'string' || notation.length === 0) {
    return DEFAULT_PROFILE;
  }
  // 注:`resolveProfile` 側で未知 name は default に fallback + console.warn する。
  // 本 extractor は raw string を返し、profile resolution は caller responsibility。
  return notation as NotationProfileName;
}

/**
 * frontmatter から `notation_overrides.<key>` flat dot-notation 形式を抽出。
 * 例:`notation_overrides.ruby: false` → `{ ruby: false }`
 *
 * 注:nested object 形式 `notation_overrides:\n  ruby: false` の parse は
 * 本 PR の現 parser では未対応(現 parser は flat のみ)、後続 PR で nested
 * mapping support 着地時に同 helper を拡張する。flat dot-notation は YAML 平
 * parse の延長で受理可能なので本 PR で sufficient。
 */
export function extractNotationOverridesFlat(body: string): Record<string, boolean | string> {
  const out: Record<string, boolean | string> = {};
  if (!body) return out;
  const result = parseFrontmatter(body);
  if (!result.found) return out;

  const prefix = 'notation_overrides.';
  for (const [key, value] of Object.entries(result.meta)) {
    if (!key.startsWith(prefix)) continue;
    const subKey = key.slice(prefix.length);
    if (!/^[A-Za-z_][\w-]*$/.test(subKey)) continue;
    if (typeof value === 'boolean') {
      out[subKey] = value;
    } else if (typeof value === 'string') {
      out[subKey] = value;
    }
    // number / null / array は notation override の値として意味を成さないため skip
  }
  return out;
}
