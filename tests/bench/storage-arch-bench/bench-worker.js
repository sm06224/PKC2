/* eslint-disable */
// PKC2 storage architecture bench — Web Worker(全計測を worker で実行)
// 構成: A single-json-base64 / B opfs-loose / C opfs-packfile / D wasm-sqlite-opfs / E idb-blob
/* eslint-disable no-restricted-globals */

const post = (m) => self.postMessage(m);
// syscall プロファイル用フェーズマーカー(epoch ms — strace -ttt と同じ時計)
const __marks = [];
const mark = (name) => __marks.push({ name, t: Date.now() });
const log = (text) => post({ type: 'log', text });
const status = (text) => post({ type: 'status', text });
const heapMB = () => {
  const p = self.performance;
  return p && p.memory ? Math.round(p.memory.usedJSHeapSize / 1048576) : null;
};
const gc = () => { try { self.gc(); } catch { /* not exposed */ } };

// ── deterministic workload ──────────────────────────────
// 100KB〜5MB の asset(seeded)。avg ≈ 2MB。metadata JSON は数 MB。
function makeWorkload(totalMB) {
  const sizes = [];
  let total = 0;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  while (total < totalMB * 1048576) {
    const s = Math.round((0.1 + rnd() * 4.9) * 1048576); // 100KB..5MB
    sizes.push(s);
    total += s;
  }
  return { sizes, totalBytes: total };
}

const MB = 1048576;
const patternChunk = new Uint8Array(MB);
for (let i = 0; i < MB; i++) patternChunk[i] = (i * 31 + 7) & 0xff;
function makeBytes(size) {
  const out = new Uint8Array(size);
  for (let off = 0; off < size; off += MB) {
    out.set(patternChunk.subarray(0, Math.min(MB, size - off)), off);
  }
  return out;
}
function bytesToB64(bytes) {
  const CH = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += CH) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length))));
  }
  return btoa(parts.join(''));
}
function b64ToBlob(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}
function makeMetaJson(count) {
  // 数 MB 相当のエントリメタ(タイトル・本文断片)
  const entries = [];
  for (let i = 0; i < 2000; i++) {
    entries.push({ lid: 'e' + i, title: 'Entry ' + i, body: 'x'.repeat(1000) });
  }
  return { entries, assetCount: count };
}

// asset を読んで ObjectURL 化するまで(= UI が使える状態)を 1 read とする
function toObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  URL.revokeObjectURL(url);
  return url;
}

async function opfsDir(name, { fresh } = { fresh: true }) {
  const root = await navigator.storage.getDirectory();
  if (fresh) { try { await root.removeEntry(name, { recursive: true }); } catch { /* */ } }
  return root.getDirectoryHandle(name, { create: true });
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
}

// 読み計測: ~2MB 級 asset を median 5 回
function pickReadTargets(sizes) {
  const idx = [];
  for (let i = 0; i < sizes.length && idx.length < 5; i++) {
    if (sizes[i] > 1.5 * MB && sizes[i] < 3 * MB) idx.push(i);
  }
  while (idx.length < 5) idx.push(idx.length % sizes.length);
  return idx;
}

