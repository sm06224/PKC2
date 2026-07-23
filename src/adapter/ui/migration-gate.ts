/**
 * 移行前 ZIP 強制バックアップゲート — storage v3 P2-4(doc M1、#967)。
 *
 * > 「M1 = 移行直前に ZIP 自動バックアップを強制生成(完了確認まで
 * >  移行しない)」— 移行・障害時にデータを人質に取らない(C9)。
 *
 * storage layout の v5(セグメントログ)移行は `persistence.lazy_entry_bodies`
 * flag を ON にした次の保存で始まる。本 module はその **flag が OFF → ON に
 * 切り替わった瞬間**(Flags Inspector での操作 = FLAGS_CHANGED)を捉え、
 *
 *   1. 現在の container の完全な Backup ZIP を生成してダウンロード
 *   2. 成功したら toast で明示(移行はその後の保存から進む)
 *   3. **失敗したら flag を自動で OFF に戻す**(= 移行を開始させない)
 *
 * 保存の debounce(300ms)より先に ZIP 生成が始まるが、生成は非同期の
 * ため最初の保存と並走しうる。それでも安全: v1→v5 の全件書込みは
 * 旧形式 record を読み終えてから書くため、生成中の ZIP は移行前の
 * 完全なデータ断面(hydrateForExport が store から復元)になる。
 * 失敗時の flag OFF は次の保存前に効く(保存 layout は flag を毎回読む)。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { Container } from '../../core/model/container';
import { showToast } from './toast';
import { exportContainerAsZip } from '../platform/zip-package';
import { lazyEntryBodiesEnabled } from '../platform/idb-store';

const FLAG_KEY = 'persistence.lazy_entry_bodies';

export interface MigrationGateOptions {
  /** test 注入用。既定は exportContainerAsZip(DL 込み)。 */
  exportZip?: (container: Container) => Promise<{ success: boolean; error?: string }>;
}

/**
 * FLAGS_CHANGED を監視し、lazy_entry_bodies の OFF → ON 遷移で
 * バックアップゲートを走らせる。unsubscribe を返す。
 */
export function mountMigrationGate(
  dispatcher: Dispatcher,
  opts: MigrationGateOptions = {},
): () => void {
  const exportZip = opts.exportZip
    ?? (async (c: Container) => exportContainerAsZip(c, { filename: 'pkc2-pre-migration-backup' }));
  let lastValue = lazyEntryBodiesEnabled();
  let running = false;
  return dispatcher.onEvent((event) => {
    if (event.type !== 'FLAGS_CHANGED') return;
    const raw = event.flags.values[FLAG_KEY];
    const now = raw === true || raw === 'true' || raw === 1;
    const was = lastValue;
    lastValue = now;
    if (!now || was || running) return; // OFF→ON の立ち上がりのみ
    const container = dispatcher.getState().container;
    if (!container) return;
    running = true;
    void (async (): Promise<void> => {
      try {
        const result = await exportZip(container);
        if (!result.success) throw new Error(result.error ?? 'backup failed');
        showToast({
          message: '移行前バックアップ ZIP を保存しました(ストレージ形式の移行は次の保存から進みます)',
          kind: 'info',
        });
      } catch (e) {
        // M1: バックアップできないなら移行させない — flag を戻す
        dispatcher.dispatch({ type: 'SET_FLAG', key: FLAG_KEY, value: false });
        lastValue = false;
        showToast({
          message: `移行前バックアップの作成に失敗したため、ストレージ形式の切替を中止しました: ${String(e)}`,
          kind: 'error',
        });
      } finally {
        running = false;
      }
    })();
  });
}
