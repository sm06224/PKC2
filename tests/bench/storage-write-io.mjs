/* eslint-disable */
/**
 * 保存形式の書込 I/O ベンチ(2026-07-25、user 指示「ベンチして根拠ありで正しく着地しましょう」)
 *
 * 測る軸は **書込ディスク I/O**。これは user 出典タグ付き指示の軸である:
 *   storage-v3-redesign-2026-07.md §A.7
 *   > user 指示「ディスク I/O に負荷をかけたくない。ゆるいストリーミング圧縮と
 *   >   チャンクパックはスケールのために必須」
 * 既存の io-bench.mjs は同じ軸を**プロトタイプ再実装**で測ったもの。本ベンチは
 * **本番コード経路**(dist/pkc2.html を実 UI 操作で動かす)を測る。
 *
 * 答えたい問い:
 *   差分保存の保存形式を **split v1 から layout 5 へ一本化すべきか**。
 *   #958 で差分保存の既定 ON が撤回された理由は「split 形式が数千 record の
 *   分散読みで boot が極端に遅い」= split v1 の欠陥であり、layout 5
 *   (meta 単一 record + segments の gzip パック)はその後継。いま差分保存だけを
 *   ON にすると **#958 で刺さった当の形式が書かれる**。
 *
 * 腕:
 *   Z 床(無操作)     編集を 1 回もしない → ブラウザ放置時のノイズ床
 *   Y 対照群(同操作・保存なし) 同じクリック・打鍵・phase 遷移をして
 *                    **CANCEL_EDIT で抜ける**(SAVE_TRIGGERS に無い)→ 保存だけ起きない
 *   A 既定           differential_save=0 lazy=0 → save() = inline 全件
 *   B 差分保存のみ    differential_save=1 lazy=0 → saveDiff() targetLayout 1 = split v1
 *   C 差分保存+lazy   differential_save=1 lazy=1 → saveDiff() targetLayout 5 = segments
 *
 * **保存に帰せられる書込 = その腕の定常書込 − Y の定常書込。**
 *
 * ⚠ Y が本ハーネスの肝である。最初は Z(放置)だけを対照群にして
 *   「1 編集あたり 3.2MB」という数字を出したが、コンテナを 1/10(4.8MB → 500KB)に
 *   しても同じ値(4.1MB)が出た ── つまり測れていたのは保存ではなく
 *   **操作そのものがブラウザに書かせる分**だった。放置は「クリックされたブラウザ」を
 *   制御しない。同じことを boot 測定でもやって同条件 2 回で符号が逆転している
 *   (+19.2% ↔ -23.2%)。**対照群の振れ幅より小さい差を「改善」と呼ばない**、
 *   そして **対照群は「測りたい操作以外を全部同じにしたもの」でなければならない**。
 *
 * 使い方(Linux 前提 — /proc/diskstats を使う):
 *   node tests/bench/storage-write-io.mjs
 *   WIO_FIXTURE=bench-fixtures/c-5000-rev.json WIO_EDITS=30 node tests/bench/storage-write-io.mjs
 *
 * 事前に fixture を作る(revisions 入り。既存 c-*.json は revisions 0 件で、
 * segments の勝ち筋である履歴の gzip パックが一切効かない):
 *   npx tsx build/scripts/generate-bench-container.ts \
 *     --entries=1000 --revisions=3000 --output=bench-fixtures/c-1000-rev.json
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import http from 'node:http';

const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const FIXTURE = process.env.WIO_FIXTURE || 'bench-fixtures/c-1000-rev.json';
const EDITS = Number(process.env.WIO_EDITS || 20);
const BOOTS = Number(process.env.WIO_BOOTS || 5);
const CID = 'wiobench';
/** 保存 debounce(既定 300ms)。編集はこれより十分あけて 1 編集 = 1 保存にする。 */
const EDIT_GAP_MS = 900;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveRepo() {
  const server = http.createServer((req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      let file = join(ROOT, path);
      if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403); res.end(); return; }
      if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({
    server, origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((x) => server.close(x)),
  })));
}

/** 実デバイス書込 MB(/proc/diskstats field 10 = sectors written、512B 単位)。 */
function deviceWrittenMB() {
  execSync('sync');
  const line = readFileSync('/proc/diskstats', 'utf8')
    .split('\n').find((l) => /\bvda\b/.test(l));
  if (!line) throw new Error('/proc/diskstats に vda が無い — この環境では実書込を測れない');
  return (Number(line.trim().split(/\s+/)[9]) * 512) / 1048576;
}

/**
 * boot 所要をページ内 performance.now() で拾う仕掛け。ハーネス側の wall clock は
 * polling 粒度と CDP 往復が混ざるので使わない。
 */
