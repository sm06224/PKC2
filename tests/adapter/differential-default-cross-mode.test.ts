/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import {
  createFileSystemDirectoryAdapter,
  type FsDirectoryHandle,
} from '@adapter/platform/storage/fs-directory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import { mountPersistence } from '@adapter/platform/persistence';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

/**
 * R6(#938、user 判断 2026-07-22)── `persistence.differential_save`
 * 既定 ON 昇格の cross-mode 検証。
 *
 * 全 storage mode は同一の `createContainerStore(adapter)` を通る:
 *   - idb  → idb-adapter(contract は storage-adapter.test.ts が pin。
 *            実ブラウザの実 IndexedDB は differential-default-parity.spec)
 *   - fsa / opfs → fs-directory-adapter(共通実装。本 file で FakeDir 検証)
 *   - memory → memory-adapter(本 file で検証)
 *
 * 「使用中のユーザーに影響が無い」の pin(各 adapter 系で):
 *   1. 既存 v1(inline)データは既定 ON のまま**無変換で読める**
 *   2. 既定 ON の初回保存で split 形式へ自動移行し、load 結果は完全等価
 *   3. OFF に戻して保存すると inline へ復帰 + split record が掃除される
 *      (旧ビルドへ戻す手順)── 往復後も完全等価
 */

const T = '2026-07-22T00:00:00Z';

function entry(lid: string, title: string, body = ''): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-r6', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e3', 'C', 'body3'), entry('e1', 'A', 'body1'), entry('e2', 'B')],
    relations: [
      { id: 'r1', from: 'e3', to: 'e1', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [{ id: 'v1', entry_lid: 'e1', snapshot: 's1', created_at: T }],
    assets: { k1: 'QUJD' },
  };
}

// FakeDir: storage-adapter.test.ts と同じ narrow surface の in-memory FS。
// fs-directory-adapter は FSA / OPFS 両 backend の共通実装なので、これで
// 「ローカルフォルダ / OPFS モード」の storage 意味論を検証できる。
class FakeFile {
  content = '';
  async getFile() {
    const c = this.content;
    return { async text() { return c; } };
  }
  async createWritable() {
    return {
      write: async (data: string) => { this.content = data; },
      close: async () => {},
    };
  }
}
class FakeDir {
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw new DOMException('missing dir', 'NotFoundError');
      d = new FakeDir();
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    let f = this.files.get(name);
    if (!f) {
      if (!opts?.create) throw new DOMException('missing file', 'NotFoundError');
      f = new FakeFile();
      this.files.set(name, f);
    }
    return f;
  }
  async removeEntry(name: string): Promise<void> {
    if (this.files.delete(name)) return;
    if (this.dirs.delete(name)) return;
    throw new DOMException('missing entry', 'NotFoundError');
  }
  async *keys(): AsyncIterableIterator<string> {
    for (const k of this.files.keys()) yield k;
    for (const k of this.dirs.keys()) yield k;
  }
}

interface ModeCase {
  name: string;
  makeAdapter: () => StorageAdapter;
}

const MODES: ModeCase[] = [
  { name: 'memory-adapter', makeAdapter: () => createMemoryAdapter() },
  {
    name: 'fs-directory-adapter(FSA / OPFS 共通実装)',
    makeAdapter: () =>
      createFileSystemDirectoryAdapter(new FakeDir() as unknown as FsDirectoryHandle),
  },
];

async function splitKeyCount(adapter: StorageAdapter): Promise<number> {
  const keys = await adapter.bucket('containers').getKeysByPrefix('__entry__:');
  return keys.length;
}

async function coreRecord(adapter: StorageAdapter, cid: string): Promise<Record<string, unknown> | undefined> {
  return (await adapter.bucket('containers').get(cid)) as Record<string, unknown> | undefined;
}

beforeEach(() => {
  setContainerFlagSource({});
  return () => setContainerFlagSource({});
});

for (const mode of MODES) {
  describe(`R6 差分保存既定 ON — ${mode.name}`, () => {
    it('既存 v1(inline)データは既定 ON のまま無変換で読める', async () => {
      const adapter = mode.makeAdapter();
      // 旧ビルド相当: inline save で v1 データを作る
      const writer = createContainerStore(adapter);
      await writer.save(makeContainer());
      expect(await splitKeyCount(adapter)).toBe(0);

      // 新ビルド(既定 ON)で読む — 保存前なので形式は v1 のまま
      const reader = createContainerStore(adapter);
      const loaded = await reader.load('c-r6');
      expect(loaded).toEqual(makeContainer());
      expect(await splitKeyCount(adapter)).toBe(0); // read は形式を変えない
    });

    it('既定 ON の自動保存で split へ移行し、load は完全等価', async () => {
      const adapter = mode.makeAdapter();
      const store = createContainerStore(adapter);
      await store.save(makeContainer()); // 既存 v1 データ

      // persistence を既定 flag(= ON)で mount し、編集 → 自動保存
      const dispatcher = createDispatcher();
      const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e2', body: 'edited' });
      await handle.flushPending();
      handle.dispose();

      // split 形式になっている(core record に marker + per-entry record)
      const rec = await coreRecord(adapter, 'c-r6');
      expect(rec?.['__pkc_split__']).toBeDefined();
      expect(await splitKeyCount(adapter)).toBe(3);

      // load は編集を含めて完全に一致
      const loaded = await createContainerStore(adapter).load('c-r6');
      expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
      expect(loaded!.entries.find((e) => e.lid === 'e2')!.body).toBe('edited');
      expect(loaded!.relations).toEqual(makeContainer().relations);
      // QUICK_UPDATE_ENTRY は revision snapshot を 1 件追加する(正常挙動)
      // ── 元の v1 が保持され、合計 2 件になっていること
      expect(loaded!.revisions).toContainEqual(makeContainer().revisions[0]);
      expect(loaded!.revisions.length).toBe(2);
      expect(loaded!.assets).toEqual(makeContainer().assets);
    });

    it('OFF に戻して保存 → inline へ復帰 + split 掃除(旧ビルドへ戻す手順)', async () => {
      const adapter = mode.makeAdapter();
      const store = createContainerStore(adapter);

      // 既定 ON で split 保存
      await store.saveDiff(makeContainer(), null);
      expect(await splitKeyCount(adapter)).toBeGreaterThan(0);

      // OFF(オプトアウト)で自動保存 → inline へ書き戻し
      setContainerFlagSource({ 'persistence.differential_save': false });
      const dispatcher = createDispatcher();
      const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'reverted' });
      await handle.flushPending();
      handle.dispose();

      const rec = await coreRecord(adapter, 'c-r6');
      expect(rec?.['__pkc_split__']).toBeUndefined();
      expect(await splitKeyCount(adapter)).toBe(0); // split record が掃除済み

      const loaded = await createContainerStore(adapter).load('c-r6');
      expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
      expect(loaded!.entries.find((e) => e.lid === 'e1')!.body).toBe('reverted');
    });

    it('往復(v1 → split → v1)後も全 field が初期データと等価', async () => {
      const adapter = mode.makeAdapter();
      const store = createContainerStore(adapter);
      await store.save(makeContainer());
      await store.saveDiff(makeContainer(), null);
      await store.save(makeContainer());
      const loaded = await createContainerStore(adapter).load('c-r6');
      expect(loaded).toEqual(makeContainer());
      expect(await splitKeyCount(adapter)).toBe(0);
    });
  });
}
