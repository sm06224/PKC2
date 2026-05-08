/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  getFrontmatterKind,
  extractVars,
  buildFrontmatterWarningElement,
  buildFrontmatterWarningHtml,
  FRONTMATTER_LIMITS,
} from '@features/markdown/frontmatter';

describe('parseFrontmatter', () => {
  it('returns empty meta and unchanged body when no frontmatter', () => {
    const body = '# Hello\nworld\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(false);
    expect(r.meta).toEqual({});
    expect(r.body).toBe(body);
  });

  it('parses simple key:value frontmatter', () => {
    const body = '---\nkind: book\nauthor: 村上春樹\nyear: 1987\n---\n# memo\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(true);
    expect(r.meta).toEqual({ kind: 'book', author: '村上春樹', year: 1987 });
    expect(r.body).toBe('# memo\n');
  });

  it('parses booleans, null, and quoted strings', () => {
    const body = '---\nactive: true\nfinished: false\nnote: ~\nname: "with: colon"\nalt: \'plain\'\n---\nbody\n';
    const r = parseFrontmatter(body);
    expect(r.meta.active).toBe(true);
    expect(r.meta.finished).toBe(false);
    expect(r.meta.note).toBe(null);
    expect(r.meta.name).toBe('with: colon');
    expect(r.meta.alt).toBe('plain');
  });

  it('parses inline arrays', () => {
    const body = '---\ntags: [a, b, c]\nnums: [1, 2, 3]\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.tags).toEqual(['a', 'b', 'c']);
    expect(r.meta.nums).toEqual([1, 2, 3]);
  });

  it('parses block-style arrays', () => {
    const body = '---\ntags:\n  - a\n  - b\n  - c\nname: thing\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.tags).toEqual(['a', 'b', 'c']);
    expect(r.meta.name).toBe('thing');
  });

  it('keeps date-like strings as strings (no Date object)', () => {
    const body = '---\nread_at: 2024-03-15\nstamp: 2024-01-10T00:00:00Z\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.read_at).toBe('2024-03-15');
    expect(r.meta.stamp).toBe('2024-01-10T00:00:00Z');
  });

  it('returns body untouched when closing fence is missing', () => {
    const body = '---\nkind: book\nbody never closed\n# memo\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(false);
    expect(r.meta).toEqual({});
    expect(r.body).toBe(body);
  });

  it('returns body untouched when there is no opening fence at byte 0', () => {
    const body = '\n---\nkind: book\n---\n# memo\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(false);
    expect(r.meta).toEqual({});
  });

  it('drops invalid keys (with spaces or special chars)', () => {
    const body = '---\nkind: book\n bad key: x\n!badly: y\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.kind).toBe('book');
    expect(r.meta).not.toHaveProperty(' bad key');
    expect(r.meta).not.toHaveProperty('!badly');
  });

  it('strips trailing whitespace # comments', () => {
    const body = '---\nkind: book   # main type\nyear: 1987 # publication\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta).toEqual({ kind: 'book', year: 1987 });
  });

  it('preserves the rest of the body verbatim', () => {
    const body = '---\nkind: book\n---\n# Heading\n\nParagraph 1.\n\n```code\nfoo\n```\n';
    const r = parseFrontmatter(body);
    expect(r.body).toBe('# Heading\n\nParagraph 1.\n\n```code\nfoo\n```\n');
  });
});

describe('getFrontmatterKind', () => {
  it('returns the kind when present', () => {
    expect(getFrontmatterKind('---\nkind: book\n---\n')).toBe('book');
    expect(getFrontmatterKind('---\nkind: youtube\nurl: https://x\n---\n')).toBe('youtube');
  });

  it('returns null when no frontmatter', () => {
    expect(getFrontmatterKind('# memo\n')).toBe(null);
  });

  it('returns null when kind is missing or empty', () => {
    expect(getFrontmatterKind('---\nauthor: x\n---\n')).toBe(null);
    expect(getFrontmatterKind('---\nkind: ""\n---\n')).toBe(null);
  });
});

// ── Natural YAML extension(2026-05-08 reform)──

