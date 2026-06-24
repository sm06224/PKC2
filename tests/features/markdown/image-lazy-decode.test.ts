/**
 * 描画画像の遅延デコード(メモリ:画面外画像のデコード後ビットマップ常駐を抑制)。
 * user direction(2026-06-24、メモリ削減)。data-safe(描画ヒントのみ)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('rendered <img> は lazy + async decode', () => {
  it('外部 image に loading=lazy / decoding=async が付く', () => {
    const html = renderMarkdown('![alt](https://example.com/x.png)');
    expect(html).toMatch(/<img[^>]*\bloading="lazy"/);
    expect(html).toMatch(/<img[^>]*\bdecoding="async"/);
  });

  it('data: 埋め込み画像にも付く(デコード遅延の主目的)', () => {
    const html = renderMarkdown('![](data:image/png;base64,iVBORw0KGgo=)');
    expect(html).toMatch(/\bloading="lazy"/);
    expect(html).toMatch(/\bdecoding="async"/);
  });
});
