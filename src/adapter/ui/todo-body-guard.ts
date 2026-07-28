/**
 * todo の read-modify-write を「未読の本文」から守る(2026-07-28)。
 *
 * ## 何が起きるか
 *
 * `parseTodoBody('')` は `JSON.parse('')` が throw するので catch に落ち、
 * **`{ status:'open', description:'' }`** を返す(`todo-body.ts:36-38`)。
 * `serializeTodoBody` は falsy なキーを書かない(`:42-51`)。よって
 *
 *   未読の本文('')→ parse → status/description だけの todo → serialize
 *
 * を通すと、**期日(date)・アーカイブ(archived)・説明文が消える**。
 *
 * 本文が '' になるのは「空の todo」だけではない。P4b の working set は
 * **まだ読んでいない / 追い出した本文を `body === ''` で表す**(#940 の contract)。
 * 実測(sqlite backend ON / 本文 4KB × todo 300 件)で **boot 直後に未読 236 件**。
 *
 * ## なぜ今まで表に出なかったか
 *
 * 「安全だったから」ではない。既定(IDB inline)では `bodiesDeferred` が立たず
 * `mountBodyWorkingSet` 自体が呼ばれない(`main.ts:1310`)ので、未読が発生しない。
 * **`storage.sqlite_backend` を ON にした環境では窓が開いている。**
 *
 * ## 同型の事故が既にある
 *
 * #1028「読めなかった本文を空の本文として確定させない」は **`save()` 側だけ**を
 * 塞いだ。同じ穴が **todo の書込経路**に残っていた。編集経路には
 * `triggerEdit` のゲートがあるが(`action-binder.ts` の「空の editor を開いて
 * 本文を失う事故の構造的防止」)、todo の 8 経路はそこを通らない。
 *
 * ## 方針
 *
 * **読めるまで書かない。** 未読なら先に hydrate し、それでも読めなければ
 * **何も書かずに user へ知らせる**(黙って no-op にしない ── 押したのに
 * 何も起きないのは「壊れている」と区別が付かない)。
 */
import type { Dispatcher } from '../state/dispatcher';
import { activeBodyWorkingSet, isBodyPendingGlobal } from '../platform/body-working-set';
import { showToast } from './toast';

/** 未読で書き込みを見送ったときの文言(toast は同文言を合流させる)。 */
const UNREADABLE_MESSAGE =
  '本文をまだ読み込めていないため、この変更は保留しました。少し待ってからもう一度お試しください';

/**
 * `lids` の本文が読めている状態で `run` を実行する。
 *
 * 🔴 **未読が 1 件も無ければ同期で `run` を呼ぶ。**
 *
 * ここを常に `async` にすると、**既定経路(未読という概念が無い)の
 * todo 操作まで 1 tick 遅れる**。実際それをやったところ、click 直後に
 * 状態を見る既存 test が 25 件落ちた ── test の都合ではなく、
 * 「押した瞬間に反映される」という**現在の挙動そのもの**が変わっていた。
 * ガードは**未読があるときだけ**非同期経路へ入る。
 *
 * 読めなかったときは `run` を呼ばず、toast で user に伝える
 * (押したのに何も起きない = 壊れていると区別が付かない状態を作らない)。
 */
export function withTodoBodies(
  dispatcher: Dispatcher,
  lids: readonly string[],
  run: () => void,
): void {
  const cid = dispatcher.getState().container?.meta.container_id;
  // container が無い / working set が mount されていない(既定 IDB 経路)
  // = 未読という概念が無いので、そのまま同期で走らせる。
  const ws = activeBodyWorkingSet();
  if (!cid || !ws) { run(); return; }

  const pending = lids.filter((lid) => isBodyPendingGlobal(cid, lid));
  if (pending.length === 0) { run(); return; }

  void (async () => {
    try {
      await ws.ensure(pending);
    } catch {
      // ensure 側でも握られるが、二重に守る。
    }
    if (pending.some((lid) => isBodyPendingGlobal(cid, lid))) {
      // ⚠ 黙って諦めない。
      showToast({ message: UNREADABLE_MESSAGE, kind: 'warn' });
      return;
    }
    run();
  })();
}

/**
 * reducer 用の同期判定。**reducer は await できない**ので、
 * 未読の entry は**触らずに飛ばす**しかない(空で上書きするよりは、
 * その 1 件だけ一括操作から漏れるほうが safe)。
 */
export function isTodoBodyUnread(cid: string | undefined, lid: string): boolean {
  if (!cid) return false;
  return isBodyPendingGlobal(cid, lid);
}
