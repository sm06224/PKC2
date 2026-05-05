import { describe, it, expect, afterEach } from 'vitest';
import {
  parseFragment,
  buildFragmentUri,
  registerFragmentConverter,
  _resetRuntimeConverters,
} from '@features/fragment/registry';
import { parseYouTubeTime } from '@features/fragment/converters/youtube';

afterEach(() => _resetRuntimeConverters());

describe('parseYouTubeTime', () => {
  it('parses raw seconds (including 0 = start of video)', () => {
    expect(parseYouTubeTime('133')).toBe(133);
    expect(parseYouTubeTime('0')).toBe(0);
  });
  it('parses h/m/s combos', () => {
    expect(parseYouTubeTime('2m13s')).toBe(2 * 60 + 13);
    expect(parseYouTubeTime('1h2m3s')).toBe(3600 + 120 + 3);
    expect(parseYouTubeTime('45s')).toBe(45);
  });
  it('returns null on garbage', () => {
    expect(parseYouTubeTime('xyz')).toBe(null);
    expect(parseYouTubeTime('')).toBe(null);
  });
});

describe('YouTube converter', () => {
  it('parses ?t= seconds', () => {
    const c = parseFragment('https://www.youtube.com/watch?v=abc&t=130');
    expect(c?.locator_kind).toBe('time');
    expect(c?.locator).toEqual({ kind: 'time', start_sec: 130 });
    expect(c?.label).toBe('2:10');
  });
  it('parses ?start= seconds', () => {
    const c = parseFragment('https://youtu.be/abc?start=200');
    expect(c?.locator).toEqual({ kind: 'time', start_sec: 200 });
  });
  it('parses #t=2m13s', () => {
    const c = parseFragment('https://www.youtube.com/watch?v=abc#t=2m13s');
    expect(c?.locator).toEqual({ kind: 'time', start_sec: 133 });
  });
  it('round-trips through buildFragmentUri', () => {
    const c = parseFragment('https://www.youtube.com/watch?v=abc&t=130');
    const uri = buildFragmentUri(c!);
    expect(uri).toContain('t=130');
  });
  it('returns null when no fragment present', () => {
    expect(parseFragment('https://www.youtube.com/watch?v=abc')).toBeNull();
  });
});

describe('Vimeo converter', () => {
  it('parses #t=2m10s', () => {
    const c = parseFragment('https://vimeo.com/12345#t=2m10s');
    expect(c?.locator_kind).toBe('time');
    expect((c!.locator as { start_sec: number }).start_sec).toBe(130);
  });
});

describe('niconico converter', () => {
  it('parses ?from=130', () => {
    const c = parseFragment('https://www.nicovideo.jp/watch/sm123?from=130');
    expect(c?.locator).toEqual({ kind: 'time', start_sec: 130 });
  });
  it('rejects negative or non-numeric from', () => {
    expect(parseFragment('https://www.nicovideo.jp/watch/sm123?from=abc')).toBeNull();
    expect(parseFragment('https://www.nicovideo.jp/watch/sm123?from=-1')).toBeNull();
  });
});

describe('PDF page converter', () => {
  it('parses asset:KEY#page=42', () => {
    const c = parseFragment('asset:Knuth-vol1#page=245', { mime: 'application/pdf' });
    expect(c?.source).toBe('asset:Knuth-vol1');
    expect(c?.locator).toEqual({ kind: 'page', page: 245 });
    expect(c?.label).toBe('p. 245');
    expect(c?.open_uri).toBe('asset:Knuth-vol1#page=245');
  });
  it('parses page-range', () => {
    const c = parseFragment('asset:Foo#page=10-15', { mime: 'application/pdf' });
    expect(c?.locator).toEqual({ kind: 'page-range', page: 10, end_page: 15 });
    expect(c?.label).toBe('pp. 10–15');
  });
  it('round-trips', () => {
    const c = parseFragment('asset:K#page=99', { mime: 'application/pdf' });
    expect(buildFragmentUri(c!)).toBe('asset:K#page=99');
  });
});

describe('小説家になろう (syosetu) converter', () => {
  it('parses path-based episode', () => {
    const c = parseFragment('https://ncode.syosetu.com/n7975cr/28/');
    expect(c?.locator_kind).toBe('episode');
    expect((c!.locator as { episode: number }).episode).toBe(28);
    expect(c?.label).toContain('n7975cr');
    expect(c?.label).toContain('28');
  });
  it('returns null for cover page (no episode)', () => {
    expect(parseFragment('https://ncode.syosetu.com/n7975cr/')).toBeNull();
  });
  it('round-trips', () => {
    const c = parseFragment('https://ncode.syosetu.com/n7975cr/28/');
    expect(buildFragmentUri(c!)).toContain('/n7975cr/28/');
  });
});

describe('W3C text-fragment converter', () => {
  it('parses exact-only', () => {
    const c = parseFragment('https://example.com/foo#:~:text=hello%20world');
    expect(c?.locator).toEqual({ kind: 'text-quote', exact: 'hello world' });
  });
  it('parses prefix-,exact,suffix', () => {
    const c = parseFragment('https://example.com/foo#:~:text=before-,middle,after');
    expect(c?.locator).toEqual({
      kind: 'text-quote', exact: 'middle', prefix: 'before', suffix: 'after',
    });
  });
  it('round-trips', () => {
    const c = parseFragment('https://example.com/foo#:~:text=greeting');
    const uri = buildFragmentUri(c!);
    expect(uri).toContain('#:~:text=greeting');
  });
});

describe('internal-log converter', () => {
  it('parses entry:LID#log/ID', () => {
    const c = parseFragment('entry:abc-001#log/row-42');
    expect(c?.source).toBe('entry:abc-001');
    expect(c?.locator).toEqual({ kind: 'log', log_id: 'row-42' });
  });
  it('round-trips', () => {
    const c = parseFragment('entry:abc-001#log/row-42');
    expect(buildFragmentUri(c!)).toBe('entry:abc-001#log/row-42');
  });
});

describe('user-registered runtime converter', () => {
  it('falls through to user converter when no built-in matches', () => {
    const unregister = registerFragmentConverter({
      id: 'test-custom',
      match: (input) => input.startsWith('myproto:'),
      toCanonical: (input) => ({
        source: input,
        locator_kind: 'custom',
        locator: { kind: 'custom', data: { handled: true } },
      }),
      fromCanonical: (c) => c.source,
    });
    const c = parseFragment('myproto:foo');
    expect(c?.locator_kind).toBe('custom');
    expect((c!.locator as { kind: string; data: { handled: boolean } }).data.handled).toBe(true);
    unregister();
    expect(parseFragment('myproto:foo')).toBeNull();
  });
});

describe('parseFragment / buildFragmentUri integration', () => {
  it('returns null for unknown inputs', () => {
    expect(parseFragment('plain text')).toBeNull();
    expect(parseFragment('https://example.com/x')).toBeNull();
  });
});
