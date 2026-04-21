#!/usr/bin/env node
/*
 * PKC2 — Bundle size budget check (Tier 3-2).
 *
 * Fails with exit code 1 when any tracked artifact exceeds its
 * configured raw-byte budget. Informational run (no fail) when
 * under budget.
 *
 * Budgets are raw bytes — NOT gzip — so the signal is stable
 * regardless of content compressibility.
 *
 * Baseline (Tier 3-1, 2026-04-14 commit 00e7f68) — raw bytes / 1024:
 *   dist/bundle.js  = 491.03 KiB  (502,813 bytes)
 *   dist/bundle.css =  70.61 KiB  ( 72,307 bytes)
 *
 * (Vite reports the same files as 502.81 kB / 72.31 kB because
 * it uses decimal 1000. The script uses binary 1024 for the check;
 * either base is fine as long as budget and baseline share it.)
 *
 * Budgets chosen below give ~20% headroom — enough for natural
 * feature growth across a couple of tiers, tight enough to catch
 * an accidental heavy dep or dead-code leak. When a legitimate
 * feature pushes past the budget, bump it here in a dedicated
 * commit so the increase shows up in PR review.
 *
 * Re-alignment (P4 Saved Searches v1, 2026-04-21):
 *   dist/bundle.js  ≈ 616.32 KB — P1 Recent Entries / P2 Breadcrumb /
 *   P3 Entry rename audit / Entry-window title refresh / P4 Saved
 *   Searches v1 が重なり、初期予算 615 KB を僅かに上回ったため 640 KB
 *   に引き上げ。引き上げ幅は ~4% 分の headroom（次の P5 ~ P6 相当の
 *   自然増を吸収する目安）で、突発的な重依存混入を依然として検知できる
 *   タイト設定を維持する。
 *
 * Intentionally CommonJS (`.cjs`) so it runs under `node` in CI
 * without needing tsx / a loader flag. Kept out of src/ because
 * it's tooling, not application code.
 */

'use strict';

const { statSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');

/** Raw-byte budgets. Bump here (with a code review) when justified. */
const BUDGETS = [
  { file: 'dist/bundle.js', maxBytes: 640 * 1024 },  // 640 KB
  { file: 'dist/bundle.css', maxBytes: 90 * 1024 },  // 90 KB
];

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

let failed = false;

for (const { file, maxBytes } of BUDGETS) {
  const abs = resolve(ROOT, file);
  if (!existsSync(abs)) {
    console.error(`[size-budget] MISSING: ${file} (did build:bundle run?)`);
    failed = true;
    continue;
  }
  const size = statSync(abs).size;
  const pct = ((size / maxBytes) * 100).toFixed(1);
  const status = size <= maxBytes ? 'OK  ' : 'FAIL';
  const line = `[size-budget] ${status} ${file}  ${formatKB(size)} / ${formatKB(maxBytes)}  (${pct}%)`;
  if (size > maxBytes) {
    console.error(line);
    console.error(
      `[size-budget]      → ${file} is over budget by ${formatKB(size - maxBytes)}. ` +
        `If this is intentional, raise maxBytes in build/check-bundle-size.cjs ` +
        `in a dedicated commit and explain why.`,
    );
    failed = true;
  } else {
    console.log(line);
  }
}

if (failed) {
  process.exit(1);
}
