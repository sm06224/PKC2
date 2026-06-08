/**
 * 領域 3 part 2 — drop 後の変換提案 toast の parity
 * (visual-state-parity-testing.md §6)。
 *
 * `.md` ファイルを実ブラウザの DataTransfer で drop zone へドロップし、
 * 出現する「TEXT に変換」toast ボタンを `elementFromPoint` で非遮蔽確認
 * した上で実 OS `mouse.click` で発火、編集画面(consumer)に復号済み
 * 内容が出ることを assert する。toast stack は `#pkc-root` 外に置かれ
 * delegation が届かないため、実クリックでの動作確認が特に重要。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

const DROPPED_MD = '# ドロップ変換テスト\n\nこの内容が TEXT エントリになる。\n';

test('parity: .md を drop → 変換提案 toast を実 OS click で TEXT 化', async ({ page }) => {
  // sidebar の file drop zone は tree モードで安定描画されるため tree に pin。
  // drop-toast 機構自体は sidebar モード非依存。
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  // `.md` ファイルを drop zone へ実ドロップ(DataTransfer 経由)。
  const dataTransfer = await page.evaluateHandle((content: string) => {
    const dt = new DataTransfer();
    dt.items.add(new File([content], 'dropped.md', { type: 'text/markdown' }));
    return dt;
  }, DROPPED_MD);
  const dropZone = page.locator('[data-pkc-region="sidebar-file-drop-zone"]').first();
  await expect(dropZone).toBeVisible();
  await dropZone.dispatchEvent('drop', { dataTransfer });

  // 変換提案 toast が出現する。
  const toastBtn = page.locator(
    '[data-pkc-region="toast"] [data-pkc-action="convert-attachment-to-text"]',
  );
  await expect(toastBtn).toBeVisible();

  // Parity gate:ボタンが見えている座標で click がボタン自身に届く。
  const box = await toastBtn.boundingBox();
  if (!box) throw new Error('toast convert button has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>('[data-pkc-action="convert-attachment-to-text"]');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click → 変換 → editing phase + 復号内容(consumer 観測点)。
  await page.mouse.click(cx, cy);
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  const bodyField = page.locator('[data-pkc-field="body"]').first();
  await expect(bodyField).toHaveValue(/ドロップ変換テスト/);

  await page.screenshot({ path: 'test-results/attach-drop-toast-parity.png' });
});
