// PKC2 — persistence.lazy_entry_bodies の診察(既定 ON にすべきか)
//
// user の問い(2026-07-25):「lazy_entry_bodies は既定オンにしたほうがいいの?
// そこらへんのパフォーマンステストやったっけ?」
//
// 触診 = 1000 エントリの実データを積んで実際に起動する。
// 視診 = 起動後の画面が本当に出来上がっているか(bootReady は嘘をつかないか)。
// 計測 = boot 所要を **ページ内の performance.now()** で拾う。
//        ハーネス側の wall clock だと polling 粒度と CDP 往復が混ざるので、
//        `window.PKC.bootReady` が install された瞬間に setter で捕まえて
//        resolve 時刻を直接読む(navigation 開始が時間原点)。
//
// 比較する 3 本(**各腕は「その flag で 1 回保存して layout を変換してから」測る**。
// 変換前に測ると「v1 の storage を ON のビルドで読んだだけ」で無意味):
//   A) 両方 OFF        … 現行の既定。storage layout 1(本文が container record に同居)
//   B) lazy だけ ON    … **対照群**。lazyBodies() は saveDiff の中でしか読まれず、
//                        differential_save が OFF だと persistence.ts は save() を呼ぶ。
//                        つまり storage は A と完全に同一のはず ── ならば
//                        B と A の差 = 本来 0 の差 = **この測定のノイズ床**。
//   C) lazy + differential_save 両方 ON … ここで初めて layout 5(segments)へ切り替わる。
// C を A と比べるだけでは速い/遅いを語る資格が無い。必ず B の床と比べる。

const FIXTURE = process.env.LAZY_FIXTURE || '/bench-fixtures/c-1000.json';
const CID = 'lazybench';
const REPEATS = Number(process.env.LAZY_REPEATS || 9);
/** 最初の N 回は捨てる(ブラウザのキャッシュ・JIT が温まるまで倍ぶれる)。 */
const WARMUP = 2;

/** bootReady の resolve 時刻(navigation 起点 ms)をページ内で捕まえる仕掛け。 */
const BOOT_TIMER_HOOK = `
(() => {
  let pkc = undefined;
  Object.defineProperty(window, 'PKC', {
    configurable: true,
    get() { return pkc; },
    set(v) {
      pkc = v;
      if (v && typeof v === 'object' && !v.__timed) {
        let ready = v.bootReady;
        Object.defineProperty(v, '__timed', { value: true });
        Object.defineProperty(v, 'bootReady', {
          configurable: true,
          get() { return ready; },
          set(p) {
            ready = p;
            if (p && typeof p.then === 'function') {
              p.then(() => { window.__bootMs = performance.now(); });
            }
          },
        });
        if (ready && typeof ready.then === 'function') {
          ready.then(() => { window.__bootMs = performance.now(); });
        }
      }
    },
  });
})();
`;

/** fixture を IndexedDB に積む(ページ内 fetch なのでハーネスを経由しない)。 */
const SEED = `(async () => {
  const res = await fetch(${JSON.stringify(FIXTURE)});
  const cont = await res.json();
  cont.meta.container_id = ${JSON.stringify(CID)};
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('pkc2');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['containers'], 'readwrite');
      tx.objectStore('containers').clear();
      tx.objectStore('containers').put(cont, ${JSON.stringify(CID)});
      tx.objectStore('containers').put(${JSON.stringify(CID)}, '__default__');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
  return cont.entries.length;
})()`;

/**
 * storage の実態を覗く。
 * ⚠ 本文の置き場は **segments バケット**(layout v5)── flag の description は
 *   「storage layout v2 / __body__ record」と書いているが、実装
 *   (idb-store.ts の `targetLayout = wantSplitBodies ? 5 : 1`)は v5 を書く。
 *   最初 containers ストアだけ見て「変換されていない」と誤判定した。
 */
