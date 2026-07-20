/** @vitest-environment happy-dom */
/**
 * #940 — FSA 再接続バナーの unit test。
 * permission prompt での silent fallback を可視化し、user gesture で
 * requestPermission → reload へ繋ぐ常駐 UI。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showFsaReconnectBanner } from '@adapter/platform/fsa-reconnect-banner';

beforeEach(() => {
  document.body.innerHTML = '';
});

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('FSA 再接続バナー(#940)', () => {
  it('フォルダ名入りで表示され、idempotent', () => {
    const b1 = showFsaReconnectBanner({ folderName: 'MyNotes', onReconnect: async () => true });
    expect(b1.getAttribute('data-pkc-region')).toBe('fsa-reconnect');
    expect(b1.textContent).toContain('MyNotes');
    expect(b1.textContent).toContain('再接続');
    const b2 = showFsaReconnectBanner({ folderName: 'Other', onReconnect: async () => true });
    expect(b2).toBe(b1); // 二重表示しない
  });

  it('再接続ボタンで onReconnect が呼ばれる(user gesture 経路)', async () => {
    const onReconnect = vi.fn(async () => true);
    const banner = showFsaReconnectBanner({ folderName: 'F', onReconnect });
    banner.querySelector<HTMLButtonElement>('[data-pkc-action="fsa-reconnect"]')!.click();
    await flush();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('拒否(false)ならボタンが復活し、案内文言がエラーに変わる', async () => {
    const banner = showFsaReconnectBanner({ folderName: 'F', onReconnect: async () => false });
    const btn = banner.querySelector<HTMLButtonElement>('[data-pkc-action="fsa-reconnect"]')!;
    btn.click();
    await flush();
    expect(btn.disabled).toBe(false);
    expect(banner.textContent).toContain('許可されませんでした');
  });

  it('× で閉じられる(このまま別データで続行)', () => {
    const banner = showFsaReconnectBanner({ folderName: 'F', onReconnect: async () => true });
    banner.querySelector<HTMLButtonElement>('[data-pkc-action="dismiss-fsa-reconnect"]')!.click();
    expect(document.querySelector('[data-pkc-region="fsa-reconnect"]')).toBeNull();
  });
});
