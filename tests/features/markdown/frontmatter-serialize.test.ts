import { describe, it, expect } from 'vitest';
import {
  serializeFrontmatter,
  setFrontmatter,
  parseFrontmatter,
} from '@features/markdown/frontmatter';

describe('frontmatter — serializeFrontmatter (Phase γ-B1)', () => {
  it('1. scalar string keys', () => {
    expect(serializeFrontmatter({ kind: 'book', title: 'Hello' })).toBe(
      '---\nkind: book\ntitle: Hello\n---',
    );
  });
  it('2. number / boolean / null', () => {
    expect(serializeFrontmatter({ n: 5, b: true, x: null })).toBe(
      '---\nn: 5\nb: true\nx: null\n---',
    );
  });
  it('3. number-like / bool-like 文字列は quote', () => {
    expect(serializeFrontmatter({ a: '123', b: 'true' })).toBe(
      '---\na: "123"\nb: "true"\n---',
    );
  });
  it('4. 空文字列は quote', () => {
    expect(serializeFrontmatter({ c: '' })).toBe('---\nc: ""\n---');
  });
  it('5. 構造文字(: # [ ])を含む文字列は quote', () => {
    expect(serializeFrontmatter({ u: 'http://x.com' })).toBe(
      '---\nu: "http://x.com"\n---',
    );
  });
  it('6. 先頭ハイフンの文字列は quote', () => {
    expect(serializeFrontmatter({ d: '-dash' })).toBe('---\nd: "-dash"\n---');
  });
  it('7. inline array', () => {
    expect(serializeFrontmatter({ tags: ['a', 'b'] })).toBe(
      '---\ntags: [a, b]\n---',
    );
  });
  it('8. 空 meta でも --- で挟む', () => {
    expect(serializeFrontmatter({})).toBe('---\n---');
  });
  it('9. 通常の内部空白は quote しない', () => {
    expect(serializeFrontmatter({ author: 'Jane Doe' })).toBe(
      '---\nauthor: Jane Doe\n---',
    );
  });
});

describe('frontmatter — setFrontmatter (Phase γ-B1)', () => {
  it('10. 既存 frontmatter block を置換', () => {
    expect(setFrontmatter('---\nkind: old\n---\ncontent', { kind: 'new' })).toBe(
      '---\nkind: new\n---\ncontent',
    );
  });
  it('11. frontmatter が無ければ prepend', () => {
    expect(setFrontmatter('just content', { kind: 'book' })).toBe(
      '---\nkind: book\n---\njust content',
    );
  });
  it('12. 空 meta なら frontmatter を除去', () => {
    expect(setFrontmatter('---\nkind: x\n---\ntext', {})).toBe('text');
  });
  it('13. 本文なし(frontmatter のみ)body', () => {
    expect(setFrontmatter('---\nkind: x\n---', { kind: 'y' })).toBe(
      '---\nkind: y\n---',
    );
  });
});

describe('frontmatter — serialize round-trip', () => {
  it('14. parse → setFrontmatter → parse で meta 不変', () => {
    const orig =
      '---\nkind: book\nauthor: Jane Doe\nyear: 2024\ndone: false\n---\nbody text';
    const { meta } = parseFrontmatter(orig);
    const rebuilt = setFrontmatter('body text', meta);
    expect(parseFrontmatter(rebuilt).meta).toEqual(meta);
    expect(parseFrontmatter(rebuilt).body).toBe('body text');
  });
  it('15. コロン入りの値も round-trip', () => {
    const meta = { title: 'Vol: 1', url: 'https://x.com/p' };
    const parsed = parseFrontmatter(setFrontmatter('b', meta));
    expect(parsed.meta).toEqual(meta);
  });
  it('16. number / boolean / null も round-trip', () => {
    const meta = { count: 3, ready: true, note: null };
    const parsed = parseFrontmatter(setFrontmatter('b', meta));
    expect(parsed.meta).toEqual(meta);
  });
});
