import { describe, it, expect } from 'vitest';
import type { Entry } from '@core/model/record';
import {
  autoDetectFilerProfile,
  classifyEntryForAutoProfile,
} from '@features/filer/auto-display-profile';

/**
 * Folder auto-detect (PR-G G15) 7-割多数決のロジック。
 *
 * Pure function なので happy-dom 不要、純 vitest で高速 verify。
 */

function mkEntry(overrides: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: overrides.lid,
    title: overrides.lid,
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mkAttachment(lid: string, mime: string): Entry {
  return mkEntry({
    lid,
    archetype: 'attachment',
    body: JSON.stringify({ name: lid, mime, asset_key: lid }),
  });
}

function mkBookText(lid: string): Entry {
  return mkEntry({
    lid,
    body: '---\nkind: book\nurl: https://www.amazon.co.jp/dp/X\n---\nbody',
  });
}

function mkVideoText(lid: string): Entry {
  return mkEntry({
    lid,
    body: '---\nkind: video\n---\nbody',
  });
}

function mkAudioText(lid: string): Entry {
  return mkEntry({
    lid,
    body: '---\nkind: audio\n---\nbody',
  });
}

describe('classifyEntryForAutoProfile', () => {
  it('attachment with image MIME → image', () => {
    expect(classifyEntryForAutoProfile(mkAttachment('a1', 'image/png'))).toBe('image');
    expect(classifyEntryForAutoProfile(mkAttachment('a2', 'image/jpeg'))).toBe('image');
  });

  it('attachment with non-image MIME → other', () => {
    expect(classifyEntryForAutoProfile(mkAttachment('a3', 'application/pdf'))).toBe('other');
    expect(classifyEntryForAutoProfile(mkAttachment('a4', 'audio/mpeg'))).toBe('other');
  });

  it('text frontmatter kind: book → book', () => {
    expect(classifyEntryForAutoProfile(mkBookText('b1'))).toBe('book');
  });

  it('text frontmatter kind: video → video', () => {
    expect(classifyEntryForAutoProfile(mkVideoText('v1'))).toBe('video');
  });

  it('text frontmatter kind: music / podcast → audio', () => {
    expect(classifyEntryForAutoProfile(mkEntry({ lid: 'm1', body: '---\nkind: music\n---' }))).toBe('audio');
    expect(classifyEntryForAutoProfile(mkEntry({ lid: 'p1', body: '---\nkind: podcast\n---' }))).toBe('audio');
    expect(classifyEntryForAutoProfile(mkAudioText('au1'))).toBe('audio');
  });

  it('text with YouTube URL in body → video', () => {
    expect(classifyEntryForAutoProfile(mkEntry({
      lid: 'yt1',
      body: 'See https://www.youtube.com/watch?v=abc',
    }))).toBe('video');
  });

  it('text with Amazon URL in frontmatter → book', () => {
    expect(classifyEntryForAutoProfile(mkEntry({
      lid: 'b2',
      body: '---\nurl: https://www.amazon.co.jp/dp/X\n---\nnote',
    }))).toBe('book');
  });

  it('plain text → other', () => {
    expect(classifyEntryForAutoProfile(mkEntry({ lid: 't1', body: 'hello world' }))).toBe('other');
  });

  it('folder archetype → other (folders are not classified)', () => {
    expect(classifyEntryForAutoProfile(mkEntry({ lid: 'f1', archetype: 'folder' }))).toBe('other');
  });
});

describe('autoDetectFilerProfile (7-割多数決)', () => {
  it('empty children → explorer', () => {
    expect(autoDetectFilerProfile([])).toEqual({ kind: 'explorer' });
  });

  it('100% images → contact-sheet', () => {
    const kids = [
      mkAttachment('i1', 'image/png'),
      mkAttachment('i2', 'image/png'),
      mkAttachment('i3', 'image/jpeg'),
    ];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'contact-sheet' });
  });

  it('70% images → contact-sheet (threshold met)', () => {
    const kids = [
      mkAttachment('i1', 'image/png'),
      mkAttachment('i2', 'image/png'),
      mkAttachment('i3', 'image/png'),
      mkAttachment('i4', 'image/png'),
      mkAttachment('i5', 'image/png'),
      mkAttachment('i6', 'image/png'),
      mkAttachment('i7', 'image/png'),
      mkEntry({ lid: 't1' }),
      mkEntry({ lid: 't2' }),
      mkEntry({ lid: 't3' }),
    ];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'contact-sheet' });
  });

  it('60% images → explorer (threshold NOT met)', () => {
    const kids = [
      mkAttachment('i1', 'image/png'),
      mkAttachment('i2', 'image/png'),
      mkAttachment('i3', 'image/png'),
      mkAttachment('i4', 'image/png'),
      mkAttachment('i5', 'image/png'),
      mkAttachment('i6', 'image/png'),
      mkEntry({ lid: 't1' }),
      mkEntry({ lid: 't2' }),
      mkEntry({ lid: 't3' }),
      mkEntry({ lid: 't4' }),
    ];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'explorer' });
  });

  it('100% books → book-base', () => {
    const kids = [mkBookText('b1'), mkBookText('b2'), mkBookText('b3')];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'book-base' });
  });

  it('100% videos → video-base', () => {
    const kids = [mkVideoText('v1'), mkVideoText('v2')];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'video-base' });
  });

  it('100% audio → audio-base', () => {
    const kids = [mkAudioText('a1'), mkAudioText('a2')];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'audio-base' });
  });

  it('mixed 50/50 → explorer', () => {
    const kids = [
      mkAttachment('i1', 'image/png'),
      mkAttachment('i2', 'image/png'),
      mkBookText('b1'),
      mkBookText('b2'),
    ];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'explorer' });
  });

  it('priority: image beats book when both at 70%', () => {
    // image and book each at exactly 70% would be unusual but verify priority.
    const kids = [
      mkAttachment('i1', 'image/png'),
      mkAttachment('i2', 'image/png'),
      mkAttachment('i3', 'image/png'),
      mkAttachment('i4', 'image/png'),
      mkAttachment('i5', 'image/png'),
      mkAttachment('i6', 'image/png'),
      mkAttachment('i7', 'image/png'),
      mkBookText('b1'),
      mkBookText('b2'),
      mkBookText('b3'),
    ];
    // 70% images, 30% books → contact-sheet wins
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'contact-sheet' });
  });

  it('all "other" → explorer fallback', () => {
    const kids = [
      mkEntry({ lid: 't1', body: 'plain' }),
      mkEntry({ lid: 't2', body: 'text' }),
    ];
    expect(autoDetectFilerProfile(kids)).toEqual({ kind: 'explorer' });
  });
});
