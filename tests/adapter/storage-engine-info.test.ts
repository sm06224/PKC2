/**
 * 保存先エンジンの表示文言(2026-07-28)。
 *
 * > 「wasm-sqlite で稼働してるかどうかわからんのやが?」
 * > 「どうやってフラグオンにするの?」(user 2026-07-28)
 *
 * 実測してわかったのは、**flag は効いているのに sqlite にならない**構成が
 * あること ── `file://` で開くと OPFS が SecurityError で使えず、黙って
 * IDB に落ちる。この状態で「IndexedDB」とだけ出すと、user は
 * 「flag の付け方が悪いのか / そもそも動かないのか」を永遠に区別できない。
 *
 * よってここで pin するのは **fallback の理由が文言に出ること**である。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetStorageEngineInfoForTest,
  describeStorageEngine,
  getStorageEngineInfo,
  setStorageEngineInfo,
} from '@adapter/platform/storage/storage-engine-info';

describe('保存先エンジンの表示', () => {
  afterEach(() => {
    __resetStorageEngineInfoForTest();
  });

  it('既定は IndexedDB', () => {
    expect(getStorageEngineInfo().kind).toBe('idb');
    expect(describeStorageEngine()).toBe('IndexedDB(従来の保存先)');
  });

  it('wasm-sqlite は **版と VFS** を出す(自称と実測を区別するため)', () => {
    setStorageEngineInfo({
      kind: 'wasm-sqlite', vfs: 'sahpool', version: '3.53.0', persistent: true,
    });
    const text = describeStorageEngine();
    expect(text).toContain('wasm-sqlite');
    expect(text).toContain('3.53.0');
    expect(text).toContain('sahpool');
    expect(text).toContain('永続');
  });

  it('永続でないときは揮発だと分かる(閉じるとデータが消える状態)', () => {
    setStorageEngineInfo({ kind: 'wasm-sqlite', vfs: 'memory', version: '3.53.0', persistent: false });
    expect(describeStorageEngine()).toContain('揮発');
  });

  it('要求したのに使えなかったときは **理由**が文言に出る', () => {
    setStorageEngineInfo({
      kind: 'idb',
      requestedButUnavailable: 'file:// で開いているため OPFS が使えません',
    });
    const text = describeStorageEngine();
    expect(text).toContain('IndexedDB');
    expect(text, '黙って IndexedDB とだけ出すと原因が分からない').toContain('OPFS が使えません');
  });

  it('計器(__pkc2StorageEngine)にも同じ情報が出る', () => {
    setStorageEngineInfo({ kind: 'desktop-host', version: '3.51.2', persistent: true });
    expect((globalThis as unknown as Record<string, unknown>).__pkc2StorageEngine)
      .toMatchObject({ kind: 'desktop-host', version: '3.51.2' });
    expect(describeStorageEngine()).toContain('native sqlite');
  });
});
