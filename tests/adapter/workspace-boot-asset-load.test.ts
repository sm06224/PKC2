/**
 * @vitest-environment happy-dom
 *
 * 初回起動で添付を丸ごと読まない(2026-07-26、user 報告
 * 「実行時メモリが爆発してる / 500MB・添付多め / 起動直後 / OOM 停止」)。
 *
 * ## 何が起きていたか
 *
 * `ensureDefaultWorkspace` は `store.loadDefault()` を呼んでいた ──
 * **container 全体 + 全 asset をメモリへ載せて、使うのは
 * `def.meta.container_id` の 1 個だけ**。
 *
 * しかもこの行は `list.length > 0` の早期 return の後、つまり
 * **ワークスペース情報がまだ無い初回起動**(= 新しいビルドへ移行した最初の
 * 1 回)に必ず走る。
 *
 * 実測(`tests/bench/migration-heap.mjs`、添付 100 件 × 512KB):
 *   起動中の asset 読出 200 件 / 100 MB → **100 件 / 50 MB**
 *   ピーク heap 296.5 MB → **88.2 MB**
 * `loadDefault` の `reassembleAssets` は `getAllByPrefix` で
 * **全 asset を 1 本の配列に同時に載せる**ため、500MB 規模では base64 化
 * (4/3 倍)と合わせて GB 級の単一確保になる。
 *
 * ⚠ これは #1021 が `storage-backend.ts` の `migrateFromIdbIfEmpty` で
 * 直したのと **同一のバグ**(「`false` を返すためだけに container 全体 +
 * 全 asset を読んでいた」)。**こちらが直し漏れていた。**
 *
 * ## 本 test が守るもの
 *
 * 「container の中身が要らない判定で全件ロードしない」を **呼び出しの形**で
 * pin する。件数や MB は環境依存なので、**どの API を呼んだか**を観測点にする。
 */
import { describe, it, expect, vi } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { ensureDefaultWorkspace } from '@adapter/platform/workspace';
import type { Container } from '@core/model/container';

const NOW = '2026-07-26T00:00:00.000Z';

function containerWithAssets(id: string): Container {
  return {
    meta: { container_id: id, title: 't', created_at: NOW, updated_at: NOW, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: NOW, updated_at: NOW },
    ],
    relations: [],
    revisions: [],
    assets: { a1: 'QUJD', a2: 'REVG', a3: 'R0hJ' },
  };
}

describe('初回起動のワークスペース作成は添付を読まない', () => {
  it('🔴 ensureDefaultWorkspace が loadDefault(全 asset ロード)を使わない', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(containerWithAssets('c-heavy'));

    const full = vi.spyOn(store, 'loadDefault');
    const shallow = vi.spyOn(store, 'loadDefaultMetaShallow');

    // ワークスペース未作成 = 初回起動の経路
    const ws = await ensureDefaultWorkspace(store);

    expect(full).not.toHaveBeenCalled();
    expect(shallow).toHaveBeenCalled();
    // 判定に必要な情報は落ちていない
    expect(ws.activeContainerId).toBe('c-heavy');
  });

  it('shallow 読みでも既定コンテナの特定は従来どおり', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(containerWithAssets('c-a'));
    await store.save(containerWithAssets('c-b')); // __default__ = c-b

    const ws = await ensureDefaultWorkspace(store);
    expect(ws.activeContainerId).toBe('c-b');
    expect([...ws.containerIds].sort()).toEqual(['c-a', 'c-b']);
  });

  it('既定コンテナが無くても落ちない(containers の先頭へ fallback)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const ws = await ensureDefaultWorkspace(store);
    expect(ws.activeContainerId).toBeNull();
    expect(ws.containerIds).toEqual([]);
  });
});
