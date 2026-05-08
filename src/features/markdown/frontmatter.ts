/**
 * YAML frontmatter parser(2026-05-08 reform — natural YAML extension wave)。
 *
 * Pure TypeScript, dep-zero。「自然な YAML 記法」が user 期待値なので、
 * 標準 YAML の典型パターンを通せるよう拡張:
 *
 *   - Document fence: `---\n…\n---\n`(body 先頭のみ)
 *   - Flat key:value(1 行 1 ペア)
 *   - **Nested mapping**(`key:\n  child: …`、深度 ≤ 4)
 *   - Inline 配列 `[a, b, c]` + ブロック配列 `- a\n- b`
 *   - **Block scalar `|`(literal)/ `>`(folded)** — 改行を保持 / fold
 *   - Quoted string(single / double)+ escape(`\n` / `\t` / `\"` / `\\`)
 *   - **Quoted-aware comment strip**(`title: "a # b"` の `#` は comment 扱いしない)
 *   - 全行 comment(行頭 `#`)/ 行末 comment(値後の ` # …`)
 *
 * 防御層(silent fail を避けて可視 warning):
 *
 *   - 全 frontmatter サイズ ≤ 16 KB
 *   - 全 key 数(全階層合計)≤ 100
 *   - 階層深度 ≤ 4
 *   - 単一配列の長さ ≤ 500
 *   - 単一 string 値のサイズ ≤ 4 KB
 *   - 禁止 key:`__proto__` / `constructor` / `prototype`(prototype pollution 防御)
 *
 * limit 超過 / parse 失敗 / forbidden key 等は `result.warnings` に記録、
 * caller(presenter / renderer)が `<div class="pkc-frontmatter-warning">`
 * として preview 先頭に表示する。silent fail はしない(silent fail だと
 * user は frontmatter が無視されたことに気づけない)。
 *
 * Out of scope(YAML 標準だが PKC2 では未対応):
 *   - Anchors / aliases(`&anchor` / `*anchor`)
 *   - Merge keys(`<<:`)
 *   - Type tags(`!!str` / `!!int`)
 *   - Explicit indent indicator(`|2` / `|3`)+ chomping(`|-` / `|+`)
 *
 * Spec: docs/development/filer-view-and-folder-display-profile-audit-2026-05.md §2.4
 */

// ── Types ──────────────────────────────────────────────

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };

export interface FrontmatterWarning {
  /** 警告の分類。CSS / display 振り分け用。 */
  kind:
    | 'size_limit'
    | 'key_count_limit'
    | 'depth_limit'
    | 'array_limit'
    | 'value_size_limit'
    | 'forbidden_key'
    | 'malformed'
    | 'duplicate_key';
  /** 1-based line number in the frontmatter block(approximate)。 */
  line?: number;
  /** Human-readable Japanese reason(可視 warning に流す)。 */
  detail: string;
}

export interface FrontmatterResult {
  /** Parsed key/value pairs。空 object は no frontmatter / parse 失敗時。 */
  meta: Record<string, FrontmatterValue>;
  /** Original body(frontmatter 削除済み、found=false なら入力そのまま)。 */
  body: string;
  /** opening + closing `---` の両方が見つかったか。 */
  found: boolean;
  /** soft warnings(空配列 = clean parse)。 */
  warnings: FrontmatterWarning[];
}

// ── Limits ─────────────────────────────────────────────

export const FRONTMATTER_LIMITS = {
  totalBytes: 16 * 1024,
  totalKeys: 100,
  maxDepth: 4,
  maxArrayItems: 500,
  maxStringValueBytes: 4 * 1024,
} as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ── Fence detection ────────────────────────────────────

const OPEN_FENCE = /^---\s*\r?\n/;
const CLOSE_FENCE_LINE = /^---\s*$/;

// ── Public API ─────────────────────────────────────────

/**
 * Split a body into its frontmatter block and the markdown remainder.
 * Always returns a defined result; on parse failure the meta is empty
 * and body is the original input。warnings 配列に soft 警告を貯める。
 */