describe('parseFrontmatter — nested mapping(natural YAML)', () => {
  it('1 階の nested mapping を object として parse', () => {
    const body = '---\nvars:\n  project: ALPHA-7\n  audience: 経営層\n---\nbody\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(true);
    expect(r.meta.vars).toEqual({ project: 'ALPHA-7', audience: '経営層' });
    expect(r.warnings).toHaveLength(0);
  });

  it('2 階の nested mapping(page.margins.top)', () => {
    const body =
      '---\npage:\n  orient: portrait\n  margins:\n    top: 1cm\n    bottom: 2cm\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.page).toEqual({
      orient: 'portrait',
      margins: { top: '1cm', bottom: '2cm' },
    });
  });

  it('depth 4 まで OK、5 階目は warning + skip', () => {
    const body =
      '---\nl1:\n  l2:\n    l3:\n      l4: deepvalue\n      l5deep:\n        l5: tooDeep\n---\n';
    const r = parseFrontmatter(body);
    // 4 階の l4 は parse される
    const l1 = r.meta.l1 as Record<string, unknown>;
    const l2 = l1.l2 as Record<string, unknown>;
    const l3 = l2.l3 as Record<string, unknown>;
    expect(l3.l4).toBe('deepvalue');
    // 5 階(l5)は depth_limit warning
    expect(r.warnings.some((w) => w.kind === 'depth_limit')).toBe(true);
  });

  it('nested と flat scalar の混在', () => {
    const body = '---\nkind: book\ntitle: Foo\nvars:\n  x: 1\n  y: 2\nyear: 2026\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.kind).toBe('book');
    expect(r.meta.title).toBe('Foo');
    expect(r.meta.year).toBe(2026);
    expect(r.meta.vars).toEqual({ x: 1, y: 2 });
  });
});

describe('parseFrontmatter — block scalar `|` and `>`', () => {
  it('literal block `|` で改行保持', () => {
    const body = '---\ndescription: |\n  line 1\n  line 2\n  line 3\n---\nbody\n';
    const r = parseFrontmatter(body);
    expect(r.meta.description).toBe('line 1\nline 2\nline 3');
  });

  it('folded block `>` で改行を space に fold', () => {
    const body = '---\nsummary: >\n  hello\n  world\n  yet again\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.summary).toBe('hello world yet again');
  });

  it('folded `>` で空行は段落区切り(改行 1 つに)', () => {
    const body = '---\nsummary: >\n  paragraph 1\n  still p1\n\n  paragraph 2\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.summary).toBe('paragraph 1 still p1\nparagraph 2');
  });

  it('literal `|` の indent が一定でないと最初の行の indent を base に', () => {
    const body = '---\nkey: |\n    extra\n    indented\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.key).toBe('extra\nindented');
  });

  it('block scalar の後に同階層 key を続けられる', () => {
    const body = '---\ndesc: |\n  line A\n  line B\nyear: 2026\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.desc).toBe('line A\nline B');
    expect(r.meta.year).toBe(2026);
  });
});

describe('parseFrontmatter — quoted-aware comment strip', () => {
  it('quoted string 内の `#` は comment 扱いしない(bug fix)', () => {
    const body = '---\ntitle: "hello # world"\nname: \'a # b\'\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.title).toBe('hello # world');
    expect(r.meta.name).toBe('a # b');
  });

  it('quoted 後の ` #` は comment として cut', () => {
    const body = '---\ntitle: "wrapped" # this is a note\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.title).toBe('wrapped');
  });

  it('行頭 # は full-line comment(skip)', () => {
    const body = '---\n# top comment\nkind: book\n# middle comment\nyear: 2026\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.kind).toBe('book');
    expect(r.meta.year).toBe(2026);
  });

  it('value 直後に空白なしの `#` は comment 扱いしない(value の一部)', () => {
    // YAML 規約:`#` は前に whitespace あり時のみ comment
    const body = '---\ncolor: red#aabbcc\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.color).toBe('red#aabbcc');
  });
});

