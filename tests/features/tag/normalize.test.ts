import { describe, it, expect } from 'vitest';
import {
  normalizeTagInput,
  TAG_MAX_LENGTH,
  TAG_MAX_COUNT,
} from '@features/tag/normalize';

// W1 Slice F — normalizer R1-R8 from
// `docs/spec/tag-data-model-v1-minimum-scope.md` §4.2.
// NFC (R5) is deliberately NOT enforced in minimum scope.

describe('normalizeTagInput — accept path', () => {
  it('returns the trimmed value when input is valid', () => {
    const r = normalizeTagInput('urgent', []);
    expect(r).toEqual({ ok: true, value: 'urgent' });
  });

  it('R1 trims leading / trailing whitespace (ASCII)', () => {
    const r = normalizeTagInput('   hello   ', []);
    expect(r).toEqual({ ok: true, value: 'hello' });
  });

  it('R1 trims full-width spaces (Unicode-aware String.trim)', () => {
    const r = normalizeTagInput('　　hello　', []);
    expect(r).toEqual({ ok: true, value: 'hello' });
  });

  it('R6 preserves case verbatim', () => {
    const r = normalizeTagInput('Urgent', []);
    expect(r).toEqual({ ok: true, value: 'Urgent' });
  });

  it('accepts non-ASCII characters (Slice B R5 raw preservation, no NFC)', () => {
    const r = normalizeTagInput('日本語', []);
    expect(r).toEqual({ ok: true, value: '日本語' });
  });

  it('accepts a value up to TAG_MAX_LENGTH (boundary inclusive)', () => {
    const s = 'x'.repeat(TAG_MAX_LENGTH);
    const r = normalizeTagInput(s, []);
    expect(r).toEqual({ ok: true, value: s });
  });

  it('accepts inserting into a non-empty list when the value is not a duplicate', () => {
    const r = normalizeTagInput('review', ['urgent']);
    expect(r).toEqual({ ok: true, value: 'review' });
  });
});

describe('normalizeTagInput — reject path', () => {
  it('R2: empty string rejects', () => {
    expect(normalizeTagInput('', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('R2: whitespace-only rejects after R1 trim', () => {
    expect(normalizeTagInput('   ', [])).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeTagInput('　　', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('R3: value longer than TAG_MAX_LENGTH rejects', () => {
    const s = 'x'.repeat(TAG_MAX_LENGTH + 1);
    expect(normalizeTagInput(s, [])).toEqual({ ok: false, reason: 'too-long' });
  });

  it('R4: embedded newline rejects', () => {
    expect(normalizeTagInput('line\nbreak', [])).toEqual({ ok: false, reason: 'control-char' });
  });

  it('R4: embedded tab rejects', () => {
    expect(normalizeTagInput('tab\there', [])).toEqual({ ok: false, reason: 'control-char' });
  });

  it('R4: embedded CR rejects', () => {
    expect(normalizeTagInput('cr\rhere', [])).toEqual({ ok: false, reason: 'control-char' });
  });

  it('R4: DEL (0x7F) rejects', () => {
    expect(normalizeTagInput('a\x7fb', [])).toEqual({ ok: false, reason: 'control-char' });
  });

  it('R7: duplicate rejects (case-sensitive)', () => {
    expect(normalizeTagInput('urgent', ['urgent'])).toEqual({ ok: false, reason: 'duplicate' });
    // Different case is NOT a duplicate — Slice B R6 is case-sensitive.
    expect(normalizeTagInput('Urgent', ['urgent'])).toEqual({ ok: true, value: 'Urgent' });
  });

  it('R7: duplicate still rejects after R1 trim', () => {
    expect(normalizeTagInput('  urgent  ', ['urgent'])).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('R8: cap-reached rejects BEFORE other validation (friendlier error)', () => {
    const full = Array.from({ length: TAG_MAX_COUNT }, (_, i) => `t${i}`);
    // Even the empty string, which would be an R2 error with room,
    // now returns cap-reached because the entry is full.
    expect(normalizeTagInput('', full)).toEqual({ ok: false, reason: 'cap-reached' });
    expect(normalizeTagInput('new-tag', full)).toEqual({ ok: false, reason: 'cap-reached' });
  });
});

describe('normalizeTagInput — purity', () => {
  it('does not mutate the existingTags array', () => {
    const existing = ['a', 'b'];
    const snapshot = [...existing];
    normalizeTagInput('c', existing);
    expect(existing).toEqual(snapshot);
  });

  it('same input + same existingTags → same result (deterministic)', () => {
    const existing = ['urgent'];
    const a = normalizeTagInput('review', existing);
    const b = normalizeTagInput('review', existing);
    expect(a).toEqual(b);
  });
});
