/**
 * Block directive attribute parser(reform-2026-05、Phase 1 PR-D)。
 *
 * Pandoc-style `{key=value key2="quoted" #id .class flag}` attribute syntax を
 * 1 つの文字列から parse する pure helper。
 *
 * `:::name{attrs}` block / `:role:[content]{attrs}` inline 双方で使う共通基盤。
 *
 * 受理する記法:
 *
 *   - `key=value`          ── unquoted、value は 1 word(空白 / `}` 不可)
 *   - `key="value with sp"` ── double-quoted、空白許容
 *   - `key='value'`        ── single-quoted
 *   - `flag`               ── 単独 word は boolean true 扱い
 *   - `#id`                ── id 指定(slug-safe な英字 / 数字 / `-` / `_`)
 *   - `.class`             ── class 指定(同上)
 *
 * 設計詳細は `docs/development/notation-redesign-2026-05/01-notation-catalog.md`
 * §1.2.4 / §1.2.5 + §1.3.2 を参照。
 */

export interface BlockDirectiveAttrs {
  /** `#id` 指定。指定なし時 undefined。 */
  id?: string;
  /** `.class` 指定の集合。指定なし時 空配列。 */
  classes: string[];
  /** `key=value` / `flag` 指定の集合。flag は boolean true で stored。 */
  kvs: Record<string, string | boolean>;
}

/**
 * `{key=value ...}` の中身(`{` `}` は除いた本体)を parse。
 *
 *   parseBlockDirectiveAttrs('quote author="Smith" year=2020')
 *     → { id: undefined, classes: [], kvs: { quote: true, author: "Smith", year: "2020" } }
 *
 *   parseBlockDirectiveAttrs('#fig-1 .important caption="Diagram"')
 *     → { id: 'fig-1', classes: ['important'], kvs: { caption: 'Diagram' } }
 *
 * malformed token は silent skip(silent fail を避けたい場合は caller で
 * 「parse 後の空 attrs vs 入力非空」を検証して warning 表示)。
 */
export function parseBlockDirectiveAttrs(inner: string): BlockDirectiveAttrs {
  const out: BlockDirectiveAttrs = { id: undefined, classes: [], kvs: {} };
  if (!inner) return out;

  // Tokenize:
  //   - quoted tokens(`"..."`、`'...'`)を 1 token に保持
  //   - 残りは whitespace 区切り
  const tokens: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    // `key="..."` or `key='...'` を 1 token として保持
    // word(non-quote / non-space)を読む
    let buf = '';
    while (i < inner.length) {
      const c = inner[i]!;
      if (c === ' ' || c === '\t' || c === '\n') break;
      if ((c === '"' || c === "'") && buf.length > 0 && buf[buf.length - 1] === '=') {
        // start quoted value
        const quote = c;
        buf += c;
        i++;
        while (i < inner.length) {
          const cc = inner[i]!;
          buf += cc;
          i++;
          if (cc === '\\' && i < inner.length) {
            // escape next char
            buf += inner[i]!;
            i++;
            continue;
          }
          if (cc === quote) break;
        }
        continue;
      }
      buf += c;
      i++;
    }
    if (buf.length > 0) tokens.push(buf);
  }

  for (const tok of tokens) {
    if (tok.startsWith('#')) {
      const id = tok.slice(1);
      if (/^[A-Za-z_][\w-]*$/.test(id)) {
        out.id = id;
      }
      continue;
    }
    if (tok.startsWith('.')) {
      const cls = tok.slice(1);
      if (/^[A-Za-z_][\w-]*$/.test(cls)) {
        out.classes.push(cls);
      }
      continue;
    }
    const eqIdx = tok.indexOf('=');
    if (eqIdx < 0) {
      // boolean flag(name のみ)
      if (/^[A-Za-z_][\w-]*$/.test(tok)) {
        out.kvs[tok] = true;
      }
      continue;
    }
    const key = tok.slice(0, eqIdx);
    let value = tok.slice(eqIdx + 1);
    if (!/^[A-Za-z_][\w-]*$/.test(key)) continue;
    // unquote if quoted
    if (value.length >= 2) {
      const f = value[0];
      const l = value[value.length - 1];
      if ((f === '"' && l === '"') || (f === "'" && l === "'")) {
        value = value.slice(1, -1);
        // unescape `\"` and `\'`
        value = value.replace(/\\(["'\\])/g, '$1');
      }
    }
    out.kvs[key] = value;
  }

  return out;
}

/**
 * `:::name{attrs}` の opening line から `name` と attrs を抜き出す。
 * attrs 不在時(`:::name` だけ)も受理。
 *
 *   parseBlockDirectiveOpen(':::quote{author="Smith" year=2020}')
 *     → { name: 'quote', attrs: { id: undefined, classes: [], kvs: { author: 'Smith', year: '2020' } } }
 *
 *   parseBlockDirectiveOpen(':::if')
 *     → { name: 'if', attrs: { id: undefined, classes: [], kvs: {} } }
 *
 *   parseBlockDirectiveOpen('not a directive')
 *     → null
 */
export function parseBlockDirectiveOpen(
  line: string,
): { name: string; attrs: BlockDirectiveAttrs } | null {
  // `:::name{...}` or `:::name`、name は slug-safe
  const m = /^:::([A-Za-z_][\w-]*)(?:\{([^}]*)\})?\s*$/.exec(line);
  if (!m) return null;
  const name = m[1]!;
  const attrsStr = m[2] ?? '';
  return { name, attrs: parseBlockDirectiveAttrs(attrsStr) };
}

/**
 * `:::` 単独行が directive close か判定。
 *
 * `:::` 単独 + 前後 whitespace のみなら true。
 */
export function isBlockDirectiveClose(line: string): boolean {
  return /^\s*:::\s*$/.test(line);
}
