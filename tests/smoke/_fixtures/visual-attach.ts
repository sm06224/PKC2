/**
 * CI-safe screenshot attach helper.
 *
 * 2026-05-05 user privacy policy:
 *   「GitHub に間違ってもテストデータそのものやプライベートデータが
 *    含まれる可能性があるスクショをアップしないでください」
 *
 * `Upload failure artifacts` workflow step has been removed already.
 * This helper adds a second layer of defence — even if a future
 * workflow change accidentally re-introduces an upload step, no
 * screenshot will have been written / attached on CI runs because
 * `attachShot` is a no-op unless `PKC_VISUAL=1` is set AND `CI` is
 * not set.
 *
 * Local dev: `PKC_VISUAL=1 npm run test:smoke -- ...` to keep
 * screenshots in `test-results/` for manual review.
 */

import type { TestInfo } from '@playwright/test';

export const VISUAL_ENABLED =
  !!process.env.PKC_VISUAL && !process.env.CI;

export async function attachShot(
  testInfo: TestInfo,
  name: string,
  body: Buffer,
): Promise<void> {
  if (!VISUAL_ENABLED) return;
  await testInfo.attach(name, { body, contentType: 'image/png' });
}
