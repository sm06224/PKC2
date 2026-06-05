/**
 * @vitest-environment happy-dom
 *
 * Phase γ-A3 A3-4:main window reload guard。
 *
 * `shouldGuardReload` の判定(flag × 子 window 有無)と、
 * `installMainReloadGuard` が `beforeunload` を実際に guard する
 * end-to-end を検証する。reform-2026-05 Phase 8 順序性:flag / 状態 →
 * consumer(beforeunload handler)の挙動が `e.defaultPrevented` という
 * user-visible 観測点で変化することまで assert する。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import {
  shouldGuardReload,
  installMainReloadGuard,
} from '@adapter/ui/main-reload-guard';

describe('main reload guard (Phase γ-A3 A3-4)', () => {
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    teardown = null;
  });

  afterEach(() => {
    if (teardown) {
      teardown();
      teardown = null;
    }
  });

  function enableFlag(): void {
    setContainerFlagSource({ 'shell.main_reload_guard': true });
  }

  function fireBeforeUnload(): boolean {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  }

  // ── shouldGuardReload(純粋判定)──

  it('flag OFF:子 window 無し → guard しない', () => {
    expect(shouldGuardReload([])).toBe(false);
  });

  it('flag OFF:子 window あり → guard しない(flag が gate)', () => {
    expect(shouldGuardReload(['e1'])).toBe(false);
  });

  it('flag ON:子 window 無し → guard しない', () => {
    enableFlag();
    expect(shouldGuardReload([])).toBe(false);
  });

  it('flag ON:子 window 1 つ → guard する', () => {
    enableFlag();
    expect(shouldGuardReload(['e1'])).toBe(true);
  });

  it('flag ON:子 window 複数 → guard する', () => {
    enableFlag();
    expect(shouldGuardReload(['e1', 'e2', 'e3'])).toBe(true);
  });

  // ── installMainReloadGuard(beforeunload end-to-end)──

  it('flag ON + 子 window あり:beforeunload が prevent される', () => {
    enableFlag();
    teardown = installMainReloadGuard(() => ['e1']);
    expect(fireBeforeUnload()).toBe(true);
  });

  it('flag ON + 子 window 無し:beforeunload は prevent されない', () => {
    enableFlag();
    teardown = installMainReloadGuard(() => []);
    expect(fireBeforeUnload()).toBe(false);
  });

  it('flag OFF + 子 window あり:beforeunload は prevent されない', () => {
    teardown = installMainReloadGuard(() => ['e1']);
    expect(fireBeforeUnload()).toBe(false);
  });

  it('getOpenWindowLids は呼出ごとに評価される(window が後から開く)', () => {
    enableFlag();
    let lids: string[] = [];
    teardown = installMainReloadGuard(() => lids);
    expect(fireBeforeUnload()).toBe(false); // まだ子 window 無し
    lids = ['e1']; // 子 window が開いた
    expect(fireBeforeUnload()).toBe(true); // 次の reload で guard
  });

  it('teardown 後は guard しない', () => {
    enableFlag();
    teardown = installMainReloadGuard(() => ['e1']);
    expect(fireBeforeUnload()).toBe(true);
    teardown();
    teardown = null;
    expect(fireBeforeUnload()).toBe(false);
  });
});
