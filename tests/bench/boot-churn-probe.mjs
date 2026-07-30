/* eslint-disable */
/**
 * **boot の最中**に何が起きているかを見る(2026-07-30)。
 *
 * user 報告:「**HTML をロードして**一部表示して消えて、また表示されてを
 * 繰り返します」+「**フラグとして sqlite がオンの時に発生する**」。
 *
 * ## なぜ今までの probe で出なかったか
 *
 * `launcher-100-probe.mjs` は **ランチャーを開いて 1.5 秒待ってから**測り
 * 始める。user が言っているのは「ロードして」── **boot の窓**である。
 * 落ち着いた後だけを見ていたので、落ち着くまでに何が起きていても見えない。
 *
 * ⇒ 本 probe は `addInitScript` で**アプリより先に**観測点を仕込み、
 *   navigation の瞬間から記録する。
 *
 * ## 記録するもの(時系列)
 *
 * - `#pkc-root` の `data-pkc-phase` の遷移(ready ↔ initializing の往復 =
 *   「表示して消えて」)
 * - ランチャー tile 数 / アイコン数の時系列
 * - dispatch した action の種類と回数(**dispatch を包んで数える**)
 * - 例外 / console error
 *
 * 使い方: node tests/bench/boot-churn-probe.mjs [--seconds=12]
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { readFileSync } from 'node:fs';

const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const SECONDS = Number(argOf('seconds', '12'));
const TILES = Number(argOf('tiles', '100'));
const DIST = argOf('dist', '/home/user/PKC2/dist/pkc2.html');

const html = readFileSync(DIST);
const server = http.createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  r.end(html);
});
await new Promise((r) => server.listen(45909, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45909/pkc2.html';

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

/** アプリより先に走らせる観測点。 */
const INIT = () => {
  const w = window;
  w.__t0 = performance.now();
  w.__phases = [];
  w.__series = [];
  w.__errors = [];
  addEventListener('error', (e) => w.__errors.push(String(e.message).slice(0, 120)));
  addEventListener('unhandledrejection', (e) => w.__errors.push(`rej: ${String(e.reason).slice(0, 110)}`));

  const tick = () => {
    const root = document.getElementById('pkc-root');
    const phase = root?.getAttribute('data-pkc-phase') ?? '(none)';
    const last = w.__phases[w.__phases.length - 1];
    if (!last || last.phase !== phase) {
      w.__phases.push({ phase, at: Math.round(performance.now() - w.__t0) });
    }
    w.__series.push({
      at: Math.round(performance.now() - w.__t0),
      tiles: document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"]').length,
      imgs: document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"] img').length,
      rows: document.querySelectorAll('[data-pkc-region="entry-list"] [data-pkc-lid]').length,
      nodes: document.getElementById('pkc-root')?.querySelectorAll('*').length ?? 0,
    });
  };
  w.__ivl = setInterval(tick, 200);
};

