/**
 * User template flag (PR-BBB, 2026-05-06).
 *
 * User 修正指示4:「自前で手入力するためのテンプレが必要。「/」コ
 * マンドにテンプレ挿入のコマンドを追加し、テンプレを用意「/tmpXX」
 * とし、XXは半角英数２文字、Flagsからjson形式で編集可能とする」
 *
 * Stores user templates in a single Tier 1 string flag whose value is
 * a JSON object: `{ "ab": "template body...", "cd": "another..." }`.
 * The key MUST be exactly 2 alphanumeric characters [a-z0-9] —
 * anything else is silently dropped at parse time.
 *
 * Slash menu picks these up dynamically and surfaces them as `/tmpAB`
 * commands. Insertion replaces `/tmpAB` with the template body.
 */

import { defineFlag } from '../../core/flags';

const FLAG_CATEGORY = 'templates';

const DEFAULT_TEMPLATES_JSON = JSON.stringify(
  {
    // Built-in starter set so the feature is discoverable on first run.
    // User can override / add more via the Flags inspector.
    mt: '## メモ\n\n- [ ] \n',
    rt: '## 振り返り\n\n良かったこと:\n\n改善点:\n',
  },
  null,
  2,
);

/**
 * Tier 1 flag — user-mutable JSON map of `{ XX: "body" }`. Inspector
 * surfaces it as a single multi-line string (JSON), validation happens
 * at parse time(下の `parseUserTemplates`)。
 */
export const userTemplatesJson = defineFlag<string>(
  'templates.entries',
  DEFAULT_TEMPLATES_JSON,
  {
    category: FLAG_CATEGORY,
    description:
      'スラッシュコマンド `/tmpXX` のテンプレ集。JSON 形式 `{"ab":"template body","cd":"..."}`。XX は半角英数 2 文字。',
    tier: 1,
  },
);

export interface UserTemplate {
  /** 2-char alphanumeric id (lowercased). Used to assemble the slash command id (`tmp${key}`). */
  readonly key: string;
  /** Template body to insert verbatim (verbatim — no further interpolation in v1). */
  readonly body: string;
}

const KEY_RE = /^[a-z0-9]{2}$/;

/**
 * Parse the templates JSON into a structured array. Invalid keys / non-
 * string bodies / non-JSON input are silently dropped — the flag
 * inspector accepts free-form strings, so we never throw at the user.
 */
export function parseUserTemplates(json: string): UserTemplate[] {
  if (!json || typeof json !== 'string') return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: UserTemplate[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (!KEY_RE.test(key)) continue;
    if (typeof v !== 'string') continue;
    out.push({ key, body: v });
  }
  // Stable order: alphabetic by key.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/**
 * Convenience: read the live flag value and parse. Used by the slash
 * menu opener.
 */
export function getActiveUserTemplates(): UserTemplate[] {
  return parseUserTemplates(userTemplatesJson());
}
