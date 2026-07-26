/* eslint-disable */
/**
 * 行リストの使い回し(2026-07-26)が **DOM を壊していないか**を実ブラウザで確認する。
 *
 * `canReuseEntryList` が true のとき、full render はサイドバーの
 * `<ul data-pkc-region="entry-list">` を作り直さず、既存 node を差し込む。
 * 判定 test(`tests/adapter/renderer-entry-list-reuse.test.ts`)は
 * 「使い回してよいか」しか見ない ── **実際に差し込んだ結果が正しいか**は
 * 実 DOM でしか確認できない(CLAUDE.md「描画と状態は別物」)。
 *
 * 確認するもの:
 *   - 行数 / 先頭行 / 選択ハイライトが編集の前後で保たれる
 *   - 🔴 **phase に依存する部分は更新される** ── 使い回しの代償が出ていないこと
 *     (編集中はルートへのドロップ枠が消え、ファイルドロップ枠が inactive になる)
 *
 * 使い方: node tests/bench/sidebar-reuse-dom-check.mjs
 */
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import http from 'node:http';
const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');
const ROOT='/home/user/PKC2', FIXTURE='bench-fixtures/c-1000-rev.json', CID='domchk';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
function serve(){const s=http.createServer((rq,rs)=>{try{const p=normalize(decodeURIComponent(new URL(rq.url,'http://x').pathname));const f=join(ROOT,p);if(!f.startsWith(ROOT+sep)&&f!==ROOT){rs.writeHead(403);rs.end();return;}if(!existsSync(f)||!statSync(f).isFile()){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'content-type':MIME[extname(f).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});createReadStream(f).pipe(rs);}catch(e){rs.writeHead(500);rs.end(String(e));}});return new Promise(r=>s.listen(0,'127.0.0.1',()=>r({origin:`http://127.0.0.1:${s.address().port}`,close:()=>new Promise(x=>s.close(x))})));}
const HOOK=`(()=>{let p;Object.defineProperty(window,'PKC',{configurable:true,get(){return p;},set(v){p=v;if(v&&typeof v==='object'&&!v.__t){Object.defineProperty(v,'__t',{value:true});let r=v.bootReady;const a=(q)=>{if(q&&q.then)q.then(()=>{window.__b=performance.now();});};Object.defineProperty(v,'bootReady',{configurable:true,get(){return r;},set(q){r=q;a(q);}});a(r);}}});})();`;
const ROW='[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';
const srv=await serve();
const raw=readFileSync(join(ROOT,FIXTURE),'utf8');
const lids=JSON.parse(raw).entries.filter(e=>e.archetype==='text').map(e=>e.lid);
rmSync('/tmp/pw-domchk',{recursive:true,force:true});
const ctx=await chromium.launchPersistentContext('/tmp/pw-domchk',{executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],viewport:{width:1280,height:900}});
await ctx.addInitScript(HOOK);
const page=await ctx.newPage();
await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForFunction('typeof window.__b === "number"',null,{timeout:180000});
await page.waitForTimeout(800);
await page.evaluate(async({raw,cid})=>{const c=JSON.parse(raw);c.meta.container_id=cid;const db=await new Promise((r,j)=>{const q=indexedDB.open('pkc2');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});await new Promise((r,j)=>{const t=db.transaction('containers','readwrite');const s=t.objectStore('containers');s.clear();s.put(c,cid);s.put(cid,'__default__');t.oncomplete=()=>r();t.onerror=()=>j(t.error);});db.close();},{raw,cid:CID});
await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForFunction('typeof window.__b === "number"',null,{timeout:300000});
await page.waitForFunction(`document.querySelectorAll('${ROW}').length > 50`,null,{timeout:120000});
await page.waitForTimeout(1200);

const snap=async()=>page.evaluate((sel)=>{
  const rows=[...document.querySelectorAll(sel)];
  return {
    n: rows.length,
    first: rows.slice(0,5).map(r=>r.getAttribute('data-pkc-lid')),
    selected: document.querySelector('[data-pkc-region="entry-list"] [data-pkc-selected="true"]')?.getAttribute('data-pkc-lid') ?? null,
    rootDrop: !!document.querySelector('[data-pkc-drop-target="root"]'),
    fileDropInactive: document.querySelector('[data-pkc-region="sidebar-file-drop-zone"]')?.getAttribute('data-pkc-inactive') ?? null,
    phase: document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase'),
  };
},ROW);

await page.locator(`${ROW}[data-pkc-lid="${lids[3]}"]`).first().click();
await page.waitForTimeout(300);
const before=await snap();
await page.locator('[data-pkc-action="begin-edit"]').first().click();
await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`,null,{timeout:20000});
await page.waitForTimeout(300);
const editing=await snap();
await page.locator('[data-pkc-field="body"]').first().click();
await page.keyboard.type('Z');
await page.locator('[data-pkc-action="commit-edit"]').first().click();
await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`,null,{timeout:20000});
await page.waitForTimeout(1500);
const after=await snap();
await ctx.close(); await srv.close();

const j=(o)=>JSON.stringify(o);
console.log('編集前  :', j(before));
console.log('編集中  :', j(editing));
console.log('確定後  :', j(after));
console.log('');
let ng=[];
if(editing.n!==before.n) ng.push(`行数が変わった ${before.n} → ${editing.n}`);
if(j(editing.first)!==j(before.first)) ng.push('先頭 5 行が変わった');
if(editing.selected!==before.selected) ng.push(`選択が動いた ${before.selected} → ${editing.selected}`);
if(editing.phase!=='editing') ng.push('phase 属性が editing になっていない');
if(editing.rootDrop) ng.push('🔴 編集中なのにルートドロップ枠が残っている(phase 依存部分が更新されていない)');
if(editing.fileDropInactive!=='true') ng.push('🔴 編集中なのにファイルドロップ枠が active のまま');
if(after.n!==before.n) ng.push(`確定後に行数が変わった ${before.n} → ${after.n}`);
if(!after.rootDrop) ng.push('確定後にルートドロップ枠が戻っていない');
if(after.fileDropInactive!==null) ng.push('確定後にファイルドロップ枠が inactive のまま');
if(ng.length){ console.log('⛔ 問題:'); for(const m of ng) console.log('  - '+m); process.exitCode=1; }
else console.log('✅ 行リスト・選択・phase 依存部分すべて期待どおり');
