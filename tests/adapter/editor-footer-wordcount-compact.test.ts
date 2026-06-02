/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildEditorFooterWordcount,
  formatCompactCount,
  formatReadTimeCompact,
} from '../../src/adapter/ui/editor-footer-wordcount';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Entry } from '../../src/core/model/record';

function setFlag(value: boolean, extraFlag?: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    const flags = ['text.wordcount_mobile_compact_enabled=1'];
    if (extraFlag) flags.push(extraFlag);
    for (const f of flags) {
      url.searchParams.append('pkc-flag', f);
    }
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function makeEntry(body: string): Entry {
  return {
    lid: 'lid_t',
    title: 'T',
    body,
    archetype: 'text',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  };
}

describe('formatCompactCount', () => {
  it('case 1: < 1000 はそのまま', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(999)).toBe('999');
  });

  it('case 2: 1000-9999 は 小数点 1 桁 + k', () => {
    expect(formatCompactCount(1000)).toBe('1.0k');
    expect(formatCompactCount(1234)).toBe('1.2k');
    expect(formatCompactCount(9999)).toBe('10.0k');
  });

  it('case 3: 10000+ は 整数 + k', () => {
    expect(formatCompactCount(10000)).toBe('10k');
    expect(formatCompactCount(15500)).toBe('16k');
    expect(formatCompactCount(123456)).toBe('123k');
  });
});

describe('formatReadTimeCompact', () => {
  it('case 4: 0 以下 → <1m', () => {
    expect(formatReadTimeCompact(0)).toBe('<1m');
    expect(formatReadTimeCompact(-5)).toBe('<1m');
  });

  it('case 5: 1 未満 → <1m', () => {
    expect(formatReadTimeCompact(0.5)).toBe('<1m');
  });

  it('case 6: 1 以上 → ~Nm', () => {
    expect(formatReadTimeCompact(1)).toBe('~1m');
    expect(formatReadTimeCompact(3.4)).toBe('~3m');
    expect(formatReadTimeCompact(15)).toBe('~15m');
  });
});

describe('editor-footer-wordcount compact mode(pgc-156)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
  });

  it('case 7: flag OFF で従来の冗長表記 + data-pkc-compact 無し', () => {
    setFlag(false);
    const el = buildEditorFooterWordcount(makeEntry('hello world'));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.getAttribute('data-pkc-compact')).toBeNull();
    expect(m?.textContent).toContain('chars');
    expect(m?.textContent).toContain('words');
  });

  it('case 8: flag ON で compact 表記 + data-pkc-compact="true"', () => {
    setFlag(true);
    const el = buildEditorFooterWordcount(makeEntry('hello world'));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.getAttribute('data-pkc-compact')).toBe('true');
    expect(m?.textContent).not.toContain('chars');
    expect(m?.textContent).not.toContain('words');
    expect(m?.textContent).toContain('w ·');
    expect(m?.textContent).toContain('l ·');
  });

  it('case 9: flag ON + 大文字数 で k 圧縮', () => {
    setFlag(true);
    const body = 'a'.repeat(1234);
    const el = buildEditorFooterWordcount(makeEntry(body));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.textContent).toContain('1.2k');
  });

  it('case 10: flag ON + noise 除外も同時 ON で compact + ✂ badge', () => {
    setFlag(true, 'text.wordcount_exclude_noise_enabled=1');
    const el = buildEditorFooterWordcount(makeEntry('plain `code` more'));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.getAttribute('data-pkc-compact')).toBe('true');
    expect(m?.getAttribute('data-pkc-noise-excluded')).toBe('true');
    expect(m?.textContent).toContain('✂');
    expect(m?.textContent).not.toContain('prose only'); // compact では短縮 mark
  });

  it('case 11: flag OFF + noise 除外 → 従来 noise badge(prose only)', () => {
    setFlag(false);
    // 別 URL flag のみ
    const url = new URL(window.location.href);
    url.searchParams.set('pkc-flag', 'text.wordcount_exclude_noise_enabled=1');
    window.history.replaceState({}, '', url.toString());
    __resetUrlCache();
    const el = buildEditorFooterWordcount(makeEntry('plain `code` more'));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.textContent).toContain('prose only');
  });

  it('case 12: flag ON + read time → ~Nm 表記', () => {
    setFlag(true);
    const body = 'word '.repeat(800); // 800 words → ~4 min
    const el = buildEditorFooterWordcount(makeEntry(body));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.textContent).toMatch(/~\dm$/);
  });

  it('case 13: 順序性(Phase 8) ── flag ON/OFF 切替で text content が変わる', () => {
    const body = 'hello world';
    setFlag(false);
    const off = buildEditorFooterWordcount(makeEntry(body)).querySelector('.pkc-editor-footer-metrics')?.textContent;
    setFlag(true);
    const on = buildEditorFooterWordcount(makeEntry(body)).querySelector('.pkc-editor-footer-metrics')?.textContent;
    expect(off).not.toBe(on);
    expect(off?.length).toBeGreaterThan(on?.length ?? 0);
  });

  it('case 14: data-pkc-char-count attr は数値で不変(compact は表示のみ)', () => {
    setFlag(true);
    const body = 'a'.repeat(5000);
    const el = buildEditorFooterWordcount(makeEntry(body));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.getAttribute('data-pkc-char-count')).toBe('5000');
  });
});
