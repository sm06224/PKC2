import { describe, expect, it } from 'vitest';
import { stripNoiseForWordcount } from '../../../src/features/wordcount/wordcount-strip';

describe('stripNoiseForWordcount', () => {
  it('case 1: empty body → empty', () => {
    expect(stripNoiseForWordcount('')).toBe('');
  });

  it('case 2: plain prose は変化なし', () => {
    expect(stripNoiseForWordcount('hello world this is prose')).toBe('hello world this is prose');
  });

  it('case 3: fenced ``` code block 全行を空 line に置換、line 数は保持', () => {
    const input = 'before\n```\nconst x = 1;\nconst y = 2;\n```\nafter';
    const out = stripNoiseForWordcount(input);
    expect(out.split('\n').length).toBe(input.split('\n').length);
    expect(out).not.toContain('const x');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('case 4: fenced ~~~ も対応', () => {
    const input = '~~~\nignored\n~~~\nkept';
    const out = stripNoiseForWordcount(input);
    expect(out).not.toContain('ignored');
    expect(out).toContain('kept');
  });

  it('case 5: inline code `X` を sentinel に置換', () => {
    expect(stripNoiseForWordcount('use `npm test` to run')).not.toContain('npm test');
    expect(stripNoiseForWordcount('use `npm test` to run')).toContain('use');
    expect(stripNoiseForWordcount('use `npm test` to run')).toContain('to run');
  });

  it('case 6: image markup `![alt](src)` を除去(alt も alt prose 扱いせず)', () => {
    const input = 'before ![my image](http://example.com/a.png) after';
    const out = stripNoiseForWordcount(input);
    expect(out).not.toContain('my image');
    expect(out).not.toContain('example.com');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('case 7: footnote ref `[^id]` を除去', () => {
    const input = 'see footnote[^a] for details';
    const out = stripNoiseForWordcount(input);
    expect(out).not.toContain('[^a]');
    expect(out).toContain('see footnote');
    expect(out).toContain('for details');
  });

  it('case 8: HTML tag `<br>` `<span>X</span>` を除去 + 中身 text 保持', () => {
    const input = 'line1<br>line2 <span>kept</span>';
    const out = stripNoiseForWordcount(input);
    expect(out).not.toContain('<br>');
    expect(out).not.toContain('<span>');
    expect(out).not.toContain('</span>');
    expect(out).toContain('kept');
  });

  it('case 9: option で fencedCode を OFF にすると code 残る', () => {
    const input = '```\ncode\n```';
    const out = stripNoiseForWordcount(input, { fencedCode: false });
    expect(out).toBe(input);
  });

  it('case 10: option 全 OFF で原文不変', () => {
    const input = '```\nx\n```\n`y`\n![a](b)\n[^c]\n<d>e</d>';
    const out = stripNoiseForWordcount(input, {
      fencedCode: false,
      inlineCode: false,
      imageMarkup: false,
      footnoteRefs: false,
      htmlTags: false,
    });
    expect(out).toBe(input);
  });

  it('case 11: fenced と inline と footnote と image の組合せ', () => {
    const input
      = 'doc has `inline` and ![pic](x.png) and ref[^a].\n```\nnoisy\n```\nkeep';
    const out = stripNoiseForWordcount(input);
    expect(out).toContain('doc has');
    expect(out).toContain('and');
    expect(out).toContain('keep');
    expect(out).not.toContain('inline');
    expect(out).not.toContain('pic');
    expect(out).not.toContain('[^a]');
    expect(out).not.toContain('noisy');
  });

  it('case 12: line count(\\n 個数)が strip 前後で同じ(prose line metric が信頼可)', () => {
    const input = 'a\n```\nb\nc\n```\nd';
    expect(stripNoiseForWordcount(input).split('\n').length).toBe(input.split('\n').length);
  });

  it('case 13: nested 風 fenced(```` 内 ~~~)は外 fence 優先', () => {
    const input = '```\n~~~\ninner\n~~~\nstill fenced\n```\nafter';
    const out = stripNoiseForWordcount(input);
    expect(out).not.toContain('still fenced');
    expect(out).not.toContain('inner');
    expect(out).toContain('after');
  });

  it('case 14: indent 付き fenced(`  ```)も認識', () => {
    const input = '  ```\n  code\n  ```\ntext';
    const out = stripNoiseForWordcount(input);
    expect(out).not.toContain('code');
    expect(out).toContain('text');
  });

  it('case 15: 順序性(Phase 8)── strip 後の wordCount が strip 前より少ない', () => {
    const before = 'prose `inline_code` ![alt text](src) more prose';
    const after = stripNoiseForWordcount(before);
    const wordsBefore = before.trim().split(/\s+/).length;
    const wordsAfter = after.trim().split(/\s+/).length;
    expect(wordsAfter).toBeLessThan(wordsBefore);
  });
});
