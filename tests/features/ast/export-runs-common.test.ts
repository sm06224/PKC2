/**
 * docx ↔ pptx export 共通 helper の unit test。
 *
 * wave 規律 §4(2026-05-15 v23 stack follow-up wave):case matrix 最低 10 件 +
 * user 提供ケース必須。本 helper は asset 解決 / link 判定 / task 検出 /
 * base64 decode の 4 系統、計 30+ ケースで網羅。
 */
import { describe, it, expect } from 'vitest';
import {
  isInternalLink,
  extractEntryLidFromHref,
  detectTaskState,
  stripTaskPrefix,
  base64ToUint8Array,
  resolveImageData,
} from '@features/ast/export-runs-common';
import type { AstInline } from '@core/ast/index';
import type { Entry } from '@core/model/record';

describe('isInternalLink', () => {
  it('returns true for entry: scheme', () => {
    expect(isInternalLink('entry:abc123')).toBe(true);
  });

  it('returns true for pkc:// scheme', () => {
    expect(isInternalLink('pkc://cid/entry/lid')).toBe(true);
  });

  it('returns true for #log/ fragment(TEXTLOG deep-link)', () => {
    expect(isInternalLink('#log/2026-05-15T00:00:00Z')).toBe(true);
  });

  it('returns true for #day/ fragment(Calendar deep-link)', () => {
    expect(isInternalLink('#day/2026-05-15')).toBe(true);
  });

  it('returns true for generic #fragment', () => {
    expect(isInternalLink('#section-heading')).toBe(true);
  });

  it('returns false for http://', () => {
    expect(isInternalLink('http://example.com')).toBe(false);
  });

  it('returns false for https://', () => {
    expect(isInternalLink('https://example.com/path')).toBe(false);
  });

  it('returns false for mailto:', () => {
    expect(isInternalLink('mailto:user@example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isInternalLink('')).toBe(false);
  });

  it('returns false for relative path without #', () => {
    expect(isInternalLink('foo/bar.html')).toBe(false);
  });
});

describe('extractEntryLidFromHref', () => {
  it('extracts lid from entry:<lid>', () => {
    expect(extractEntryLidFromHref('entry:abc123')).toBe('abc123');
  });

  it('extracts lid from entry:<lid>#frag', () => {
    expect(extractEntryLidFromHref('entry:abc123#section-1')).toBe('abc123');
  });

  it('extracts lid from pkc://<cid>/entry/<lid>', () => {
    expect(extractEntryLidFromHref('pkc://container-1/entry/lid-xyz')).toBe('lid-xyz');
  });

  it('extracts lid from pkc://<cid>/entry/<lid>#frag', () => {
    expect(extractEntryLidFromHref('pkc://container-1/entry/lid-xyz#log/abc')).toBe('lid-xyz');
  });

  it('extracts lid from pkc://<cid>/entry/<lid>?query', () => {
    expect(extractEntryLidFromHref('pkc://container-1/entry/lid-xyz?v=1')).toBe('lid-xyz');
  });

  it('returns null for #log/ fragment(not entry: or pkc://)', () => {
    expect(extractEntryLidFromHref('#log/abc')).toBeNull();
  });

  it('returns null for http://', () => {
    expect(extractEntryLidFromHref('http://example.com')).toBeNull();
  });

  it('returns null for pkc:// without /entry/', () => {
    expect(extractEntryLidFromHref('pkc://container-1/asset/key')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractEntryLidFromHref('')).toBeNull();
  });

  it('handles entry: with empty lid', () => {
    expect(extractEntryLidFromHref('entry:')).toBe('');
  });
});

describe('detectTaskState', () => {
  const textInline = (value: string): AstInline => ({ kind: 'text', value });

  it('detects open task `[ ] xxx`', () => {
    expect(detectTaskState([textInline('[ ] do this')])).toBe('open');
  });

  it('detects done task `[x] xxx`', () => {
    expect(detectTaskState([textInline('[x] done')])).toBe('done');
  });

  it('detects done task `[X] xxx`(capital X)', () => {
    expect(detectTaskState([textInline('[X] done')])).toBe('done');
  });

  it('returns null for plain text', () => {
    expect(detectTaskState([textInline('plain paragraph')])).toBeNull();
  });

  it('returns null for empty inlines', () => {
    expect(detectTaskState([])).toBeNull();
  });

  it('returns null when first inline is not text', () => {
    expect(detectTaskState([{ kind: 'strong', children: [textInline('[ ] inside')] } as AstInline])).toBeNull();
  });

  it('returns null without trailing space `[x]xxx`(spec requires space)', () => {
    expect(detectTaskState([textInline('[x]no-space')])).toBeNull();
  });

  it('returns null for malformed `[abc] xxx`', () => {
    expect(detectTaskState([textInline('[abc] x')])).toBeNull();
  });

  it('detects task with multi-byte body', () => {
    expect(detectTaskState([textInline('[ ] 日本語タスク')])).toBe('open');
  });

  it('detects task with leading whitespace before regex(does NOT match — spec is line-start)', () => {
    expect(detectTaskState([textInline(' [ ] indented')])).toBeNull();
  });
});

describe('stripTaskPrefix', () => {
  const textInline = (value: string): AstInline => ({ kind: 'text', value });

  it('strips `[ ] ` prefix from first text inline', () => {
    const result = stripTaskPrefix([textInline('[ ] do this')]);
    expect(result).toEqual([textInline('do this')]);
  });

  it('strips `[x] ` prefix', () => {
    const result = stripTaskPrefix([textInline('[x] done')]);
    expect(result).toEqual([textInline('done')]);
  });

  it('strips `[X] ` prefix', () => {
    const result = stripTaskPrefix([textInline('[X] done')]);
    expect(result).toEqual([textInline('done')]);
  });

  it('keeps following inlines intact', () => {
    const strong: AstInline = { kind: 'strong', children: [textInline('bold')] } as AstInline;
    const result = stripTaskPrefix([textInline('[ ] head '), strong]);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(textInline('head '));
    expect(result[1]).toBe(strong);
  });

  it('returns copy unchanged when first is not text', () => {
    const strong: AstInline = { kind: 'strong', children: [textInline('foo')] } as AstInline;
    const result = stripTaskPrefix([strong]);
    expect(result).toEqual([strong]);
  });

  it('returns empty array for empty input', () => {
    expect(stripTaskPrefix([])).toEqual([]);
  });

  it('keeps text unchanged when no task prefix matches', () => {
    const result = stripTaskPrefix([textInline('plain text')]);
    expect(result).toEqual([textInline('plain text')]);
  });

  it('strips prefix preserving multi-byte body', () => {
    const result = stripTaskPrefix([textInline('[ ] 日本語タスク')]);
    expect(result).toEqual([textInline('日本語タスク')]);
  });

  it('only strips first match(no global replace)', () => {
    const result = stripTaskPrefix([textInline('[ ] [x] still here')]);
    expect(result).toEqual([textInline('[x] still here')]);
  });

  it('returns shallow-copied array(not mutating input)', () => {
    const input = [textInline('[ ] hello')];
    const result = stripTaskPrefix(input);
    expect(result).not.toBe(input);
  });
});

describe('base64ToUint8Array', () => {
  it('decodes basic ASCII text', () => {
    // "Hello" → base64 "SGVsbG8="
    const arr = base64ToUint8Array('SGVsbG8=');
    expect(Array.from(arr)).toEqual([72, 101, 108, 108, 111]);
  });

  it('decodes empty string to empty array', () => {
    const arr = base64ToUint8Array('');
    expect(arr.length).toBe(0);
  });

  it('decodes PNG magic header(89 50 4E 47)', () => {
    // PNG magic bytes 89 50 4E 47 0D 0A 1A 0A → base64 "iVBORw0KGgo="
    const arr = base64ToUint8Array('iVBORw0KGgo=');
    expect(arr[0]).toBe(0x89);
    expect(arr[1]).toBe(0x50);
    expect(arr[2]).toBe(0x4e);
    expect(arr[3]).toBe(0x47);
  });

  it('decodes JPEG magic header(FF D8 FF)', () => {
    // FF D8 FF → base64 "/9j/"(URL-unsafe)
    const arr = base64ToUint8Array('/9j/');
    expect(arr[0]).toBe(0xff);
    expect(arr[1]).toBe(0xd8);
    expect(arr[2]).toBe(0xff);
  });

  it('returns Uint8Array instance', () => {
    const arr = base64ToUint8Array('AA==');
    expect(arr).toBeInstanceOf(Uint8Array);
  });
});

describe('resolveImageData', () => {
  const makeCtx = (
    assets: Record<string, string>,
    entries: Entry[] = [],
  ): { assets: Record<string, string>; entriesByLid: Map<string, Entry> } => ({
    assets,
    entriesByLid: new Map(entries.map((e) => [e.lid, e])),
  });

  const attachmentEntry = (lid: string, assetKey: string, mime: string): Entry => ({
    lid,
    title: 'attachment',
    archetype: 'attachment',
    body: JSON.stringify({ asset_key: assetKey, mime }),
  } as Entry);

  it('resolves asset:<key> with mime from owning attachment entry', () => {
    const ctx = makeCtx({ k1: 'BASE64DATA' }, [attachmentEntry('e1', 'k1', 'image/jpeg')]);
    expect(resolveImageData('asset:k1', ctx)).toEqual({ data: 'BASE64DATA', mime: 'image/jpeg' });
  });

  it('resolves pkc://<cid>/asset/<key>(PR-V20 form)', () => {
    const ctx = makeCtx({ k1: 'BASE64DATA' }, [attachmentEntry('e1', 'k1', 'image/png')]);
    expect(resolveImageData('pkc://c1/asset/k1', ctx)).toEqual({ data: 'BASE64DATA', mime: 'image/png' });
  });

  it('falls back to image/png mime when no owning attachment found', () => {
    const ctx = makeCtx({ k1: 'BASE64' });
    expect(resolveImageData('asset:k1', ctx)).toEqual({ data: 'BASE64', mime: 'image/png' });
  });

  it('resolves data:image/<mime>;base64,<data> inline URI', () => {
    expect(resolveImageData('data:image/gif;base64,R0lGOD', makeCtx({})))
      .toEqual({ data: 'R0lGOD', mime: 'image/gif' });
  });

  it('returns null for unresolvable asset:key', () => {
    expect(resolveImageData('asset:missing', makeCtx({}))).toBeNull();
  });

  it('returns null for non-image data: URI', () => {
    expect(resolveImageData('data:text/plain;base64,SGVsbG8=', makeCtx({}))).toBeNull();
  });

  it('returns null for pkc:// without /asset/', () => {
    expect(resolveImageData('pkc://c1/entry/lid1', makeCtx({}))).toBeNull();
  });

  it('returns null for http:// URLs(external image not handled)', () => {
    expect(resolveImageData('http://example.com/foo.png', makeCtx({}))).toBeNull();
  });

  it('handles attachment entry with invalid JSON body(silent ignore + png fallback)', () => {
    const badEntry: Entry = { lid: 'e1', title: '', archetype: 'attachment', body: 'not-json' } as Entry;
    const ctx = makeCtx({ k1: 'DATA' }, [badEntry]);
    expect(resolveImageData('asset:k1', ctx)).toEqual({ data: 'DATA', mime: 'image/png' });
  });

  it('ignores non-attachment entries with same asset_key', () => {
    const textEntry: Entry = {
      lid: 'e1',
      title: '',
      archetype: 'text',
      body: JSON.stringify({ asset_key: 'k1', mime: 'image/jpeg' }),
    } as Entry;
    const ctx = makeCtx({ k1: 'DATA' }, [textEntry]);
    expect(resolveImageData('asset:k1', ctx)).toEqual({ data: 'DATA', mime: 'image/png' });
  });
});
