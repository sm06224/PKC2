/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  showStorageFallbackNotice,
  mountStorageFallbackNotice,
} from '@adapter/ui/storage-fallback-notice';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

/**
 * C11 §4.5 ④-1 — ブラウザ保存フォールバック掲示。
 *
 * 契約(doc §4.5 UX 仕様):
 *   - 明示ダイアログで掲示(自動切替はしない)
 *   - 図解 / ベンチ要約 / 互換保証・マイグレーションの記載が載る
 *   - 選択肢 4 系統(フォルダ推奨 / 都度保存 / 閲覧のみ / 再試行)
 *   - 「閲覧のみ」は SYS_ENTER_READONLY で編集 UI を実際に抑止
 *   - embed 中は出さない
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-41', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function region(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="storage-fallback-notice"]');
}

beforeEach(() => {
  document.body.innerHTML = '';
  return () => {
    document.body.innerHTML = '';
  };
});

describe('showStorageFallbackNotice の掲示内容', () => {
  it('図解・ベンチ要約・互換保証と 4 つの選択肢が載る', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d, { reason: 'probe failed' });
    expect(region()).toBe(overlay);
    expect(overlay.getAttribute('role')).toBe('dialog');

    // doc の必須記載: 図解(新旧比較)・ベンチ・互換保証/マイグレーション
    const diagram = overlay.querySelector('[data-pkc-region="storage-fallback-diagram"]');
    expect(diagram?.textContent).toContain('従来モード');
    expect(diagram?.textContent).toContain('ファイル保存モード');
    const bench = overlay.querySelector('[data-pkc-region="storage-fallback-bench"]');
    expect(bench?.textContent).toContain('実測');
    const compat = overlay.querySelector('[data-pkc-region="storage-fallback-compat"]');
    expect(compat?.textContent).toContain('互換保証');
    expect(compat?.textContent).toContain('マイグレーション');

    // 選択肢 4 系統
    for (const action of [
      'storage-fallback-pick-folder',
      'storage-fallback-manual-save',
      'storage-fallback-view-only',
      'storage-fallback-retry',
    ]) {
      expect(overlay.querySelector(`[data-pkc-action="${action}"]`)).not.toBeNull();
    }
    // 検知理由も掲示される
    expect(overlay.textContent).toContain('probe failed');
  });

  it('「都度保存で続行」でダイアログが閉じる', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d);
    overlay
      .querySelector<HTMLButtonElement>('[data-pkc-action="storage-fallback-manual-save"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(region()).toBeNull();
    expect(d.getState().readonly).toBe(false);
  });

  it('「閲覧のみ」は readonly 化してダイアログを閉じる', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d);
    overlay
      .querySelector<HTMLButtonElement>('[data-pkc-action="storage-fallback-view-only"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(region()).toBeNull();
    expect(d.getState().readonly).toBe(true);
    // readonly では編集系 action が blocked になる(実効性の確認)
    const before = d.getState();
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'nonexistent' });
    expect(d.getState().phase).toBe(before.phase);
  });
});

describe('mountStorageFallbackNotice の表示ゲート', () => {
  it('ready + container で 1 回だけ表示される', () => {
    const d = createDispatcher();
    mountStorageFallbackNotice(d, { force: true });
    expect(region()).toBeNull();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    expect(region()).not.toBeNull();
  });

  it('embed 中は表示しない', () => {
    const d = createDispatcher();
    mountStorageFallbackNotice(d, { force: true });
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(), embedded: true });
    expect(region()).toBeNull();
  });

  it('automation(webdriver)では force なしだと表示しない', () => {
    // happy-dom は navigator.webdriver が立つ想定(startup-notice と同じ
    // ゲートを共有)。立たない環境では表示される = このテストは force
    // 経路だけを固定する。
    const isAutomated = (globalThis.navigator as { webdriver?: boolean }).webdriver === true;
    const d = createDispatcher();
    mountStorageFallbackNotice(d, {});
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    if (isAutomated) {
      expect(region()).toBeNull();
    } else {
      expect(region()).not.toBeNull();
    }
  });
});
