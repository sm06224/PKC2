import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_PROFILE,
  resolveProfile,
  resolveEffectiveFeatures,
  listProfiles,
  isPkcMarkdownProfile,
  type NotationFeatures,
  type NotationProfileName,
} from '@features/notation/profiles';

describe('features/notation/profiles — registry', () => {
  it('default profile = pkc-markdown-1.0', () => {
    expect(DEFAULT_PROFILE).toBe('pkc-markdown-1.0');
  });

  it('listProfiles で 6 profile 全部返す', () => {
    const list = listProfiles();
    expect(list).toEqual(
      expect.arrayContaining([
        'commonmark',
        'gfm',
        'pandoc',
        'obsidian',
        'pkc-markdown-1.0',
        'pkc-markdown-experimental',
      ]),
    );
    expect(list.length).toBe(6);
  });

  it('isPkcMarkdownProfile:`pkc-markdown-*` なら true', () => {
    expect(isPkcMarkdownProfile('pkc-markdown-1.0')).toBe(true);
    expect(isPkcMarkdownProfile('pkc-markdown-experimental')).toBe(true);
    expect(isPkcMarkdownProfile('pkc-markdown-2.0')).toBe(true);  // 将来 version
    expect(isPkcMarkdownProfile('commonmark')).toBe(false);
    expect(isPkcMarkdownProfile('gfm')).toBe(false);
  });
});

describe('resolveProfile — feature set 解決', () => {
  it('null / undefined / 未指定 → default profile', () => {
    expect(resolveProfile(null)).toEqual(resolveProfile('pkc-markdown-1.0'));
    expect(resolveProfile(undefined)).toEqual(resolveProfile('pkc-markdown-1.0'));
  });

  it('commonmark — 全 PKC 拡張 off', () => {
    const f = resolveProfile('commonmark');
    expect(f.highlight).toBe(false);
    expect(f.emDot).toBe(false);
    expect(f.ruby).toBe(false);
    expect(f.variables).toBe(false);
    expect(f.taskList).toBe(false);
    expect(f.cardPrefix).toBe(false);
    expect(f.embedSeamless).toBe(false);
  });

  it('gfm — taskList のみ on(commonmark に追加)', () => {
    const f = resolveProfile('gfm');
    expect(f.taskList).toBe(true);
    expect(f.highlight).toBe(false);
    expect(f.cardPrefix).toBe(false);
  });

  it('pandoc — gfm + footnote 系 + autoNumberedRef', () => {
    const f = resolveProfile('pandoc');
    expect(f.taskList).toBe(true);
    expect(f.footnoteRef).toBe(true);
    expect(f.footnoteInline).toBe(true);
    expect(f.autoNumberedRef).toBe(true);
    expect(f.cardPrefix).toBe(false);  // Pandoc 標準には card 概念なし
  });

  it('obsidian — gfm + comment + highlight', () => {
    const f = resolveProfile('obsidian');
    expect(f.taskList).toBe(true);
    expect(f.comment).toBe(true);
    expect(f.highlight).toBe(true);
    expect(f.cardPrefix).toBe(false);
  });

  it('pkc-markdown-1.0 — 全 PKC Markdown feature on', () => {
    const f = resolveProfile('pkc-markdown-1.0');
    expect(f.highlight).toBe(true);
    expect(f.emDot).toBe(true);
    expect(f.ruby).toBe(true);
    expect(f.simpleInlineAttrs).toBe(true);
    expect(f.variables).toBe(true);
    expect(f.taskList).toBe(true);
    expect(f.cardPrefix).toBe(true);
    expect(f.embedSeamless).toBe(true);
    expect(f.embedQuoteAttribute).toBe(true);
    expect(f.quoteBlockDirective).toBe(true);
    expect(f.mathInline).toBe(true);
    expect(f.mathBlock).toBe(true);
    expect(f.footnoteRef).toBe(true);
    expect(f.footnoteInline).toBe(true);
    expect(f.blockDirective).toBe(true);
    expect(f.inlineRole).toBe(true);
  });

  it('pkc-markdown-experimental ⊇ pkc-markdown-1.0', () => {
    const f10 = resolveProfile('pkc-markdown-1.0');
    const fEx = resolveProfile('pkc-markdown-experimental');
    // experimental は 1.0 の super-set であるべき
    for (const key of Object.keys(f10) as (keyof NotationFeatures)[]) {
      if (f10[key] === true) {
        expect(fEx[key], `feature ${key} should still be enabled in experimental`).toBe(true);
      }
    }
  });

  it('未知 profile → default fallback + console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = resolveProfile('not-a-real-profile' as NotationProfileName);
    expect(f).toEqual(resolveProfile('pkc-markdown-1.0'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown notation profile "not-a-real-profile"'),
    );
    warnSpy.mockRestore();
  });
});

describe('resolveEffectiveFeatures — profile + override', () => {
  it('overrides 無し時は base profile そのまま', () => {
    const base = resolveProfile('pkc-markdown-1.0');
    const eff = resolveEffectiveFeatures('pkc-markdown-1.0');
    expect(eff).toEqual(base);
  });

  it('部分 override が base に重なる', () => {
    const eff = resolveEffectiveFeatures('pkc-markdown-1.0', { ruby: false });
    expect(eff.ruby).toBe(false);
    // 他 feature は base のまま
    expect(eff.highlight).toBe(true);
    expect(eff.emDot).toBe(true);
  });

  it('override で commonmark に拡張を追加できる(profile boost)', () => {
    const eff = resolveEffectiveFeatures('commonmark', { taskList: true, highlight: true });
    expect(eff.taskList).toBe(true);
    expect(eff.highlight).toBe(true);
    expect(eff.ruby).toBe(false);  // 未 override
  });

  it('未知 profile + override → default fallback + override', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const eff = resolveEffectiveFeatures('unknown' as NotationProfileName, { ruby: false });
    // default に fallback、ruby は override で false
    expect(eff.ruby).toBe(false);
    expect(eff.emDot).toBe(true);  // default 1.0 の値が来る
    warnSpy.mockRestore();
  });
});
