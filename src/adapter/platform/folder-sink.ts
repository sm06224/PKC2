/**
 * フォルダ sink 自動保存 — C11 §4.5 ④-2(user GO 2026-07-22)。
 *
 * 「作業系 = メモリ、FS = 一方向 sink 専用」の構造原理(§2 分離)に
 * 従い、選択されたローカルフォルダへ**完全な復元可能物(Backup ZIP)**を
 * debounce で置き続ける。第一段は全体書き出し形(封印パック + manifest の
 * セグメント形式は v3 P2 のセグメントログと同時に切替)。
 *
 * 想定する主用途はブラウザストレージが死んでいる環境(§4.5 モード B):
 * FSA のフォルダハンドルは IndexedDB にしか永続できないため記憶できず、
 * backend 切替(fsa)も成立しない。そこで**セッション内だけ**メモリ上の
 * handle に対して sink を mount し、フォルダには常に最新の完全バックアップが
 * 置かれ続ける状態を作る。次回起動時はフォルダを選び直す(ブラウザ仕様)。
 *
 * 書き込みの原子性: File System Access API の `createWritable()` は
 * ステージング(swap file)へ書き、`close()` で初めて実ファイルに反映
 * される仕様(= temp→rename と同等の保証がネイティブに得られる)。
 * 途中クラッシュしても前世代の完全な ZIP が壊れず残る。
 *
 * 読み戻しはしない(sink 専用・一方向)。復元は通常の ZIP import 経路。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { DomainEvent } from '../../core/action/domain-event';
import { SAVE_TRIGGERS } from './persistence';
import { exportContainerAsZip } from './zip-package';

/** sink が置くファイル名(単一・安定 — 少数・大・不変の原則)。 */
export const FOLDER_SINK_FILENAME = 'pkc2-autosave.pkc2.zip';

const DEFAULT_DEBOUNCE_MS = 5_000;

/** 本 sink が必要とする最小のフォルダハンドル構造型(Blob 書き込み)。 */
export interface SinkWritable {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface SinkFileHandle {
  createWritable(): Promise<SinkWritable>;
}
export interface SinkDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<SinkFileHandle>;
}

export interface FolderSinkOptions {
  debounceMs?: number;
  /** 書き込み成功のたびに呼ばれる(UI 側で表示に使う)。 */
  onSaved?: (info: { filename: string; size: number; at: Date }) => void;
  /** 書き込み失敗(permission 剥奪 / ディスク不足等)。 */
  onError?: (error: unknown) => void;
}

export interface FolderSink {
  /** debounce を待たず即時書き込み(mount 直後の初回や明示保存)。 */
  flushNow(): Promise<void>;
  /** 監視・pagehide handler を解除する。 */
  unmount(): void;
}

/**
 * フォルダ sink を mount する。persistence と同じ保存トリガ event で
 * debounce 書き込みを arm し、pagehide で最終 flush を試みる。
 */
export function mountFolderSink(
  dispatcher: Dispatcher,
  dir: SinkDirectoryHandle,
  opts: FolderSinkOptions = {},
): FolderSink {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false;
  let rearm = false;
  let unmounted = false;

  async function doWrite(): Promise<void> {
    if (unmounted) return;
    if (writing) {
      // 書き込み中に再トリガ → 完了後にもう一周(最新 state を取り直す)
      rearm = true;
      return;
    }
    writing = true;
    try {
      const state = dispatcher.getState();
      const container = state.container;
      if (!container || state.readonly) return;
      // exportContainerAsZip は store からの asset hydration を含む完全な
      // ZIP 生成経路。downloadFn を差し替えて Blob を受け取り、DL の
      // 代わりにフォルダへ書く。
      let blob: Blob | null = null;
      const result = await exportContainerAsZip(container, {
        filename: 'pkc2-autosave',
        downloadFn: (b) => { blob = b; },
      });
      if (!result.success || !blob) {
        throw new Error(result.success ? 'ZIP blob missing' : result.error ?? 'ZIP build failed');
      }
      const fh = await dir.getFileHandle(FOLDER_SINK_FILENAME, { create: true });
      const w = await fh.createWritable();
      try {
        await w.write(blob);
      } finally {
        // close() が staging → 実ファイルの commit。エラー時も必ず閉じる
        // (OPFS/FSA はロック残留で以後書けなくなる)。
        await w.close();
      }
      opts.onSaved?.({ filename: FOLDER_SINK_FILENAME, size: (blob as Blob).size, at: new Date() });
    } catch (e) {
      opts.onError?.(e);
    } finally {
      writing = false;
      if (rearm && !unmounted) {
        rearm = false;
        schedule();
      }
    }
  }

  function schedule(): void {
    if (unmounted) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doWrite();
    }, debounceMs);
  }

  const handleEvent = (event: DomainEvent): void => {
    if (SAVE_TRIGGERS.has(event.type)) schedule();
  };
  const unsubEvent = dispatcher.onEvent(handleEvent);

  const pagehideHandler = (): void => {
    // fire-and-forget: ブラウザは promise を待たないが、staging commit が
    // 間に合えば最新世代が残る。間に合わなくても前世代は壊れない。
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      void doWrite();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', pagehideHandler);
  }

  return {
    flushNow: (): Promise<void> => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      return doWrite();
    },
    unmount: (): void => {
      unmounted = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      unsubEvent();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', pagehideHandler);
      }
    },
  };
}
