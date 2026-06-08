/**
 * @vitest-environment happy-dom
 *
 * user direction 2026-05-28「blob url を含むマークダウンテキストの貼付時に、PKC の
 * アセットとして書き込みし、アセットの埋め込みとしてインライン再現できますか？」
 *
 * `rewriteBlobUrlsToAssets` の挙動:
 * - 単 blob URL を asset 化、`asset:<key>` に置換
 * - 同 blob URL の複数 occurrence を dedup(1 度だけ fetch、同 key で全置換)
 * - 複数 blob URL を全件処理
 * - fetch 失敗 を fallback(URL 維持、errors[] に格納)
 * - blob URL 不在の markdown は no-op(processedCount=0)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rewriteBlobUrlsToAssets, hasBlobUrlImageMarkdown } from '@adapter/ui/paste-blob-url-rewrite';

function makeFakeDispatcher() {
  const dispatched: { type: string; [key: string]: unknown }[] = [];
  return {
    dispatched,
    dispatch(action: { type: string; [key: string]: unknown }): void {
      dispatched.push(action);
    },
    getState(): unknown {
      return null;
    },
    onState(): () => void {
      return () => {};
    },
    onEvent(): () => void {
      return () => {};
    },
  };
}

function mockFetchResponse(content: string, mime: string): void {
  // happy-dom の fetch を mock。Response を作って blob() を解決させる。
  const buf = new TextEncoder().encode(content);
  const blob = new Blob([buf], { type: mime });
  vi.stubGlobal('fetch', async (url: string) => {
    void url;
    return new Response(blob, { status: 200, headers: { 'Content-Type': mime } });
  });
}

function mockFetchError(): void {
  vi.stubGlobal('fetch', async (url: string) => {
    void url;
    throw new Error('Network error');
  });
}

describe('rewriteBlobUrlsToAssets(user direction 2026-05-28)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('case 1: 単 blob URL を asset 化 + markdown 置換', async () => {
    mockFetchResponse('fake-image-data', 'image/png');
    const disp = makeFakeDispatcher();
    const text = '![my image](blob:null/abc-123)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.processedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.rewrittenText).toMatch(/^!\[my image\]\(asset:att-blob-/);
    expect(disp.dispatched).toHaveLength(1);
    expect(disp.dispatched[0]!.type).toBe('PASTE_ATTACHMENT');
    expect(disp.dispatched[0]!.contextLid).toBe('lid-1');
    expect(disp.dispatched[0]!.mime).toBe('image/png');
  });

  it('case 2: 同 blob URL 複数 occurrence は dedup(1 fetch、全置換)', async () => {
    const fetchSpy = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const disp = makeFakeDispatcher();
    const text = '![a](blob:null/same)\n\n![b](blob:null/same)\n\n![c](blob:null/same)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // dedup
    expect(disp.dispatched).toHaveLength(1); // 1 asset
    expect(result.processedCount).toBe(1);
    // 同 asset key で 3 occurrence 全置換
    const assetMatches = result.rewrittenText.match(/asset:att-blob-/g);
    expect(assetMatches?.length).toBe(3);
  });

  it('case 3: 複数の異なる blob URL を全件処理', async () => {
    let i = 0;
    vi.stubGlobal('fetch', async () => {
      i++;
      return new Response(new Blob([new Uint8Array([i])], { type: 'image/png' }), { status: 200 });
    });
    const disp = makeFakeDispatcher();
    const text = '![a](blob:null/aaa) and ![b](blob:null/bbb) and ![c](blob:null/ccc)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.processedCount).toBe(3);
    expect(disp.dispatched).toHaveLength(3);
    // 3 つの独立 asset key で置換、blob: は残ってない
    expect(result.rewrittenText).not.toContain('blob:');
    expect(result.rewrittenText.match(/asset:att-blob-/g)?.length).toBe(3);
  });

  it('case 4: fetch 失敗時 fallback(URL 維持、errors[] に格納)', async () => {
    mockFetchError();
    const disp = makeFakeDispatcher();
    const text = '![broken](blob:null/dead)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Network error');
    // URL は維持
    expect(result.rewrittenText).toBe(text);
    // dispatch は発火していない
    expect(disp.dispatched).toHaveLength(0);
  });

  it('case 5: HTTP 4xx / 5xx は failure として扱う', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }));
    const disp = makeFakeDispatcher();
    const text = '![](blob:null/missing)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('404');
  });

  it('case 6: blob URL 不在の markdown は no-op(全 fetch 不発火)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const disp = makeFakeDispatcher();
    const text = '# heading\n\n![normal](https://example.com/x.png)\n\nplain text';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.rewrittenText).toBe(text);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('case 7: 部分 success(複数 URL、一部 fetch 成功、一部 失敗)', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('good')) {
        return new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }), { status: 200 });
      }
      throw new Error('bad blob');
    });
    const disp = makeFakeDispatcher();
    const text = '![ok](blob:null/good-1) and ![bad](blob:null/bad-1) and ![ok2](blob:null/good-2)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.processedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    // 成功は asset:、失敗は blob: のまま
    expect(result.rewrittenText).toContain('asset:att-blob-');
    expect(result.rewrittenText).toContain('blob:null/bad-1');
    expect(result.rewrittenText).not.toContain('blob:null/good-');
  });

  it('case 8: alt text 保持(`![alt](blob:...)` → `![alt](asset:KEY)`)', async () => {
    mockFetchResponse('img', 'image/gif');
    const disp = makeFakeDispatcher();
    const text = '![Image with **markdown** alt](blob:null/x)';
    const result = await rewriteBlobUrlsToAssets(text, {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.rewrittenText).toMatch(/^!\[Image with \*\*markdown\*\* alt\]\(asset:/);
  });

  it('case 9: PASTE_ATTACHMENT dispatch の payload(name / mime / size / contextLid / assetData)', async () => {
    const blobContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG signature start
    vi.stubGlobal('fetch', async () => new Response(new Blob([blobContent], { type: 'image/jpeg' }), { status: 200 }));
    const disp = makeFakeDispatcher();
    await rewriteBlobUrlsToAssets('![](blob:null/x)', {
      contextLid: 'lid-x',
      dispatcher: disp as never,
    });
    const payload = disp.dispatched[0]!;
    expect(payload.type).toBe('PASTE_ATTACHMENT');
    expect(payload.contextLid).toBe('lid-x');
    expect(payload.mime).toBe('image/jpeg');
    expect(payload.size).toBe(4);
    expect(typeof payload.assetKey).toBe('string');
    expect((payload.assetKey as string).startsWith('att-blob-')).toBe(true);
    expect(typeof payload.assetData).toBe('string'); // base64
    expect(typeof payload.name).toBe('string');
  });

  it('case 10: 空 text は no-op', async () => {
    const disp = makeFakeDispatcher();
    const result = await rewriteBlobUrlsToAssets('', {
      contextLid: 'lid-1',
      dispatcher: disp as never,
    });
    expect(result.processedCount).toBe(0);
    expect(result.rewrittenText).toBe('');
  });
});

describe('hasBlobUrlImageMarkdown', () => {
  it('blob: 入り markdown image を true 判定', () => {
    expect(hasBlobUrlImageMarkdown('![](blob:null/x)')).toBe(true);
    expect(hasBlobUrlImageMarkdown('text\n\n![alt](blob:null/abc) trailing')).toBe(true);
  });

  it('blob: 不在 / 非 image link は false 判定', () => {
    expect(hasBlobUrlImageMarkdown('')).toBe(false);
    expect(hasBlobUrlImageMarkdown('plain text')).toBe(false);
    expect(hasBlobUrlImageMarkdown('![normal](https://x.com/a.png)')).toBe(false);
    expect(hasBlobUrlImageMarkdown('[link text](blob:null/x)')).toBe(false); // link は対象外
  });

  it('global regex の lastIndex 干渉なし(複数回 call で同 result)', () => {
    const text = '![](blob:null/x)';
    expect(hasBlobUrlImageMarkdown(text)).toBe(true);
    expect(hasBlobUrlImageMarkdown(text)).toBe(true);
    expect(hasBlobUrlImageMarkdown(text)).toBe(true);
  });
});
