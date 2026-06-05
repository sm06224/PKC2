/**
 * 領域 6:`:::details` 折りたたみブロック方言。
 *
 * 任意位置の content を native `<details>` / `<summary>` で畳む。
 *   :::details{summary="クリックで開く" open}
 *   折りたたまれる本文。
 *   :::
 *
 * - `summary` 属性 = 畳んだ時の見出し(空白区切り attr、quoted で
 *   空白・CJK 可)。省略時「詳細」。
 * - `open` フラグ = 既定展開(無指定は native <details> 準拠で畳んだ状態)。
 * - レンダラがトークン生成、ユーザーは生 HTML を書かない(`html:false` 維持)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown, hasMarkdownSyntax } from '@features/markdown/markdown-render';

describe('領域 6:::details 折りたたみブロック', () => {
  it('summary 付き basic — <details class="pkc-details"> + <summary> + 本文', () => {
    const html = renderMarkdown(':::details{summary="クリックで開く"}\n本文テキスト\n:::');
    expect(html).toContain('<details class="pkc-details">');
    expect(html).toMatch(/<summary class="pkc-details-summary">クリックで開く<\/summary>/);
    expect(html).toContain('本文テキスト');
    expect(html).toContain('</details>');
  });

  it('既定は畳んだ状態 — open 属性なし', () => {
    const html = renderMarkdown(':::details{summary="X"}\n本文\n:::');
    expect(html).toMatch(/<details class="pkc-details">/);
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it('{open} で既定展開 — <details ... open>', () => {
    const html = renderMarkdown(':::details{summary="X" open}\n本文\n:::');
    expect(html).toMatch(/<details class="pkc-details" open>/);
  });

  it('summary 省略 → 既定ラベル「詳細」', () => {
    const html = renderMarkdown(':::details\n本文\n:::');
    expect(html).toMatch(/<summary class="pkc-details-summary">詳細<\/summary>/);
  });

  it('summary 空文字 → 「詳細」へ fallback', () => {
    const html = renderMarkdown(':::details{summary=""}\n本文\n:::');
    expect(html).toMatch(/<summary class="pkc-details-summary">詳細<\/summary>/);
  });

  it('CJK / 絵文字 summary を保持する', () => {
    const html = renderMarkdown(':::details{summary="補足説明 📌 詳しくは"}\n本文\n:::');
    expect(html).toContain('<summary class="pkc-details-summary">補足説明 📌 詳しくは</summary>');
  });

  it('summary 内の HTML 特殊文字を escape する', () => {
    const html = renderMarkdown(':::details{summary="a<b & c"}\n本文\n:::');
    expect(html).toContain('&lt;b');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<summary class="pkc-details-summary">a<b');
  });

  it('本文の markdown が render される', () => {
    const html = renderMarkdown(':::details{summary="X"}\n**強調**された本文\n:::');
    expect(html).toMatch(/<strong>強調<\/strong>/);
  });

  it('複数の :::details が独立して描画される', () => {
    const html = renderMarkdown(
      ':::details{summary="一つ目"}\nA\n:::\n\n:::details{summary="二つ目"}\nB\n:::',
    );
    expect((html.match(/<details class="pkc-details">/g) ?? []).length).toBe(2);
    expect(html).toContain('一つ目');
    expect(html).toContain('二つ目');
  });

  it(':::details の中に :::section をネストできる', () => {
    const html = renderMarkdown(
      ':::details{summary="外"}\n:::section{role=note}\n中身\n:::\n:::',
    );
    expect(html).toContain('<details class="pkc-details">');
    expect(html).toMatch(/<section[^>]*pkc-section-note/);
    expect(html).toContain('中身');
  });

  it('fenced code 内の :::details は処理されず literal 残置', () => {
    const html = renderMarkdown('```\n:::details{summary="X"}\n本文\n:::\n```');
    expect(html).not.toContain('<details class="pkc-details">');
    expect(html).toContain(':::details{summary=&quot;X&quot;}');
  });

  it('hasMarkdownSyntax が :::details のみの body を markdown と認識する', () => {
    // detail-presenter は hasMarkdownSyntax が true のときだけ renderMarkdown
    // 経路へ流す。:::details だけの body も render されるよう認識必須。
    expect(hasMarkdownSyntax(':::details{summary="X"}\n本文\n:::')).toBe(true);
    // 同時修正::::section のみの body も(従来欠落していた)。
    expect(hasMarkdownSyntax(':::section{role=note}\n本文\n:::')).toBe(true);
  });
});
