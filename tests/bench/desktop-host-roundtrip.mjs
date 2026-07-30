/* eslint-disable */
/**
 * L4: デスクトップ host の実機 roundtrip(2026-07-27)。
 *
 * exe(Bun 単一実行ファイル)を**実際に起動して**、ブラウザ版と同じ op 語彙で
 * storage が往復することを確認する。狙いは 2 つ:
 *
 *  1. **schema / RPC を fork していない**ことの実証 ── ここで使う op は
 *     `sqlite-rpc.ts` の語彙そのもの。exe 側に写しを作った瞬間にここが壊れる
 *  2. **同一 origin 以外を弾く**ことの実証 ── host は localhost で HTTP を
 *     話すので、他のローカルページから DB を読めてはいけない
 *
 * 使い方:
 *   npm run build            # dist/pkc2.html(exe に埋め込む)
 *   node tests/bench/desktop-host-roundtrip.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUN = process.env.BUN_BIN ?? '/root/.bun/bin/bun';
if (!existsSync(BUN)) {
  console.log('⛔ bun が無い ── この harness は skip');
  process.exit(0);
}
if (!existsSync('dist/pkc2.html')) {
  console.log('⛔ dist/pkc2.html が無い(先に npm run build)');
  process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), 'pkc2-host-'));
const dbPath = join(dataDir, 'pkc2.db');
const PORT = 45751;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`   ✅ ${label}${detail ? ` (${detail})` : ''}`); }
  else { fail++; console.log(`   ❌ ${label}${detail ? ` (${detail})` : ''}`); }
};

const child = spawn(BUN, ['run', 'desktop/pkc2-host.ts', '--no-webview'], {
  env: { ...process.env, PKC2_DB: dbPath, PKC2_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let hostLog = '';
child.stdout.on('data', (d) => { hostLog += d.toString(); });
child.stderr.on('data', (d) => { hostLog += d.toString(); });

const origin = `http://127.0.0.1:${PORT}`;
const rpc = async (body, headers = {}) => {
  const res = await fetch(`${origin}/__pkc/storage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { httpStatus: res.status };
  return res.json();
};

// 起動待ち
const deadline = Date.now() + 20000;
let up = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${origin}/__pkc/host`);
    if (r.ok) { up = true; break; }
  } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 200));
}
if (!up) {
  console.log('⛔ host が起動しない\n' + hostLog);
  child.kill('SIGKILL');
  process.exit(1);
}

console.log('■ A. host の名乗りと単一 HTML の供給');
const info = await (await fetch(`${origin}/__pkc/host`)).json();
check('product が pkc2-desktop', info.product === 'pkc2-desktop', JSON.stringify(info));
const page = await (await fetch(`${origin}/`)).text();
check('埋め込み HTML を返す', page.startsWith('<!') && page.length > 1_000_000,
  `${(page.length / 1048576).toFixed(2)} MB`);

console.log('■ B. ブラウザ版と同じ op 語彙で往復する');
const init = await rpc({ op: 'init', dbName: 'pkc2-sqlite' });
check('init が永続を返す', init.ok && init.result?.persistent === true, JSON.stringify(init.result));

const T = '2026-07-01T00:00:00.000Z';
const rows = {
  // ⚠ キー名は共有 schema(`ContainerRows`)に従う ── ここを勝手に `meta` に
  //    すると「exe 用の写し」を作ったのと同じことになる(fork 禁止)。
  container: { cid: 'c-host', title: 'host container', created_at: T, updated_at: T, schema_version: 1, extra: null },
  entries: [
    { lid: 'e1', title: 'first', archetype: 'text', created_at: T, updated_at: T, ord: 0, body: '本文 1', extra: null },
    { lid: 'e2', title: 'second', archetype: 'text', created_at: T, updated_at: T, ord: 1, body: '本文 2', extra: JSON.stringify({ tags: ['a'] }) },
  ],
  relations: [],
  revisions: [
    { id: 'r1', entry_lid: 'e1', created_at: T, prev_rid: null, content_hash: null, ord: 0, snapshot: '{}', extra: null },
  ],
};
const saved = await rpc({ op: 'saveFull', cid: 'c-host', rows, setDefault: true });
check('saveFull が通る', saved.ok === true, saved.error ?? '');

const loaded = await rpc({ op: 'loadContainer', cid: 'c-host' });
check('entries が往復する', loaded.result?.entries?.length === 2,
  `entries=${loaded.result?.entries?.length}`);
check('extra(additive field)が保たれる',
  loaded.result?.entries?.[1]?.extra?.includes('tags') === true,
  String(loaded.result?.entries?.[1]?.extra));

const counts = await rpc({ op: 'revCounts', cid: 'c-host' });
// 契約は **`Array<{entry_lid, n}>`**(worker 版 `handleRevCounts` と同一)。
// map 形へ畳むのは client 側の仕事 ── ここを map で期待すると、
// 「host だけ別の形を返す」= fork を招く。
check('revCounts が worker と同じ行形で返る(P4a の deferred boot 経路)',
  Array.isArray(counts.result)
    && counts.result.length === 1
    && counts.result[0].entry_lid === 'e1'
    && Number(counts.result[0].n) === 1,
  JSON.stringify(counts.result));

const deferred = await rpc({ op: 'loadContainer', cid: 'c-host', skipRevisions: true });
check('skipRevisions で revisions を運ばない',
  (deferred.result?.revisions?.length ?? 0) === 0,
  `revisions=${deferred.result?.revisions?.length ?? 0}`);

const ops = await rpc({
  op: 'applyOps', cid: 'c-host', setDefault: false,
  ops: [{ t: 'entry-upsert', row: { lid: 'e1', title: 'first', archetype: 'text', created_at: T, updated_at: '2026-07-02T00:00:00.000Z', ord: 0, body: '編集後', extra: null } }],
});
check('applyOps(参照 diff の op)が通る', ops.ok === true, ops.error ?? '');
const after = await rpc({ op: 'loadContainer', cid: 'c-host' });
check('差分が反映される', after.result?.entries?.[0]?.body === '編集後',
  String(after.result?.entries?.[0]?.body));

const defCid = await rpc({ op: 'getDefaultCid' });
check('default cid が返る', defCid.result === 'c-host', String(defCid.result));

console.log('■ C. 同一 origin 以外を弾く(他のローカルページから DB を触らせない)');
const evil = await rpc({ op: 'getDefaultCid' }, { origin: 'http://127.0.0.1:9999' });
check('別 origin の POST は 403', evil.httpStatus === 403, `status=${evil.httpStatus}`);
const evilProbe = await fetch(`${origin}/__pkc/host`, { headers: { origin: 'http://evil.example' } });
check('別 origin の probe も 403', evilProbe.status === 403, `status=${evilProbe.status}`);

console.log('■ D. 永続化(プロセスを跨いで残る)');
child.kill('SIGTERM');
await new Promise((r) => setTimeout(r, 800));
const child2 = spawn(BUN, ['run', 'desktop/pkc2-host.ts', '--no-webview'], {
  env: { ...process.env, PKC2_DB: dbPath, PKC2_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const dl2 = Date.now() + 20000;
let up2 = false;
while (Date.now() < dl2) {
  try { const r = await fetch(`${origin}/__pkc/host`); if (r.ok) { up2 = true; break; } } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 200));
}
if (up2) {
  const reloaded = await rpc({ op: 'loadContainer', cid: 'c-host' });
  check('再起動後もデータが残る', reloaded.result?.entries?.[0]?.body === '編集後',
    String(reloaded.result?.entries?.[0]?.body));
} else {
  check('再起動後もデータが残る', false, 'host が再起動しない');
}
child2.kill('SIGKILL');
rmSync(dataDir, { recursive: true, force: true });

console.log(`\n${fail === 0 ? '■ 全チェック通過' : `■ ${fail} 件失敗`}(${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
