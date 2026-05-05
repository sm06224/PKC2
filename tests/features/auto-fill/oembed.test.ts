import { describe, it, expect, vi } from 'vitest';
import {
  findOEmbedProvider,
  fetchOEmbed,
  oEmbedToFrontmatter,
  type OEmbedResponse,
} from '@features/auto-fill/oembed';

describe('findOEmbedProvider', () => {
  it('matches YouTube hosts', () => {
    expect(findOEmbedProvider('https://www.youtube.com/watch?v=abc')?.provider).toBe('YouTube');
    expect(findOEmbedProvider('https://m.youtube.com/watch?v=abc')?.provider).toBe('YouTube');
    expect(findOEmbedProvider('https://youtu.be/abc')?.provider).toBe('YouTube');
  });

  it('matches Vimeo', () => {
    expect(findOEmbedProvider('https://vimeo.com/12345')?.provider).toBe('Vimeo');
  });

  it('returns null for unsupported hosts', () => {
    expect(findOEmbedProvider('https://nicovideo.jp/watch/sm1')).toBeNull();
    expect(findOEmbedProvider('not a url')).toBeNull();
  });
});

describe('fetchOEmbed', () => {
  it('hits the provider endpoint and returns the JSON body', async () => {
    const fakeResp: OEmbedResponse = {
      title: 'Sample',
      author_name: 'Channel',
      provider_name: 'YouTube',
      thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => fakeResp,
    } as unknown as Response));
    const out = await fetchOEmbed('https://www.youtube.com/watch?v=abc', fetchMock as unknown as typeof fetch);
    expect(out).toEqual(fakeResp);
    expect(fetchMock).toHaveBeenCalledOnce();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, ...unknown[]];
    const url = String(firstCall[0]);
    expect(url).toContain('youtube.com/oembed');
    expect(url).toContain('format=json');
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as unknown as Response));
    await expect(
      fetchOEmbed('https://www.youtube.com/watch?v=missing', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/404/);
  });

  it('throws on unsupported provider', async () => {
    await expect(fetchOEmbed('https://nicovideo.jp/watch/sm1')).rejects.toThrow(/No oEmbed provider/);
  });
});

describe('oEmbedToFrontmatter', () => {
  it('maps oEmbed fields to frontmatter keys', () => {
    const meta = oEmbedToFrontmatter(
      {
        title: 'Sample',
        author_name: 'Channel',
        provider_name: 'YouTube',
        thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      },
      'https://www.youtube.com/watch?v=abc',
    );
    expect(meta.kind).toBe('video');
    expect(meta.url).toBe('https://www.youtube.com/watch?v=abc');
    expect(meta.title).toBe('Sample');
    expect(meta.channel).toBe('Channel');
    expect(meta.provider).toBe('YouTube');
    expect(meta.thumbnail).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
  });

  it('omits fields the response did not carry', () => {
    const meta = oEmbedToFrontmatter({}, 'https://example.com/x');
    expect(meta).toEqual({ kind: 'video', url: 'https://example.com/x' });
  });
});
