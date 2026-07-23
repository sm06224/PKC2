/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mountFolderSink,
  FOLDER_SINK_FILENAME,
  type SinkDirectoryHandle,
  type SinkWritable,
} from '@adapter/platform/folder-sink';
import { createDispatcher } from '@adapter/state/dispatcher';
import { importFromZipBuffer } from '@adapter/platform/zip-package';
import type { Container } from '@core/model/container';

/**
 * C11 §4.5 ④-2 — フォルダ sink 自動保存。
 *
 * 契約:
 *   - 保存トリガ event → debounce 1 回で完全な Backup ZIP を書く
 *   - close() まで実ファイル反映されない FSA staging を前提に、
 *     必ず close する(write 失敗時も)
 *   - flushNow は即時書き込み
 *   - 書いた ZIP は通常の import 経路で復元できる(sink は一方向、
 *     読み戻さない — 復元可能性だけを保証する)
 *   - unmount 後は書かない
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-42', title: 'sink', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Alpha', body: 'hello', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

interface FakeDir extends SinkDirectoryHandle {
  files: Map<string, Blob>;
  /** close() 前の staging 書き込み回数(atomicity 検証用)。 */
  openWritables: number;
}

function makeFakeDir(): FakeDir {
  const files = new Map<string, Blob>();
  const dir: FakeDir = {
    files,
    openWritables: 0,
    getFileHandle: (name: string) => {
      return Promise.resolve({
        createWritable: (): Promise<SinkWritable> => {
          dir.openWritables += 1;
          const parts: (Blob | string)[] = [];
          return Promise.resolve({
            write: (data: Blob | string): Promise<void> => {
              parts.push(data);
              return Promise.resolve();
            },
            close: (): Promise<void> => {
              dir.openWritables -= 1;
              // FSA staging: close で初めて「実ファイル」に反映
              files.set(name, new Blob(parts));
              return Promise.resolve();
            },
          });
        },
      });
    },
  };
  return dir;
}

beforeEach(() => {
  vi.useFakeTimers();
  return () => {
    vi.useRealTimers();
  };
});

async function drainAsync(): Promise<void> {
  // fake timers 下で pending microtask / promise chain を消化する
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('mountFolderSink', () => {
  it('保存トリガ → debounce → 完全な ZIP がフォルダに置かれ、import で復元できる', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const dir = makeFakeDir();
    const saved: number[] = [];
    mountFolderSink(d, dir, { onSaved: (i) => saved.push(i.size) });

    // 編集 → ENTRY_UPDATED(保存トリガ)
    d.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'edited body' });
    expect(dir.files.size).toBe(0); // debounce 窓内はまだ書かない

    await vi.advanceTimersByTimeAsync(6_000);
    await drainAsync();

    expect(dir.files.has(FOLDER_SINK_FILENAME)).toBe(true);
    expect(dir.openWritables).toBe(0); // writable は必ず close 済み
    expect(saved).toHaveLength(1);

    // 書かれた ZIP は通常 import 経路で完全復元できる
    const blob = dir.files.get(FOLDER_SINK_FILENAME)!;
    const result = await importFromZipBuffer(await blob.arrayBuffer());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const entry = result.container.entries.find((e) => e.lid === 'e1');
      expect(entry?.body).toBe('edited body');
    }
  });

  it('連続編集は debounce で 1 回にまとまる', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const dir = makeFakeDir();
    const saved: number[] = [];
    mountFolderSink(d, dir, { onSaved: (i) => saved.push(i.size) });

    for (let i = 0; i < 5; i++) {
      d.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: `body ${i}` });
      await vi.advanceTimersByTimeAsync(1_000);
    }
    await vi.advanceTimersByTimeAsync(6_000);
    await drainAsync();
    expect(saved).toHaveLength(1);
  });

  it('flushNow は debounce を待たず即時に書く', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const dir = makeFakeDir();
    const sink = mountFolderSink(d, dir);
    await sink.flushNow();
    await drainAsync();
    expect(dir.files.has(FOLDER_SINK_FILENAME)).toBe(true);
  });

  it('unmount 後はトリガが来ても書かない', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const dir = makeFakeDir();
    const sink = mountFolderSink(d, dir);
    sink.unmount();
    d.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'x' });
    await vi.advanceTimersByTimeAsync(10_000);
    await drainAsync();
    expect(dir.files.size).toBe(0);
  });

  it('write 失敗でも writable を close し、onError が呼ばれる', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    let closed = 0;
    const failingDir: SinkDirectoryHandle = {
      getFileHandle: () =>
        Promise.resolve({
          createWritable: (): Promise<SinkWritable> =>
            Promise.resolve({
              write: () => Promise.reject(new Error('disk full')),
              close: (): Promise<void> => {
                closed += 1;
                return Promise.resolve();
              },
            }),
        }),
    };
    const errors: unknown[] = [];
    const sink = mountFolderSink(d, failingDir, { onError: (e) => errors.push(e) });
    await sink.flushNow();
    await drainAsync();
    expect(closed).toBe(1);
    expect(errors).toHaveLength(1);
  });
});