const LAYOUT_PROBE = `(async () => {
  return await new Promise((resolve) => {
    const req = indexedDB.open('pkc2');
    req.onerror = () => resolve({ error: String(req.error) });
    req.onsuccess = () => {
      const db = req.result;
      const names = Array.from(db.objectStoreNames);
      const tx = db.transaction(names, 'readonly');
      const out = { stores: {}, layout: null, entriesInCore: null };
      let pending = names.length;
      for (const name of names) {
        const kreq = tx.objectStore(name).getAllKeys();
        kreq.onsuccess = () => {
          out.stores[name] = kreq.result.map(String);
          if (--pending === 0) {
            const core = tx.objectStore('containers').get(${JSON.stringify(CID)});
            core.onsuccess = () => {
              const rec = core.result;
              out.layout = rec && rec.__pkc_layout__ !== undefined ? rec.__pkc_layout__ : (rec ? 1 : null);
              out.entriesInCore = rec && Array.isArray(rec.entries) ? rec.entries.length : null;
              out.bodiesInCore = rec && Array.isArray(rec.entries)
                ? rec.entries.filter((e) => e && e.body).length : null;
              resolve(out);
              db.close();
            };
          }
        };
      }
    };
  });
})()`;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default {
  name: 'PKC2 — lazy_entry_bodies の boot 実測(1000 エントリ)',

  async run(t) {
    // boot タイマーを **ページのスクリプトより前に**仕込む
    await t.page.cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: BOOT_TIMER_HOOK },
      t.page.sessionId,
    );

    // 一度開いて同一 origin にしてから seed(IndexedDB は origin 単位)。
    // ⚠ **boot 完了まで待ってから** seed する。promise の存在だけ確認して
    //    書き込むと、まだ走っているアプリ自身の初期保存に上書きされて
    //    seed が消える(実際に踏んだ:サイドバー 0 件になる)。
    await t.goto('/dist/pkc2.html');
    await t.page.waitFor('!!(window.PKC && window.PKC.bootReady)', { timeout: 20000, label: 'boot signal' });
    await t.page.eval('PKC.bootReady.then(() => true)');
    await t.page.settle(800);
    const n = await t.page.eval(SEED);
    t.note(`fixture 投入: ${n} エントリ(${FIXTURE})`);

    // ⚠ 投入しただけで満足しない。**アプリが本当にそれを読んだか**を先に確かめる。
    //   ここを飛ばして計測すると、空コンテナ同士を比べて「39.8% 速い」という
    //   無意味な数字が出る(実際に一度出した)。
    await t.goto('/dist/pkc2.html');
    await t.page.waitFor('typeof window.__bootMs === "number"', { timeout: 60000, every: 40, label: 'seed 後の boot' });
    // ⚠ bootReady の直後に DOM を数えると 0 が返る(初回 render の反映待ち)。
    //    ここを settle 無しで見て「fixture が載っていない」と一度誤診した。
    await t.page.settle(600);
    const ROWS = `document.querySelectorAll('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]').length`;
    await t.page.waitFor(`${ROWS} > 50`, { timeout: 30000, every: 100, label: 'サイドバーに fixture の行が並ぶ' });
    const rows0 = await t.page.eval(ROWS);
    const title = await t.page.eval(`(document.querySelector('.pkc-header-title')?.textContent || '')`);
    t.note(`seed 後にアプリが見ているもの: コンテナ「${title}」/ サイドバー行 ${rows0} 件`);
    t.expect(rows0 > 50, `1000 エントリの fixture がアプリに載っている(サイドバー行 ${rows0} 件)`);

    /** flag を URL で与えて起動し、boot 所要(ms)を返す。 */
    const bootOnce = async (flags, label) => {
      const qs = Object.entries(flags).map(([k, v]) => `pkc-flag=${k}=${v}`).join('&');
      await t.goto(`/dist/pkc2.html?${qs}`);
      await t.page.waitFor('typeof window.__bootMs === "number"', {
        timeout: 60000, every: 40, label: `boot 完了(${label})`,
      });
      const ms = await t.page.eval('window.__bootMs');
      // 計測ごとに「空コンテナを測っていないか」を確認する。
      await t.page.settle(400);
      const rows = await t.page.eval(
        `document.querySelectorAll('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]').length`,
      );
      if (rows < 50) throw new Error(`空に近いコンテナを測っている(行 ${rows} 件)── 計測が無効`);
      return ms;
    };

    const LAZY = 'persistence.lazy_entry_bodies';
    const DIFF = 'persistence.differential_save';
    const saveOnce = async (label) => {
      // 実操作で保存を起こす(= 現在の flag が選ぶ layout で書き戻る)
      await t.human.click('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
      await t.page.waitFor(
        `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`,
        { timeout: 20000, label: `編集フェーズ(${label})` },
      );
      await t.human.click('[data-pkc-action="commit-edit"]');
      await t.page.waitFor(
        `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`,
        { timeout: 20000, label: `ready 復帰(${label})` },
      );
      await t.page.settle(2000); // 永続化の debounce を待つ
    };
    const runArm = async (flags, label) => {
      const all = [];
      for (let i = 0; i < REPEATS + WARMUP; i++) all.push(await bootOnce(flags, label));
      const xs = all.slice(WARMUP); // 冷えている間の 2 回は捨てる
      const med = median(xs);
      const spread = ((Math.max(...xs) - Math.min(...xs)) / med) * 100;
      t.note(`${label}: [捨 ${all.slice(0, WARMUP).map((x) => x.toFixed(0)).join('/')}] `
        + `${xs.map((x) => x.toFixed(0)).join(' / ')} ms → 中央値 ${med.toFixed(0)} ms(振れ幅 ${spread.toFixed(0)}%)`);
      return med;
    };

    // ── A) 現行の既定(両方 OFF) ─────────────────────────
    const offMed = await runArm({ [LAZY]: 0, [DIFF]: 0 }, 'A 既定(両方 OFF)');
    await t.shot('A 既定で 1000 エントリ起動後');
    const layoutA = await t.page.eval(LAYOUT_PROBE);
    t.note(`A の storage: layout ${layoutA.layout} / containers ${(layoutA.stores?.containers ?? []).length} 件`
      + ` / segments ${(layoutA.stores?.segments ?? []).length} 件`
      + ` / core 内 entries ${layoutA.entriesInCore}(本文あり ${layoutA.bodiesInCore})`);

    // ── B) lazy だけ ON ─────────────────────────────────
    // **これが user の問いの本体**:「lazy_entry_bodies を既定 ON にすべきか」
    // だが、lazyBodies() は idb-store の saveDiff の中でしか読まれず、
    // persistence.ts は differential_save が OFF なら save() を呼ぶ。
    // つまり lazy 単独では storage 形式が一切変わらないはず ── 実測で確かめる。
    await t.goto(`/dist/pkc2.html?pkc-flag=${LAZY}=1&pkc-flag=${DIFF}=0`);
    await t.page.waitFor('typeof window.__bootMs === "number"', { timeout: 60000, every: 40, label: 'B 初回 boot' });
    await saveOnce('B');
    const layoutB = await t.page.eval(LAYOUT_PROBE);
    t.note(`B(lazy だけ ON)で保存した後の storage: layout ${layoutB.layout}`
      + ` / segments ${(layoutB.stores?.segments ?? []).length} 件`
      + ` / core 内 entries ${layoutB.entriesInCore}(本文あり ${layoutB.bodiesInCore})`);
    const bUnchanged = layoutB.layout === layoutA.layout
      && (layoutB.stores?.segments ?? []).length === (layoutA.stores?.segments ?? []).length;
    t.expect(
      bUnchanged,
      'lazy_entry_bodies だけを ON にしても storage 形式は変わらない'
        + '(lazyBodies() は saveDiff の中でしか読まれず、differential_save が OFF だと save() が呼ばれる)',
    );
    const bMed = await runArm({ [LAZY]: 1, [DIFF]: 0 }, 'B lazy だけ ON');

    // ── C) lazy + differential_save 両方 ON ────────────────
    await t.goto(`/dist/pkc2.html?pkc-flag=${LAZY}=1&pkc-flag=${DIFF}=1`);
    await t.page.waitFor('typeof window.__bootMs === "number"', { timeout: 60000, every: 40, label: 'C 初回 boot' });
    await saveOnce('C');
    const layoutC = await t.page.eval(LAYOUT_PROBE);
    t.note(`C(両方 ON)で保存した後の storage: layout ${layoutC.layout}`
      + ` / segments ${(layoutC.stores?.segments ?? []).length} 件`
      + ` / core 内 entries ${layoutC.entriesInCore}(本文あり ${layoutC.bodiesInCore})`);
    t.expect(
      layoutC.layout !== layoutA.layout || (layoutC.stores?.segments ?? []).length > 0,
      `両方 ON で初めて storage 形式が切り替わる(layout ${layoutA.layout} → ${layoutC.layout}`
        + ` / segments ${(layoutC.stores?.segments ?? []).length} 件)`,
    );
    const cMed = await runArm({ [LAZY]: 1, [DIFF]: 1 }, 'C 両方 ON');
    await t.shot('C 両方 ON で 1000 エントリ起動後');

    // ── 判定 ────────────────────────────────────────
    const pct = (x) => ((x - offMed) / offMed) * 100;
    t.note(`boot 中央値の比較 — A 既定 ${offMed.toFixed(0)} ms`
      + ` / B lazy だけ ${bMed.toFixed(0)} ms(${pct(bMed) >= 0 ? '+' : ''}${pct(bMed).toFixed(1)}%)`
      + ` / C 両方 ${cMed.toFixed(0)} ms(${pct(cMed) >= 0 ? '+' : ''}${pct(cMed).toFixed(1)}%)`);

    // B は **対照群**。storage 形式が A と完全に同一(layout 1 / segments 0)なので、
    // B と A の差は「本来 0 であるはずの差」= この測定のノイズ床そのもの。
    // C の差をこの床と比べないと、速い/遅いを語る資格が無い。
    const noiseFloor = Math.abs(pct(bMed));
    t.note(`ノイズ床(対照群 B と A の差、本来 0 のはず): ${noiseFloor.toFixed(1)}%`);
    if (Math.abs(pct(cMed)) <= noiseFloor) {
      t.pass(`両方 ON の差(${pct(cMed).toFixed(1)}%)はノイズ床(${noiseFloor.toFixed(1)}%)以下`
        + ' ── boot が速くなるとも遅くなるとも言えない(= 既定 ON にする性能上の根拠が無い)');
    } else if (pct(cMed) < -noiseFloor) {
      t.pass(`両方 ON は boot が有意に速い(${pct(cMed).toFixed(1)}% < -${noiseFloor.toFixed(1)}%)`);
    } else {
      t.fail(`両方 ON は boot が有意に遅い(${pct(cMed).toFixed(1)}% > +${noiseFloor.toFixed(1)}%)`, 'perf-regression');
    }

    // 画面が本当に出来上がっているか(bootReady が嘘をついていないか)
    await t.page.settle(600);
    const rendered = await t.page.eval(
      `document.querySelectorAll('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]').length`,
    );
    t.expect(rendered > 50, `ON でもサイドバー全件が描画されている(行 ${rendered} 件)`);

    // 本文が読めているか = lazy の最大のリスク(空に見える事故)の直接確認
    await t.human.click('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]');
    await t.page.settle(400);
    const bodyLen = await t.page.eval(
      `(document.querySelector('[data-pkc-region="center-content"]')?.textContent || '').length`,
    );
    t.expect(bodyLen > 20, `ON でも本文が読める(中央ペイン ${bodyLen} 文字)`);
    await t.shot('ON でエントリを開いたところ');
  },
};
