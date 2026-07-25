/**
 * CodeEditLite の編集支援(純関数)— code-edit-lite-design-2026-07 §2。
 *
 * markdown body 用の `adapter/ui/editor-key-helpers.ts`(リスト継続・
 * 番号振り直し・markdown 固有の carve-out)とは**編集対象が違う**ため分離:
 * こちらは code(json / yaml / js / html / xml / css 等)向けの
 * indent / bracket / タグ補完で、DOM に依存しない
 * `(value, selection) → patch` の純関数として実装する。
 * patch の適用(setRangeText / undo 保持)は component 側の責務。
 */

export interface CodeEditPatch {
  readonly value: string;
  readonly selStart: number;
  readonly selEnd: number;
}

const INDENT_UNIT = '  ';

/** 開き括弧 / quote → 対応する閉じ。code では `'` も対にする(js 文字列)。 */
const PAIRS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

const CLOSERS = ')]}"\'`';

/** html の void 要素(閉じタグ補完をしない)。xml / svg では全タグ補完する。 */
const HTML_VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

export function isMarkupLang(lang: string): boolean {
  const l = lang.toLowerCase();
  return l === 'html' || l === 'xml' || l === 'svg';
}

function isYamlLang(lang: string): boolean {
  const l = lang.toLowerCase();
  return l === 'yaml' || l === 'yml';
}

function lineStartAt(value: string, pos: number): number {
  return value.lastIndexOf('\n', pos - 1) + 1;
}

function leadingIndentOf(line: string): string {
  return /^[\t ]*/.exec(line)![0];
}

/** 行末(空白除く)がブロック開始か(言語別)。Enter の +1 段判定。 */
function lineOpensBlock(line: string, lang: string): boolean {
  const t = line.replace(/[\t ]+$/, '');
  if (!t) return false;
  const last = t.charAt(t.length - 1);
  if (last === '{' || last === '[' || last === '(') return true;
  if (isYamlLang(lang)) {
    if (last === ':') return true;
    if (/:\s*[|>][+-]?$/.test(t)) return true; // block scalar `key: |` / `key: >`
  }
  if (isMarkupLang(lang) && last === '>') {
    // 行末が開きタグ(`</...>` でも `.../>` でもない)なら 1 段下げる
    const m = /<(\/?)([A-Za-z][\w:-]*)(?:\s[^<>]*)?(\/?)>$/.exec(t);
    if (m && m[1] !== '/' && m[3] !== '/') {
      if (lang.toLowerCase() === 'html' && HTML_VOID.has(m[2]!.toLowerCase())) return false;
      return true;
    }
  }
  return false;
}

/**
 * Enter: indent 継承 + ブロック開始行で +1 段。
 * caret が対の間(`{|}` `[|]` `(|)` / `<tag>|</`)なら
 * 「展開」(改行 2 本 + 中段 indent)を行う。
 * 素の改行(indent なし・ブロック開始でもない)は null = ブラウザ既定に任せる。
 */
export function codeEnterPatch(
  value: string,
  selStart: number,
  selEnd: number,
  lang: string,
): CodeEditPatch | null {
  if (selStart !== selEnd) return null;
  const ls = lineStartAt(value, selStart);
  const line = value.slice(ls, selStart);
  const indent = leadingIndentOf(line);
  const prev = value.charAt(selStart - 1);
  const rest = value.slice(selStart);
  const betweenPair =
    (prev === '{' && rest.startsWith('}')) ||
    (prev === '[' && rest.startsWith(']')) ||
    (prev === '(' && rest.startsWith(')')) ||
    (prev === '>' && rest.startsWith('</'));
  if (betweenPair) {
    const inserted = '\n' + indent + INDENT_UNIT + '\n' + indent;
    const caret = selStart + 1 + indent.length + INDENT_UNIT.length;
    return { value: value.slice(0, selStart) + inserted + rest, selStart: caret, selEnd: caret };
  }
  const opens = lineOpensBlock(line, lang);
  if (indent === '' && !opens) return null;
  const inserted = '\n' + indent + (opens ? INDENT_UNIT : '');
  const caret = selStart + inserted.length;
  return {
    value: value.slice(0, selStart) + inserted + value.slice(selStart),
    selStart: caret,
    selEnd: caret,
  };
}

/**
 * Tab / Shift+Tab:
 *  - 複数行選択 → 各行 indent / outdent(選択は維持)
 *  - それ以外の Tab → INDENT_UNIT 挿入(選択があれば置換)
 *  - それ以外の Shift+Tab → 現在行の行頭 indent を 1 unit 外す
 */
export function codeTabPatch(
  value: string,
  selStart: number,
  selEnd: number,
  shift: boolean,
): CodeEditPatch | null {
  const multiline = selStart !== selEnd && value.slice(selStart, selEnd).includes('\n');
  if (multiline) {
    const firstLineStart = lineStartAt(value, selStart);
    // 選択末尾が改行直後で終わる場合、下の行へは波及させない
    const regionEnd = value.charAt(selEnd - 1) === '\n' ? selEnd - 1 : selEnd;
    const before = value.slice(0, firstLineStart);
    const region = value.slice(firstLineStart, regionEnd);
    const after = value.slice(regionEnd);
    const modified = region
      .split('\n')
      .map((line) => {
        if (shift) {
          if (line.startsWith(INDENT_UNIT)) return line.slice(INDENT_UNIT.length);
          if (line.startsWith('\t')) return line.slice(1);
          return line;
        }
        return INDENT_UNIT + line;
      })
      .join('\n');
    return {
      value: before + modified + after,
      selStart: firstLineStart,
      selEnd: regionEnd + (modified.length - region.length),
    };
  }
  if (shift) {
    const ls = lineStartAt(value, selStart);
    if (value.startsWith(INDENT_UNIT, ls)) {
      return {
        value: value.slice(0, ls) + value.slice(ls + INDENT_UNIT.length),
        selStart: Math.max(ls, selStart - INDENT_UNIT.length),
        selEnd: Math.max(ls, selEnd - INDENT_UNIT.length),
      };
    }
    if (value.charAt(ls) === '\t') {
      return {
        value: value.slice(0, ls) + value.slice(ls + 1),
        selStart: Math.max(ls, selStart - 1),
        selEnd: Math.max(ls, selEnd - 1),
      };
    }
    return null;
  }
  const v = value.slice(0, selStart) + INDENT_UNIT + value.slice(selEnd);
  const c = selStart + INDENT_UNIT.length;
  return { value: v, selStart: c, selEnd: c };
}

