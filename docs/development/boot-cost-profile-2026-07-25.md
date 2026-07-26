# boot コストの実測プロファイル ── 27 秒はストレージではなかった(2026-07-25)

> user 指示(2026-07-25):「各断面においてどのようなアーキテクチャに置き換えるべきか検討して欲しい」
>
> その検討に入る前に、**「boot 27 秒がどこに消えているか」を実測した**。
> I/O 律速か CPU 律速かで採るべきアーキテクチャが正反対になるため。

---

## 結論

**boot 22.9 秒のうち、ストレージ I/O は 1.5%(0.35 秒)しかなかった。
85.6% はレンダラの計算量 ── たった 2 つの関数だった。**

修正後、**同条件の boot は 27.2 秒 → 3.1 秒(8.7 倍速)**。
ストレージのアーキテクチャには一切触れていない。

| | 修正前 | 修正後 |
|---|---|---|
| boot(15000 entries / 45000 revisions / 76MB) | **27,201 ms** | **3,110 ms** |

---

## 1. 内訳の実測

15000 entries / 45000 revisions / 76MB、既定(inline)、実 Chromium。
ページのスクリプトより前に IndexedDB / JSON API を包んで累積時間を取り、
CDP Profiler(1ms サンプリング)で self-time を関数別に集計した。

```
boot 22,930 ms
├ IDB(.result アクセス = structured clone 復元込み)   351 ms   1.5%
├ JSON.parse                                            87 ms   0.4%
├ Tt                                                15,131 ms  65.5%
├ Lqt                                                4,637 ms  20.1%
├ (program) — bundle パース / レイアウト / paint       1,207 ms   5.2%
└ DOM 操作(setAttribute / appendChild / createElement)  745 ms   3.2%
```

⚠ **最初の計測は間違えた。** IDB の計測 span を `req.result` アクセス**前**に
閉じていたため、structured clone の復元コストが「その他」に流れ込み、
IDB が 0.2% と出ていた。`.result` を参照してから span を閉じるよう直して 1.5%。
**それでもストレージは支配要因ではない**、という結論は変わらない。

## 2. 犯人

minify 名 `Tt` / `Lqt` をバンドルから引き当てた:

```js
function Tt(e,t){                                  // 65.5% = 15.1 秒
  if(0===e.revisions.length)return 0;
  let n=0;
  for(const r of e.revisions) r.entry_lid===t&&n++;   // 全 revision を線形走査
  return n
}
function Lqt(e,t,n,r,i){                           // 20.1% = 4.6 秒
  const a=nWt("li","pkc-entry-item");              // サイドバー 1 行の DOM 構築
  a.setAttribute("data-pkc-action","select-entry"), ...
```

- `Tt` = `getRevisionCount`(`src/core/operations/container-ops.ts:405`)
- `Lqt` = サイドバー行ビルダ(`src/adapter/ui/renderer.ts:5797` が `Tt` を呼ぶ)

**サイドバーは全 entry を描画し、1 件ごとに全 revision を走査していた。**
N×M = 15,000 × 45,000 = **6.75 億回**の比較。これが 15.1 秒の正体。

## 3. なぜ今まで見つからなかったか(ここが本題)

`getRevisionCount` 自身の doc コメントが答えを持っていた:

```ts
/**
 * pgc-230:revisions が空配列のとき(typical fresh container)早期 return ──
 * sidebar render で全 entry に対し getRevisionCount が呼ばれるため、c-1000+
 * で revisions=0 でも N 回 filter(empty array) が走る無駄を構造的に除去。
 */
if (container.revisions.length === 0) return 0;
```

**`bench-fixtures/c-*.json` は 5 つとも revisions が 0 件だった。**
つまりこの早期 return により、**歴代のベンチは全部「無料の道」しか通っていない**。

- `storage-backend-benchmark-2026-07.md`
- `differential-save-benchmark-2026-07.md`
- `storage-v3-redesign-2026-07.md` の A.1(300MB・asset 中心)
- 本セッション初期の `lazy_entry_bodies` boot 測定

これらは全て **履歴を持たないコンテナ**を測っている。
一方 **実ユーザーは編集するたびに revision が増える** ので、必ずこの経路を踏む。

⇒ **fixture に履歴が無かったこと自体が、最大の計測欠陥だった。**
`build/scripts/generate-bench-container.ts --revisions=<N>` を足して初めて露出した。

### 教訓(自己免疫整備として資産へ反映すべき)