// ── A: single-json-base64(現行構成)────────────────────
async function benchSingleJson(sizes) {
  const dir = await opfsDir('bench-a');
  const meta = makeMetaJson(sizes.length);
  // 投入: base64 込み単一 JSON を 1 ファイルへ(chunk 書きで生成側の破綻は回避)
  mark('ingest:start');
  let t0 = performance.now();
  {
    const fh = await dir.getFileHandle('all.json', { create: true });
    const sah = await fh.createSyncAccessHandle();
    const enc = new TextEncoder();
    let at = 0;
    const w = (s) => { const b = enc.encode(s); sah.write(b, { at }); at += b.length; };
    w('{"meta":' + JSON.stringify(meta) + ',"assets":{');
    for (let i = 0; i < sizes.length; i++) {
      w((i ? ',' : '') + JSON.stringify('k' + i) + ':"');
      w(bytesToB64(makeBytes(sizes[i])));
      w('"');
    }
    w('}}');
    sah.flush(); sah.close();
  }
  mark('ingest:end');
  const ingestMs = Math.round(performance.now() - t0);

  // コールドスタート: 全読み + JSON.parse(この構成の宿命)
  gc();
  mark('cold:start');
  t0 = performance.now();
  let doc;
  {
    const fh = await dir.getFileHandle('all.json');
    const file = await fh.getFile();
    doc = JSON.parse(await file.text());
  }
  mark('cold:end');
  const coldStartMs = Math.round(performance.now() - t0);
  const heapAfter = (gc(), heapMB());

  mark('reads:start');
  const targets = pickReadTargets(sizes);
  const reads = [];
  for (const i of targets) {
    const t = performance.now();
    toObjectUrl(b64ToBlob(doc.assets['k' + i]));
    reads.push(performance.now() - t);
  }
  t0 = performance.now();
  for (let j = 0; j < 10; j++) toObjectUrl(b64ToBlob(doc.assets['k' + (j % sizes.length)]));
  mark('reads:end');
  const read10Ms = Math.round(performance.now() - t0);

  // 追記 10 件 = ドキュメント再構築 + 全書き直し(この構成の宿命)
  t0 = performance.now();
  for (let j = 0; j < 10; j++) doc.assets['new' + j] = bytesToB64(makeBytes((1 + (j % 5)) * MB));
  {
    const fh = await dir.getFileHandle('all.json', { create: true });
    const sah = await fh.createSyncAccessHandle();
    const enc = new TextEncoder();
    sah.truncate(0);
    // 全 stringify は 500MB 級で string 上限に当たるため chunk 書き
    let at = 0;
    const w = (s) => { const b = enc.encode(s); sah.write(b, { at }); at += b.length; };
    w('{"meta":' + JSON.stringify(doc.meta) + ',"assets":{');
    let first = true;
    for (const [k, v] of Object.entries(doc.assets)) {
      w((first ? '' : ',') + JSON.stringify(k) + ':"'); w(v); w('"');
      first = false;
    }
    w('}}');
    sah.flush(); sah.close();
  }
  mark('append:end');
  const append10Ms = Math.round(performance.now() - t0);
  doc = null;
  return { name: 'A 現行: 単一JSON+base64', ingestMs, coldStartMs, read1Ms: median(reads), read10Ms, append10Ms, heapMB: heapAfter, opensPerRead: 0 };
}

// ── B: opfs-loose(1 asset = 1 ファイル)─────────────────
async function benchLooseFiles(sizes) {
  const dir = await opfsDir('bench-b');
  const assetsDir = await dir.getDirectoryHandle('assets', { create: true });
  mark('ingest:start');
  let t0 = performance.now();
  {
    const fh = await dir.getFileHandle('meta.json', { create: true });
    const sah = await fh.createSyncAccessHandle();
    sah.write(new TextEncoder().encode(JSON.stringify(makeMetaJson(sizes.length))), { at: 0 });
    sah.flush(); sah.close();
    for (let i = 0; i < sizes.length; i++) {
      const f = await assetsDir.getFileHandle('k' + i + '.bin', { create: true });
      const s = await f.createSyncAccessHandle();
      s.write(makeBytes(sizes[i]), { at: 0 });
      s.flush(); s.close();
    }
  }
  mark('ingest:end');
  const ingestMs = Math.round(performance.now() - t0);

  gc();
  mark('cold:start');
  t0 = performance.now();
  {
    const fh = await dir.getFileHandle('meta.json');
    JSON.parse(await (await fh.getFile()).text());
  }
  mark('cold:end');
  const coldStartMs = Math.round(performance.now() - t0);
  const heapAfter = (gc(), heapMB());

  const readOne = async (i) => {
    const f = await assetsDir.getFileHandle('k' + i + '.bin');
    const blob = await f.getFile(); // File は Blob
    toObjectUrl(blob.slice());
  };
  mark('reads:start');
  const targets = pickReadTargets(sizes);
  const reads = [];
  for (const i of targets) {
    const t = performance.now();
    await readOne(i);
    reads.push(performance.now() - t);
  }
  t0 = performance.now();
  for (let j = 0; j < 10; j++) await readOne(j % sizes.length);
  mark('reads:end');
  const read10Ms = Math.round(performance.now() - t0);

  t0 = performance.now();
  for (let j = 0; j < 10; j++) {
    const f = await assetsDir.getFileHandle('new' + j + '.bin', { create: true });
    const s = await f.createSyncAccessHandle();
    s.write(makeBytes((1 + (j % 5)) * MB), { at: 0 });
    s.flush(); s.close();
  }
  mark('append:end');
  const append10Ms = Math.round(performance.now() - t0);
  return { name: 'B OPFS 個別ファイル', ingestMs, coldStartMs, read1Ms: median(reads), read10Ms, append10Ms, heapMB: heapAfter, opensPerRead: 1 };
}