export function parseFrontmatter(body: string): FrontmatterResult {
  const warnings: FrontmatterWarning[] = [];
  const emptyMeta: Record<string, FrontmatterValue> = {};
  if (!body || !OPEN_FENCE.test(body)) {
    return { meta: emptyMeta, body, found: false, warnings };
  }
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
    return { meta: emptyMeta, body, found: false, warnings };
  }

  const frontLines = lines.slice(0, closeIdx);

  // size cap(approximate, byte length 計測)
  const fmText = frontLines.join('\n');
  const fmBytes = byteLength(fmText);
  if (fmBytes > FRONTMATTER_LIMITS.totalBytes) {
    warnings.push({
      kind: 'size_limit',
      detail: `frontmatter サイズが ${FRONTMATTER_LIMITS.totalBytes} bytes を超過(${fmBytes} bytes)、parse 中断`,
    });
    const remainder = lines.slice(closeIdx + 1).join('\n');
    return {
      meta: emptyMeta,
      body: remainder.startsWith('\n') ? remainder.slice(1) : remainder,
      found: true,
      warnings,
    };
  }

  const ctx: ParseContext = { warnings, keyCount: 0 };
  const state: ParseState = { lines: frontLines, index: 0, ctx };
  const meta = parseMapping(state, -1, 1);

  const remainder = lines.slice(closeIdx + 1).join('\n');
  return {
    meta,
    body: remainder.startsWith('\n') ? remainder.slice(1) : remainder,
    found: true,
    warnings,
  };
}

/**
 * Public helper: returns the `kind` discriminator if present and valid.
 */
export function getFrontmatterKind(body: string): string | null {
  const { meta, found } = parseFrontmatter(body);
  if (!found) return null;
  const kind = meta['kind'];
  return typeof kind === 'string' && kind.length > 0 ? kind : null;
}

/**
 * Extract `vars.*` を `Record<string, string>` に正規化。本文 `{{vars.x}}`
 * 展開で使う(`renderMarkdown(text, { vars })` 経由)。
 *
 * 受理する 2 形式(本 reform 後は parseFrontmatter の nested mapping 経由):
 *   1. nested:`vars:\n  project: ALPHA-7`
 *   2. flat dot-notation:`vars.project: ALPHA-7`
 * 両形式併用 OK(後者優先 = 上書き)。
 */
export function extractVars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const result = parseFrontmatter(body);
  if (!result.found) return out;

  // 1. nested:meta.vars が object なら walk
  const vars = result.meta['vars'];
  if (vars && typeof vars === 'object' && !Array.isArray(vars)) {
    for (const [k, v] of Object.entries(vars)) {
      out[k] = stringifyVarValue(v);
    }
  }

  // 2. flat dot-notation:`vars.<key>` を見つけて上書き
  for (const [k, v] of Object.entries(result.meta)) {
    if (k.startsWith('vars.')) {
      const subKey = k.slice('vars.'.length);
      if (/^[A-Za-z_][\w-]*$/.test(subKey)) {
        out[subKey] = stringifyVarValue(v);
      }
    }
  }

  return out;
}

