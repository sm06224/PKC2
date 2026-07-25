#!/usr/bin/env node
/*
 * Playwright 用 Chromium 実行ファイルの解決(バージョンズレ耐性)。
 *
 * 背景: `@playwright/test` を bump すると要求する Chromium ビルド番号
 * (chromium-NNNN)が変わる。この開発環境は `playwright install` が
 * proxy 403 で失敗するため、要求ビルドが未インストールだと起動不能になる。
 *
 * 対策: Playwright の**バージョン紐付き解決を一切使わず**、実在する
 * Chromium バイナリを直接 `executablePath` に渡す。優先順位:
 *   1. 環境変数 PKC_PRE_INSTALLED_CHROMIUM(明示指定)
 *   2. /opt/pw-browsers/chromium(この環境の安定シンボリックリンク)
 *   3. PLAYWRIGHT_BROWSERS_PATH 配下で最も番号が新しい chromium-NNNN
 *   4. `npx playwright` の既定パスに落ちる(この環境では最終手段)
 *
 * 使い方:
 *   - パス出力:   node scripts/resolve-pw-chromium.cjs
 *   - eval で export: eval "$(node scripts/resolve-pw-chromium.cjs --export)"
 *   playwright.config.ts は PKC_PRE_INSTALLED_CHROMIUM を読むので、
 *   実行前にこれで export しておけば config が executablePath を張る。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** ファイルが実行可能な実在バイナリか。 */
function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** browsers dir 配下の chromium-NNNN から chrome バイナリを新しい順に探す。 */
function scanBrowsersDir(root) {
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }
  const builds = entries
    .map((name) => {
      const m = /^chromium-(\d+)$/.exec(name);
      return m ? { name, num: parseInt(m[1], 10) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.num - a.num); // 新しい番号を優先
  const out = [];
  for (const b of builds) {
    // linux / mac / win の一般的な配置を順に試す。
    for (const rel of [
      'chrome-linux/chrome',
      'chrome-linux/headless_shell',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-win/chrome.exe',
    ]) {
      const p = path.join(root, b.name, rel);
      if (isExecutable(p)) out.push(p);
    }
  }
  return out;
}

function resolveChromium() {
  const candidates = [];
  if (process.env.PKC_PRE_INSTALLED_CHROMIUM) {
    candidates.push(process.env.PKC_PRE_INSTALLED_CHROMIUM);
  }
  candidates.push('/opt/pw-browsers/chromium');
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  candidates.push(...scanBrowsersDir(browsersPath));

  for (const c of candidates) {
    // シンボリックリンクは実体を解決してから存在確認。
    let real = c;
    try {
      real = fs.realpathSync(c);
    } catch {
      /* リンク切れ等 → 次の候補へ */
      continue;
    }
    if (isExecutable(real)) return real;
  }
  return null;
}

const resolved = resolveChromium();
const asExport = process.argv.includes('--export');

if (!resolved) {
  // 見つからなくても config は env 無しで既定経路に落ちるので、
  // export モードでは何も出さず、パスモードでは空行 + 非ゼロ終了。
  if (!asExport) {
    process.stderr.write('[resolve-pw-chromium] no chromium binary found under PLAYWRIGHT_BROWSERS_PATH\n');
    process.exit(2);
  }
  process.exit(0);
}

if (asExport) {
  process.stdout.write(`export PKC_PRE_INSTALLED_CHROMIUM=${resolved}\n`);
  process.stdout.write('export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1\n');
} else {
  process.stdout.write(`${resolved}\n`);
}
