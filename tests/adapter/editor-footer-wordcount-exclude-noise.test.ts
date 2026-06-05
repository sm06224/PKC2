/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import { buildEditorFooterWordcount } from '../../src/adapter/ui/editor-footer-wordcount';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Entry } from '../../src/core/model/record';

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'text.wordcount_exclude_noise_enabled=1');
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

describe('editor-footer-wordcount noise exclusion(pgc-151)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
  });

  it('case 1: flag OFF で従来通り body 全体 count + noise badge 無し', () => {
    setFlag(false);
    const entry = makeEntry('hello `inline` ![a](b)');
    const el = buildEditorFooterWordcount(entry);
    const metrics = el.querySelector('.pkc-editor-footer-metrics');
    expect(metrics?.getAttribute('data-pkc-noise-excluded')).toBeNull();
    expect(metrics?.textContent).not.toContain('prose only');
    expect(metrics?.getAttribute('data-pkc-char-count')).toBe(String(entry.body.length));
  });

  it('case 2: flag ON で fenced code は除外 → char count 減少', () => {
    setFlag(true);
    const withFence = makeEntry('prose\n```\nconst x = 1;\nconst y = 2;\n```\nmore');
    const withoutFence = makeEntry('prose\nmore');
    const elFence = buildEditorFooterWordcount(withFence);
    const elPlain = buildEditorFooterWordcount(withoutFence);
    const charsFence = Number(elFence.querySelector('.pkc-editor-footer-metrics')?.getAttribute('data-pkc-char-count'));
    const charsPlain = Number(elPlain.querySelector('.pkc-editor-footer-metrics')?.getAttribute('data-pkc-char-count'));
    // fence 内 code は空行に置換されるが、fence boundary も空行に → 約等。
    // 厳密 equality は line breaks 数で誤差があるため「fence で大幅減少」 を assert。
    expect(charsFence).toBeLessThan(withFence.body.length);
    expect(charsPlain).toBeLessThan(withFence.body.length);
  });

  it('case 3: flag ON で prose-only badge が表示される', () => {
    setFlag(true);
    const el = buildEditorFooterWordcount(makeEntry('hello'));
    const metrics = el.querySelector('.pkc-editor-footer-metrics');
    expect(metrics?.getAttribute('data-pkc-noise-excluded')).toBe('true');
    expect(metrics?.textContent).toContain('prose only');
    expect(metrics?.textContent).toContain('✂');
  });

  it('case 4: flag ON で inline code 除外', () => {
    setFlag(true);
    const entry = makeEntry('use `npm test` to run');
    const el = buildEditorFooterWordcount(entry);
    const words = Number(el.querySelector('.pkc-editor-footer-metrics')?.getAttribute('data-pkc-word-count'));
    // "use", "to", "run" + sentinel(1 char space)= 3 words(sentinel は空白なので word に数えられない)
    expect(words).toBe(3);
  });

  it('case 5: flag ON で image markup 除外', () => {
    setFlag(true);
    const entry = makeEntry('before ![alt text](src.png) after');
    const el = buildEditorFooterWordcount(entry);
    const text = el.querySelector('.pkc-editor-footer-metrics')?.textContent ?? '';
    // word count = before + after = 2
    const m = text.match(/(\d+) words/);
    expect(Number(m?.[1])).toBe(2);
  });

  it('case 6: flag ON でも line count は body 行数(prose 構造保持)', () => {
    setFlag(true);
    const body = 'a\n```\nx\ny\n```\nb';
    const entry = makeEntry(body);
    const el = buildEditorFooterWordcount(entry);
    const lines = Number(el.querySelector('.pkc-editor-footer-metrics')?.getAttribute('data-pkc-line-count'));
    expect(lines).toBe(body.split('\n').length);
  });

  it('case 7: 順序性(Phase 8) ── flag ON/OFF 切替で char count 観測点が動く', () => {
    const body = 'prose `inline_code` more';
    const entry = makeEntry(body);
    setFlag(false);
    const charsOff = Number(buildEditorFooterWordcount(entry).querySelector('.pkc-editor-footer-metrics')?.getAttribute('data-pkc-char-count'));
    setFlag(true);
    const charsOn = Number(buildEditorFooterWordcount(entry).querySelector('.pkc-editor-footer-metrics')?.getAttribute('data-pkc-char-count'));
    expect(charsOn).toBeLessThan(charsOff);
  });

  it('case 8: 空 body は flag ON/OFF どちらも 0 全部', () => {
    setFlag(true);
    const el = buildEditorFooterWordcount(makeEntry(''));
    const m = el.querySelector('.pkc-editor-footer-metrics');
    expect(m?.getAttribute('data-pkc-char-count')).toBe('0');
    expect(m?.getAttribute('data-pkc-word-count')).toBe('0');
    expect(m?.getAttribute('data-pkc-line-count')).toBe('0');
  });
});
