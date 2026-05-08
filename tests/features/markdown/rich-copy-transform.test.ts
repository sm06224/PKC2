/**
 * Rich-paste 用 HTML 変換の unit test。
 *
 * 検証:
 *   - PKC 独自の data-pkc-* / class-only style が inline `style="..."` に
 *     複製される(Word / ONLYOFFICE で書式が落ちない)
 *   - 元の data-pkc-* / class 属性は **残置**(round-trip / 再 import)
 *   - 既存の inline style(L-6 simple-inline)は触らない
 *   - 標準 HTML(<table>, <strong>, <ruby> 等)は変換しない
 */
import { describe, it, expect } from 'vitest';
import { htmlForRichCopy } from '@features/markdown/rich-copy-transform';

describe('htmlForRichCopy', () => {
  it('L-5 align: data-pkc-align="center" → inline text-align', () => {
    const out = htmlForRichCopy('<p data-pkc-align="center">中央</p>');
    expect(out).toContain('data-pkc-align="center"');
    expect(out).toContain('style="text-align: center');
    expect(out).toContain('中央');
  });

  it('L-5 align right / left も同様', () => {
    const r = htmlForRichCopy('<p data-pkc-align="right">右</p>');
    const l = htmlForRichCopy('<p data-pkc-align="left">左</p>');
    expect(r).toContain('style="text-align: right');
    expect(l).toContain('style="text-align: left');
  });

  it('L-9 indent: data-pkc-indent="1" → inline text-indent: 1em', () => {
    const out = htmlForRichCopy('<p data-pkc-indent="1">字下げ</p>');
    expect(out).toContain('data-pkc-indent="1"');
    expect(out).toContain('style="text-indent: 1em');
  });

  it('L-5 + L-9 併用: align + indent 両方が style に入る', () => {
    const out = htmlForRichCopy('<p data-pkc-align="center" data-pkc-indent="1">center indent</p>');
    expect(out).toContain('text-align: center');
    expect(out).toContain('text-indent: 1em');
    expect(out).toContain('data-pkc-align="center"');
    expect(out).toContain('data-pkc-indent="1"');
  });

  it('L-2 highlight: <mark> に inline background-color', () => {
    const out = htmlForRichCopy('<mark>重要</mark>');
    expect(out).toContain('<mark style="background-color: #fff59d');
    expect(out).toContain('重要');
  });

  it('L-2 em-dot: <em class="pkc-em-dot"> に text-emphasis inline', () => {
    const out = htmlForRichCopy('<em class="pkc-em-dot">傍点</em>');
    expect(out).toContain('text-emphasis: filled dot');
    expect(out).toContain('-webkit-text-emphasis: filled dot');
    expect(out).toContain('pkc-em-dot');  // class 残置
  });

  it('L-1 section break: <hr> に border inline', () => {
    const out = htmlForRichCopy('<hr class="pkc-section-break" data-pkc-role="section">');
    expect(out).toContain('border-top: 1px solid');
    expect(out).toContain('pkc-section-break');
  });

  it('L-8 blank-line: <div> N 個 → <p>&nbsp;</p> × N で portable spacer', () => {
    const out = htmlForRichCopy(
      '<div class="pkc-blank-line" data-pkc-blank-count="3" aria-hidden="true"></div>',
    );
    const nbspParaCount = (out.match(/<p style="margin: 0;">&nbsp;<\/p>/g) ?? []).length;
    expect(nbspParaCount).toBe(3);
    // 元の div は残らない(置換)
    expect(out).not.toContain('pkc-blank-line');
  });

  it('L-7 figure caption: text-align center + 色 inline', () => {
    const out = htmlForRichCopy('<figcaption class="pkc-fig-caption">図 1: キャプション</figcaption>');
    expect(out).toContain('text-align: center');
    expect(out).toContain('pkc-fig-caption');
  });

  it('L-6 simple-inline は既存 inline style があるので触らない', () => {
    const html = '<span class="pkc-inline-mark" style="font-weight: bold; color: red">重要</span>';
    const out = htmlForRichCopy(html);
    expect(out).toBe(html);
  });

  it('標準 HTML(<table>, <strong>, <ruby>)は変換しない', () => {
    const html = '<table><tr><td><strong>標準</strong></td></tr></table>';
    expect(htmlForRichCopy(html)).toBe(html);
    const rubyHtml = '<ruby>漢字<rt>かんじ</rt></ruby>';
    expect(htmlForRichCopy(rubyHtml)).toBe(rubyHtml);
  });

  it('複合:全 markup 入りの fixture でも整合性が崩れない', () => {
    const src = [
      '<p data-pkc-align="center">中央 <mark>注目</mark></p>',
      '<p data-pkc-indent="1">字下げ + <em class="pkc-em-dot">圏点</em></p>',
      '<hr class="pkc-section-break" data-pkc-role="section">',
      '<div class="pkc-blank-line" data-pkc-blank-count="2" aria-hidden="true"></div>',
      '<figcaption class="pkc-fig-caption">図 1: cap</figcaption>',
    ].join('');
    const out = htmlForRichCopy(src);
    expect(out).toContain('text-align: center');
    expect(out).toContain('text-indent: 1em');
    expect(out).toContain('background-color: #fff59d');
    expect(out).toContain('text-emphasis: filled dot');
    expect(out).toContain('border-top:');
    expect(out).toContain('text-align: center');
    // blank-line div × 2 → <p>&nbsp;</p> × 2
    expect((out.match(/&nbsp;/g) ?? []).length).toBe(2);
  });

  it('境界:何も markup なしの素 HTML は変化なし', () => {
    const html = '<p>素のテキスト</p><p><strong>強調</strong></p>';
    expect(htmlForRichCopy(html)).toBe(html);
  });
});
