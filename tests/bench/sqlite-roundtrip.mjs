/* eslint-disable */
/**
 * P2 受け入れ実証: `storage.sqlite_backend` flag ON の実ブラウザで
 * **永続化の往復**と**旧 IDB データの非破壊併存**を確かめる。
 *
 * シナリオ(すべて同一 profile / 固定ポート ── IDB / OPFS は origin 単位):
 *   A. flag OFF で boot → UI で entry「IDB-SEED-1」を作成(旧形式 = IDB に入る)
 *   B. flag ON  で boot → sqlite backend 成立 + IDB → sqlite 一括移行を確認、
 *      UI で entry「SQLITE-EDIT-2」を作成(こちらは sqlite にだけ書かれる)
 *   C. flag ON  で再 boot → **両方見える**(= sqlite の永続化往復が成立)
 *   D. flag OFF で再 boot → SEED は見える / EDIT-2 は**見えない**
 *      (= 旧 IDB は移行時点のまま無傷。sqlite 時代の編集が漏れていない)
 *   E. flag ON  で再 boot → EDIT-2 が戻る(OFF boot が sqlite 側を壊していない)
 *
 * D は Invariant 5「互換は双方向」の実機 pin ── 「この変更を知らない読み手
 * (旧形式しか読まないビルド相当)が storage を読んだら何が見えるか」を
 * 実際に見る。
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = 45714; // この harness 専用の固定ポート(他と衝突させない)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const FLAG = 'pkc-flag=storage.sqlite_backend%3Dtrue';
const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

const srv = await new Promise((r) => {
  const server = http.createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT + sep) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(f).pipe(res);
  });
  server.listen(PORT, '127.0.0.1', () => r({ origin: `http://127.0.0.1:${PORT}`, close: () => new Promise((x) => server.close(x)) }));
});

const prof = '/tmp/pw-sqlite-roundtrip';
rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1400, height: 950 },
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`   ${cond ? '✅' : '⛔'} ${name}${detail ? `(${detail})` : ''}`);
  if (!cond) failures++;
};

async function boot(withFlag) {
  await page.goto(`${srv.origin}/dist/pkc2.html${withFlag ? `?${FLAG}` : ''}`);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.waitForTimeout(400);
  return page.evaluate('window.__pkc2StorageInfo');
}

async function createEntry(title) {
  await page.locator('[data-pkc-action="create-entry"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`, null, { timeout: 20000 });
  const titleBox = page.locator('[data-pkc-field="title"]').first();
  await titleBox.click();
  await titleBox.fill(title);
  await page.locator('[data-pkc-field="body"]').first().click();
  await page.keyboard.type(`body of ${title}`);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`, null, { timeout: 20000 });
  await page.waitForTimeout(1800); // 保存 debounce(300ms)+ 書込完了余裕
}

async function sidebarTitles() {
  return page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((n) => n.textContent ?? ''), ROW_SEL);
}
const has = (titles, t) => titles.some((x) => x.includes(t));

console.log('■ A. flag OFF で seed(旧形式 = IDB)');
let info = await boot(false);
check('backend=idb / sqlite=false', info && info.backend === 'idb' && info.sqlite === false, JSON.stringify(info));
await createEntry('IDB-SEED-1');
check('IDB-SEED-1 が sidebar に居る', has(await sidebarTitles(), 'IDB-SEED-1'));

console.log('■ B. flag ON で boot(sqlite 成立 + 一括移行)+ sqlite 側で編集');
info = await boot(true);
check('sqlite backend 成立', info && info.sqlite === true, JSON.stringify(info));
check('IDB → sqlite 移行が走った', info && info.migrated === true);
check('移行後も IDB-SEED-1 が見える', has(await sidebarTitles(), 'IDB-SEED-1'));
await createEntry('SQLITE-EDIT-2');
check('SQLITE-EDIT-2 が sidebar に居る', has(await sidebarTitles(), 'SQLITE-EDIT-2'));

console.log('■ C. flag ON で再 boot(sqlite 永続化の往復)');
info = await boot(true);
check('sqlite backend 継続', info && info.sqlite === true);
check('2 回目は移行しない(idempotent)', info && info.migrated === false);
let titles = await sidebarTitles();
check('IDB-SEED-1 が残っている', has(titles, 'IDB-SEED-1'));
check('SQLITE-EDIT-2 が残っている(= OPFS sqlite に永続化された)', has(titles, 'SQLITE-EDIT-2'));

console.log('■ D. flag OFF で再 boot(旧 IDB の非破壊を実地確認)');
info = await boot(false);
check('IDB に戻る', info && info.sqlite === false);
titles = await sidebarTitles();
check('IDB-SEED-1 は見える(移行は非破壊)', has(titles, 'IDB-SEED-1'));
check('SQLITE-EDIT-2 は見えない(sqlite 側の編集は IDB に漏れない)', !has(titles, 'SQLITE-EDIT-2'));

console.log('■ E. flag ON で再々 boot(OFF boot が sqlite を壊していないか)');
info = await boot(true);
check('sqlite backend 復帰', info && info.sqlite === true);
titles = await sidebarTitles();
check('SQLITE-EDIT-2 が戻る', has(titles, 'SQLITE-EDIT-2'));

console.log('■ F. P3: asset(Blob record + meta 行)の store 契約を実機で往復');
const p3 = await page.evaluate(async () => {
  const store = window.__pkc2StoreDebug;
  const cid = 'p3check';
  await store.saveAsset(cid, 'a.bin', 'QUJDRA=='); // "ABCD"
  const b64 = await store.loadAsset(cid, 'a.bin');
  const blob = await store.loadAssetBlob(cid, 'a.bin');
  await store.saveAssetMeta(cid, { 'a.bin': { size: 4, hash: '0123456789abcdef' } });
  const meta = await store.loadAssetMeta(cid);
  await store.saveAssetMeta(cid, {});
  const metaAfterClear = await store.loadAssetMeta(cid);
  return {
    b64,
    isBlob: blob instanceof Blob,
    blobSize: blob ? blob.size : -1,
    meta,
    metaAfterClear,
  };
});
check('base64 → Blob record → base64 の両読み往復', p3.b64 === 'QUJDRA==');
check('loadAssetBlob が Blob(4 bytes)を返す', p3.isBlob && p3.blobSize === 4, JSON.stringify({ isBlob: p3.isBlob, size: p3.blobSize }));
check('asset meta が sqlite 行で往復する', JSON.stringify(p3.meta) === JSON.stringify({ 'a.bin': { size: 4, hash: '0123456789abcdef' } }), JSON.stringify(p3.meta));
check('行 0 件 = null(未索引と同型)', p3.metaAfterClear === null);
// meta 行が reload を跨いで残るか(worker/OPFS の実永続)
await page.evaluate(async () => {
  await window.__pkc2StoreDebug.saveAssetMeta('p3check', { 'a.bin': { size: 4, hash: 'feedfacefeedface' } });
});
info = await boot(true);
const metaAfterReload = await page.evaluate(() => window.__pkc2StoreDebug.loadAssetMeta('p3check'));
check('meta 行が reload を跨いで永続する', JSON.stringify(metaAfterReload) === JSON.stringify({ 'a.bin': { size: 4, hash: 'feedfacefeedface' } }), JSON.stringify(metaAfterReload));

if (pageErrors.length) {
  console.log(`⚠ pageerror ${pageErrors.length} 件:`);
  for (const e of pageErrors.slice(0, 5)) console.log(`   ${e}`);
  failures++;
}
console.log('');
console.log(failures === 0 ? '■ 全チェック通過' : `⛔ ${failures} 件失敗`);
await ctx.close();
await srv.close();
process.exit(failures === 0 ? 0 : 1);
