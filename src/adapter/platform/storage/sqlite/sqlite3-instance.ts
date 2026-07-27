/**
 * sqlite3.wasm の静的 bundle と遅延初期化 ── wasm-sqlite 設計 P2 の土台。
 *
 * > 「私は依存をなくして欲しいと言っただけで、完全になくせとは言っていない。
 * >  ビルドが静的であれば何も問題ない」(user 指示 2026-07-27)
 *
 * 設計(`docs/development/storage-wasm-sqlite-design-2026-07.md` §4):
 *
 *   - **静的**: wasm バイナリは `?inline` で bundle.js に base64 焼き込み。
 *     実行時 fetch なし・CDN なし ── 単一 HTML 哲学と両立する
 *   - **遅延**: `WebAssembly` の compile も Emscripten の初期化も、
 *     最初の `getSqlite3()` 呼び出しまで一切走らない。空アプリの
 *     renderer 常駐(実測 356MB、bundle のコンパイル済みコード由来と推定)を
 *     これ以上悪化させないための必須条件
 *   - **速やかな破棄の起点**: instance は singleton だが、consumer は
 *     stmt / DB ハンドルを必ず finalize / close する(原則はここではなく
 *     各 consumer が守る ── SqliteContainerStore 実装時に test で pin する)
 */
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
// vite の `?inline` は asset を data URL 文字列として焼き込む(実行時 fetch なし)。
// `.wasm` 拡張子のままだと vite 8(rolldown)が特別扱いして UNLOADABLE_DEPENDENCY に
// なるため、build 前段(build/scripts/copy-sqlite-wasm.cjs)が `.wasm.bin` として
// コピーしたものを import する(コピー先は .gitignore 済み生成物)。
import wasmDataUrl from './sqlite3.wasm.bin?inline';

let instance: Promise<Sqlite3Static> | null = null;

/** data URL → bytes(base64 部分だけを decode。fetch は使わない)。 */
function wasmBytes(): Uint8Array {
  const comma = wasmDataUrl.indexOf(',');
  const b64 = wasmDataUrl.slice(comma + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * sqlite3 module の遅延 singleton。初回呼び出しで wasm を instantiate する。
 * 以後は同じ Promise を返す(Emscripten module の二重初期化を防ぐ)。
 */
export function getSqlite3(): Promise<Sqlite3Static> {
  if (!instance) {
    // 型注意: 公開型は `init(): Promise<Sqlite3Static>`(引数なし)だが、
    // 実装(dist/index.mjs)は `function ff(...args)` → `moduleArg` として
    // Emscripten Module init オブジェクトを受け取り、`wasmBinary` があれば
    // fetch せず instantiate に直行する(index.mjs:405)。型が実装より
    // 狭いだけなので、ここだけ明示的に橋を架ける。
    const init = sqlite3InitModule as unknown as (
      opts?: {
        wasmBinary?: ArrayBuffer;
        locateFile?: (f: string) => string;
        print?: (s: string) => void;
        printErr?: (s: string) => void;
      },
    ) => Promise<Sqlite3Static>;
    instance = init({
      // 焼き込んだ bytes を直接渡す ── fetch 経路には到達しない。
      wasmBinary: wasmBytes().buffer as ArrayBuffer,
      // ⚠ wasmBinary があっても Emscripten は `wasmBinaryFile ??= findWasmBinary()`
      // を評価する。IIFE bundle では `import.meta.url` が無く
      // `new URL("sqlite3.wasm", import.meta.url)` が throw するため(2026-07-27 実測
      // "Failed to construct 'URL': Invalid base URL")、locateFile でダミーを返して
      // URL 構築を回避する。bytes は wasmBinary から取られ、この path は読まれない。
      locateFile: (f: string) => f,
      print: () => undefined,
      printErr: (msg: string) => console.warn('[PKC2] sqlite3:', msg),
    });
  }
  return instance;
}

export interface SqliteProbeResult {
  ok: boolean;
  version: string;
  ms: number;
  error?: string;
}

/**
 * 動作実証(P2 spike): :memory: DB で CREATE / INSERT / SELECT を往復し、
 * ハンドルを **必ず閉じて** 結果を返す。`window.__pkc2SqliteProbe()` から
 * 実ブラウザで叩く(tests/bench/sqlite-spike.mjs)。
 */
export async function probeSqliteWasm(): Promise<SqliteProbeResult> {
  const t0 = performance.now();
  try {
    const sqlite3 = await getSqlite3();
    const db = new sqlite3.oo1.DB(':memory:');
    try {
      db.exec('CREATE TABLE probe (k TEXT PRIMARY KEY, v TEXT)');
      db.exec({ sql: 'INSERT INTO probe (k, v) VALUES (?, ?)', bind: ['hello', 'sqlite'] });
      const rows: unknown[] = [];
      db.exec({ sql: 'SELECT v FROM probe WHERE k = ?', bind: ['hello'], rowMode: 'array', resultRows: rows as never });
      const first = rows[0] as string[] | undefined;
      const ok = Array.isArray(first) && first[0] === 'sqlite';
      return { ok, version: sqlite3.version.libVersion, ms: performance.now() - t0 };
    } finally {
      db.close(); // 速やかな破棄(user 指示 2026-07-27)
    }
  } catch (err) {
    return { ok: false, version: '', ms: performance.now() - t0, error: String(err) };
  }
}