// ── C: opfs-packfile(単一 pack + offset 範囲読み)────────
async function benchPackfile(sizes) {
  const dir = await opfsDir('bench-c');
  mark('ingest:start');
  const index = {};
  let t0 = performance.now();
  {
    const fh = await dir.getFileHandle('assets.pack', { create: true });
    const sah = await fh.createSyncAccessHandle();
    let at = 0;
    for (let i = 0; i < sizes.length; i++) {
      const bytes = makeBytes(sizes[i]);
      sah.write(bytes, { at });
      index['k' + i] = { offset: at, length: bytes.length };
      at += bytes.length;
    }
    sah.flush(); sah.close();
    const mf = await dir.getFileHandle('meta.json', { create: true });
    const ms = await mf.createSyncAccessHandle();
    ms.write(new TextEncoder().encode(JSON.stringify({ ...makeMetaJson(sizes.length), index })), { at: 0 });
    ms.flush(); ms.close();
  }
  mark('ingest:end');
  const ingestMs = Math.round(performance.now() - t0);

  gc();
  mark('cold:start');
  t0 = performance.now();
  let meta;
  let sah;
  {
    const mf = await dir.getFileHandle('meta.json');
    meta = JSON.parse(await (await mf.getFile()).text());
    const fh = await dir.getFileHandle('assets.pack');
    sah = await fh.createSyncAccessHandle(); // 常駐ハンドル(この構成の設計)
  }
  mark('cold:end');
  const coldStartMs = Math.round(performance.now() - t0);
  const heapAfter = (gc(), heapMB());

  const readOne = (key) => {
    const { offset, length } = meta.index[key];
    const buf = new Uint8Array(length);
    sah.read(buf, { at: offset });
    toObjectUrl(new Blob([buf]));
  };
  mark('reads:start');
  const targets = pickReadTargets(sizes);
  const reads = [];
  for (const i of targets) {
    const t = performance.now();
    readOne('k' + i);
    reads.push(performance.now() - t);
  }
  t0 = performance.now();
  for (let j = 0; j < 10; j++) readOne('k' + (j % sizes.length));
  mark('reads:end');
  const read10Ms = Math.round(performance.now() - t0);

  t0 = performance.now();
  {
    let at = sah.getSize();
    for (let j = 0; j < 10; j++) {
      const bytes = makeBytes((1 + (j % 5)) * MB);
      sah.write(bytes, { at });
      meta.index['new' + j] = { offset: at, length: bytes.length };
      at += bytes.length;
    }
    sah.flush();
    const mf = await dir.getFileHandle('meta.json', { create: true });
    const ms = await mf.createSyncAccessHandle();
    ms.truncate(0);
    ms.write(new TextEncoder().encode(JSON.stringify(meta)), { at: 0 });
    ms.flush(); ms.close();
  }
  mark('append:end');
  const append10Ms = Math.round(performance.now() - t0);
  sah.close();
  return { name: 'C OPFS packfile+offset', ingestMs, coldStartMs, read1Ms: median(reads), read10Ms, append10Ms, heapMB: heapAfter, opensPerRead: 0 };
}