describe('parseFrontmatter — limits + warnings', () => {
  it('size 超過で warning + parse 中断、body は返す', () => {
    const huge = 'big_value: ' + 'A'.repeat(FRONTMATTER_LIMITS.totalBytes + 100);
    const body = `---\n${huge}\n---\nbody content\n`;
    const r = parseFrontmatter(body);
    expect(r.found).toBe(true);
    expect(r.meta).toEqual({});
    expect(r.warnings.some((w) => w.kind === 'size_limit')).toBe(true);
    expect(r.body).toBe('body content\n');
  });

  it('forbidden key __proto__ を reject + warning(prototype pollution 防御)', () => {
    const body = '---\n__proto__: malicious\nkind: book\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta).not.toHaveProperty('__proto__');
    expect(r.meta.kind).toBe('book');
    expect(r.warnings.some((w) => w.kind === 'forbidden_key')).toBe(true);
    // Object.prototype が汚染されていないこと
    expect(({} as Record<string, unknown>).malicious).toBeUndefined();
  });

  it('forbidden key constructor / prototype も reject', () => {
    const body = '---\nconstructor: a\nprototype: b\nkind: book\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta).not.toHaveProperty('constructor');
    expect(r.meta).not.toHaveProperty('prototype');
    expect(r.meta.kind).toBe('book');
    expect(r.warnings.filter((w) => w.kind === 'forbidden_key')).toHaveLength(2);
  });

  it('inline array 長さ超過で切り捨て + warning', () => {
    const items = Array.from({ length: FRONTMATTER_LIMITS.maxArrayItems + 50 }, (_, i) => i).join(', ');
    const body = `---\nbig: [${items}]\n---\n`;
    const r = parseFrontmatter(body);
    expect((r.meta.big as unknown[]).length).toBe(FRONTMATTER_LIMITS.maxArrayItems);
    expect(r.warnings.some((w) => w.kind === 'array_limit')).toBe(true);
  });

  it('value size 超過で truncate + warning', () => {
    const longValue = 'X'.repeat(FRONTMATTER_LIMITS.maxStringValueBytes + 100);
    const body = `---\nbig: "${longValue}"\n---\n`;
    const r = parseFrontmatter(body);
    expect((r.meta.big as string).length).toBeLessThanOrEqual(
      FRONTMATTER_LIMITS.maxStringValueBytes,
    );
    expect(r.warnings.some((w) => w.kind === 'value_size_limit')).toBe(true);
  });

  it('duplicate key を warning(後者で上書き)', () => {
    const body = '---\nkind: book\nkind: video\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.kind).toBe('video');
    expect(r.warnings.some((w) => w.kind === 'duplicate_key')).toBe(true);
  });

  it('clean parse は warnings 空配列', () => {
    const body = '---\nkind: book\nyear: 2026\n---\n';
    const r = parseFrontmatter(body);
    expect(r.warnings).toEqual([]);
  });
});

describe('extractVars — natural YAML 経由', () => {
  it('nested vars: object 形式から抽出', () => {
    const body = '---\nvars:\n  project: ALPHA-7\n  audience: 経営層\n---\n';
    expect(extractVars(body)).toEqual({ project: 'ALPHA-7', audience: '経営層' });
  });

  it('flat vars.<key> 形式から抽出', () => {
    const body = '---\nvars.project: ALPHA-7\nvars.audience: 経営層\n---\n';
    expect(extractVars(body)).toEqual({ project: 'ALPHA-7', audience: '経営層' });
  });

  it('nested + flat 併用、flat が後勝ち', () => {
    const body = '---\nvars:\n  x: nested\nvars.x: flat\n---\n';
    expect(extractVars(body)).toEqual({ x: 'flat' });
  });

  it('frontmatter 不在 → 空 record', () => {
    expect(extractVars('# no fm\n')).toEqual({});
  });

  it('vars 値が number / boolean でも string 化', () => {
    const body = '---\nvars:\n  n: 42\n  b: true\n---\n';
    expect(extractVars(body)).toEqual({ n: '42', b: 'true' });
  });
});

describe('buildFrontmatterWarningElement / Html', () => {
  it('warnings 空 array なら null(DOM 経路)', () => {
    expect(buildFrontmatterWarningElement([])).toBe(null);
  });

  it('warnings 空 array なら 空文字(HTML 経路)', () => {
    expect(buildFrontmatterWarningHtml([])).toBe('');
  });

  it('warning kind を data-pkc-frontmatter-warning-kind に持つ', () => {
    const el = buildFrontmatterWarningElement([
      { kind: 'forbidden_key', detail: '禁止 key', line: 3 },
    ]);
    expect(el).not.toBeNull();
    expect(el!.classList.contains('pkc-frontmatter-warning')).toBe(true);
    const li = el!.querySelector('li');
    expect(li!.getAttribute('data-pkc-frontmatter-warning-kind')).toBe('forbidden_key');
    expect(li!.textContent).toContain('禁止 key');
    expect(li!.textContent).toContain('line 3');
  });

  it('複数 warning は ul.li リスト + count attribute', () => {
    const el = buildFrontmatterWarningElement([
      { kind: 'forbidden_key', detail: 'a' },
      { kind: 'duplicate_key', detail: 'b' },
      { kind: 'malformed', detail: 'c' },
    ]);
    expect(el!.getAttribute('data-pkc-frontmatter-warning-count')).toBe('3');
    expect(el!.querySelectorAll('li').length).toBe(3);
  });

  it('HTML 経路は escape 済み(<script> 等が literal で残らない)', () => {
    const html = buildFrontmatterWarningHtml([
      { kind: 'malformed', detail: '<script>alert(1)</script>' },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
