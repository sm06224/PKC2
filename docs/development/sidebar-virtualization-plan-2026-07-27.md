# サイドバー DOM 仮想化 ── 実装計画(doc-first・user 裁定待ち)

> 「仮想化も積む」(user 指示 2026-07-27)
> 「効果が小さいからやらないではなく、積み上げた先に価値があるなら小さかろうが
>  積んでください」(user 指示 2026-07-27、不可侵)

## 0. なぜ doc-first か

**本計画は 2026-07-26 に敵対的検証で棄却された案①の再提案にあたる**
(`storage-arch-cross-sections-2026-07-26.md:144,148-150`
「DOM を順序の正本として読む機構が 4 つあり、全部作り直しになる」)。

今回の実地調査でその機構を **6 箇所**まで確定させた(§2)。棄却理由に対する
応答は「S2 を独立した前工事として先に着地させる」という構成であり、
これが妥当かどうかは着手前に裁定が要る。

## 1. 何を買うのか(効果の軸を混ぜない)

| 軸 | 現状の数字 | 仮想化で動くか |
|---|---|---|
| **メモリ(DOM 系)** | partition_alloc + blink_gc が 3000 entries で 16 → 59MB(§8-4 実測) | ✅ **本命**。DOM ノードそのものが減る |
| boot(行構築) | 15,000 行の DOM 構築コスト | ✅ 減る |
| 保存確定の 531ms | Layout / Style は支配的でない(`session-handoff-2026-07-26.md:89-91`) | ❌ **仮想化の領域ではない**。ここを根拠にしない |
| スクロールの滑らかさ | `content-visibility:auto`(PR #183)が既に off-screen の layout/paint を止めている | △ 二重取りにはならない |

⚠ **`content-visibility: auto` が既に入っている**ため、JS 仮想化が上積みで
買えるのは「**DOM ノードのメモリ + 生成コスト + memo 指紋比較 + append**」だけ。
layout/paint 分は既に止まっている。**この残コストを分離して測る対照実験を
S1 直後に行い、期待より小さければ S4 以降を着手しない判断もありうる**
(効果が小さいから棄却、ではなく「どの段階まで積むか」の判断材料として)。

## 2. 本当の障害 ── DOM を順序の正本として読む 6 箇所

| # | 機構 | file:line | 窓化すると何が起きるか |
|---|---|---|---|
| 1 | Shift+click 範囲選択の `visibleOrder` | `action-binder.ts:1848-1856` → `app-state.ts:3737-3742` | anchor が窓外だと `indexOf` が -1 → `blocked()` で**選択が丸ごと無反応**(何も起きない・何も出ない) |
| 2 | ↑↓ キーボードナビ | `action-binder.ts:6446-6470` | 窓の端で `currentIdx >= lids.length - 1` が真になり、**リストの末尾でもないのに無言停止** |
| 3 | 選択 highlight の全行走査 | `renderer.ts:848-869` | 窓外の行にハイライトが残る / 付かない |
| 4 | ensure-visible(選択行を画面内へ) | `renderer.ts:687-722` | 要素が取れないと**黙って return** → 「選んだのに見えない」 |
| 5 | 1 行差し替え(entry-body scope) | `renderer.ts:963-999` | 窓外の行は差し替わらず、古い内容が残る |
| 6 | in-window marker の subtree 走査 | `renderer.ts:4094-4117` | 窓の外に出た行の marker が更新されない |

🔴 **6 件とも「例外も test failure も出ない」型の壊れ方**をする。
とくに #2 は vitest(`action-binder-keyboard.test.ts:191/211`)も同じ DOM 導出を
期待値に使っているため、**test が緑のまま実機だけ壊れる**。

## 3. 行の高さ(実測 2026-07-27)

既定構成では **24.91px で完全に一様**(タイトルは `white-space:nowrap` +
`text-overflow:ellipsis` で必ず 1 行に潰れ、badge 類は行ボックスを広げず、
tree の depth は `paddingLeft` のみ)。一様性を壊すのは 3 条件だけ:

| 条件 | 高さ | 対処 |
|---|---|---|
| `.pkc-entry-move-btn`(manual sort の選択行) | 26px | **base.css に該当セレクタが 1 つも無く**、UA 既定の button ボックスが効いている ── S3 で CSS を足して一様化(バグ修正でもある) |
| `shell.compact_entry_labels` flag | 22〜33.84px | flag ON 時のみ動的高へ落とすか、flag の扱いを裁定 |
| 検索時の sub-location 行 | 22.11px | 同じ UL に混在する第 2 の li 種。窓の index 計算で扱う |

⚠ 単位高そのものは構成で動く(モバイル 48px / `theme.scale` 1.5 で 36.88px)
ため **定数化は不可**。実行時測定が要る。

⚠ **`content-visibility:auto` により未表示行は 39px という嘘の高さを返す**
(scrollHeight が真値の約 1.45 倍: N=400 で 14,487px vs 9,964px)。
測定ベースの動的高仮想化はこれで壊れるので、動的高を採るなら
content-visibility の除去とセットになる。

## 4. 段階(リスク昇順 ── 最初の段階は最小・可逆)

| 段階 | 内容 | 単独で残る価値 | risk |
|---|---|---|---|
| **S1** | 計器の同期点を行数依存から外す。`<ul>` に `data-pkc-row-count`(**論理**表示行数)を付与し、bench harness の「行数を待つ / 分母にする」を全部これに移す | bench の flake 要因が 1 つ消える | 最小(additive 属性 1 個) |
| **S2** | 🔑 **可視行順序の正本を DOM から描画側へ移す**(挙動不変・DOM fallback 付き)。`visible-order.ts` に `WeakMap<UL, string[]>` で append 順を記録。キーは **UL ノード**(`canReuseEntryList` で UL ごと引っ越すため、モジュール変数だとズレる) | **仮想化を断念しても価値が残る**(イベントごとの O(N) querySelectorAll が消える) | 低〜中 |
| **S3** | 行高の一様化(`.pkc-entry-move-btn` の CSS 追加)+ 単位高の実行時測定 | 選択時に行が 1px ずれるバグの解消 | 低(visual parity test 1 件必須) |
| **S4** | 仮想化スキャフォールド(flag `sidebar.virtual_list` 既定 OFF、window = 全件で **DOM は bit 等価**) | 行生成経路の集約 | 中 |
| **S5** | **windowing 本体**(flag ON 時のみ)。発動条件を二重に絞る:単位高が測れる **かつ** 論理行数 >= 200。どちらか偽なら全件描画へ自動 fallback ── happy-dom(高さが全部 0)と小 N の既存 test が構造的に守られる | ── | **最大** |
| **S6** | 既定 ON の判断(別 PR、数字が出てから) | ── | 低(ただし既定変更は全 user を新経路へ) |

## 5. 壊してはいけないもの(§2 の 6 件 + α)

1. ↑↓ ナビが窓の端で無言停止しないこと
2. Shift+click 範囲選択が blocked にならないこと
3. 選択行が必ず画面に見えること(quick-open / breadcrumb / calendar タップ / entry-ref からの遷移)
4. entry-list の scrollTop 保存・復元(スクロールの実体は `aside` ではなく **`ul[data-pkc-region="entry-list"]`**)
5. `markChildWindowItems` の decoration が窓に入った行にも適用されること
6. DnD 並べ替え(tree 行の `draggable`)と drop target の解決

## 6. 裁定が要る点

1. **この構成(S2 を独立した前工事にする)で、2026-07-26 の棄却に応えられているか**
2. doc は S1〜S6 全体で裁定を取るか、S1〜S3(低リスク前工事)だけ先に通して S4 以降を別 doc にするか
3. 効果の軸をどこに置くか(**メモリと boot**。保存 531ms の軸は仮想化の領域ではない)
4. `content-visibility` を残したまま JS 仮想化を上積みするのか、置き換えるのか
5. `shell.compact_entry_labels` flag(行高の一様性を壊す)の扱い ── 動的高の二重実装にするか、flag を退役させるか

## 7. 参照

- 棄却の記録: `storage-arch-cross-sections-2026-07-26.md`
- メモリ内訳の実測: `storage-wasm-sqlite-design-2026-07.md` §8-4
- 計測規律: `.claude/skills/perf-measurement/SKILL.md`
- parity test の書き方: `docs/development/visual-state-parity-testing.md`
