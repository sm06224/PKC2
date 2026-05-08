/**
 * YAML mini frontmatter parser (領域 10-6 ζ'' Phase 2a).
 *
 * Pure TypeScript, dep-zero. Supports the subset that book / youtube /
 * album / paper / film entries actually need:
 *
 *   - Document fence: `---\n…\n---\n` at byte 0 of body
 *   - Flat key:value pairs, one per line
 *   - Values inferred as `string | number | boolean | null` plus
 *     scalar arrays (`[a, b, c]` / next-line `- a` block)
 *   - Quoted strings (single, double) keep their literal content
 *
 * Out of scope (returns the body untouched if encountered):
 *   - Nested mappings (key with `:\n  child:` indented children)
 *   - Anchors / aliases / merge keys
 *   - Complex multiline scalars (`|`, `>`)
 *   - Type tags (`!!str`)
 *
 * Spec: docs/development/filer-view-and-folder-display-profile-audit-2026-05.md §2.4
 */

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export interface FrontmatterResult {
  /** Parsed key/value pairs. Empty object when no frontmatter detected. */
  meta: Record<string, FrontmatterValue>;
  /** Original body with the fenced frontmatter removed (if any). */
  body: string;
  /**
   * `true` when an opening `---` was found AND a matching closing `---`
   * was also found. `false` keeps `body` identical to the input.
   */
  found: boolean;
}

const OPEN_FENCE = /^---\s*\r?\n/;
const CLOSE_FENCE_LINE = /^---\s*$/;

/**
 * Split a body into its frontmatter block and the markdown remainder.
 * Always returns a defined result; on parse failure the meta is empty
 * and body is the original input.
 */
export function parseFrontmatter(body: string): FrontmatterResult {
  if (!body || !OPEN_FENCE.test(body)) {
    return { meta: {}, body, found: false };
  }
  // Strip the opening `---\n`.
  const afterOpen = body.replace(OPEN_FENCE, '');
  const lines = afterOpen.split(/\r?\n/);
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CLOSE_FENCE_LINE.test(lines[i] ?? '')) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { meta: {}, body, found: false };
  }

  const yamlLines = lines.slice(0, closeIdx);
  const meta = parseFlatYaml(yamlLines);
  const remainder = lines.slice(closeIdx + 1).join('\n');
  return { meta, body: remainder.startsWith('\n') ? remainder.slice(1) : remainder, found: true };
}

function parseFlatYaml(lines: readonly string[]): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {};
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    i += 1;
    const line = raw.replace(/\s+#.*$/u, '').trimEnd(); // strip trailing # comment
    if (line.trim() === '') continue;
    if (line.startsWith('#')) continue;

    const colon = findKeyColon(line);
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    if (!key || !/^[A-Za-z_][\w.-]*$/.test(key)) continue;
    const valuePart = line.slice(colon + 1).trim();

    if (valuePart === '') {
      // Could be a block-style array on subsequent indented lines.
      const arr: Array<string | number | boolean | null> = [];
      while (i < lines.length) {
        const next = lines[i] ?? '';
        const m = /^\s*-\s+(.*)$/u.exec(next);
        if (!m) break;
        arr.push(parseScalar(m[1]!.trim()));
        i += 1;
      }
      out[key] = arr;
      continue;
    }

    if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
      out[key] = parseInlineArray(valuePart.slice(1, -1));
      continue;
    }

    out[key] = parseScalar(valuePart);
  }
  return out;
}

function findKeyColon(line: string): number {
  // Find the first `:` outside quotes.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && (inSingle || inDouble)) {
      i += 1;
      continue;
    }
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === ':') return i;
  }
  return -1;
}

