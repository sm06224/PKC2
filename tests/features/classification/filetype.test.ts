import { describe, it, expect } from 'vitest';
import {
  classifyByMime,
  classifyByFilename,
  classifyAsset,
} from '@features/classification/filetype';

describe('classifyByMime', () => {
  it('maps known MIMEs', () => {
    expect(classifyByMime('image/png')).toBe('image');
    expect(classifyByMime('video/mp4')).toBe('video');
    expect(classifyByMime('audio/mpeg')).toBe('audio');
    expect(classifyByMime('application/pdf')).toBe('document');
    expect(classifyByMime('application/epub+zip')).toBe('ebook');
    expect(classifyByMime('application/zip')).toBe('archive');
  });

  it('falls back to type prefix when mime is generic', () => {
    expect(classifyByMime('image/x-future')).toBe('image');
    expect(classifyByMime('audio/x-future')).toBe('audio');
    expect(classifyByMime('text/whatever')).toBe('document');
  });

  it('returns other for null / empty / unknown', () => {
    expect(classifyByMime(null)).toBe('other');
    expect(classifyByMime('')).toBe('other');
    expect(classifyByMime('application/x-mystery')).toBe('other');
  });
});

describe('classifyByFilename', () => {
  it('maps known extensions', () => {
    expect(classifyByFilename('foo.png')).toBe('image');
    expect(classifyByFilename('foo.JPG')).toBe('image');
    expect(classifyByFilename('foo.mp4')).toBe('video');
    expect(classifyByFilename('foo.pdf')).toBe('document');
    expect(classifyByFilename('foo.epub')).toBe('ebook');
    expect(classifyByFilename('foo.csv')).toBe('spreadsheet');
    expect(classifyByFilename('foo.tsx')).toBe('code');
  });

  it('returns other for unknown extensions', () => {
    expect(classifyByFilename('foo.unknownext')).toBe('other');
    expect(classifyByFilename('no-extension')).toBe('other');
  });
});

describe('classifyAsset', () => {
  it('uses mime first when present', () => {
    const c = classifyAsset({ mime: 'image/png', filename: 'foo.bin' });
    expect(c.kind).toBe('image');
    expect(c.mime).toBe('image/png');
  });

  it('falls back to filename when mime is missing', () => {
    const c = classifyAsset({ filename: 'foo.epub' });
    expect(c.kind).toBe('ebook');
    expect(c.ext).toBe('epub');
  });

  it('extracts MIME from data: URLs', () => {
    const c = classifyAsset({ dataUrl: 'data:image/png;base64,abc==' });
    expect(c.mime).toBe('image/png');
    expect(c.kind).toBe('image');
  });
});