/** closer / quote の skip-out(直後に同じ文字があれば caret 前進のみ)。 */
export function codeSkipOutPatch(
  value: string,
  selStart: number,
  selEnd: number,
  ch: string,
): CodeEditPatch | null {
  if (selStart !== selEnd) return null;
  if (!CLOSERS.includes(ch)) return null;
  if (value.charAt(selStart) !== ch) return null;
  return { value, selStart: selStart + 1, selEnd: selStart + 1 };
}

/**
 * 開き括弧 / quote:
 *  - 選択あり → 選択を対で包む(code 向け拡張。markdown 版は非対応)
 *  - 選択なし → 対を挿入して caret を間に。直後が単語文字なら pair しない。
 *    対称 quote は直前が同じ文字なら pair しない(連打対策)
 */
export function codeBracketPatch(
  value: string,
  selStart: number,
  selEnd: number,
  ch: string,
): CodeEditPatch | null {
  const close = PAIRS[ch];
  if (!close) return null;
  if (selStart !== selEnd) {
    const inner = value.slice(selStart, selEnd);
    const v = value.slice(0, selStart) + ch + inner + close + value.slice(selEnd);
    return { value: v, selStart: selStart + 1, selEnd: selEnd + 1 };
  }
  const next = value.charAt(selStart);
  if (/\w/.test(next)) return null;
  if ((ch === '"' || ch === "'" || ch === '`') && value.charAt(selStart - 1) === ch) return null;
  const v = value.slice(0, selStart) + ch + close + value.slice(selStart);
  return { value: v, selStart: selStart + 1, selEnd: selStart + 1 };
}

/**
 * `>` 入力(markup 言語のみ): 直前の `<tag ...` を閉じて `</tag>` を
 * caret の後ろへ自動挿入する。閉じタグ / 自己終了 / コメント / DOCTYPE /
 * html の void 要素では発火しない。value は `>` **挿入前**を渡す。
 */
export function tagCloseOnGtPatch(
  value: string,
  selStart: number,
  selEnd: number,
  lang: string,
): CodeEditPatch | null {
  if (selStart !== selEnd) return null;
  if (!isMarkupLang(lang)) return null;
  const upto = value.slice(0, selStart);
  const lt = upto.lastIndexOf('<');
  if (lt < 0) return null;
  const frag = upto.slice(lt); // 例: `<div class="a"`(まだ `>` なし)
  if (frag.includes('>')) return null; // 直近の `<` は既に閉じている
  if (frag.endsWith('/')) return null; // 自己終了 `<br/`
  const m = /^<([A-Za-z][\w:-]*)(?:\s[^<>]*)?$/.exec(frag);
  if (!m) return null; // `</...` / `<!--` / `<!DOCTYPE` 等
  const name = m[1]!;
  if (lang.toLowerCase() === 'html' && HTML_VOID.has(name.toLowerCase())) return null;
  const v = value.slice(0, selStart) + '></' + name + '>' + value.slice(selStart);
  const c = selStart + 1; // caret は `>` の直後 = タグの間
  return { value: v, selStart: c, selEnd: c };
}

/** 選択範囲(空なら caret 位置)をタグで包む。tag 名が不正なら null。 */
export function wrapSelectionWithTagPatch(
  value: string,
  selStart: number,
  selEnd: number,
  tagName: string,
): CodeEditPatch | null {
  const name = tagName.trim();
  if (!/^[A-Za-z][\w:-]*$/.test(name)) return null;
  const open = `<${name}>`;
  const close = `</${name}>`;
  const inner = value.slice(selStart, selEnd);
  const v = value.slice(0, selStart) + open + inner + close + value.slice(selEnd);
  if (selStart === selEnd) {
    const c = selStart + open.length;
    return { value: v, selStart: c, selEnd: c };
  }
  return { value: v, selStart, selEnd: selEnd + open.length + close.length };
}

/**
 * keydown dispatch(修飾キーなし・非 IME を caller が保証)。
 * 返り値 null はブラウザ既定に任せる。
 */
export function codeEditKeyPatch(
  value: string,
  selStart: number,
  selEnd: number,
  key: string,
  shiftKey: boolean,
  lang: string,
): CodeEditPatch | null {
  if (key === 'Tab') return codeTabPatch(value, selStart, selEnd, shiftKey);
  if (key === 'Enter' && !shiftKey) return codeEnterPatch(value, selStart, selEnd, lang);
  if (key === '>') {
    const tag = tagCloseOnGtPatch(value, selStart, selEnd, lang);
    if (tag) return tag;
    return null;
  }
  if (key.length === 1) {
    const skip = codeSkipOutPatch(value, selStart, selEnd, key);
    if (skip) return skip;
    return codeBracketPatch(value, selStart, selEnd, key);
  }
  return null;
}
