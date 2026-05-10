/**
 * reform-2026-05 Phase 2 PR-2I:AI-safe profile 追加 test。
 */
import { describe, it, expect } from 'vitest';
import { resolveProfile, listProfiles, type NotationProfileName } from '@features/notation/profiles';

describe('pkc-markdown-1.0-ai-safe profile(reform Phase 2 PR-2I)', () => {
  it('listProfiles に含まれる', () => {
    const names = listProfiles();
    expect(names).toContain('pkc-markdown-1.0-ai-safe');
  });

  it('resolveProfile で feature set が返る(pkc-markdown-1.0 base)', () => {
    const features = resolveProfile('pkc-markdown-1.0-ai-safe');
    const baseFeatures = resolveProfile('pkc-markdown-1.0');
    // base 同等(現時点では profile name で identification できれば十分)
    expect(features).toEqual(baseFeatures);
  });

  it('未知 profile は default に fallback(警告 console.warn)', () => {
    const orig = console.warn;
    console.warn = () => {/* silent for test */};
    try {
      const features = resolveProfile('bogus-profile' as NotationProfileName);
      expect(features).toEqual(resolveProfile('pkc-markdown-1.0'));
    } finally {
      console.warn = orig;
    }
  });
});
