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
 * Re-alignment (W1 D-1 Tag chip CSS, 2026-04-23):
 *   dist/bundle.css ≈ 91.07 KB — W1 Slice A / F / F-2 / F-3 で追加
 *   された Tag / Saved Search chip 用 DOM 構造に D-1 で最低限の
 *   スタイル（chip / label / remove / focus-visible ring / active
 *   state / `タグ:` strip）を入れた結果、初期予算 90 KB を超過。
 *
 *   先行コミット `perf(css): consolidate Tag chip rules` で
 *   D-1 の重複ルール集約と 3 件の未参照クラス
 *   （`.pkc-attachment-field` / `.pkc-detached-preview-img` /
 *   `.pkc-guardrail-info`）除去により 92.15 KB → 91.07 KB まで
 *   -1.08 KB 削減。残差は D-1 が DOM 20+ クラスに初見のスタイル
 *   を与える不可避のコスト。
 *
 *   そこで budget は 96 KB ではなく **94 KB** に引き上げる — 現サイズ
 *   91.07 KB に ~3.2% の headroom（~2.93 KB）を上乗せした最小枠。
 *   Color tag / parser など次 wave の自然増を吸収しつつ、重依存の
 *   混入を依然としてタイトに検知できる設定を維持する。
 *
 * Re-alignment (W1 Link slice — Paste event wiring, 2026-04-24):
 *   dist/bundle.js ≈ 640.52 KB — PKC permalink → internal markdown
 *   link 変換の adapter 層 wiring が action-binder.ts に組み込まれた
 *   ことで、これまで tree-shake されていた `src/features/link/*` 系
 *   (paste-conversion / permalink / convertPastedText / parsePermalink
 *   / isSamePermalinkContainer) と新規 `link-paste-handler.ts` が
 *   bundle に乗り、初期予算 640 KB を 0.52 KB 超過。
 *
 *   先行で link-paste-handler.ts 内の防御的 try/catch を 4 → 1 に
 *   削減（focus / execCommand 周りは throw しない通常パスなので不要、
 *   setSelectionRange のみ <input type=number/email> 互換のため残置）
 *   して 0.09 KB 削減した上で残差。link システムは Link Unification
 *   v0 spec に基づく参照基盤の最小成立分(spec / pure parser /
 *   features-layer paste-conversion / adapter wiring + tests 92件)で
 *   構成されており、これ以上の削減は防御性 / コメント密度 / 機能性を
 *   損なう。
 *
 *   そこで budget は **648 KB** に引き上げる — 現サイズ 640.52 KB に
 *   ~1.2% の headroom（~7.48 KB）を上乗せした最小枠。次 slice
 *   (Copy permalink UI / card / embed renderer / cross-container
 *   placeholder) 2-3 件分の自然増を吸収しつつ、重依存の混入を依然
 *   としてタイトに検知できる設定を維持する。
 *
 * Re-alignment (Link terminology / grammar correction, 2026-04-24):
 *   `pkc://...` を「permalink」と誤呼称していた初版 spec を是正し、
 *   3 概念(Internal / Portable PKC Reference / External Permalink)
 *   に分離。新形 External Permalink (`<base>#pkc?...`) の parser /
 *   formatter 追加、paste conversion の両形受理化、URI scheme
 *   non-interference の網羅(Office / obsidian / vscode / mailto)、
 *   Copy link UI の出力形式変更、tests も大幅拡充された。
 *
 *   ユーザー指示で JS bundle budget を **1.5 MB(1536 KB)** まで
 *   許容する方針に切り替え。Link / Color / future card / embed /
 *   share UI の自然増、加えて訂正後の追加 helper / 約 65 件の追加
 *   テストが将来 bundle に乗る可能性を吸収するための広めの枠。
 *
 *   無制限ではない: 1.5 MB は約 2.4 倍の現行サイズで、突発的な重
 *   依存(markdown-it フル機能版 / 大型 polyfill 等)を依然として
 *   検知可能なライン。CSS 側は 94 KB のタイト枠を維持し、表示資源は
 *   従来どおりの監視粒度を保つ。
 *
 * Re-alignment (Color wave close + CSS budget headroom maintenance,
 * 2026-04-25):
 *   dist/bundle.css ≈ 93.06 KB — Color Slice 1-4 の着地で picker /
 *   sidebar marker / palette HEX tokens が積まれ、Slice 3 着地時点で
 *   一度 budget を超過(93.65 KB → 95.55 KB)、`fix(color):
 *   consolidate per-palette CSS to fit the 94 KB bundle.css budget`
 *   で 8 色 × 3 selector の重複を `.pkc-color-<id>` 共有 class へ
 *   集約して 93.87 KB(99.9%、headroom 0.13 KB)に押し戻したが、
 *   次の UI slice(Card click wiring / Import-Export UI / clickable-
 *   image renderer など)で再び超過する蓋然性が高い状態。
 *
 *   先行で 2 段階の追加削減を実施:
 *   (1) 主テーマ変数 `:root` と `#pkc-root[data-pkc-theme="dark"]`
 *       が同内容のため、comma-merge で 1 つの rule に統合
 *       (Light は @media と非 @media を跨げないため統合不能、
 *       仕様上の不可避コスト)。
 *   (2) syntax-highlight token 用の同等の 4-way duplication にも
 *       同じ trick を適用、合計で約 0.81 KB 削減し 93.06 KB に。
 *
 *   そこで budget は **96 KB** に引き上げる — 現サイズ 93.06 KB に
 *   ~3.2% の headroom(~2.94 KB)を上乗せした最小枠。Card / Import-
 *   Export / clickable-image など 1-2 件の UI slice が新規 chip /
 *   button styling を追加しても余裕が残り、それでもなお重 dep の
 *   混入を検知可能なタイト枠を維持する。
 *
 *   この引き上げは **dedicated maintenance PR** で実施(機能 PR と
 *   混在させない方針、初版コメント §"Bump here (with a code review)
 *   when justified" に従う)。
 *
 * Re-alignment (Card Slice 5.0 close + CSS budget headroom maintenance,
 * 2026-04-25):
 *   dist/bundle.css ≈ 94.46 KB — Card Slice 5.0(minimal chrome、PR
 *   #186 で着地)で `.pkc-card-widget` chrome ブロック(border /
 *   background / typography / state modifier)が +1.00 KB 積まれ、
 *   96 KB budget の headroom が 2.94 → 1.54 KB に縮小。次の UI slice
 *   (Card Slice 5.1 excerpt / 5.2 thumbnail / Slice 6 advanced
 *   variants、いずれも CSS が増える系統)で再び超過する蓋然性が高い。
 *
 *   Slice 5.1 excerpt は archetype 別の preview 表示で +0.5〜1 KB
 *   見込み、Slice 5.2 thumbnail / Slice 6 variants はそれぞれ +1〜2 KB
 *   見込みのため、headroom 1.54 KB のままだと 5.1 で確実に詰まる。
 *
 *   そこで budget は **98 KB** に引き上げる — 現サイズ 94.46 KB に
 *   ~3.6% の headroom(~3.54 KB)を上乗せした最小枠。Slice 5.1
 *   excerpt 1 件 + 軽微な調整を吸収しつつ、5.2 / 6 着手前に再評価
 *   できるタイト設定を維持する。
 *
 *   この引き上げは **dedicated maintenance PR**(本 PR、PR #138 +
 *   PR #177 と同 pattern)で実施。機能 PR(Slice 5.1 excerpt)と
 *   混在させないことで「予算引き上げの理由」が PR review で明確
 *   になる。
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
  { file: 'dist/bundle.js', maxBytes: 1536 * 1024 },  // 1.5 MB (Link terminology correction re-alignment)
  { file: 'dist/bundle.css', maxBytes: 112 * 1024 },  // 112 KB (iPhone push/pop shell + drawer + tablet split-view runway, 2026-04-26)
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