const BOOT_HOOK = `(() => {
  let pkc;
  Object.defineProperty(window, 'PKC', {
    configurable: true,
    get() { return pkc; },
    set(v) {
      pkc = v;
      if (v && typeof v === 'object' && !v.__timed) {
        let ready = v.bootReady;
        Object.defineProperty(v, '__timed', { value: true });
        const arm = (p) => { if (p && p.then) p.then(() => { window.__bootMs = performance.now(); }); };
        Object.defineProperty(v, 'bootReady', {
          configurable: true,
          get() { return ready; },
          set(p) { ready = p; arm(p); },
        });
        arm(ready);
      }
    },
  });
})();`;

/** 現在の storage 実態を読む(layout / segments 件数 / 使用量)。 */
const PROBE = `(async () => {
  const open = () => new Promise((res, rej) => {
    const rq = indexedDB.open('pkc2');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  const db = await open();
  const names = [...db.objectStoreNames];
  const all = async (store) => {
    if (!names.includes(store)) return [];
    return await new Promise((res) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
      r.onsuccess = () => res(r.result.map(String));
      r.onerror = () => res([]);
    });
  };
  const get = (store, key) => new Promise((res) => {
    if (!names.includes(store)) return res(null);
    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
    r.onsuccess = () => res(r.result ?? null);
    r.onerror = () => res(null);
  });
  const core = await get('containers', ${JSON.stringify(CID)});
  const est = await navigator.storage.estimate();
  return {
    layout: core && core.__pkc_layout__ ? core.__pkc_layout__ : 1,
    containerKeys: (await all('containers')).length,
    segments: (await all('segments')).length,
    entries: core && core.entries ? core.entries.length : 0,
    revisions: core && core.revisions ? core.revisions.length : 0,
    usageMB: (est.usage ?? 0) / 1048576,
  };
})()`;

/** 編集対象にする text エントリの lid(決定的な順序で、腕をまたいで同一)。 */
function textLidsOf(fixturePath) {
  const c = JSON.parse(readFileSync(join(ROOT, fixturePath), 'utf8'));
  return c.entries.filter((e) => e.archetype === 'text').map((e) => e.lid);
}

