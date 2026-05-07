/**
 * parseCaptureJson + isCaptureJsonFilename tests (PR-QQ, 2026-05-06).
 *
 * Bookmarklet DL モードが書き出す `.pkc-capture.json` を import
 * 経路で受理するための pure helper。PKC-Message v1 envelope 形式の
 * structural validate と offer payload の field 範囲を確認。
 */
import { describe, it, expect } from 'vitest';
import {
  parseCaptureJson,
  isCaptureJsonFilename,
} from '@features/auto-fill/parse-capture-json';

const SAMPLE_ENVELOPE = {
  protocol: 'pkc-message',
  version: 1,
  type: 'record:offer',
  source_id: 'extension:pkc2-bookmarklet@1.1-dl',
  target_id: null,
  timestamp: '2026-05-06T12:00:00Z',
  payload: {
    title: 'Captured page',
    body: '# Captured page\n\nSelected excerpt',
    source_url: 'https://example.com/article',
    captured_at: '2026-05-06T12:00:00Z',
    kind: 'novel',
    provider: 'カクヨム',
    thumbnail_url: 'https://example.com/cover.png',
    author: '山田太郎',
  },
};

describe('parseCaptureJson', () => {
  it('parses a well-formed v1 record:offer envelope', () => {
    const parsed = parseCaptureJson(JSON.stringify(SAMPLE_ENVELOPE));
    expect(parsed).not.toBeNull();
    expect(parsed!.timestamp).toBe('2026-05-06T12:00:00Z');
    expect(parsed!.payload.title).toBe('Captured page');
    expect(parsed!.payload.kind).toBe('novel');
    expect(parsed!.payload.provider).toBe('カクヨム');
    expect(parsed!.payload.author).toBe('山田太郎');
    expect(parsed!.payload.thumbnail_url).toBe('https://example.com/cover.png');
  });

  it('returns null on malformed JSON', () => {
    expect(parseCaptureJson('{not json')).toBeNull();
  });

  it('returns null when protocol is not pkc-message', () => {
    const env = { ...SAMPLE_ENVELOPE, protocol: 'something-else' };
    expect(parseCaptureJson(JSON.stringify(env))).toBeNull();
  });

  it('returns null when version is not 1', () => {
    const env = { ...SAMPLE_ENVELOPE, version: 2 };
    expect(parseCaptureJson(JSON.stringify(env))).toBeNull();
  });

  it('returns null when type is not record:offer', () => {
    const env = { ...SAMPLE_ENVELOPE, type: 'record:reject' };
    expect(parseCaptureJson(JSON.stringify(env))).toBeNull();
  });

  it('returns null when payload is missing title or body', () => {
    const env = { ...SAMPLE_ENVELOPE, payload: { body: 'b' } };
    expect(parseCaptureJson(JSON.stringify(env))).toBeNull();
    const env2 = { ...SAMPLE_ENVELOPE, payload: { title: 't' } };
    expect(parseCaptureJson(JSON.stringify(env2))).toBeNull();
  });

  it('drops unknown kind values silently (kind becomes undefined)', () => {
    const env = {
      ...SAMPLE_ENVELOPE,
      payload: { ...SAMPLE_ENVELOPE.payload, kind: 'invalid-kind' },
    };
    const parsed = parseCaptureJson(JSON.stringify(env));
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.kind).toBeUndefined();
  });

  it('round-trips the v1.1 additive fields(brand / pages / isbn / duration_sec)', () => {
    const env = {
      ...SAMPLE_ENVELOPE,
      payload: {
        title: 'Mouse',
        body: '# Mouse',
        kind: 'book',
        brand: 'Logicool',
        pages: 320,
        isbn: '978-4-04-104268-3',
        duration_sec: 7200,
      },
    };
    const parsed = parseCaptureJson(JSON.stringify(env));
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.brand).toBe('Logicool');
    expect(parsed!.payload.pages).toBe(320);
    expect(parsed!.payload.isbn).toBe('978-4-04-104268-3');
    expect(parsed!.payload.duration_sec).toBe(7200);
  });
});

describe('isCaptureJsonFilename', () => {
  it('matches `.pkc-capture.json`', () => {
    expect(isCaptureJsonFilename('foo.pkc-capture.json')).toBe(true);
    expect(isCaptureJsonFilename('PKC2-CAPTURE-2026-05-06.pkc-capture.json')).toBe(true);
  });

  it('matches `.pkc-capture` (legacy)', () => {
    expect(isCaptureJsonFilename('foo.pkc-capture')).toBe(true);
  });

  it('rejects regular .json filenames', () => {
    expect(isCaptureJsonFilename('container.json')).toBe(false);
    expect(isCaptureJsonFilename('settings.json')).toBe(false);
  });

  it('rejects HTML / ZIP filenames', () => {
    expect(isCaptureJsonFilename('export.html')).toBe(false);
    expect(isCaptureJsonFilename('backup.pkc2.zip')).toBe(false);
  });

  it('case-insensitive', () => {
    expect(isCaptureJsonFilename('Foo.PKC-Capture.JSON')).toBe(true);
  });
});