> **ベンチの fixture が「実ユーザーのデータ」と同じ**形をしているかを、
> 測る前に確かめる。ゼロ件の次元があるなら、それは「測っていない次元」である。

## 4. 修正

`revisions` 配列の**同一性**をキーにした memo(`WeakMap<Revision[], Map<lid, count>>`)
を core に置き、`getRevisionCount` の内部だけを索引参照に変えた。
**呼び出し側の署名変更ゼロ**で全経路が効く。

Container は immutable に更新される(`revisions: [...container.revisions, revision]`)ので、
revision が増えれば配列の同一性が変わり memo は自動失効する。
`idb-store.ts:1022-1030` の `revisions.push` は**新しいローカル配列**を組み立てているだけで、
生きた Container の配列を破壊していないことを確認済み。

regression test: `tests/core/revision-count-index.test.ts`
(**必ず revisions を持たせて**検証する。0 件では早期 return に逃げて何も測れないため)

## 5. 修正後のプロファイル

```
boot 5,291 ms(プロファイラ有効時。無効時は 3,110 ms)
├ (program) — bundle パース / レイアウト / paint   4,093 ms  73.3%
├ IDB                                                511 ms   9.7%
├ (anonymous)                                        362 ms   6.5%
├ GC                                                 186 ms   3.3%
└ appendChild / setAttribute                         235 ms   4.2%
```

**アプリの JS にホットスポットが無くなった。**

⚠ **この内訳の読み方に注意(2026-07-26 訂正)**:
上の百分率は **プロファイラ有効時の 5,291 ms に対する比率**であり、
プロファイラ無効時の **3,110 ms に対する比率ではない**。両者を混ぜて
「3.1 秒の 73% が `(program)`」と読んではいけない(初版でその誤りを犯した)。

また `(program)` は V8 CPU プロファイルの**受け皿バケット**で、
バンドルのパースやレイアウトのほかに**プロファイラ自身のオーバーヘッドも入る**。
「5.9MB バンドルのパース + 15000 行のレイアウト」は**推定であって内訳の実測ではない**。
ここを分解するには別の計測(Performance timeline / longtask attribution)が要る。

さらに **修正後はストレージの相対比重が上がっている**:
IDB は 351 ms → 511 ms と**絶対値が減っていない**一方で全体が縮んだため、
比率は 1.5% → 9.7% になった。「ストレージは 1.5% だから無視してよい」は
**修正前の比率**の話であり、修正後の設計判断にそのまま持ち込んではいけない。

## 6. アーキテクチャ検討への含意

**この結果は、進行中のストレージ再設計の前提を変える。**

1. **boot が遅かった理由はストレージではなかった。** 修正前の 22.9 秒のうち
   IDB は 1.5% しかなく、O(N×M) の索引化だけで 8.7 倍になった。
   ⚠ ただし **修正後は IDB が 9.7%** に上がっている(絶対値は 351→511 ms で
   横ばい、全体が縮んだため)。「1.5% だから無視してよい」は修正前の話であり、
   **これから何を設計するかの根拠には使えない**
2. 同様に、先の書込 I/O ベンチが挙げた「次の perf 改善 = 毎保存の O(N+M)」も、
   **boot には効かない**(あれは保存側の話)
3. **残る 5.3 秒の内訳は性質が違う**:
   - バンドルのパース(5.9MB)── 保存形式と無関係
   - 15000 行のサイドバー DOM 構築とレイアウト ── **仮想化 / 遅延描画**の領域
   - IDB 0.5 秒 ── ここでようやくストレージの出番だが、支配的ではない

⇒ **「操作可能になるまでの時間」を縮める主戦場は、ストレージ層ではなく
描画層(何を描かないか)である**可能性が高い。断面ごとのアーキテクチャ検討は
この実測の上でやり直す。

ただし本測定は **本文・履歴プレーンのみ(asset 0)** である。
asset を含む実運用(数百 MB)では I/O の比率が上がる可能性があり、
**asset 込みの再測は未実施**。

## 参照

- **手法の正本**: `.claude/skills/perf-measurement/SKILL.md`(`/measure` コマンド)
  ── 本 doc が踏んだ罠(計器の span を実体化前に閉じた / 百分率の取り違え)はそちらに再発防止として収録済み
- 書込 I/O ベンチ: [`storage-write-io-bench-2026-07-25.md`](./storage-write-io-bench-2026-07-25.md)
- 設計正本: [`storage-v3-architecture-2026-07.md`](./storage-v3-architecture-2026-07.md)
- 履歴入り fixture 生成: `build/scripts/generate-bench-container.ts --revisions=<N>`
