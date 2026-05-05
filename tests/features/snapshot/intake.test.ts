import { describe, it, expect } from 'vitest';
import { snapshotToEntryDraft, decodeSnapshotParam } from '@features/snapshot/intake';
import type { PKC2Snapshot } from '@features/snapshot/types';
import { isSnapshot } from '@features/snapshot/types';

describe('isSnapshot', () => {
  it('accepts well-formed snapshot', () => {
    expect(isSnapshot({ format: 'pkc2-fragment-snapshot', version: 1 })).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot({ format: 'other' })).toBe(false);
    expect(isSnapshot({ format: 'pkc2-fragment-snapshot', version: 2 })).toBe(false);
  });
});

describe('snapshotToEntryDraft', () => {
  it('renders YouTube fragment as kind=video', () => {
    const s: PKC2Snapshot = {
      format: 'pkc2-fragment-snapshot',
      version: 1,
      fragment: {
        source: 'https://www.youtube.com/watch?v=abc',
        locator_kind: 'time',
        locator: { kind: 'time', start_sec: 130 },
        open_uri: 'https://www.youtube.com/watch?v=abc&t=130',
        label: '2:10',
      },
      selection: { title: 'Sample video', snippet: 'A short clip.' },
      captured_at: '2026-05-05T12:00:00Z',
    };
    const out = snapshotToEntryDraft(s);
    expect(out.title).toBe('Sample video');
    expect(out.body).toContain('kind: video');
    expect(out.body).toContain('url: https://www.youtube.com/watch?v=abc&t=130');
    expect(out.body).toMatch(/fragment_label:\s*("?2:10"?)/);
    expect(out.body).toContain('captured_at: 2026-05-05T12:00:00Z');
    expect(out.body).toContain('# Sample video');
    expect(out.body).toContain('A short clip.');
  });

  it('handles snapshot with selection only (no fragment)', () => {
    const s: PKC2Snapshot = {
      format: 'pkc2-fragment-snapshot',
      version: 1,
      selection: {
        title: 'Article title',
        snippet: 'First paragraph.',
        url: 'https://example.com/article',
      },
      comment: 'Read this later',
    };
    const out = snapshotToEntryDraft(s);
    expect(out.title).toBe('Article title');
    expect(out.body).toContain('url: https://example.com/article');
    expect(out.body).toContain('## Memo');
    expect(out.body).toContain('Read this later');
  });

  it('falls back to Snapshot title when nothing else is available', () => {
    const s: PKC2Snapshot = { format: 'pkc2-fragment-snapshot', version: 1 };
    const out = snapshotToEntryDraft(s);
    expect(out.title).toBe('Snapshot');
  });
});

describe('decodeSnapshotParam', () => {
  it('decodes raw JSON', () => {
    const v = decodeSnapshotParam('{"format":"pkc2-fragment-snapshot","version":1}');
    expect(isSnapshot(v)).toBe(true);
  });

  it('decodes base64-encoded JSON', () => {
    const json = '{"format":"pkc2-fragment-snapshot","version":1}';
    const b64 = (typeof btoa === 'function') ? btoa(json) : Buffer.from(json).toString('base64');
    const v = decodeSnapshotParam(b64);
    expect(isSnapshot(v)).toBe(true);
  });

  it('returns null on garbage', () => {
    expect(isSnapshot(decodeSnapshotParam('not-base64-or-json'))).toBe(false);
  });

  it('decodes UTF-8 via base64', () => {
    const json = '{"format":"pkc2-fragment-snapshot","version":1,"selection":{"title":"日本語"}}';
    const b64 = Buffer.from(json, 'utf-8').toString('base64');
    const v = decodeSnapshotParam(b64);
    expect(isSnapshot(v)).toBe(true);
    expect((v as PKC2Snapshot).selection?.title).toBe('日本語');
  });
});
