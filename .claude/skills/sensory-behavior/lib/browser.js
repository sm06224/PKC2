// Chromium を探して、DevTools 付きで起こす — 依存ゼロ
//
// どの環境でも「そこにあるブラウザ」で動くことが移植性の要。
// バイナリのダウンロードは一切しない(できない環境の方が多い)。

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cdp } from './cdp.js';

const CANDIDATES = [
  process.env.VISUAL_CHROME,          // 明示指定が最優先
  '/opt/pw-browsers/chromium',        // Claude Code リモート環境の常備品
  'google-chrome',                    // GitHub Actions ubuntu ランナーはこれ
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'chrome',
];

export function findChrome() {
  for (const c of CANDIDATES) {
    if (!c) continue;
    if (c.includes('/')) {
      if (existsSync(c)) return c;
      continue;
    }
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

export async function launchChrome({ width = 1280, height = 900 } = {}) {
  const bin = findChrome();
  if (!bin) throw new Error('Chromium/Chrome が見つからない。VISUAL_CHROME=<path> で教えてください');
  const profile = mkdtempSync(join(tmpdir(), 'na-visual-'));
  const proc = spawn(bin, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    // 音は「デバイスに出さない」だけ。WebAudio のグラフは動き続けるので、
    // ページ内に仕込んだタップ(page.js の AUDIO_HOOK)からは全部聴こえる
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    // 裏に回った気になって描画をサボられると rAF 系の作品が止まる
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let err = '';
    const timer = setTimeout(() => reject(new Error(`ブラウザが 20 秒経っても起きない:\n${err}`)), 20000);
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`ブラウザが即終了した (code ${code}):\n${err}`));
    });
  });

  const cdp = await Cdp.connect(wsUrl);
  return {
    bin,
    cdp,
    proc,
    async close() {
      cdp.close();
      proc.kill();
      await new Promise((r) => {
        proc.once('exit', r);
        setTimeout(r, 3000).unref?.();
      });
      // ブラウザが書き残しをしている最中でも粘って消す(消えなくても実害はない)
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
      } catch { /* 一時ディレクトリの残骸は OS に任せる */ }
    },
  };
}