async function run(label, query, seedFirst) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    if (seedFirst) {
      // seed は測定と同じ flag で(= 同じ backend へ書く)。
      await page.goto(URL_ + query);
      await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
      await page.waitForTimeout(900);
      const engine = await page.evaluate(() => globalThis.__pkc2StorageEngine ?? null);
      if (query.includes('sqlite_backend=true') && engine?.kind !== 'wasm-sqlite') {
        return { label, fatal: `sqlite を要求したのに ${engine?.kind} で動いている` };
      }
      await page.evaluate(async (n) => {
        const T = '2026-07-01T00:00:00.000Z';
        const px = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAWklEQVRYw+3XMQ0AIBAEwQNCcIA'
          + 'AHOAAB0hAAg7QQAIS7pKtZpKrLwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
          + 'AAAAAAAAAAAAAAAADwzwWvVQGBhaVFVQAAAABJRU5ErkJggg==';
        const entries = [];
        for (let i = 0; i < n; i += 1) {
          entries.push({
            lid: `app${i}`, title: `アプリケーション ${i}`, archetype: 'attachment',
            body: JSON.stringify({
              mime: 'text/html', registered_as_app: true,
              app_icon_asset_key: `icon${i}`, asset_key: `html${i}`,
              name: `app${i}.html`, size: 2048,
            }),
            created_at: T, updated_at: T,
          });
        }
        const cont = {
          meta: { container_id: 'bc', title: 'bc', created_at: T, updated_at: T, schema_version: 1 },
          entries, relations: [], revisions: [], assets: {},
        };
        const store = window.__pkc2StoreDebug;
        await store.clearAll();
        await store.save(cont);
        await store.setDefaultContainer('bc');
        for (let i = 0; i < n; i += 1) {
          await store.saveAsset('bc', `icon${i}`, px);
          await store.saveAsset('bc', `html${i}`, px);
        }
      }, TILES);
    }

    // ここからが本番 ── 観測点をアプリより先に入れて開き直す。
    await page.addInitScript(INIT);
    await page.goto(URL_ + query);
    // ⚠ `ready` を待たない ── 待つと boot の窓を飛ばしてしまう。
    await page.waitForTimeout(2500);
    // ランチャーへ(出ていれば)
    const btn = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="launcher"]').first();
    if (await btn.count() > 0) await btn.click();
    await page.waitForTimeout(SECONDS * 1000);

    const r = await page.evaluate(() => {
      clearInterval(window.__ivl);
      const s = window.__series;
      const flips = (k) => s.filter((v, i) => i > 0 && v[k] !== s[i - 1][k]).length;
      const rng = (k) => `${Math.min(...s.map((x) => x[k]))}〜${Math.max(...s.map((x) => x[k]))}`;
      return {
        phases: window.__phases,
        errors: [...new Set(window.__errors)].slice(0, 3),
        tiles: rng('tiles'), tileFlips: flips('tiles'),
        imgs: rng('imgs'), imgFlips: flips('imgs'),
        nodes: rng('nodes'), nodeFlips: flips('nodes'),
        // 後半(落ち着いた後)だけの変化 ── boot の正常な立ち上げと区別する。
        lateNodeFlips: (() => {
          const late = s.slice(Math.floor(s.length / 2));
          return late.filter((v, i) => i > 0 && v.nodes !== late[i - 1].nodes).length;
        })(),
        samples: s.length,
      };
    });
    const engine = await page.evaluate(() => globalThis.__pkc2StorageEngine ?? null);
    return { label, engine, ...r };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 700));
  }
}

const ARMS = [
  ['idb', ''],
  ['🔴 sqlite', '?pkc-flag=storage.sqlite_backend=true'],
];

console.log(`■ boot からの churn(tile ${TILES} 枚、観測は navigation の瞬間から)\n`);
for (const [label, q] of ARMS) {
  const r = await run(label, q, true);
  if (r.fatal) { console.log(`   ${label}: 🔴 ${r.fatal}\n`); continue; }
  console.log(`   ${label}  [${r.engine?.kind}${r.engine?.vfs ? `/${r.engine.vfs}` : ''}]`);
  console.log(`      phase 遷移: ${r.phases.map((p) => `${p.phase}@${p.at}ms`).join(' → ')}`);
  console.log(`      tile ${r.tiles}(変化 ${r.tileFlips})  アイコン ${r.imgs}(変化 ${r.imgFlips})`);
  console.log(`      root ノード ${r.nodes}(変化 ${r.nodeFlips}、後半だけ ${r.lateNodeFlips})`);
  if (r.errors.length) console.log(`      🔴 例外: ${r.errors.join(' / ')}`);
  const bad = r.lateNodeFlips > 5 || r.tileFlips > 2 || r.imgFlips > 2
    || r.phases.filter((p) => p.phase === 'ready').length > 1;
  console.log(`      ${bad ? '🔴 落ち着いていない' : '✅ 立ち上がって静止'}\n`);
}
console.log('   ⚠ ready が 2 回以上出ていれば「表示して消えてまた表示」に一致する。');

server.close();