function stringifyVarValue(v: FrontmatterValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // arrays / nested objects は JSON 化(vars には不適だが silent ではなく可視)
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

// ── Parse state ────────────────────────────────────────

interface ParseContext {
  warnings: FrontmatterWarning[];
  keyCount: number;
}

interface ParseState {
  lines: readonly string[];
  index: number;
  ctx: ParseContext;
}

// ── Mapping parser(recursive descent)────────────────

function parseMapping(
  state: ParseState,
  parentIndent: number,
  depth: number,
): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {};
  let blockIndent = -1;
  const seenKeys = new Set<string>();

  if (depth > FRONTMATTER_LIMITS.maxDepth) {
    state.ctx.warnings.push({
      kind: 'depth_limit',
      line: state.index + 1,
      detail: `階層が ${FRONTMATTER_LIMITS.maxDepth} を超えるため以降の key を無視`,
    });
    skipDeeperLines(state, parentIndent);
    return out;
  }

  while (state.index < state.lines.length) {
    const line = state.lines[state.index] ?? '';
    const trimmed = line.trim();

    // skip empty / full-line comment
    if (trimmed === '' || trimmed.startsWith('#')) {
      state.index++;
      continue;
    }

    const indent = getIndent(line);
    if (indent <= parentIndent) break;
    if (blockIndent === -1) blockIndent = indent;
    if (indent < blockIndent) break;
    if (indent > blockIndent) {
      state.ctx.warnings.push({
        kind: 'malformed',
        line: state.index + 1,
        detail: `予期しないインデント(line ${state.index + 1})`,
      });
      state.index++;
      continue;
    }

    // strip end-of-line comment(quoted string aware)
    const stripped = stripEndOfLineComment(line.slice(indent));
    const colon = findKeyColon(stripped);
    if (colon < 0) {
      state.ctx.warnings.push({
        kind: 'malformed',
        line: state.index + 1,
        detail: `key:value 形式でない line を skip`,
      });
      state.index++;
      continue;
    }

    const key = stripped.slice(0, colon).trim();
    if (!key || !/^[A-Za-z_][\w.-]*$/.test(key)) {
      state.ctx.warnings.push({
        kind: 'malformed',
        line: state.index + 1,
        detail: `無効な key 名:${key.slice(0, 50)}`,
      });
      state.index++;
      continue;
    }

    if (FORBIDDEN_KEYS.has(key)) {
      state.ctx.warnings.push({
        kind: 'forbidden_key',
        line: state.index + 1,
        detail: `禁止 key:${key}(prototype pollution 防御で reject)`,
      });
      state.index++;
      continue;
    }

    if (seenKeys.has(key)) {
      state.ctx.warnings.push({
        kind: 'duplicate_key',
        line: state.index + 1,
        detail: `重複 key:${key}(後者で上書き)`,
      });
    }
    seenKeys.add(key);

    if (state.ctx.keyCount >= FRONTMATTER_LIMITS.totalKeys) {
      state.ctx.warnings.push({
        kind: 'key_count_limit',
        line: state.index + 1,
        detail: `key 総数が ${FRONTMATTER_LIMITS.totalKeys} を超過、以降を無視`,
      });
      // skip remaining lines at this level
      while (state.index < state.lines.length) state.index++;
      break;
    }
    state.ctx.keyCount++;

    const valuePart = stripped.slice(colon + 1).trim();
    state.index++;

    // Block scalar(`|` / `>`)
    if (valuePart === '|' || valuePart === '>') {
      const folded = valuePart === '>';
      const value = readBlockScalar(state, blockIndent, folded);
      out[key] = enforceStringSize(value, state, key);
      continue;
    }

    // Empty value → either nested mapping, block array, or null
    if (valuePart === '') {
      // peek next non-empty line
      const peekIdx = peekNextContent(state);
      if (peekIdx < 0) {
        out[key] = null;
        continue;
      }
      const peekLine = state.lines[peekIdx] ?? '';
      const peekIndent = getIndent(peekLine);
      if (peekIndent <= blockIndent) {
        out[key] = null;
        continue;
      }
      const peekTrimmed = peekLine.trim();
      if (peekTrimmed.startsWith('- ') || peekTrimmed === '-') {
        out[key] = readBlockArray(state, blockIndent, depth);
      } else {
        out[key] = parseMapping(state, blockIndent, depth + 1);
      }
      continue;
    }

    // Inline array
    if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
      out[key] = parseInlineArray(valuePart.slice(1, -1), state);
      continue;
    }

    // Scalar
    const scalar = parseScalar(valuePart);
    if (typeof scalar === 'string') {
      out[key] = enforceStringSize(scalar, state, key);
    } else {
      out[key] = scalar;
    }
  }

  return out;
}

