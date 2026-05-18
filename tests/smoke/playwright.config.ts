/**
 * PKC2 — Playwright smoke baseline (Tier 3-2).
 *
 * Scope: smoke 271+ test cases proving the single-HTML artifact
 * (dist/pkc2.html) boots, accepts user input, persists into
 * IndexedDB, and per-feature parity tests for visual / reducer flows.
 *
 * Decisions (Tier 3-2, refined PR-W19 2026-05-16):
 *   - testDir: `tests/smoke/` so the smoke tree does NOT collide
 *     with the vitest suites under `tests/core/` / `tests/features/`
 *     / `tests/adapter/` (vitest auto-excludes `tests/smoke/*.spec.ts`).
 *   - Browser: chromium only. Single-HTML is the deliverable;
 *     cross-browser will be revisited when an actual cross-browser
 *     bug surfaces.
 *   - URL: served via a static http server started by webServer
 *     (http://127.0.0.1:4173/pkc2.html). file:// was considered but
 *     some Chromium builds block IndexedDB on file://; http
 *     guarantees consistent behaviour.
 *   - **PR-W19**:`fullyParallel: true` + `workers: 2` で 1 shard 内も
 *     並列化、外側で matrix shard 4 並列と組合せて 8 parallel。各 spec
 *     は独立 browser context で IndexedDB / DOM 相互干渉なし。
 *   - **PR-W19**:**Tier 分離** — `SMOKE_TIER=a` 環境変数で PR blocking 用
 *     small set(10 critical spec、< 2 min)に絞る。main push / 毎晩
 *     schedule は全件(`SMOKE_TIER=all`、デフォルト)。
 *   - **PR-W19**:diagnostic / debug 系 5 spec を `_archive/` に隔離、
 *     production smoke から完全 exclude。
 *   - **PR-W19**:`retries: 0`(flake を retry で隠さず即診断、CI 時間
 *     倍化リスクを避ける)。
 *   - Reporter: list. No HTML report artifact to keep CI slim.
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * PR-W19:**Tier-A** = PR blocking 用 critical smoke 10 spec。boot / 主要
 * view-mode / 編集入力 / search / debug 等、regression が起きると即破壊的な
 * 経路のみ。残り spec は Tier-B(main push + schedule 毎晩で full 検証)。
 *
 * Tier-A 選定基準(全 user-facing critical path を 1 spec 以上 cover):
 * - boot:app-launch
 * - center pane / view-mode:detail / kanban / filer / graph
 * - 編集経路:editor key helpers / swipe / search
 * - debug 経路:debug-report
 * - 視覚 parity:reform-2026-05 comprehensive(reform doctrine の代表 spec)
 */
const TIER_A_SPECS = [
  'app-launch.spec.ts',
  'card-widget.spec.ts',
  'kanban-dnd-parity.spec.ts',
  'editor-key-helpers.spec.ts',
  'swipe-to-delete.spec.ts',
  'search-filter.spec.ts',
  'filer-view-navigation-rows.spec.ts',
  'graph-view-mode.spec.ts',
  'debug-report.spec.ts',
  'reform-2026-05-phase1-comprehensive-parity.spec.ts',
];

const tier = process.env.SMOKE_TIER ?? 'all';
const testMatch = tier === 'a'
  ? TIER_A_SPECS.map((s) => `**/${s}`)
  : /^(?!.*\/_archive\/).*\.spec\.ts$/;

export default defineConfig({
  testDir: __dirname,
  testMatch,
  // `_archive/` 配下の spec は production smoke から exclude(diagnostic / debug 用)
  testIgnore: ['**/_archive/**'],
  // PR-W19:各 spec は独立 browser context で実行
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // PR-W19:retry で flake を隠蔽せず即診断(flake は別 PR で fix)
  retries: 0,
  // CI parallelism reduction(2026-05-18 user direction「シャードの実行を
  // 2 つずつとかにできない?」):
  // 旧 workers=2 で per-runner CPU + IDB / browser process contention が
  // flake 源だった。CI でも workers=1 にして shard 内 sequential 化、
  // 同時実行 test 数を最小化。GitHub Actions side で `max-parallel: 2` も
  // 別途設定して total 2 parallel test までに絞る(同 max 2 contexts 動作)。
  // wall time は ~2x になるが flake が消えるため net で fast(retry の無駄
  // が消える)。
  workers: 1,
  reporter: [['list']],
  // CI tolerance bump(2026-05-18 user direction「smoke の責務は機能検証、
  // boot time / paint timing の品質保証は dev / bench に分離する」):
  // 旧 30s では CI 高負荷時(workers=2 × shard 4 = 8 parallel)に post-render
  // side effect 完了前に test timeout してた。60s に倍化して、各 spec から
  // tight な explicit timeout(`{ timeout: 5_000 }` 等)を撤廃。assertion
  // は default(action timeout = test timeout 内)に乗せ、test timeout 内で
  // 動けば pass、動かなければ slow-fail で診断可能に。
  // Boot time 品質は `tests/bench/` の bench infrastructure で測定する。
  timeout: 60_000,

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    // Serve the built single-HTML via Node's built-in http module.
    // Tried `npx http-server dist -p 4173` but observed 404 on
    // Playwright's readiness probe — http-server's port hand-off
    // seems to race with Playwright's port check when both are on
    // 127.0.0.1. A tiny in-repo server (scripts/smoke-serve.cjs)
    // is deterministic: starts synchronously, listens, then replies
    // with the file content.
    command: 'node ../../scripts/smoke-serve.cjs',
    url: 'http://127.0.0.1:4173/pkc2.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
