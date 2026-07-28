/** @vitest-environment happy-dom */
/**
 * todo の read-modify-write が「未読の本文」を壊さないことを pin する
 * (2026-07-28、user 裁定「12-1 は今すぐ対応」)。
 *
 * ## 壊れ方
 *
 * `parseTodoBody('')` は `JSON.parse('')` が throw → catch →
 * `{ status:'open', description:'' }` を返す。`serializeTodoBody` は falsy な
 * キーを書かないので、**期日・アーカイブ・説明文が消える**。
 * そして P4b の working set は「まだ読んでいない本文」を `body === ''` で表す
 * ので、未読の todo に対する操作がそのまま**データ喪失**になる。
 *
 * ## この pin が守るもの
 *
 * 1. **契約**: `parseTodoBody('') → serializeTodoBody` が実際に date/archived を
 *    落とすこと(= 危険が実在すること)を先に固定する。ここが変われば
 *    ガードの前提も変わるので、まずこれを pin する
 * 2. **経路**: 書込を行う 8 経路すべてに未読ガードが入っていること
 *
 * ⚠ 2 は**静的検査**で見る。未読状態は working set が mount された環境
 * (= sqlite backend)でしか作れず、happy-dom の単体 test で 8 経路ぶんの
 * 実行環境を組むと test 自体が実態から離れる。ここでは「ガードを通らずに
 * `serializeTodoBody` へ到達する経路が無い」ことを担保する。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTodoBody, serializeTodoBody } from '@features/todo/todo-body';

describe('未読の本文を todo の read-modify-write に通さない', () => {
  it('前提: 未読("")を parse → serialize すると期日・アーカイブが消える', () => {
    // 本物の todo(期日・アーカイブ・説明文つき)
    const real = serializeTodoBody({
      status: 'open',
      description: '買い物リストを作る',
      date: '2026-08-15',
      archived: true,
    });
    expect(real).toContain('2026-08-15');

    // 未読を表す '' を通すと…
    const roundTripped = serializeTodoBody({
      ...parseTodoBody(''),
      status: 'done',
    });
    expect(roundTripped, '期日が生き残ってしまった ── 前提が変わった').not.toContain('2026-08-15');
    expect(roundTripped, 'アーカイブが生き残ってしまった').not.toContain('archived');
    expect(JSON.parse(roundTripped).description, '説明文が生き残ってしまった').toBe('');
  });

  /**
   * 書込経路の静的検査。
   *
   * marker の決め方で 2 回外した(記録として残す):
   *
   * 1. `parseTodoBody(` で数える → **読み取り専用の表示経路**
   *    (todo-presenter の描画 / archived フィルタ)まで拾う。壊すのは
   *    書き戻しなので書き戻しの側で数えるべきだった
   * 2. `serializeTodoBody(` で数える → **新規作成の経路**まで拾う。
   *    `app-state.ts` の todo 追加(kanban / calendar の popover)は
   *    `generateLid()` + `addEntry` の直後に本文を組み立てており、
   *    **失う既存本文がそもそも無い**ので危険ではない(実際に誤検出した)
   *
   * 危ないのは **既存の todo を継ぎ足して書き戻す形** ── `{ ...todo` の
   * スプレッドである。ここだけを数える。
   */
  const WRITE_SITES: ReadonlyArray<readonly [string, string]> = [
    ['action-binder', 'src/adapter/ui/action-binder.ts'],
    ['reducer', 'src/adapter/state/app-state.ts'],
  ];

  for (const [label, file] of WRITE_SITES) {
    it(`${label}: 既存 todo の書き戻しがすべて未読ガードの内側にある`, () => {
      const src = readFileSync(resolve(__dirname, '../../', file), 'utf8');
      const lines = src.split('\n');
      const unguarded: string[] = [];

      // ⚠ **行単位で判定してはいけない**(2026-07-28 に踏んだ)。書き戻しの
      //   半分は複数行に割れている:
      //     const toggled = serializeTodoBody({
      //       ...todo,
      //   1 行だけ見る正規表現ではこの形が**丸ごと検出から漏れ**、
      //   ガードを外しても pin が緑のままだった。ソース全体に対して
      //   改行をまたぐ正規表現で当てる。
      const rmw = /serializeTodoBody\(\s*\{\s*\.\.\./gs;
      for (let m = rmw.exec(src); m !== null; m = rmw.exec(src)) {
        const lineNo = src.slice(0, m.index).split('\n').length;
        // 手前 40 行にガードがあるか。
        //   - action-binder: `withTodoBodies(` の中で走らせている
        //   - reducer: `isBodyPendingGlobal(` で continue している
        const window = lines.slice(Math.max(0, lineNo - 1 - 40), lineNo - 1).join('\n');
        const guarded =
          window.includes('withTodoBodies(') || window.includes('isBodyPendingGlobal(');
        if (!guarded) {
          unguarded.push(`${file}:${lineNo}: ${(lines[lineNo - 1] ?? '').trim().slice(0, 80)}`);
        }
      }
      expect(
        rmw.lastIndex >= 0 && src.match(/serializeTodoBody\(\s*\{\s*\.\.\./gs)?.length,
        '書き戻しの形が 1 件も見つからない ── 検出パターンが実装とずれた',
      ).toBeGreaterThan(0);

      expect(
        unguarded,
        '未読ガードを通らずに todo の本文を書き戻す経路がある。\n'
          + '未読("")を書き戻すと期日・アーカイブ・説明文が消える:\n'
          + unguarded.join('\n'),
      ).toEqual([]);
    });
  }

  describe('withTodoBodies の挙動', () => {
    /**
     * ⚠ 実機(sqlite backend)で未読の todo を**クリックで**踏むところまでは
     *   再現できなかった:未読になるほど後方の行はサイドバーの窓の外におり、
     *   選択すると `ensure()` が走って未読でなくなる(それ自体が緩和策)。
     *   よって「未読のまま書込に入る」経路の検証はここで行う。
     */
    it('未読ゼロなら同期で走る(既定経路の挙動を変えない)', async () => {
      vi.resetModules();
      vi.doMock('@adapter/platform/body-working-set', () => ({
        activeBodyWorkingSet: () => ({ ensure: async () => {} }),
        isBodyPendingGlobal: () => false,
      }));
      const { withTodoBodies } = await import('@adapter/ui/todo-body-guard');
      const dispatcher = {
        getState: () => ({ container: { meta: { container_id: 'c' } } }),
      } as never;
      let ran = 0;
      withTodoBodies(dispatcher, ['a'], () => { ran += 1; });
      // await を 1 つも挟まずに走っていること = 同期
      expect(ran, '未読ゼロなのに非同期になっている').toBe(1);
    });

    it('未読が残ったままなら run を呼ばない(空で上書きしない)', async () => {
      vi.resetModules();
      let ensured = 0;
      vi.doMock('@adapter/platform/body-working-set', () => ({
        activeBodyWorkingSet: () => ({ ensure: async () => { ensured += 1; } }),
        // hydrate しても未読のまま = 読めなかった
        isBodyPendingGlobal: () => true,
      }));
      const toasts: string[] = [];
      vi.doMock('@adapter/ui/toast', () => ({
        showToast: (o: { message: string }) => { toasts.push(o.message); return null; },
      }));
      const { withTodoBodies } = await import('@adapter/ui/todo-body-guard');
      const dispatcher = {
        getState: () => ({ container: { meta: { container_id: 'c' } } }),
      } as never;
      let ran = 0;
      withTodoBodies(dispatcher, ['a'], () => { ran += 1; });
      await new Promise((r) => setTimeout(r, 0));
      expect(ensured, 'hydrate を試していない').toBe(1);
      expect(ran, '🔴 読めていないのに書き込んだ').toBe(0);
      expect(toasts.length, 'user に知らせていない(黙って no-op)').toBe(1);
    });

    it('hydrate で読めたら run を呼ぶ', async () => {
      vi.resetModules();
      let pending = true;
      vi.doMock('@adapter/platform/body-working-set', () => ({
        activeBodyWorkingSet: () => ({ ensure: async () => { pending = false; } }),
        isBodyPendingGlobal: () => pending,
      }));
      const { withTodoBodies } = await import('@adapter/ui/todo-body-guard');
      const dispatcher = {
        getState: () => ({ container: { meta: { container_id: 'c' } } }),
      } as never;
      let ran = 0;
      withTodoBodies(dispatcher, ['a'], () => { ran += 1; });
      expect(ran, '同期で走ってしまった(未読なのに)').toBe(0);
      await new Promise((r) => setTimeout(r, 0));
      expect(ran, 'hydrate 後に走っていない').toBe(1);
    });
  });

  it('ガードは「読めなければ書かない」── 黙って no-op にしない', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/adapter/ui/todo-body-guard.ts'),
      'utf8',
    );
    // 読めなかったときに user へ知らせる(押したのに何も起きない状態を作らない)
    expect(src, 'toast で知らせていない').toMatch(/showToast\(/);
    // 読めなかったら run を呼ばない(= 書き込まない)
    expect(src, '未読が残ったときに中断していない').toMatch(/isBodyPendingGlobal\(cid, lid\)\)\) \{/);
    // 🔴 未読が無いときは**同期**で走る(既定経路の挙動を変えない)
    expect(src, '未読ゼロのときに同期で走る経路が無い').toMatch(/if \(pending\.length === 0\) \{ run\(\); return; \}/);
  });
});
