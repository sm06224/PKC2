/**
 * 移行前 ZIP 強制ゲート(C11 ④-3 / storage v3 M1)の共有実装。
 *
 * 「ストレージ移行の前に、完全な復元可能物(Backup ZIP)を**移行先フォルダへ**
 * 置き、書き込みを確認できるまで移行しない(データを人質に取らない)」を
 * 1 箇所に集約する。呼び出し元は 2 経路:
 *
 *   - Settings の 📂 Local folder 切替(action-binder `pick-storage-folder`)
 *   - フォールバック掲示の「📁 フォルダを選んで続行」
 *     (storage-fallback-notice。2026-07-24 追加 — 従来この経路だけゲートが
 *     無く、reload 後の boot 移行が無バックアップで走っていた)
 *
 * 失敗は throw(caller が「切替中止」を判断し、ユーザーに逃げ道を残す)。
 */

import type { Container } from '../../core/model/container';
import { exportContainerAsZip } from './zip-package';
import { writeBlobToDirectory, type SinkDirectoryHandle } from './folder-sink';

/** 移行前バックアップの basename(実ファイル名は `.pkc2.zip` が付く)。 */
export const PRE_MIGRATION_BACKUP_BASENAME = 'pkc2-pre-migration-backup';

/**
 * container の完全な Backup ZIP を生成し、移行先フォルダへ書き込む。
 * 参照 asset は export 側で hydrate されるため working-set が部分でも欠落しない。
 *
 * @returns 書き込んだファイル名(`pkc2-pre-migration-backup.pkc2.zip`)
 * @throws export 失敗 / blob 欠落 / フォルダ書き込み失敗
 */
export async function writePreMigrationBackupZip(
  container: Container,
  dir: SinkDirectoryHandle,
): Promise<{ filename: string }> {
  let backupBlob: Blob | null = null;
  const result = await exportContainerAsZip(container, {
    filename: PRE_MIGRATION_BACKUP_BASENAME,
    downloadFn: (b) => { backupBlob = b; },
  });
  if (!result.success || !backupBlob) {
    throw new Error(result.success ? 'backup blob missing' : result.error ?? 'backup failed');
  }
  await writeBlobToDirectory(dir, result.filename, backupBlob);
  return { filename: result.filename };
}