// ── D: wasm-sqlite-opfs(公式 @sqlite.org/sqlite-wasm、SAHPool VFS)──
async function benchSqliteOpfs(sizes) {
  let sqlite3;
  try {
    const mod = await import('./node_modules/@sqlite.org/sqlite-wasm/dist/index.mjs');
    sqlite3 = await mod.default({ print: () => {}, printErr: () => {} });
  } catch (e) {
    return { name: 'D SQLite WASM (OPFS)', error: 'module load failed: ' + String(e).slice(0, 120) };
  }
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'bench-d', clearOnInit: true });
  let db = new pool.OpfsSAHPoolDb('/bench.db');
  db.exec('PRAGMA journal_mode=TRUNCATE;');
  db.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE assets (k TEXT PRIMARY KEY, v BLOB);');
  mark('ingest:start');
  let t0 = performance.now();
  db.exec('BEGIN');
  db.exec({ sql: 'INSERT INTO meta VALUES (?,?)', bind: ['meta', JSON.stringify(makeMetaJson(sizes.length))] });
  for (let i = 0; i < sizes.length; i++) {
    db.exec({ sql: 'INSERT INTO assets VALUES (?,?)', bind: ['k' + i, makeBytes(sizes[i])] });
  }
  db.exec('COMMIT');
  mark('ingest:end');
  const ingestMs = Math.round(performance.now() - t0);
  db.close();

  gc();
  mark('cold:start');
  t0 = performance.now();
  db = new pool.OpfsSAHPoolDb('/bench.db');
  {
    const rows = [];
    db.exec({ sql: 'SELECT v FROM meta WHERE k = ?', bind: ['meta'], resultRows: rows });
    JSON.parse(rows[0][0]);
  }
  mark('cold:end');
  const coldStartMs = Math.round(performance.now() - t0);
  const heapAfter = (gc(), heapMB());

  const readOne = (key) => {
    const rows = [];
    db.exec({ sql: 'SELECT v FROM assets WHERE k = ?', bind: [key], resultRows: rows });
    toObjectUrl(new Blob([rows[0][0]]));
  };
  mark('reads:start');
  const targets = pickReadTargets(sizes);
  const reads = [];
  for (const i of targets) {
    const t = performance.now();
    readOne('k' + i);
    reads.push(performance.now() - t);
  }
  t0 = performance.now();
  for (let j = 0; j < 10; j++) readOne('k' + (j % sizes.length));
  mark('reads:end');
  const read10Ms = Math.round(performance.now() - t0);

  t0 = performance.now();
  db.exec('BEGIN');
  for (let j = 0; j < 10; j++) {
    db.exec({ sql: 'INSERT INTO assets VALUES (?,?)', bind: ['new' + j, makeBytes((1 + (j % 5)) * MB)] });
  }
  db.exec('COMMIT');
  mark('append:end');
  const append10Ms = Math.round(performance.now() - t0);
  db.close();
  await pool.removeVfs();
  return { name: 'D SQLite WASM (OPFS SAHPool)', ingestMs, coldStartMs, read1Ms: median(reads), read10Ms, append10Ms, heapMB: heapAfter, opensPerRead: 0 };
}

