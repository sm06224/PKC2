# 保存形式の書込 I/O 実測(2026-07-25)

> user 指示(2026-07-25):「ベンチして根拠ありで正しく着地しましょう」

処遇 doc [`lazy-entry-bodies-disposition-2026-07-25.md`](./lazy-entry-bodies-disposition-2026-07-25.md) §6 が
user 裁定待ちにしていた問い ──
**「`differential_save` の保存形式を split v1 から layout 5 へ一本化すべきか」** に、実測で答える。

ハーネス: `tests/bench/storage-write-io.mjs`(本番コード経路 = `dist/pkc2.html` を実 UI 操作で駆動)

---

## 結論

**一本化しない。** 加えて、**私が処遇 doc で「する」を推したのは撤回する** ── 実測が支持しなかった。

さらに、当初の問いより重い発見があった:

> **差分保存の per-edit 書込削減は約 -25% どまりで、設計が謳う O(1) ではない。**
> split v1 も layout 5 も、**毎保存で O(N+M) のレコードを書いている**(コードで確認済、§4)。

---

## 1. 測定条件

| | |
|---|---|
| fixture | 5000 entries / **15000 revisions** / assets 0 / 21.1 MB |
| 指標 | `/proc/diskstats` の実デバイス書込(sectors written × 512B、`sync` 済) |
| 反復 | 3 回(独立プロファイル・独立ブラウザ) |
| 編集 | 1 編集 = エントリ選択 → 編集開始 → 本文に 1 文字 → 確定。text エントリのみ |

腕:

| 腕 | flags | 保存経路 |
|---|---|---|
| Z 床 | 両 OFF | 編集を 1 回もしない(放置時のノイズ) |
| **Y 対照群** | 両 OFF | 同じ操作をして **CANCEL_EDIT で抜ける** = 保存だけ起きない |
| A | 両 OFF | `save()` = inline 全件 |
| B | diff のみ | `saveDiff()` targetLayout 1 = **split v1** |
| C | diff + lazy | `saveDiff()` targetLayout 5 = **segments** |

**保存に帰せられる書込 = その腕 − Y。**

### ⚠ Y が本ベンチの肝(最初は間違えた)

当初は Z(ブラウザ放置)だけを対照群にして「1 編集あたり 3.2MB」と出した。
ところが **コンテナを 1/10(4.8MB → 500KB)にしても 4.1MB と出た** ──
測れていたのは保存ではなく **操作そのものがブラウザに書かせる分**だった。

`CANCEL_EDIT` が `SAVE_TRIGGERS`(`persistence.ts:48-79`)に含まれないことを使い、
**クリック・打鍵・phase 遷移・再描画をすべて同じにして保存だけ起きない**腕に作り直した。
Y の実測は 1000 件 1124 KB / 5000 件 1209 KB と **コンテナサイズに依存しない** ので、
操作オーバーヘッドとして正しく分離できている。

計測手法自体も先に検証した:放置 0.7MB に対し 20MB 書込 → 19.3MB、60MB → 54.4MB
(信号がノイズの 15〜40 倍・線形)。

---

## 2. 結果(3 回・中央値と実測レンジ)

対照群 Y: 1209 / 1329 / 1183 KB → **中央値 1209 KB / 操作**(これは保存ではない)

| 腕 | 保存書込 / 編集 | レンジ | 変換 1 回 | 最終使用量 | **boot 中央値** | boot レンジ |
|---|---|---|---|---|---|---|
| A inline | **3851 KB** | 3719–3933(±3%) | 20.4 MB | 5.7 MB | **3370 ms** | 3331–3372(**±0.6%**) |
| B split v1 | **2853 KB** | 2841–3029(±3%) | **49.7 MB** | **9.1 MB** | 3642 ms | 3625–3679(±0.7%) |
| C layout 5 | **2898 KB** | 2100–3499(±24%) | **18.7 MB** | **3.4 MB** | **6205 ms** | 6198–7046 |

A 比:

| | 保存書込 | 使用量 | 変換 | boot |
|---|---|---|---|---|
| B split v1 | **-26%** | ×1.6 | ×2.4 | **+8%** |
| C layout 5 | **-25%** | **×0.60** | **×0.92** | **+84 〜 +109%** |

---

## 3. 一本化しない理由

### 🔴 layout 5 は boot をほぼ倍にする ── #958 と同じ軸

C の boot は 3 回とも A の **1.8〜2.1 倍**。しかも **A 自身が ±0.6% で極めて安定**しており、
これはノイズではない。

#958(差分保存の既定 ON 撤回)の理由はまさに boot だった。
**boot を倍にする形式を既定にはできない。** 使用量が 0.6 倍になっても、
それは既定を変える理由にならない ── 起動は全 user が毎回通る経路で、
storage 使用量は困っている人だけの問題である。

機構の推定: layout 5 の boot は **revision segments を全件 gunzip する**
(`idb-store.ts:926-928` は `skipBodies` に関係なく `loadRevSegments` を実行する)。
15000 revisions を 21 segment に gzip して持つぶん、伸長 CPU が boot に乗る。

