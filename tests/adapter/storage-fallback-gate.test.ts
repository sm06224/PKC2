/** @vitest-environment happy-dom */
/**
 * フォールバック掲示「📁 フォルダを選んで続行」の移行前 ZIP ゲート
 * (2026-07-24 追加)。
 *
 * 背景: この経路だけゲートが無かった。見送りの根拠「守るデータが未ロード」は
 * 誤りで、掲示は ready + container の時にしか出ず、成功パスでは reload 後の
 * boot(migrateFromIdbIfEmpty)が実 IDB データをフォルダへ移行する。
 *
 * 契約:
 *   - ゲートは saveFsaHandle より**前**に走る(順序)
 *   - ゲート失敗 → 切替せず(saveFsaHandle / setStorageBackendPref を呼ばず)
 *     ダイアログは**開いたまま**(別フォルダ再選択 / 都度保存へ逃げられる)
 *   - ゲート成功 → 従来どおり切替(handle 保存 → pref → close → flush → reload)
 *   - IDB 全滅(saveFsaHandle throw)でもゲートは走っており、従来どおり
 *     セッション内 sink 経路に入る
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Container } from '@core/model/container';

const calls: string[] = [];
const pickDirectoryMock = vi.fn();
const verifyMock = vi.fn();
const saveHandleMock = vi.fn();
const setPrefMock = vi.fn();
const gateMock = vi.fn();
const flushMock = vi.fn();
const flushNowMock = vi.fn();

vi.mock('@adapter/platform/storage/fsa-adapter', () => ({
  pickDirectory: (...a: unknown[]) => pickDirectoryMock(...a),
  verifyFsaPermission: (...a: unknown[]) => verifyMock(...a),
}));
vi.mock('@adapter/platform/storage/fsa-handle-store', () => ({
  saveFsaHandle: (...a: unknown[]) => { calls.push('saveFsaHandle'); return saveHandleMock(...a); },
}));
vi.mock('@adapter/platform/storage-backend', () => ({
  setStorageBackendPref: (...a: unknown[]) => { calls.push('setPref'); return setPrefMock(...a); },
}));
vi.mock('@adapter/platform/pre-migration-backup', () => ({
  writePreMigrationBackupZip: (...a: unknown[]) => { calls.push('gate'); return gateMock(...a); },
}));
vi.mock('@adapter/platform/persistence', () => ({
  flushActivePersistence: (...a: unknown[]) => { calls.push('flush'); return flushMock(...a); },
}));
vi.mock('@adapter/platform/folder-sink', () => ({
  mountFolderSink: () => ({ flushNow: (...a: unknown[]) => { calls.push('sink.flushNow'); return flushNowMock(...a); } }),
}));
vi.mock('@adapter/platform/idb-store', () => ({
  probeIDBAvailability: async () => ({ available: false, reason: 'test' }),
}));

import { showStorageFallbackNotice } from '@adapter/ui/storage-fallback-notice';
import { createDispatcher } from '@adapter/state/dispatcher';

const T = '2026-07-24T00:00:00Z';
function makeContainer(): Container {
  return {
    meta: { container_id: 'c-fb', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [], relations: [], revisions: [], assets: {},
  };
}

function region(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="storage-fallback-notice"]');
}

async function clickFolderAndSettle(overlay: HTMLElement): Promise<void> {
  overlay
    .querySelector<HTMLButtonElement>('[data-pkc-action="storage-fallback-pick-folder"]')!
    .click();
  // click handler 内の async チェーンを flush
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = '';
  calls.length = 0;
  pickDirectoryMock.mockReset().mockResolvedValue({ name: 'picked-dir' });
  verifyMock.mockReset().mockResolvedValue(true);
  saveHandleMock.mockReset().mockResolvedValue(undefined);
  setPrefMock.mockReset();
  gateMock.mockReset().mockResolvedValue({ filename: 'pkc2-pre-migration-backup.pkc2.zip' });
  flushMock.mockReset().mockResolvedValue(undefined);
  flushNowMock.mockReset().mockResolvedValue(undefined);
});

describe('フォールバック掲示の移行前 ZIP ゲート', () => {
  it('ゲート成功: gate → saveFsaHandle → setPref → flush の順で切替、ダイアログは閉じる', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d);
    await clickFolderAndSettle(overlay);

    expect(calls).toEqual(['gate', 'saveFsaHandle', 'setPref', 'flush']);
    expect(gateMock.mock.calls[0]![0]).toMatchObject({ meta: { container_id: 'c-fb' } });
    expect(region()).toBeNull();
  });

  it('ゲート失敗: 切替せずダイアログは開いたまま(再選択可能)', async () => {
    gateMock.mockRejectedValue(new Error('backup failed'));
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d);
    await clickFolderAndSettle(overlay);

    expect(calls).toEqual(['gate']);
    expect(saveHandleMock).not.toHaveBeenCalled();
    expect(setPrefMock).not.toHaveBeenCalled();
    // 詰み回避: ダイアログが残り、フォルダ再選択も都度保存も選べる
    expect(region()).not.toBeNull();
    expect(region()!.querySelector('[data-pkc-action="storage-fallback-pick-folder"]')).not.toBeNull();
  });

  it('IDB 全滅(saveFsaHandle throw)でもゲートは先に走り、sink 経路へ入る', async () => {
    saveHandleMock.mockRejectedValue(new Error('idb dead'));
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d);
    await clickFolderAndSettle(overlay);

    expect(calls).toEqual(['gate', 'saveFsaHandle', 'sink.flushNow']);
    expect(region()).toBeNull();
  });

  it('フォルダ選択キャンセルではゲートを呼ばない', async () => {
    pickDirectoryMock.mockResolvedValue(null);
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const overlay = showStorageFallbackNotice(d);
    await clickFolderAndSettle(overlay);
    expect(calls).toEqual([]);
    expect(region()).not.toBeNull();
  });
});
