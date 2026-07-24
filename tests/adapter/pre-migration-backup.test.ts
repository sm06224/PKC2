/** @vitest-environment happy-dom */
/**
 * 移行前 ZIP 強制ゲート共有ヘルパ(pre-migration-backup.ts)の contract。
 * Settings 側 / フォールバック掲示側の両呼び出し元が依存する:
 *   - 成功: export → 移行先フォルダへ書き込み → filename を返す
 *   - export 失敗 / blob 欠落 / 書き込み失敗: throw(caller が切替中止)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Container } from '@core/model/container';

const exportMock = vi.fn();
const writeMock = vi.fn();

vi.mock('@adapter/platform/zip-package', () => ({
  exportContainerAsZip: (...args: unknown[]) => exportMock(...args),
}));
vi.mock('@adapter/platform/folder-sink', () => ({
  writeBlobToDirectory: (...args: unknown[]) => writeMock(...args),
}));

import { writePreMigrationBackupZip, PRE_MIGRATION_BACKUP_BASENAME } from '@adapter/platform/pre-migration-backup';

const T = '2026-07-24T00:00:00Z';
function makeContainer(): Container {
  return {
    meta: { container_id: 'c-gate', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [], relations: [], revisions: [], assets: {},
  };
}
const dir = { name: 'dir' } as never;

beforeEach(() => {
  exportMock.mockReset();
  writeMock.mockReset();
});

describe('writePreMigrationBackupZip', () => {
  it('成功: export の blob を移行先フォルダへ書き、filename を返す', async () => {
    const blob = new Blob(['zip']);
    exportMock.mockImplementation(async (_c, opts) => {
      (opts as { downloadFn: (b: Blob) => void }).downloadFn(blob);
      return { success: true, filename: `${PRE_MIGRATION_BACKUP_BASENAME}.pkc2.zip` };
    });
    writeMock.mockResolvedValue(undefined);

    const out = await writePreMigrationBackupZip(makeContainer(), dir);
    expect(out.filename).toBe('pkc2-pre-migration-backup.pkc2.zip');
    expect(exportMock.mock.calls[0]![1]).toMatchObject({ filename: PRE_MIGRATION_BACKUP_BASENAME });
    expect(writeMock).toHaveBeenCalledWith(dir, 'pkc2-pre-migration-backup.pkc2.zip', blob);
  });

  it('export 失敗は throw(書き込みは走らない)', async () => {
    exportMock.mockResolvedValue({ success: false, error: 'boom' });
    await expect(writePreMigrationBackupZip(makeContainer(), dir)).rejects.toThrow('boom');
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('success でも blob が渡されなければ throw', async () => {
    exportMock.mockResolvedValue({ success: true, filename: 'x.pkc2.zip' });
    await expect(writePreMigrationBackupZip(makeContainer(), dir)).rejects.toThrow('backup blob missing');
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('フォルダ書き込み失敗は throw', async () => {
    exportMock.mockImplementation(async (_c, opts) => {
      (opts as { downloadFn: (b: Blob) => void }).downloadFn(new Blob(['zip']));
      return { success: true, filename: 'x.pkc2.zip' };
    });
    writeMock.mockRejectedValue(new Error('disk full'));
    await expect(writePreMigrationBackupZip(makeContainer(), dir)).rejects.toThrow('disk full');
  });
});
