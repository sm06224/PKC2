/**
 * #926 — URL 起動タイルの擬似リダイレクトページ生成(pure)unit test。
 */
import { describe, it, expect } from 'vitest';
import { isLaunchableUrl, buildUrlRedirectHtml, urlTileFilename } from '@features/launcher/url-tile';

describe('isLaunchableUrl', () => {
  it('http / https のみ許可、危険スキームは拒否', () => {
    expect(isLaunchableUrl('https://example.com/path?q=1')).toBe(true);
    expect(isLaunchableUrl('http://192.168.1.1:8080/')).toBe(true);
    expect(isLaunchableUrl('  https://example.com  ')).toBe(true);
    expect(isLaunchableUrl('javascript:alert(1)')).toBe(false);
    expect(isLaunchableUrl('file:///etc/passwd')).toBe(false);
    expect(isLaunchableUrl('data:text/html,hi')).toBe(false);
    expect(isLaunchableUrl('example.com')).toBe(false);
    expect(isLaunchableUrl('')).toBe(false);
  });
});

describe('buildUrlRedirectHtml', () => {
  it('no-referrer meta + location.replace + noreferrer fallback link + meta refresh を持つ', () => {
    const html = buildUrlRedirectHtml({ url: 'https://example.com/x', title: '社内ポータル' })!;
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('location.replace("https://example.com/x")');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('http-equiv="refresh" content="1;url=https://example.com/x"');
    expect(html).toContain('<title>社内ポータル</title>');
  });

  it('title / URL の特殊文字を escape する(XSS 防御)', () => {
    const html = buildUrlRedirectHtml({
      url: 'https://example.com/?a="x"&b=<s>',
      title: '<script>alert(1)</script>',
    })!;
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    // 属性内 URL は quote escape 済み
    expect(html).toContain('&quot;x&quot;');
    // JS リテラルは JSON escape(</script> 分断なし)
    expect(html).not.toMatch(/location\.replace\("[^"]*"x"/);
  });

  it('不正 URL は null(タイル化を拒否)', () => {
    expect(buildUrlRedirectHtml({ url: 'javascript:alert(1)' })).toBeNull();
    expect(buildUrlRedirectHtml({ url: 'notaurl' })).toBeNull();
  });

  it('title 省略時は URL を表示名にする', () => {
    const html = buildUrlRedirectHtml({ url: 'https://example.com/' })!;
    expect(html).toContain('<title>https://example.com/</title>');
  });
});

describe('urlTileFilename', () => {
  it('危険文字を落として .url.html を付ける', () => {
    expect(urlTileFilename('社内 ポータル/2026')).toBe('社内-ポータル-2026.url.html');
    expect(urlTileFilename('   ')).toBe('url-tile.url.html');
  });
});