function readBlockArray(
  state: ParseState,
  parentIndent: number,
  depth: number,
): FrontmatterValue[] {
  const out: FrontmatterValue[] = [];
  let blockIndent = -1;

  while (state.index < state.lines.length) {
    const line = state.lines[state.index] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') {
      state.index++;
      continue;
    }
    if (trimmed.startsWith('#')) {
      state.index++;
      continue;
    }
    const indent = getIndent(line);
    if (indent <= parentIndent) break;
    if (blockIndent === -1) blockIndent = indent;
    if (indent < blockIndent) break;
    if (!trimmed.startsWith('-')) break;

    if (out.length >= FRONTMATTER_LIMITS.maxArrayItems) {
      state.ctx.warnings.push({
        kind: 'array_limit',
        line: state.index + 1,
        detail: `配列要素が ${FRONTMATTER_LIMITS.maxArrayItems} を超過、以降を無視`,
      });
      // skip remaining items at this indent
      while (state.index < state.lines.length) {
        const next = state.lines[state.index] ?? '';
        if (next.trim() === '' || next.trim().startsWith('-')) {
          state.index++;
        } else {
          break;
        }
      }
      break;
    }

    // strip leading `- ` (or `-` at end of line for nested block)
    const itemBody = trimmed === '-' ? '' : trimmed.slice(2).trimStart();
    state.index++;

    if (itemBody === '') {
      // Could be nested mapping / array on next indented lines
      const peek = peekNextContent(state);
      if (peek < 0 || getIndent(state.lines[peek] ?? '') <= blockIndent) {
        out.push(null);
        continue;
      }
      const peekLine = state.lines[peek] ?? '';
      const peekTrimmed = peekLine.trim();
      if (peekTrimmed.startsWith('- ') || peekTrimmed === '-') {
        out.push(readBlockArray(state, blockIndent, depth));
      } else {
        out.push(parseMapping(state, blockIndent, depth + 1));
      }
      continue;
    }

    if (itemBody === '|' || itemBody === '>') {
      out.push(readBlockScalar(state, blockIndent, itemBody === '>'));
      continue;
    }

    if (itemBody.startsWith('[') && itemBody.endsWith(']')) {
      out.push(parseInlineArray(itemBody.slice(1, -1), state));
      continue;
    }

    // inline `key: value` after `- ` → mapping with single key
    const colon = findKeyColon(itemBody);
    if (colon > 0 && depth + 1 <= FRONTMATTER_LIMITS.maxDepth) {
      // synthesise a virtual line and parse as nested mapping starting here
      // Simple approach: treat the rest of this line as `key: value` and any
      // subsequent more-indented lines belong to the same map item.
      const synthesised = parseMappingItemFromLine(state, blockIndent, depth + 1, itemBody);
      out.push(synthesised);
      continue;
    }

    out.push(parseScalar(itemBody));
  }

  return out;
}

function parseMappingItemFromLine(
  state: ParseState,
  parentIndent: number,
  depth: number,
  firstLine: string,
): Record<string, FrontmatterValue> {
  const item: Record<string, FrontmatterValue> = {};
  if (depth > FRONTMATTER_LIMITS.maxDepth) {
    state.ctx.warnings.push({
      kind: 'depth_limit',
      line: state.index,
      detail: `階層が ${FRONTMATTER_LIMITS.maxDepth} を超えるため以降の key を無視`,
    });
    return item;
  }
  const colon = findKeyColon(firstLine);
  if (colon < 0) return item;
  const key = firstLine.slice(0, colon).trim();
  const valuePart = firstLine.slice(colon + 1).trim();

  if (!FORBIDDEN_KEYS.has(key) && /^[A-Za-z_][\w.-]*$/.test(key)) {
    state.ctx.keyCount++;
    if (valuePart === '') {
      const peek = peekNextContent(state);
      if (peek < 0 || getIndent(state.lines[peek] ?? '') <= parentIndent) {
        item[key] = null;
      } else {
        const peekLine = state.lines[peek] ?? '';
        const peekTrimmed = peekLine.trim();
        if (peekTrimmed.startsWith('- ')) {
          item[key] = readBlockArray(state, parentIndent, depth);
        } else {
          item[key] = parseMapping(state, parentIndent, depth + 1);
        }
      }
    } else if (valuePart === '|' || valuePart === '>') {
      item[key] = readBlockScalar(state, parentIndent, valuePart === '>');
    } else if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
      item[key] = parseInlineArray(valuePart.slice(1, -1), state);
    } else {
      item[key] = parseScalar(valuePart);
    }
  } else if (FORBIDDEN_KEYS.has(key)) {
    state.ctx.warnings.push({
      kind: 'forbidden_key',
      line: state.index,
      detail: `禁止 key:${key}`,
    });
  }

  // continuation lines (more indented than parentIndent) merge into same item
  // — only when the first line has empty value (block style) handled above.
  // Inline `- key: val` items don't extend further unless the following
  // line is at deeper indent and is a key:value pair on its own (rare).
  while (state.index < state.lines.length) {
    const next = state.lines[state.index] ?? '';
    const t = next.trim();
    if (t === '' || t.startsWith('#')) {
      state.index++;
      continue;
    }
    const ind = getIndent(next);
    if (ind <= parentIndent) break;
    // additional `key: value` lines at the same indent as the first content
    // line of this item — extend the item
    const stripped = stripEndOfLineComment(next.slice(ind));
    const c = findKeyColon(stripped);
    if (c < 0) break;
    const k = stripped.slice(0, c).trim();
    if (!/^[A-Za-z_][\w.-]*$/.test(k) || FORBIDDEN_KEYS.has(k)) {
      state.index++;
      continue;
    }
    state.ctx.keyCount++;
    const v = stripped.slice(c + 1).trim();
    state.index++;
    if (v === '') {
      const peek = peekNextContent(state);
      if (peek < 0 || getIndent(state.lines[peek] ?? '') <= ind) {
        item[k] = null;
      } else {
        const peekTrimmed = (state.lines[peek] ?? '').trim();
        if (peekTrimmed.startsWith('- ')) {
          item[k] = readBlockArray(state, ind, depth);
        } else {
          item[k] = parseMapping(state, ind, depth + 1);
        }
      }
    } else if (v === '|' || v === '>') {
      item[k] = readBlockScalar(state, ind, v === '>');
    } else if (v.startsWith('[') && v.endsWith(']')) {
      item[k] = parseInlineArray(v.slice(1, -1), state);
    } else {
      item[k] = parseScalar(v);
    }
  }

  return item;
}