async function seed(page, fixturePath) {
  const json = readFileSync(join(ROOT, fixturePath), 'utf8');
  return await page.evaluate(async ({ raw, cid }) => {
    const cont = JSON.parse(raw);
    cont.meta.container_id = cid;
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('pkc2');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    await new Promise((res, rej) => {
      const t = db.transaction('containers', 'readwrite');
      const s = t.objectStore('containers');
      s.clear();
      s.put(cont, cid);
      s.put(cid, '__default__');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    return { entries: cont.entries.length, revisions: cont.revisions.length };
  }, { raw: json, cid: CID });
}

// サイドバー行(li[data-pkc-action="select-entry"])は archetype 属性を持たず
// `data-pkc-lid` を持つ(実 DOM で確認済)。よって **fixture から text の lid を
// 取り出して lid 指定でクリック**する。
//
// text に限る理由: todo の `[data-pkc-field="body"]` は hidden input(JSON body)で
// クリックできず、archetype ごとに編集面の形が違う。混ぜると「腕の差」ではなく
// 「たまたま当たった archetype の差」を測ってしまう。
const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';
const ROWS = `document.querySelectorAll('${ROW_SEL}').length`;

async function bootOnce(page, origin, flags) {
  const qs = Object.entries(flags).map(([k, v]) => `pkc-flag=${k}=${v}`).join('&');
  await page.goto(`${origin}/dist/pkc2.html?${qs}`);
  await page.waitForFunction('typeof window.__bootMs === "number"', null, { timeout: 120000 });
  const ms = await page.evaluate('window.__bootMs');
  await page.waitForTimeout(600);
  return ms;
}

/**
 * 1 編集 = エントリを選ぶ → 編集開始 → 本文に 1 文字足す → 確定 or 取消。
 *
 * `commit` を false にすると **CANCEL_EDIT** で抜ける。CANCEL_EDIT は
 * SAVE_TRIGGERS(persistence.ts:48-79)に無く ENTRY_UPDATED も出さないので、
 * **クリック・打鍵・phase 遷移・再描画はまったく同じまま保存だけ起きない**。
 * これが対照群 Y の正体 ── 「操作そのものがブラウザに書かせる分」を差し引くために要る。
 *
 * ⚠ 対照群を「ブラウザ放置」にしてはいけない(最初そうして失敗した)。
 *   放置比では 1 編集 4MB 級と出るが、コンテナを 1/10 にしても同じ値が出る。
 *   つまり測れていたのは保存ではなく操作のオーバーヘッドだった。
 */
async function editOnce(page, lid, commit = true) {
  await page.locator(`${ROW_SEL}[data-pkc-lid="${lid}"]`).first().click();
  await page.waitForTimeout(120);
  const edit = page.locator('[data-pkc-action="begin-edit"]').first();
  await edit.click();
  await page.waitForFunction(
    `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`,
    null, { timeout: 20000 },
  );
  const body = page.locator('[data-pkc-field="body"]').first();
  await body.click();
  await page.keyboard.type('x');
  await page.locator(`[data-pkc-action="${commit ? 'commit-edit' : 'cancel-edit'}"]`).first().click();
  await page.waitForFunction(
    `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`,
    null, { timeout: 20000 },
  );
}

const OFF = { 'persistence.differential_save': 0, 'persistence.lazy_entry_bodies': 0 };
const ARMS = [
  { key: 'Z', label: '床(無操作)', flags: OFF, edits: 0, commit: true },
  { key: 'Y', label: '対照群(同操作・保存なし)', flags: OFF, edits: EDITS, commit: false },
  { key: 'A', label: '既定(inline)', flags: OFF, edits: EDITS, commit: true },
  { key: 'B', label: '差分保存のみ(split v1)', flags: { 'persistence.differential_save': 1, 'persistence.lazy_entry_bodies': 0 }, edits: EDITS, commit: true },
  { key: 'C', label: '差分保存+lazy(layout 5)', flags: { 'persistence.differential_save': 1, 'persistence.lazy_entry_bodies': 1 }, edits: EDITS, commit: true },
];

const srv = await serveRepo();
const TEXT_LIDS = textLidsOf(FIXTURE);
if (TEXT_LIDS.length === 0) throw new Error(`${FIXTURE} に text エントリが無い — このワークロードは成立しない`);
const fixtureMB = statSync(join(ROOT, FIXTURE)).size / 1048576;
console.log(`fixture: ${FIXTURE} (${fixtureMB.toFixed(1)} MB) / text ${TEXT_LIDS.length} 件 / 編集 ${EDITS} 回 / boot ${BOOTS} 回`);
console.log('');

const results = [];
for (const arm of ARMS) {
  const prof = `/tmp/pw-wio-${arm.key}`;
  rmSync(prof, { recursive: true, force: true });
  // ephemeral context は storage がメモリバックになり実 I/O を踏まない
  // (io-bench.mjs が 2026-07-22 に踏んだ計測バグ)。persistent 必須。
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addInitScript(BOOT_HOOK);
  const page = await ctx.newPage();

  // 同一 origin にしてから seed(IndexedDB は origin 単位)。
  // ⚠ boot 完了まで待ってから seed する。promise の存在だけ見て書くと、
  //   まだ走っているアプリ自身の初期保存に上書きされて seed が消える。
  await page.goto(`${srv.origin}/dist/pkc2.html`);
  await page.waitForFunction('typeof window.__bootMs === "number"', null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const seeded = await seed(page, FIXTURE);

  // seed をアプリが本当に読んだか確認してから測る。ここを飛ばすと
  // 空コンテナ同士を比べて無意味な数字が出る。
  await bootOnce(page, srv.origin, arm.flags);
  await page.waitForFunction(`${ROWS} > 50`, null, { timeout: 60000 });
  const rows = await page.evaluate(ROWS);

  // ── ① 変換フェーズ(一回きり)──────────────────────────
  // その flag が選ぶ layout へ storage を変換する初回保存。定常コストと
  // 混ぜてはいけないので独立に測る。
  const convBefore = deviceWrittenMB();
  if (arm.edits > 0) {
    await editOnce(page, TEXT_LIDS[0], arm.commit);
    await page.waitForTimeout(4000);
  } else {
    await page.waitForTimeout(4000);
  }
  const convMB = deviceWrittenMB() - convBefore;
  const afterConv = await page.evaluate(PROBE);

  // ── ② 定常フェーズ ────────────────────────────────
  const steadyBefore = deviceWrittenMB();
  const walls = [];
  for (let i = 0; i < arm.edits; i++) {
    const t0 = Date.now();
    await editOnce(page, TEXT_LIDS[(i + 1) % TEXT_LIDS.length], arm.commit);
    walls.push(Date.now() - t0);
    await page.waitForTimeout(EDIT_GAP_MS);
  }
  // 保存は debounce 後に非同期で走り、実デバイスへはさらに遅れて落ちる。
  await page.waitForTimeout(5000);
  const steadyMB = deviceWrittenMB() - steadyBefore;
  const probe = await page.evaluate(PROBE);

  // ── ③ boot フェーズ ───────────────────────────────
  const boots = [];
  for (let i = 0; i < BOOTS; i++) boots.push(await bootOnce(page, srv.origin, arm.flags));
  boots.sort((a, b) => a - b);
  const bootMed = boots[Math.floor(boots.length / 2)];

  await ctx.close();

  const perEditKB = arm.edits > 0 ? (steadyMB * 1024) / arm.edits : 0;
  results.push({
    ...arm, rows, seeded, convMB, steadyMB, perEditKB, bootMed, probe, afterConv,
    wallMed: walls.length ? walls.sort((a, b) => a - b)[Math.floor(walls.length / 2)] : 0,
  });

  console.log(`■ ${arm.key} ${arm.label}`);
  console.log(`   seed ${seeded.entries} entries / ${seeded.revisions} revisions → サイドバー ${rows} 行`);
  console.log(`   変換(1 回きり)     実書込 ${convMB.toFixed(1)} MB  → layout ${afterConv.layout} / segments ${afterConv.segments}`);
  console.log(`   定常 ${String(arm.edits).padStart(2)} 編集       実書込 ${steadyMB.toFixed(1)} MB`
    + (arm.edits > 0 ? `  = 1 編集あたり ${perEditKB.toFixed(0)} KB` : '  ← ノイズ床'));
  console.log(`   最終 storage        layout ${probe.layout} / containers ${probe.containerKeys} 件`
    + ` / segments ${probe.segments} 件 / 使用量 ${probe.usageMB.toFixed(1)} MB`);
  console.log(`   boot 中央値         ${bootMed.toFixed(0)} ms`);
  console.log('');
}

await srv.close();

// ── 判定 ────────────────────────────────────────────
const at = (k) => results.find((r) => r.key === k);
const [Z, Y, A, B, C] = ['Z', 'Y', 'A', 'B', 'C'].map(at);

// **保存に帰せられる書込 = その腕の定常書込 − 対照群 Y の定常書込。**
// Y は同じ操作を CANCEL_EDIT で抜けるので保存だけが無い。この引き算をしないと
// 「操作がブラウザに書かせる分」(コンテナサイズに依存しない数 MB)が全部
// 保存コストに見えてしまう。
const savePerEditKB = (r) => ((r.steadyMB - Y.steadyMB) * 1024) / r.edits;

console.log('─'.repeat(72));
console.log(`床 Z(無操作)          : 実書込 ${Z.steadyMB.toFixed(1)} MB`);
console.log(`対照群 Y(同操作・保存なし): 実書込 ${Y.steadyMB.toFixed(1)} MB / ${Y.edits} 操作`
  + ` = 1 操作あたり ${((Y.steadyMB * 1024) / Y.edits).toFixed(0)} KB(これは保存ではなく操作の代金)`);
console.log('');
console.log('| 腕 | 定常書込 | **保存に帰せられる分**(Y 差引) | 変換 1 回 | 最終使用量 | boot 中央値 | layout |');
console.log('|---|---|---|---|---|---|---|');
for (const r of [A, B, C]) {
  console.log(`| ${r.key} ${r.label} | ${r.steadyMB.toFixed(1)} MB`
    + ` | **${savePerEditKB(r).toFixed(0)} KB / 編集** | ${r.convMB.toFixed(1)} MB`
    + ` | ${r.probe.usageMB.toFixed(1)} MB | ${r.bootMed.toFixed(0)} ms | ${r.probe.layout} |`);
}
console.log('');

let invalid = false;
for (const r of [A, B, C]) {
  if (r.steadyMB <= Y.steadyMB) {
    console.log(`⚠ ${r.key} の定常書込 ${r.steadyMB.toFixed(1)} MB が対照群 Y ${Y.steadyMB.toFixed(1)} MB 以下`
      + ' — 保存分が操作の代金に埋もれている。この腕の数字は無効');
    invalid = true;
  }
}
if (B.probe.layout === C.probe.layout) {
  console.log(`⚠ B と C の layout が同じ(${B.probe.layout})— flag が効いていない。計測が無効`);
  invalid = true;
}
if (invalid) {
  console.log('\n⛔ 上の警告がある限り、この実行の数字を結論に使ってはならない。');
} else {
  const rel = (x, base) => ((x - base) / base) * 100;
  console.log(`C(layout 5)対 B(split v1): 保存書込 ${rel(savePerEditKB(C), savePerEditKB(B)).toFixed(1)}%`);
  console.log(`C(layout 5)対 A(inline)  : 保存書込 ${rel(savePerEditKB(C), savePerEditKB(A)).toFixed(1)}%`);
  console.log(`boot(A 比): B ${rel(B.bootMed, A.bootMed).toFixed(1)}% / C ${rel(C.bootMed, A.bootMed).toFixed(1)}%`);
}