### layout 5 に利点が無いわけではない

- **使用量 0.6 倍**(3.4 MB 対 5.7 MB)── gzip は確かに効いている
- **変換コスト最小**(18.7 MB。split v1 は 49.7 MB = **2.4 倍**)
- per-edit 書込は split v1 と実質同じ(2898 対 2853、C 自身の振れ幅 ±24% の内側)

⇒ **storage 逼迫で困っている人向けの opt-in としては引き続き妥当。既定にはしない。**

### split v1 も一本化先にならない

B は boot +8% と軽微だが、**使用量 1.6 倍・変換コスト 2.4 倍**。
per-edit 書込の -26% と引き換えにこれを全 user に配る根拠は無い。

---

## 4. より重い発見 ── 差分保存は O(1) ではない

**「差分保存は書込を変更分 O(1) にする」という前提が、この規模で成り立っていない。**

実測: A 3851 → B 2853 KB(**-26%**)。O(1) なら KB オーダーのはずである。

コードで機構を確認した(`idb-store.ts` の marker / core 構築):

```
const marker: SplitMarker = {
  entryOrder: wantSplitBodies ? [] : container.entries.map((e) => e.lid),
  revOrder: container.revisions.map((r) => r.id),      // ← 15000 件を毎保存
};
const core: StoredContainerRecord = {
  ...
  entries: wantSplitBodies
    ? container.entries.map((e) => (e.body === '' ? e : { ...e, body: '' }))  // ← 全 5000 件を毎保存
    : [],
  ...
};
```

- **split v1**: marker に `entryOrder`(5000 lid)+ `revOrder`(15000 id)= **O(N+M) を毎保存**
- **layout 5**: `entryOrder` は空だが `revOrder` は **O(M) を毎保存**、さらに core record に
  **body を落とした全 5000 entry = O(N) を毎保存**

差分になっているのは entry / revision の **本体**だけで、**索引と順序リストは毎回全書き**である。
N・M が大きいほどこの固定費が支配し、差分の利得を食う。

**改善の余地はここにある**(順序リストの差分化 / 索引の分割)。
保存形式の切替よりこちらのほうが効果が大きい可能性が高い。これは別 issue。

---

## 5. 本測定の限界(結論に効くもの)

1. **高速ディスク上の測定**(virtio / ext4、`/proc/diskstats` の `vda`)。
   #958 の user 報告は **遅いストレージ**の話だった。gunzip の CPU が boot 増の主因なら、
   I/O が支配的な遅いディスクでは順位が変わりうる。**遅いストレージでの再測は未実施**
2. **編集は 6 回**。debounce(300ms)より十分あけて 1 編集 = 1 保存にしているが、
   5000 件では保存自体が長引く場合があり、一部が合流した可能性は排除できない。
   合流は保存回数を減らすので **per-edit を過小評価する方向**に働き、
   最も保存が重い A に最も強く効く ⇒ 「A が最も重い」という結論には安全側
3. **C の振れ幅が大きい**(±24%)。segment の compaction が走る回か否かで変わるため。
   C の per-edit 書込を B と厳密に比べるだけの分解能は無い(順位付けはしていない)
4. **assets 0 の fixture**。asset の書込は 3 腕で同じ(`putAssets` は layout 非依存)なので
   比較には影響しないが、絶対値は実運用より小さい

---

## 6. 着地

| 項目 | 判断 |
|---|---|
| `differential_save` を layout 5 へ一本化 | **しない**(boot ほぼ倍) |
| `differential_save` の既定 | **OFF 据え置き**(#958 の判断は追認された) |
| `lazy_entry_bodies` の既定 | **OFF 据え置き**(診察 doc の結論を追認) |
| `lazy_entry_bodies` の廃止 | **しない**。storage 逼迫向けの opt-in として利点が実証された(使用量 0.6 倍・変換コスト最小) |
| マニュアルの記述 | **実測のトレードオフに書き換える**(「起動が速くなる」ではなく「保存領域は減るが起動は遅くなる」) |
| 次にやるべき perf 改善 | **順序リスト・索引の O(N+M) 毎保存を削る**(§4)。保存形式の切替より効く見込み |

処遇 doc の推奨のうち **§5「畳むべきは split v1 の書き手ではないか」と §6 の「一本化する」推しは、
本実測により取り下げる**。split v1 は per-edit 書込では最良で、boot も +8% にとどまる。

## 参照

- ハーネス: `tests/bench/storage-write-io.mjs`
- fixture 生成: `build/scripts/generate-bench-container.ts --revisions=<N>`
- 診察所見: [`lazy-entry-bodies-diagnosis-2026-07-25.md`](./lazy-entry-bodies-diagnosis-2026-07-25.md)
- 処遇判断: [`lazy-entry-bodies-disposition-2026-07-25.md`](./lazy-entry-bodies-disposition-2026-07-25.md)
- user 指示の出典: [`storage-v3-redesign-2026-07.md`](./storage-v3-redesign-2026-07.md) §A.7
- 差分保存の撤回経緯: [`differential-save-benchmark-2026-07.md`](./differential-save-benchmark-2026-07.md) / #958