function parseInlineArray(inner: string): Array<string | number | boolean | null> {
  if (inner.trim() === '') return [];
  // Naive split on commas outside quotes; sufficient for scalars.
  const parts: string[] = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && (inSingle || inDouble)) {
      buf += ch + (inner[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;
    if (ch === ',' && !inSingle && !inDouble) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((p) => parseScalar(p.trim()));
}

function parseScalar(raw: string): string | number | boolean | null {
  if (raw === '' || raw === '~' || raw === 'null' || raw === 'Null' || raw === 'NULL') return null;
  if (raw === 'true' || raw === 'True' || raw === 'TRUE') return true;
  if (raw === 'false' || raw === 'False' || raw === 'FALSE') return false;

  // Quoted string — strip quotes, handle a couple of escapes.
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (first === '"' && last === '"') {
      return raw.slice(1, -1).replace(/\\(["\\nt])/gu, (_m, ch: string) =>
        ch === 'n' ? '\n' : ch === 't' ? '\t' : ch,
      );
    }
    if (first === "'" && last === "'") {
      return raw.slice(1, -1).replace(/''/gu, "'");
    }
  }

  // Numeric? Use JSON.parse for strict number validation.
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }

  // Date-like (YYYY-MM-DD, ISO timestamp) — keep as string. Useful for
  // `read_at: 2024-03-15` etc. without converting to a Date object.
  return raw;
}

/**
 * Public helper: returns the `kind` discriminator if present and valid.
 * Filer subset profiles look this up to decide which entries belong
 * to the `book-base` / `youtube-base` / etc. query.
 */
export function getFrontmatterKind(body: string): string | null {
  const { meta, found } = parseFrontmatter(body);
  if (!found) return null;
  const kind = meta['kind'];
  return typeof kind === 'string' && kind.length > 0 ? kind : null;
}

/**
 * L-? M-7(2026-05-08、wave-10-2 Phase 2):frontmatter から `vars.*` を
 * 抽出して flat `Record<string, string>` に正規化する helper。本文の
 * `{{vars.name}}` 展開で使う(`renderMarkdown(text, { vars })` 経由)。
 *
 * 受理する 2 形式:
 *
 *   1. ネスト object 形式(spec §3.6 例):
 *        vars:
 *          project: ALPHA-7
 *          client: Acme Corp
 *
 *   2. flat dot-notation 形式(YAML 平 parse の延長):
 *        vars.project: ALPHA-7
 *        vars.client: Acme Corp
 *
 * 両形式を併用しても OK(後者が優先される、上書き)。
 *
 * 既存 `parseFrontmatter` は flat 1 階のみ対応で nested object を
 * 解釈しないため、本 helper は raw frontmatter 領域を独自に scan する。
 *
 * 値は string 化して返す(boolean / number は `String()`、null は除外)。
 *
 * frontmatter 不在 / vars 不在 / parse 失敗 → `{}` を返す(safe default)。
 */
export function extractVars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!body || !OPEN_FENCE.test(body)) return out;
  const afterOpen = body.replace(OPEN_FENCE, '');
  const lines = afterOpen.split(/\r?\n/);
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CLOSE_FENCE_LINE.test(lines[i] ?? '')) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return out;
  const frontLines = lines.slice(0, closeIdx);

  // 1. nested object 形式:`vars:` 単独行 + 後続の indented `<key>: <value>` 群
  for (let i = 0; i < frontLines.length; i++) {
    const line = frontLines[i] ?? '';
    if (!/^vars\s*:\s*$/.test(line)) continue;
    // 子行を読み込む。1 文字以上のインデント(SP / TAB)+ key: value 形式。
    let j = i + 1;
    while (j < frontLines.length) {
      const child = frontLines[j] ?? '';
      // 空行は break(ネストブロック終了)
      if (child.trim() === '') break;
      const m = /^(\s+)([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(child);
      if (!m) break;  // 非インデント or 不正形式 = nested 終了
      const key = m[2]!;
      const rawVal = m[3]!.trim();
      out[key] = parseVarValue(rawVal);
      j++;
    }
    break;  // vars: ブロックは 1 回だけ
  }

  // 2. flat dot-notation 形式:`vars.X: value`
  for (const line of frontLines) {
    const m = /^vars\.([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const rawVal = m[2]!.trim();
    out[key] = parseVarValue(rawVal);
  }

  return out;
}

/** quoted string / scalar を string 化して返す。null は空文字。 */
function parseVarValue(raw: string): string {
  if (raw === '' || raw === '~' || /^null$/i.test(raw)) return '';
  if (raw.length >= 2) {
    const f = raw[0];
    const l = raw[raw.length - 1];
    if (f === '"' && l === '"') {
      return raw.slice(1, -1).replace(/\\(["\\nt])/gu, (_m, ch: string) =>
        ch === 'n' ? '\n' : ch === 't' ? '\t' : ch,
      );
    }
    if (f === "'" && l === "'") return raw.slice(1, -1).replace(/''/gu, "'");
  }
  // trailing # comment を strip(YAML 慣例)
  return raw.replace(/\s+#.*$/u, '').trim();
}