// ── E: idb-blob(比較基準: 現在の v3 推奨)──────────────
function idbOpen(name) {
  return new Promise((res, rej) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta');
      req.result.createObjectStore('assets');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
const idbTx = (db, store, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(store, mode);
  fn(t.objectStore(store));
  t.oncomplete = () => res();
  t.onerror = () => rej(t.error);
});
const idbGet = (db, store, key) => new Promise((res, rej) => {
  const t = db.transaction(store, 'readonly');
  const rq = t.objectStore(store).get(key);
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
});

async function benchIdbBlob(sizes) {
  await new Promise((res) => { const rq = indexedDB.deleteDatabase('bench-e'); rq.onsuccess = rq.onerror = rq.onblocked = () => res(); });
  let db = await idbOpen('bench-e');
  mark('ingest:start');
  let t0 = performance.now();
  await idbTx(db, 'meta', 'readwrite', (s) => s.put(JSON.stringify(makeMetaJson(sizes.length)), 'meta'));
  for (let i = 0; i < sizes.length; i++) {
    const blob = new Blob([makeBytes(sizes[i])]);
    await idbTx(db, 'assets', 'readwrite', (s) => s.put(blob, 'k' + i));
  }
  mark('ingest:end');
  const ingestMs = Math.round(performance.now() - t0);
  db.close();

  gc();
  mark('cold:start');
  t0 = performance.now();
  db = await idbOpen('bench-e');
  JSON.parse(await idbGet(db, 'meta', 'meta'));
  mark('cold:end');
  const coldStartMs = Math.round(performance.now() - t0);
  const heapAfter = (gc(), heapMB());

  const readOne = async (key) => {
    const blob = await idbGet(db, 'assets', key);
    toObjectUrl(blob);
  };
  mark('reads:start');
  const targets = pickReadTargets(sizes);
  const reads = [];
  for (const i of targets) {
    const t = performance.now();
    await readOne('k' + i);
    reads.push(performance.now() - t);
  }
  t0 = performance.now();
  for (let j = 0; j < 10; j++) await readOne('k' + (j % sizes.length));
  mark('reads:end');
  const read10Ms = Math.round(performance.now() - t0);

  t0 = performance.now();
  for (let j = 0; j < 10; j++) {
    await idbTx(db, 'assets', 'readwrite', (s) => s.put(new Blob([makeBytes((1 + (j % 5)) * MB)]), 'new' + j));
  }
  mark('append:end');
  const append10Ms = Math.round(performance.now() - t0);
  db.close();
  return { name: 'E IDB + Blob(v3 案)', ingestMs, coldStartMs, read1Ms: median(reads), read10Ms, append10Ms, heapMB: heapAfter, opensPerRead: 0 };
}

// ── driver ──────────────────────────────────────────────
const BENCHES = {
  A: benchSingleJson, B: benchLooseFiles, C: benchPackfile,
  D: benchSqliteOpfs, E: benchIdbBlob,
};

// 各構成の開始前に全ベンチデータを掃除(quota を 1 構成分に保つ)
async function cleanAll() {
  const root = await navigator.storage.getDirectory();
  for (const n of ['bench-a', 'bench-b', 'bench-c', 'bench-d']) {
    try { await root.removeEntry(n, { recursive: true }); } catch { /* */ }
  }
  // sqlite SAHPool VFS のファイルは .opaque ディレクトリに残る
  try {
    for await (const name of root.keys()) {
      if (name.startsWith('.') || name.includes('bench')) {
        try { await root.removeEntry(name, { recursive: true }); } catch { /* */ }
      }
    }
  } catch { /* */ }
  await new Promise((res) => {
    const rq = indexedDB.deleteDatabase('bench-e');
    rq.onsuccess = rq.onerror = rq.onblocked = () => res();
  });
}

self.onmessage = async (ev) => {
  if (ev.data.cmd !== 'run-one') return;
  const { tag, totalMB } = ev.data;
  await cleanAll();
  const { sizes, totalBytes } = makeWorkload(totalMB);
  log(`[${tag}] workload: ${sizes.length} assets / ${(totalBytes / 1048576).toFixed(0)}MB`);
  try {
    __marks.length = 0;
    const row = await BENCHES[tag](sizes);
    row.marks = [...__marks];
    post({ type: 'result', row });
  } catch (e) {
    post({ type: 'result', row: { name: tag + ' (failed)', error: String(e).slice(0, 200) } });
  }
  post({ type: 'done' });
};