function readBlockScalar(state: ParseState, keyIndent: number, folded: boolean): string {
  const collected: string[] = [];
  let blockIndent = -1;

  while (state.index < state.lines.length) {
    const line = state.lines[state.index] ?? '';
    if (line.trim() === '') {
      collected.push('');
      state.index++;
      continue;
    }
    const indent = getIndent(line);
    if (indent <= keyIndent) break;
    if (blockIndent === -1) blockIndent = indent;
    if (indent < blockIndent) break;
    collected.push(line.slice(blockIndent));
    state.index++;
  }

  // trim trailing empty lines (clip chomping = keep at most one trailing newline)
  while (collected.length > 0 && collected[collected.length - 1] === '') {
    collected.pop();
  }

  if (folded) {
    return foldLines(collected);
  }
  return collected.join('\n');
}

function foldLines(lines: readonly string[]): string {
  // YAML folded scalar: 連続する non-empty 行は ' ' で join、空行は '\n'。
  // 行頭インデントが深い行(more indented)は literal で改行保持(本実装は単純化:
  // base indent との差は keep する)。
  if (lines.length === 0) return '';
  let out = '';
  let prevWasEmpty = false;
  let first = true;
  for (const line of lines) {
    if (line === '') {
      out += '\n';
      prevWasEmpty = true;
      first = true;
      continue;
    }
    if (first) {
      out += line;
      first = false;
    } else if (prevWasEmpty) {
      out += line;
    } else {
      out += ' ' + line;
    }
    prevWasEmpty = false;
  }
  return out;
}

// ── Helpers ────────────────────────────────────────────

function peekNextContent(state: ParseState): number {
  for (let i = state.index; i < state.lines.length; i++) {
    const t = (state.lines[i] ?? '').trim();
    if (t !== '' && !t.startsWith('#')) return i;
  }
  return -1;
}

function skipDeeperLines(state: ParseState, parentIndent: number): void {
  while (state.index < state.lines.length) {
    const line = state.lines[state.index] ?? '';
    const t = line.trim();
    if (t === '') {
      state.index++;
      continue;
    }
    if (getIndent(line) <= parentIndent) break;
    state.index++;
  }
}

function getIndent(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ' || ch === '\t') n++;
    else break;
  }
  return n;
}

/**
 * Quoted-aware end-of-line comment strip。`title: "a # b"` の `#` は
 * comment 扱いせず、`title: "a" # comment` は comment として cut。
 */
function stripEndOfLineComment(line: string): string {
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
    else if (!inSingle && !inDouble && ch === '#') {
      // YAML 規約:`#` は前に whitespace があるときだけ comment
      if (i === 0 || /\s/.test(line[i - 1] ?? '')) {
        return line.slice(0, i).trimEnd();
      }
    }
  }
  return line.trimEnd();
}

