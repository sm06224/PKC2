// @vitest-environment happy-dom
/**
 * 拡張紐付けレジストリ(#806 一括実装 4/6)。
 * 紐付け = standing opt-in、既定送り先は紐付け済みのみ・取消可能(G3)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadExtensionBindings,
  bindExtension,
  unbindExtension,
  isExtensionBound,
  setDefaultTarget,
  getDefaultTarget,
  clearDefaultTarget,
  matchKeyForArchetype,
  matchKeyForMime,
  matchKeyForEntry,
  __resetExtensionBindingsCacheForTest,
  EXTENSION_BINDINGS_KEY,
} from '@adapter/platform/extension-bindings';

beforeEach(() => {
  __resetExtensionBindingsCacheForTest();
  localStorage.clear();
});

describe('bind / unbind', () => {
  it('bind は冪等、isBound で確認', () => {
    bindExtension('ext1');
    bindExtension('ext1');
    expect(loadExtensionBindings().bound).toEqual(['ext1']);
    expect(isExtensionBound('ext1')).toBe(true);
    expect(isExtensionBound('ext2')).toBe(false);
  });

  it('unbind は既定送り先からも除去(整合)', () => {
    bindExtension('ext1');
    setDefaultTarget(matchKeyForArchetype('text'), 'ext1');
    expect(getDefaultTarget(matchKeyForArchetype('text'))).toBe('ext1');
    unbindExtension('ext1');
    expect(isExtensionBound('ext1')).toBe(false);
    expect(getDefaultTarget(matchKeyForArchetype('text'))).toBeNull();
  });
});

describe('default target', () => {
  it('紐付け済みのみ既定にできる', () => {
    expect(setDefaultTarget(matchKeyForMime('application/pdf'), 'extX')).toBe(false);
    bindExtension('extX');
    expect(setDefaultTarget(matchKeyForMime('application/pdf'), 'extX')).toBe(true);
    expect(getDefaultTarget(matchKeyForMime('application/pdf'))).toBe('extX');
  });

  it('clear で取消できる(G3 可視・取消)', () => {
    bindExtension('extX');
    setDefaultTarget(matchKeyForArchetype('todo'), 'extX');
    clearDefaultTarget(matchKeyForArchetype('todo'));
    expect(getDefaultTarget(matchKeyForArchetype('todo'))).toBeNull();
  });

  it('紐付け解除済みを指す既定は null に縮退(getter 側整合)', () => {
    bindExtension('extX');
    setDefaultTarget(matchKeyForMime('image/png'), 'extX');
    // localStorage を直接いじって解除状態を作る(別タブ等の競合を模す)。
    localStorage.setItem(EXTENSION_BINDINGS_KEY, JSON.stringify({ bound: [], defaults: { 'mime:image/png': 'extX' } }));
    __resetExtensionBindingsCacheForTest();
    expect(getDefaultTarget(matchKeyForMime('image/png'))).toBeNull();
  });
});

describe('matchKeyForEntry', () => {
  it('attachment は mime 優先', () => {
    const body = JSON.stringify({ name: 'r.pdf', mime: 'application/pdf', asset_key: 'k' });
    expect(matchKeyForEntry({ archetype: 'attachment', body })).toBe('mime:application/pdf');
  });

  it('mime 不明の attachment は archetype に縮退', () => {
    expect(matchKeyForEntry({ archetype: 'attachment', body: '{}' })).toBe('archetype:attachment');
    expect(matchKeyForEntry({ archetype: 'attachment', body: 'not json' })).toBe('archetype:attachment');
  });

  it('非 attachment は archetype', () => {
    expect(matchKeyForEntry({ archetype: 'text', body: 'plain' })).toBe('archetype:text');
  });
});

describe('persistence', () => {
  it('localStorage に保存され、cache reset 後も読める', () => {
    bindExtension('e1');
    setDefaultTarget(matchKeyForArchetype('text'), 'e1');
    __resetExtensionBindingsCacheForTest();
    const b = loadExtensionBindings();
    expect(b.bound).toEqual(['e1']);
    expect(b.defaults).toEqual({ 'archetype:text': 'e1' });
  });

  it('壊れた JSON は空にフォールバック', () => {
    localStorage.setItem(EXTENSION_BINDINGS_KEY, '{not json');
    __resetExtensionBindingsCacheForTest();
    expect(loadExtensionBindings()).toEqual({ bound: [], defaults: {} });
  });
});
