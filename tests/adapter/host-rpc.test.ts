/** @vitest-environment happy-dom */
/**
 * デスクトップ host 経由の SqliteRpc(L4、2026-07-27)。
 *
 * ここで pin するのは **安全側の性質**である ── host が居ないただのブラウザで
 * 誤って有効化されても、静かに従来経路(IDB / OPFS)へ落ちること。
 *
 *  1. host が居ない / 別物が応答する → `detectDesktopHost` は null
 *     (「localhost で何かが応答した」だけで掴むと、**他人のローカルサーバを
 *      storage 正本にしてしまう**)
 *  2. RPC の失敗は **throw する**(握って undefined を返すと、書けていないのに
 *     成功に見える ── storage で最悪の形)
 *  3. dispose 後は呼べない
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_PROBE_PATH,
  HOST_RPC_PATH,
  createHostSqliteRpc,
  detectDesktopHost,
} from '@adapter/platform/storage/sqlite/host-rpc';

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init))));
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('desktop host の検出(L4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('名乗りが一致したときだけ host として採用する', async () => {
    stubFetch((url) => {
      expect(url).toBe(HOST_PROBE_PATH);
      return json({ product: 'pkc2-desktop', version: '1', dbPath: '/tmp/x.db' });
    });
    await expect(detectDesktopHost()).resolves.toMatchObject({ product: 'pkc2-desktop' });
  });

  it('別物が 200 を返しても掴まない(他人のローカルサーバを正本にしない)', async () => {
    stubFetch(() => json({ product: 'some-other-dev-server' }));
    await expect(detectDesktopHost()).resolves.toBeNull();
  });

  it('404 / 例外は null(= 通常のブラウザとして振る舞う)', async () => {
    stubFetch(() => json({}, 404));
    await expect(detectDesktopHost()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
    await expect(detectDesktopHost()).resolves.toBeNull();
  });
});

describe('host RPC の契約(L4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('op をそのまま POST し、result を返す', async () => {
    let seen: unknown = null;
    stubFetch((url, init) => {
      expect(url).toBe(HOST_RPC_PATH);
      seen = JSON.parse(String(init?.body));
      return json({ ok: true, result: { persistent: true } });
    });
    const rpc = createHostSqliteRpc();
    await expect(rpc.call({ op: 'init', dbName: 'pkc2-sqlite' })).resolves.toEqual({ persistent: true });
    // op 語彙を**変換せず**そのまま渡している(fork していないことの pin)
    expect(seen).toEqual({ op: 'init', dbName: 'pkc2-sqlite' });
  });

  it('HTTP エラーは throw する(握り潰さない)', async () => {
    stubFetch(() => json({ ok: false, error: 'boom' }, 500));
    const rpc = createHostSqliteRpc();
    await expect(rpc.call({ op: 'getDefaultCid' })).rejects.toThrow(/500/);
  });

  it('ok:false は throw する(書けていないのに成功に見せない)', async () => {
    stubFetch(() => json({ ok: false, error: 'disk full' }));
    const rpc = createHostSqliteRpc();
    await expect(rpc.call({ op: 'getDefaultCid' })).rejects.toThrow(/disk full/);
  });

  it('dispose 後は呼べない', async () => {
    stubFetch(() => json({ ok: true, result: null }));
    const rpc = createHostSqliteRpc();
    rpc.dispose();
    await expect(rpc.call({ op: 'getDefaultCid' })).rejects.toThrow(/disposed/);
  });
});
