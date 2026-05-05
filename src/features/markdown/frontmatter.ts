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
