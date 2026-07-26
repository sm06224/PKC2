# 既定 storage layout の再判定(2026-07-26)── 「既定パスが 1 編集 25.7MB 書く」の処遇

> user 指示(2026-07-26、標準指令):
> 「**全く改善しないという選択肢はあり得ない。過去の実測に引っ張られたり、
> 過去の資産に引っ張られて変更をしない実装を考えないなんていう結論に
> 逃げ込むことは許さない。パフォーマンス改善は必ずしなさい**」

---

## 0. 結論を先に

**layout を変えるのではなく、「変わっていないのに書いている」を止めるのが答えだった。**

| # | 分かったこと | 処遇 |
|---|---|---|
| 1 | 差分保存(split v1)の既定 ON は **boot が 5.5 倍**になる | ❌ 棄却(実測) |
| 2 | layout 5 の既定 ON は、**boot 比較が交絡していて判断材料にならない** | ⏸ 保留(§3) |
| 3 | 🔴 **編集を 1 回もせず起動しただけで 25,685 KB 書いていた** | ✅ **修正済**(§5) |
| 4 | 🔴 lazy layout でバックアップ ZIP から**添付が丸ごと落ちる** | ✅ 修正済(#1023) |

**3 が本命だった。** 形式変更なし・後方互換完全・既定パスの全 user に効く。

---

## 1. 🔴 まず、私の仮説が実測で潰れた記録

### 仮説: 「#958 は FS 固有だから、IDB では差分保存を既定 ON にできる」

根拠はあった。#958 の本文がこう書いている:

> `createWritable()` は atomic swap のため per-file 数十 ms /
> 初回の全件書込みは数千 entry で**分単位** / 以後の boot も**数千ファイル open**
> **IDB は range scan / 単一 tx なので速く、CI・スモークでは検出できなかった**

しかも修正 `slowPerRecordIO`(`idb-store.ts:793`)は **flag と無関係に**
FS backend を inline へ迂回させる。つまり flag を既定 ON にしても
**FS 環境で #958 は再現しない**。ここまでは正しい。

### 実測: それでも IDB で boot が 5.5 倍になった

| 規模 | A(inline) | B(split v1) | B の A 比 |
|---|---|---|---|
| 1000 / 3000(5MB) | 270 ms | 307 ms | +13.7% |
| 5000 / 15000(25MB) | 423 / 485 ms | **2,532 / 2,689 ms** | **約 5.5 倍**(2 回とも) |
| 15000 / 45000(76MB) | 936 ms | 2,138 ms | +128% |

**「IDB は range scan だから速い」は「ファイル open より速い」であって
「タダ」ではなかった。** 20,019 record の structured clone 復元が効く。

⇒ **差分保存単体の既定 ON は取り下げる。**

---

## 2. layout 5(C)の数字

| 規模 | A | C | C の A 比 |
|---|---|---|---|
| 1000 / 3000 | 270 / 263 ms | 276 / 291 ms | +2.2% / +10.6% |
| 5000 / 15000 | 423 / 485 ms | 497 / **494** ms | +17.5% / **+1.9%** |
| 15000 / 45000 | 936 ms | 1,164 ms | +24.4%(1 走行のみ) |

⚠ **C の boot ペナルティは A 自身の振れ幅に埋もれる。** 25MB 規模の 2 回目は
A が 423 → 485 と動いた一方 C は 497 → 494 で動いていない。
**「+17.5%」を確定値として持ち出してはいけない。**

書込・使用量(put 計器 / 生存データ計器):

| | A | B | C |
|---|---|---|---|
| 書込 / 編集(5000 件、put 計器) | 25,688 KB | 11 KB | **987 KB** |
| 生存データの蓄積 / 編集 | 1.3 KB | 1.4 KB | **0.4 KB** |
| quota @160 編集(5000 件) | **6.85 MB** | 9.29 MB | 6.36 MB |
| quota の伸び / 編集 | **1.7 KB** | 不安定 | 15.8 KB |
| record 数(1000 件) | 4 | 4,074 | **13** |

---

## 3. ⏸ しかし C の既定化は判断できない ── 比較が交絡している

実装監査(5 観点 × 敵対的反証)で、**測り方の前提が崩れた**。

### (a) layout 5 は revision を遅延していない

`idb-store.ts:1122-1123` の分岐は `lay >= 4` **のみ**で、`skipBodies` を見ていない。
**boot で rev segments を全件 gunzip する。** 遅延するのは本文だけ。

fixture の内訳(実測):

| fixture | Σ rev JSON | Σ body |
|---|---|---|
| c-1000-rev | 3.71 MB | 1.01 MB |
| c-5000-rev | 18.74 MB | 5.07 MB |
| c-15000-rev | **56.99 MB** | 15.20 MB |

⇒ **boot で伸長する履歴が、節約する本文の 3.7 倍**。

### (b) 🔴 `bootReady` の意味が腕で違う

C は **本文を 1 件も読まずに** `bootReady` に到達する(`main.ts` の `bodiesDeferred: true`)。
その後 `body-working-set.ts:91-97` が **32 件 / 200 ms** で backfill する。
N=15000 なら収束まで **約 94 秒**、その間ずっと再 render が入る。

**これは測定の外側にある。** 「操作可能になるまでの時間」を比べたことにならない。

### (c) render の差が混ざっている

C は body が空なので、初回サイドバー描画(N 行・**非仮想化**、`renderer.ts:4950-`)の
`countTaskProgress(entry.body)`(`renderer.ts:5785`)が実質ゼロになる。
測った差は storage だけの差ではない。

### (d) ハーネスの地雷

`storage-write-io.mjs` の seed は `containers` を `clear()` する。workspace record も
同 bucket(`workspace:` prefix)にあるため、**seed 直後の 1 回目 boot だけが「初回起動」**
になり `ensureDefaultWorkspace` → `skipBodies` なしの `loadDefault()` を踏む。
今回は計測フェーズが後段なので巻き込んでいないが、**順序を 1 つ入れ替えれば C だけ重くなる**。

⇒ **C の既定化を判断するには、腕をまたいで同じ状態(全 hydrate 済み)まで測り直す必要がある。
現時点では推奨も否決もしない。**

---

## 4. 手法上の訂正(2 件)

### 🔴 (a) `boot-cost-profile-2026-07-25.md` は **別ハーネスの数字を並べていた**

> | boot(15000 entries / 45000 revisions / 76MB) | **27,201 ms** | **3,110 ms** |

- 27,201 ms … `tests/bench/storage-write-io.mjs`
- 3,110 ms … scratchpad の CDP プロファイル用ハーネス(**別実装**)

**同一ハーネスで測り直した今日の A は 936 ms。**
倍率を出すなら同じ計器で測った 2 点でなければならない。
自分で `perf-measurement` skill に書いた規律を、自分で破っていた。

### 🔴 (b) 「1000 件では layout 5 の使用量が 1.5 倍悪い」の正体

`idb-store.ts` の flag コメントと `storage-write-io-bench-2026-07-25.md:100` の記述。
条件を揃えて再現を取った:

| 1000 件・旧コード | A | B | C |
|---|---|---|---|
| EDITS=1 | 1.4 MB | 4.4 MB | **1.3 MB** |
| EDITS=4 | 1.4 MB | 2.5 MB | **2.0 MB** |

**当時の測定は正しかった。違いはコードではなく編集回数だった。**
そして `navigator.storage.estimate()` は **IDB 自身の未回収領域を含む**ので、
これは「layout 5 がデータを溜めている」ことを意味しない。
専用計器(`tests/bench/storage-footprint.mjs`、生存 record を全件読み戻す)で分けると:

| 生存データの伸び / 編集 | A | B | C |
|---|---|---|---|
| 1000 件・160 編集 | 1.4 KB | 1.4 KB | **0.4 KB** |

⇒ **C は旧コピーを溜めていない。** estimate() の差は IDB の GC 遅れだった。

---

## 5. ✅ 本命 ── 「変わっていないのに書いている」

### 🔴 起動しただけで 25,685 KB

`CONTAINER_LOADED` は `SAVE_TRIGGERS` の一員(`persistence.ts:56`)。
boot は `SYS_INIT_COMPLETE` → reducer が `CONTAINER_LOADED`(`app-state.ts:1380`)を出す。
⇒ **編集を 1 回もしなくても、起動のたびにコンテナ全体が保存される。**

put 計器で直接測った(コード読みだけで実装しない):

```
■ A 既定(inline) — **起動しただけ**で put 3 回 / 25685 KB
        25685 KB  put 1 回  core record
```

**既定パスなので全 user が毎起動これを踏んでいた。**

### なぜ trigger を消せないか

`mergeSystemEntries`(`main.ts`)が system entry を足した場合、その差分は保存が要る。
だから消すのではなく「**変わっていないなら書かない**」で止める。

### 実装(3 点)

1. `mergeSystemEntries`(`core/model/container.ts`)が **no-op のとき `base` をそのまま返す**。
   従来は変化が無くても必ず新オブジェクトを作っていたので、参照比較が効かなかった。
   比較は供給された system entry の分だけ(通常ひと握り)、**保守的**(迷ったら「違う」)
2. `persistence.ts` が `persistedRef`(storage と一致していると分かっている参照)を持ち、
   **参照が同一なら保存を skip**。Container は immutable 更新なので偽陽性なし。
   ⚠ `pendingPurge`(orphan asset 回収)が立っているときは skip しない
3. boot 側は `notePersistedBaseline(container)` で基準値を渡す。
   ⚠ **`loadDefaultMetaShallow().storedInline` が true のときだけ**。
   false のときの起動時保存は無駄書きではなく **形式を戻す作業**(flag OFF →
   inline へ書き戻る安全弁)なので止めてはならない。
   `bodiesDeferred === false` では代用できない ── split v1 は `__pkc_layout__` を
   持たず bodiesDeferred も false だが、`__pkc_split__` marker を持つので inline ではない

### 実測(同一計器・同一 fixture)

```
修正前: 起動しただけで put 3 回 / 25685 KB
修正後: 起動しただけで put 1 回 /     0 KB
```

**形式変更なし・後方互換完全・既定パスの全 user に効く。**

---

## 6. 監査が挙げた未処理のデータ消失経路

実装監査(5 観点 × 敵対的反証)は、既定化の可否とは別に **現存する欠陥**を挙げた。
1 件は本セッションで修正済み、残りは未着手。

| # | 内容 | 状態 |
|---|---|---|
| S1 | `hydrateForExport` が本文より先に asset を集める ⇒ **バックアップ ZIP から添付が丸ごと落ちる**(移行前バックアップも同経路) | ✅ **#1023 で修正** |
| S2 | 読めなかった本文が `''` として焼き付く(`body-working-set.ts:66-68` が無条件に pending を外す / 書き側 `?? ''`) | ⏳ 未着手 |
| S3 | `differential_save` 単独 OFF で `save()` が空本文を inline に焼き、`dropSegments` が segments を消す(`save()` に `bodyPending` guard が無い) | ⏳ 未着手 |
| S4 | `appendRevSegments` が**復号失敗**した active segment を `tail=[]` で上書き破棄(JSON 破損側は非破壊なのに gzip 破損側だけ破壊的) | ⏳ 未着手 |

**S2 / S3 / S4 は `lazy_entry_bodies` を既定 ON にする前に必ず塞ぐ必要がある。**
現在は opt-in なので影響範囲が限られている。

### compaction の実態(既定化を考えるなら要る知識)

- body 側には compaction がある(`idb-store.ts:874`、`segKeys > referenced*2 + 4`)。
  ただし判定が **segment の個数**なので、**live な lid が 1 つでも残る segment 内の
  死骸は何バイトあっても不可視**(監査 probe: live 100KB に対し死骸 900KB で永久に非発火)
- **rev 側には compaction 判定が無い**
- 恒久的に積まれる主項は revision(`snapshot = JSON.stringify(entry)` = 旧本文まるごと
  1 部 / 編集、上限・保持期間の設定は src に存在しない)。これは **全 layout 共通**
- 🟢 緩和: `diffBase` は `mountPersistence` ごとに null 初期化されるので、
  **起動後の最初の保存は必ず全再構築 = 全 compaction**

---

## 7. 残っている改善余地(実測ベース、着手順の候補)

| # | 案 | 1 編集の書込 | 互換 |
|---|---|---|---|
| ✅ | 変わっていないなら書かない | **起動 25,685 → 0 KB** | 完全 |
| **B-2** | revision の `snapshot` だけ segments へ(spine は inline に残す) | **−17,132 KB(−66.7%)** | 版マーカー必須 |
| B-5 | core record 丸ごと gzip | 25,668 → 3,578 KB(7.2 倍) | 旧ビルド不可 |
| B-3 | entry `body` を segments へ | −5,266 KB | 版マーカー必須 |

**B-2 が次の本命。** boot が読むのは spine(id / entry_lid / created_at / prev_rid /
content_hash = 1,894 KB)だけで、`snapshot` を読むのは `parseRevisionSnapshot` の
呼び元(ゴミ箱 / 選択中 entry / export)に限られる ── **boot を重くせずに 66.7% 減らせる**
唯一の項。

⚠ ただし **fixture の削除済み lid が 0 件**なので、ゴミ箱経路
(`getRestoreCandidates` → `renderer.ts:5261/5297` が毎 render で snapshot を読む)は
**一度も測られていない**。B-2 の効果はここに左右されるので、fixture を作り直してから判断する。

---

## 8. 測定の限界(結論に持ち込む前に明記する)

- **asset 0 の fixture。** user の「500MB 超」は asset 主体で、そこは P1(Blob 化)の領分
- **削除済み lid 0 / `meta.entry_order` 不在**。CLAUDE.md「ゼロ件の次元 = 測っていない次元」
- **走行間の絶対値は比較しない。** B の boot が非単調(25MB で 2,532 / 2,689 ms、
  3 倍の record 数の 76MB で 2,138 ms)。25MB 側は 2 回とも再現しているので noise ではなく
  **未解明**。B は却下済みなので判断は変わらないが、**B の絶対値は使わない**
- diskstats 版の書込の腕は 3 規模とも ⛔ ガードが発火(対照群 Y 以下)。
  **書込の主張には put 計器しか使わない**
- 15000 規模の C は **1 走行のみ**(再現未取得)

---

## 参照

- [`save-write-volume-2026-07-26.md`](./save-write-volume-2026-07-26.md) — 書込断面(put 計器)
- [`storage-write-io-bench-2026-07-25.md`](./storage-write-io-bench-2026-07-25.md) — 実デバイス書込 + boot(前回)
- [`boot-cost-profile-2026-07-25.md`](./boot-cost-profile-2026-07-25.md) — boot の内訳(§4-a で訂正)
- [`storage-arch-cross-sections-2026-07-26.md`](./storage-arch-cross-sections-2026-07-26.md) — 断面ごとの設計案
- 計器: `tests/bench/save-write-volume.mjs` / `storage-write-io.mjs` / **`storage-footprint.mjs`(新規)**
- 手法の正本: `.claude/skills/perf-measurement/SKILL.md`
