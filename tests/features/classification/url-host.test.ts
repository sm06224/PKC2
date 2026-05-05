import { describe, it, expect } from 'vitest';
import { classifyUrl, classifyFirstUrlInBody, classifyFrontmatterUrl } from '@features/classification/url-host';

describe('classifyUrl', () => {
  it('returns null for empty / non-URL input', () => {
    expect(classifyUrl('')).toBeNull();
    expect(classifyUrl('not a url')).toBeNull();
    expect(classifyUrl('mailto:foo@example.com')).not.toBeNull();
  });

  it('classifies Amazon URLs as book', () => {
    expect(classifyUrl('https://www.amazon.co.jp/dp/B0DRABCDEF')?.kind).toBe('book');
    expect(classifyUrl('https://www.amazon.co.jp/dp/B0DRABCDEF')?.provider).toBe('Amazon');
    expect(classifyUrl('https://amazon.com/dp/B0DRABCDEF')?.kind).toBe('book');
  });

  it('classifies YouTube and niconico as video', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=xyz')?.kind).toBe('video');
    expect(classifyUrl('https://www.youtube.com/watch?v=xyz')?.provider).toBe('YouTube');
    expect(classifyUrl('https://youtu.be/xyz')?.kind).toBe('video');
    expect(classifyUrl('https://www.nicovideo.jp/watch/sm12345')?.provider).toBe('ニコニコ動画');
    expect(classifyUrl('https://vimeo.com/12345')?.kind).toBe('video');
  });

  it('classifies novel sites as novel', () => {
    expect(classifyUrl('https://ncode.syosetu.com/n1234ab/')?.kind).toBe('novel');
    expect(classifyUrl('https://ncode.syosetu.com/n1234ab/')?.provider).toBe('小説家になろう');
    expect(classifyUrl('https://kakuyomu.jp/works/12345')?.provider).toBe('カクヨム');
    expect(classifyUrl('https://www.aozora.gr.jp/cards/000148/files/789.html')?.kind).toBe('novel');
  });

  it('classifies music / podcast / academic URLs', () => {
    expect(classifyUrl('https://open.spotify.com/track/xyz')?.kind).toBe('music');
    expect(classifyUrl('https://podcasts.apple.com/jp/podcast/xyz')?.kind).toBe('podcast');
    expect(classifyUrl('https://arxiv.org/abs/2401.12345')?.kind).toBe('paper');
    expect(classifyUrl('https://doi.org/10.1234/abc')?.kind).toBe('paper');
  });

  it('returns kind=unknown but provider=host for unmapped sites', () => {
    const c = classifyUrl('https://example.com/foo');
    expect(c?.kind).toBe('unknown');
    expect(c?.provider).toBe('example.com');
  });
});

describe('classifyFirstUrlInBody', () => {
  it('extracts and classifies the first URL in markdown', () => {
    const body = '見たもの\n\n- https://www.youtube.com/watch?v=abc\n- https://www.amazon.co.jp/dp/B0\n';
    expect(classifyFirstUrlInBody(body)?.kind).toBe('video');
  });

  it('returns null when there is no URL', () => {
    expect(classifyFirstUrlInBody('# heading\nplain text\n')).toBeNull();
  });
});

describe('classifyFrontmatterUrl', () => {
  it('reads the url field from a meta object', () => {
    expect(classifyFrontmatterUrl({ url: 'https://www.amazon.co.jp/dp/B0' })?.kind).toBe('book');
    expect(classifyFrontmatterUrl({ url: 'https://nicovideo.jp/watch/sm1' })?.kind).toBe('video');
  });

  it('returns null when url is absent or non-string', () => {
    expect(classifyFrontmatterUrl({})).toBeNull();
    expect(classifyFrontmatterUrl({ url: 42 })).toBeNull();
  });
});