function findKeyColon(line: string): number {
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

function parseInlineArray(
  inner: string,
  state: ParseState,
): Array<string | number | boolean | null> {
  if (inner.trim() === '') return [];
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
  if (parts.length > FRONTMATTER_LIMITS.maxArrayItems) {
    state.ctx.warnings.push({
      kind: 'array_limit',
      detail: `inline 配列が ${FRONTMATTER_LIMITS.maxArrayItems} を超過、後ろを切り捨て`,
    });
    parts.length = FRONTMATTER_LIMITS.maxArrayItems;
  }
  return parts.map((p) => parseScalar(p.trim()));
}

function parseScalar(raw: string): string | number | boolean | null {
  if (raw === '' || raw === '~' || raw === 'null' || raw === 'Null' || raw === 'NULL') return null;
  if (raw === 'true' || raw === 'True' || raw === 'TRUE') return true;
  if (raw === 'false' || raw === 'False' || raw === 'FALSE') return false;

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

  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }

  return raw;
}

function enforceStringSize(
  s: string,
  state: ParseState,
  key: string,
): string {
  const bytes = byteLength(s);
  if (bytes > FRONTMATTER_LIMITS.maxStringValueBytes) {
    state.ctx.warnings.push({
      kind: 'value_size_limit',
      line: state.index,
      detail: `key "${key}" の値が ${FRONTMATTER_LIMITS.maxStringValueBytes} bytes を超過(${bytes} bytes)、切り詰め`,
    });
    // 切り詰め:UTF-8 byte で safe な truncation を簡略に(BMP 文字は 3 byte / surrogate 4 byte)
    let truncated = '';
    let acc = 0;
    for (const ch of s) {
      const chBytes = byteLength(ch);
      if (acc + chBytes > FRONTMATTER_LIMITS.maxStringValueBytes) break;
      truncated += ch;
      acc += chBytes;
    }
    return truncated;
  }
  return s;
}

function byteLength(s: string): number {
  // TextEncoder は browser / node 共通で UTF-8 byte 長を返す
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length;
  }
  // fallback: rough estimate(BMP 文字 1〜3 byte 程度)
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
  }
  return n;
}

// ── Warning DOM helper ─────────────────────────────────

/**
 * Build a `<div class="pkc-frontmatter-warning">` DOM element listing the
 * warnings。caller(detail-presenter / textlog-presenter / rendered-viewer
 * / action-binder live preview)が preview 先頭に prepend する。
 *
 * 空 array なら `null` を返す(挿入不要)。
 */
export function buildFrontmatterWarningElement(
  warnings: readonly FrontmatterWarning[],
): HTMLElement | null {
  if (warnings.length === 0) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'pkc-frontmatter-warning';
  wrapper.setAttribute('role', 'note');
  wrapper.setAttribute('data-pkc-frontmatter-warning-count', String(warnings.length));
  const header = document.createElement('div');
  header.className = 'pkc-frontmatter-warning-header';
  header.textContent = `⚠ frontmatter parse 警告 (${warnings.length} 件)`;
  wrapper.appendChild(header);
  const list = document.createElement('ul');
  list.className = 'pkc-frontmatter-warning-list';
  for (const w of warnings) {
    const li = document.createElement('li');
    li.setAttribute('data-pkc-frontmatter-warning-kind', w.kind);
    const lineHint = w.line ? ` (line ${w.line})` : '';
    li.textContent = `${w.detail}${lineHint}`;
    list.appendChild(li);
  }
  wrapper.appendChild(list);
  return wrapper;
}

/**
 * Build the warning HTML string(server-side / Viewer popup 用)。
 * DOM 経路と同じ classname / data 属性を持つ HTML を返す。
 */
export function buildFrontmatterWarningHtml(
  warnings: readonly FrontmatterWarning[],
): string {
  if (warnings.length === 0) return '';
  const items = warnings
    .map((w) => {
      const lineHint = w.line ? ` (line ${w.line})` : '';
      return `<li data-pkc-frontmatter-warning-kind="${escapeAttr(w.kind)}">${escapeHtml(
        w.detail,
      )}${escapeHtml(lineHint)}</li>`;
    })
    .join('');
  return (
    `<div class="pkc-frontmatter-warning" role="note" data-pkc-frontmatter-warning-count="${warnings.length}">` +
    `<div class="pkc-frontmatter-warning-header">⚠ frontmatter parse 警告 (${warnings.length} 件)</div>` +
    `<ul class="pkc-frontmatter-warning-list">${items}</ul>` +
    `</div>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
