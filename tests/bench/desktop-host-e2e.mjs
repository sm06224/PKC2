/* eslint-disable */
/**
 * L4: exe の中で PKC2 を開き、**host の実ファイル DB が正本になる**ことの実証
 * (設計 doc の「案 B」、2026-07-27)。
 *
 * `desktop-host-roundtrip.mjs` が host 単体の契約を見るのに対し、こちらは
 * **ページ ↔ host の end-to-end**:
 *   1. exe が配る単一 HTML を実 browser で開く
 *   2. UI で entry を作る
 *   3. その entry が **host の sqlite 実ファイル**に入っている
 *   4. host を再起動しても残っている(ブラウザ storage ではない証拠)
 *
 * ⚠ 3 が無いと「案 A(シェルだけ)」と区別できない ── 同じ HTML が webview で
 *    動くことと、その HTML が host DB を使うことは**別の話**である。
 *
 * 使い方: npm run build && node tests/bench/desktop-host-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');

const dataDir = mkdtempSync(join(tmpdir(), 'pkc2-e2e-'));
const dbPath = join(dataDir, 'pkc2.db');
const PORT = 45761;
const origin = `http://127.0.0.1:${PORT}`;
const spawnHost = () => spawn('/root/.bun/bin/bun', ['run', 'desktop/pkc2-host.ts', '--no-webview'],
  { env: { ...process.env, PKC2_DB: dbPath, PKC2_PORT: String(PORT) }, stdio: ['ignore','pipe','pipe'] });
let host = spawnHost();
const waitUp = async () => { const dl=Date.now()+20000; while(Date.now()<dl){ try{ if((await fetch(`${origin}/__pkc/host`)).ok) return true; }catch{} await new Promise(r=>setTimeout(r,200)); } return false; };
if (!await waitUp()) { console.log('host 起動せず'); process.exit(1); }

const ctx = await chromium.launchPersistentContext('/tmp/pw-host-e2e', {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'], viewport: { width: 1400, height: 950 },
});
const page = await ctx.newPage();
page.on('console', m => { const t=m.text(); if (t.includes('PKC2')) console.log('   page:', t); });
await page.goto(`${origin}/?pkc-flag=storage.sqlite_backend%3Dtrue`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
console.log('storage info:', JSON.stringify(await page.evaluate('window.__pkc2StorageHost ?? null')));
console.log('backend info:', JSON.stringify(await page.evaluate('window.__pkc2StorageInfo ?? null')));

// entry を 1 件作る
const newBtn = page.locator('[data-pkc-action="toggle-new-picker"]').first();
if (await newBtn.count() > 0) { await newBtn.click(); await page.locator('.pkc-new-picker-row[data-pkc-archetype="text"]').first().click(); }
else await page.locator('.pkc-btn-create[data-pkc-archetype="text"]').first().click();
await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase')==='editing'`, null, {timeout:20000});
await page.locator('[data-pkc-field="title"]').first().fill('HOST-DB-1');
await page.locator('[data-pkc-action="commit-edit"]').first().click();
await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase')==='ready'`, null, {timeout:20000});
await page.waitForTimeout(1500);

// host の DB に直接問い合わせて、実ファイルに入ったか確認
const cid = (await (await fetch(`${origin}/__pkc/storage`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'getDefaultCid'})})).json()).result;
const rows = (await (await fetch(`${origin}/__pkc/storage`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'loadContainer',cid})})).json()).result;
console.log('host DB entries:', JSON.stringify(rows?.entries?.map(e=>e.title)));
console.log('=> HOST-DB-1 が host の実ファイルに入った:', rows?.entries?.some(e=>e.title==='HOST-DB-1'));

// host を再起動して、ページ再読込でデータが戻るか
host.kill('SIGTERM'); await new Promise(r=>setTimeout(r,800));
host = spawnHost(); await waitUp();
await page.goto(`${origin}/?pkc-flag=storage.sqlite_backend%3Dtrue`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.waitForTimeout(800);
const visible = await page.evaluate(() => Array.from(document.querySelectorAll('[data-pkc-region="entry-list"] li.pkc-entry-item')).map(e=>e.textContent?.trim()));
console.log('=> host 再起動後もページに見える:', visible.some(t=>t?.includes('HOST-DB-1')), JSON.stringify(visible.slice(0,3)));

await ctx.close(); host.kill('SIGKILL'); rmSync(dataDir,{recursive:true,force:true});
