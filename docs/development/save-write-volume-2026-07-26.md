# 保存断面の書込量 ── 「アプリが書けと言った量」の直接計測(2026-07-26)

> user 裁定(2026-07-26):「いっぺんに片付ける必要がないなら、貴方の推奨で OK。
> 綺麗に着地させましょう。こういう時のために診察テストも作った。
> **しっかり測定して実装していきましょう**」
>
> 推奨した順序 = **B(保存断面)→ 測り直し → 設計確定**。本 doc はその B の測定。

ハーネス: `tests/bench/save-write-volume.mjs`

---

## なぜ新しい計器を作ったか

先の `storage-write-io.mjs` は `/proc/diskstats` の実デバイス書込を測る。
実コストとしては正しいが、**ブラウザ自身の書込(1 操作あたり 1〜2MB)が混じる**ため
対照群の差し引きが必要で、「向きは信頼できるが倍率は信頼できない」ところまでしか
分解できなかった([`storage-write-io-bench-2026-07-25.md`](./storage-write-io-bench-2026-07-25.md) §2-b)。

本計器は `IDBObjectStore.put/delete` をページ内で包み、**key ごとの書込バイト数**を積む。
**ブラウザのオーバーヘッドは 1 バイトも入らない。**
「毎保存で O(N+M) を書いている」という主張は、この計器で初めて検証できた。

※ バイト数は `JSON.stringify(value).length`(Blob は `.size`)による近似。
IDB の structured clone 表現とは一致しないが、**腕をまたいで同じ尺度**であり
「どの key が N・M に比例するか」を見るには十分。絶対値の主張には使わない。

---

## 1. 結果 ── 1 編集(本文 1 文字)あたりの書込量

### N=5000 / M=15000(25.1 MB)

| 腕 | 1 編集あたり | 内訳 |
|---|---|---|
| **A 既定(inline)** | **51,378 KB** | core record 51,378 KB(put 2.0 回) |
| **B 差分保存(split v1)** | **1,270 KB** | **core record 1,268 KB** / `__entry__:` 1 KB / `__rev__:` 1 KB |
| **C 差分保存+lazy(layout 5)** | **3,012 KB** | **core record 2,824 KB** / segments rev pack 116 KB / body pack 73 KB |

### N=1000 / M=3000(5.1 MB)

| 腕 | 1 編集あたり | 内訳 |
|---|---|---|
| A 既定(inline) | 10,213 KB | core record |
| B 差分保存(split v1) | 250 KB | **core record 247 KB** / 実データ 3 KB |
| C 差分保存+lazy | 685 KB | **core record 555 KB** / segments 130 KB |

## 2. 確定したこと

### 🔴 (a) 既定パスは 1 文字の編集で **コンテナ全体を 2 回**書く

25 MB のコンテナで **51 MB / 編集**。5 MB のコンテナで 10 MB / 編集。
きれいに **2 × コンテナサイズ**。

### 🔴 (b) 差分保存の書込は **99.8% が core record の無駄**

B は実データ(変更 entry 1 + revision 1)が **2 KB** なのに、
core record を **1,268 KB** 書いている。**634 倍**。
C も 2,824 KB のうち segments(実データ)は 189 KB で、**93.7% が core record**。

これで「差分保存は O(1) ではない」が定量的に確定した。
先の diskstats ベンチでは「-26% どまり」としか言えなかったが、
**内訳は「実データ 0.2%、索引の全書き 99.8%」** である。

### 🔴 (c) **1 編集につき保存が 2 回走っている**

core record の put 間隔は 790〜1193 ms で、ベンチの編集間隔(1200 ms)と一致。
つまり **1 編集 = 2 保存**。

原因を追った:

- `COMMIT_EDIT` の reducer(`app-state.ts:4166`)が出す save trigger は
  **`ENTRY_UPDATED` 1 つだけ**
- もう 1 つは **UI 設定の保存**。`ui-prefs.ts:8` が明記している ──
  > **正本 = container の `__settings__` payload `uiPrefs` バッグ**
  > 書き込みは debounce して `SET_UI_PREFS` を 1 回 dispatch(reducer が
  > `__settings__` へ merge → `SETTINGS_CHANGED` → persistence が save)
- `SETTINGS_CHANGED` は `SAVE_TRIGGERS`(`persistence.ts:48-79`)に入っている

### 🔴 (d) **選択するだけでコンテナ全体が書かれる**(直接確認)

推測で実装しないため、**編集しない腕**(選択だけ)を追加して測った:

| 腕 | 1 操作あたり | core record の put |
|---|---|---|
| **S 選択のみ(編集しない)** | **5,104 KB** | **1.0 回** |
| A 編集 | 10,213 KB | 2.0 回 |

**サイドバーの行をクリックするだけで、コンテナ全体(5 MB)が書かれている。**
25 MB のデータなら 1 クリックで 25 MB。
そして A の「2 回保存」は **選択 1 回 + 本体更新 1 回**の合算だと確定した。

### ✅ 真犯人を特定して直した(2026-07-26 追記)

推測のまま実装しないため、**保存の前後で container を差分**した。変化していたのは
`__settings__`(system-settings、714 → 738 bytes)ただ 1 件で、
その中で変わったキーも 1 つだけだった:

```
uiPrefs["pkc2.tabStrip"]
  {"lids":[],"active":null,"pinned":[]}
→ {"lids":["txt-62"],"active":"txt-62","pinned":[]}
```

**タブストリップ**だった。経路はこうなっている:

1. サイドバーの行をクリック → `ENTRY_SELECTED`
2. `wireTabStrip`(`tab-strip.ts:698`)が `recordTabOpen` + **`persistTabState()`**
3. `setUiPref('pkc2.tabStrip', …)` → `SET_UI_PREFS` → `__settings__` に merge
4. `SETTINGS_CHANGED`(`SAVE_TRIGGERS` の一員)→ **コンテナ全体の保存**

`wireTabStrip` が always-on なのは**設計どおり**である(:696 に
「flag OFF なら tab を記録するが描画は renderer が判断する。本 wiring 自体は
always-on(open 履歴を保持しておく)」と明記)。しかし**書き出し先が container**
だったため、**既定 OFF の opt-in 機能が全 user の選択ごとに全件書込みを起こしていた**。
同ファイル冒頭が宣言する「**flag OFF で完全 no-op**」が永続化の次元で破れていた。

**修正**: メモリ内の記録(= 有効化したとき履歴が残る、という意図)はそのまま残し、
**永続化だけ** `shellTabsEnabled()` に従わせた(`persistTabState` の先頭 1 行)。
形式変更なし・マイグレーション不要。

#### 効果(同一条件・N=1000 / M=3000)

| 腕 | 修正前 | 修正後 |
|---|---|---|
| **S 選択のみ** | 5,104 KB | **0 KB** |
| **A 編集(既定)** | 10,213 KB | **5,106 KB(半減)** |
| B 差分保存 | 250 KB | 126 KB |
| C layout 5 | 685 KB | 392 KB |

**選択は 1 バイトも書かなくなり、編集は予測どおり半分**(2 保存 → 1 保存)になった。
25 MB のコンテナなら、サイドバーを 1 回クリックするたびに書いていた 25 MB が消える。

### 参考: 特定に至るまでに潰した候補

機構としては「UI 設定の正本が container の `__settings__`」なので
`SETTINGS_CHANGED` → 全体保存の線が濃いが、**選択時に何がその pref を書くかは未特定**。
以下は**調べて否定した**:

- ❌ `SELECT_ENTRY` の reducer(`app-state.ts:1393`)── コメントが明示している
  > Pure read against the container — **no mutation**
- ❌ 折りたたみ状態の listener(`main.ts:438-458`)── 参照比較でガードされており、
  `collapsedFolders` が実際に変わらない限り書かない

**残る候補**(未検証): `main.ts:699-701` の毎 render `workingSet.refresh()` /
`pane-prefs` / `edit-mode-prefs` / その他 `setUiPref` 呼び出し元
(`action-binder.ts:9594` / `tab-strip.ts:339` / `folder-prefs.ts:137` /
`pane-prefs.ts:127` / `edit-mode-prefs.ts:51` ほか)。

⇒ 実際にやったのは「保存の前後で container を差分する」直接観測だった(上記)。
**機構を推定したまま実装しなかったのが正解で、推定していた「UI 設定の保存」は
当たっていたが、その中の *どれ* かは差分を見るまで分からなかった。**

---

## 2-b. core record の項別内訳 ── **推測は外れていた**(2026-07-26 追記)

「core record が 99.8% を占める」までは分かったが、**その中の何が O(N+M) なのか**は
測っていなかった。計器を項別に割って測ったところ、**コード読みで名指ししていた項が
最大ではなかった**。

N=5000 / M=15000 / R=3074、1 保存あたり:

| 腕 | core record の中身 | |
|---|---|---|
| **A 既定(inline)** | `revisions` **19,206 KB** / `entries` 6,041 KB / `relations` 442 KB | 履歴が支配 |
| **B 差分保存(split v1)** | **`relations` 442 KB** / `revOrder` 145 KB / `entryOrder` 47 KB | **relations が最大** |
| **C layout 5** | `entries` 768 KB / **`relations` 442 KB** / `revOrder` 145 KB / `__pkc_bodyseg__` 57 KB | entries と relations |

### 訂正

§4(前身 doc)で「差分保存の O(N+M) は `marker.revOrder` と `core.entries`」と書いたが、
**`relations` を挙げていなかった**。`core` は

```ts
const core: StoredContainerRecord = {
  ...container,        // ← relations がここで丸ごと入る
  entries: wantSplitBodies ? …meta のみ… : [],
  revisions: [],
  assets: {},
  __pkc_split__: marker,
};
```

と `...container` を spread しているため、**relations は全 layout で毎保存・全件書き**である。
split v1 では `revOrder`(145 KB)の **3 倍**(442 KB)あり、こちらが最大項だった。

⇒ **コード読みで項を名指しするのは当てにならない。項別に測ること。**
(`perf-measurement` §4「推測した機構のまま実装しない」の実例をもう 1 つ増やした)

### 効く順(実測ベース)

| 対象 | B で減る | C で減る | 備考 |
|---|---|---|---|
| ✅ **relations を core から出す** | **442 KB** | **442 KB** | **着地済み**(下記)。両方に効く最大項 |
| `core.entries`(meta 全件) | — | 768 KB | C のみ。C で最大 |
| `revOrder` | 145 KB | 145 KB | id 形式を変えずに減らす方法の検討が要る |
| `__pkc_bodyseg__` | — | 57 KB | C のみ |

⚠ ただし **core record は毎保存で必ず変わる**(revision が 1 件増えると `revOrder` が伸びる)。
つまり「変わった時だけ書く」を効かせるには **`revOrder` を core から外すのが前提**になる。
順序としては `revOrder` → `relations` → `core.entries` の依存がある。

### `revOrder` は単純には落とせない(調査済み・#2 の着工前提)

`revisions` 配列の順序に意味があるかを調べた。消費側は **3 箇所とも `created_at` で
並べ替える**ので、一見すると `revOrder` は冗長に見える:

- `getEntryRevisions`(`container-ops.ts:382-384`)`.sort(created_at)`
- 同 `:460-462` `.sort(created_at)`
- `getRestoreCandidates`(`:546-561`)`created_at` 比較 + `.sort(created_at)`

**しかし 1 箇所だけ配列順に依存している。** `findLatestRevisionIdForLid`(`:359-371`)の
doc が明示している:

> "Most recent" is defined as the revision with the greatest `created_at` string among
> those matching `entry_lid === lid`; **ties are broken by array position
> (later wins, matching insertion order)**.

⇒ **`created_at` が同一(同一ミリ秒)の revision が同じ entry に 2 件あるとき、
配列順が tie-break として効く。** `revOrder` を落とすと replay 順が
`__rev__:` の key 順(= revision id の辞書順)になり、この tie-break が変わる。

現在の revision id 形式では辞書順 ≠ 挿入順なので(例: `rev-z` < `rev-10`)、
**単純な削除は挙動変更を伴う**。取りうる道は:

1. `prev_rid` を tie-break の正本にする(`Revision.prev_rid` は既に H-6 で存在し、
   `findLatestRevisionIdForLid` の結果がそこに入る = 線形の履歴ポインタがある)
2. revision id を単調増加形式にする ── ただし**敵対的検証で「id 衝突 → revision の
   無言消失を新設する」と指摘された**ので、採るなら衝突不能性の担保が要る
3. `revOrder` を core から別レコードへ移し、**変わった時だけ書く**
   (順序の意味は保ったまま、毎保存の O(M) は消える)

**3 が最も安全**(意味論を一切変えない)。ただし core record が毎保存で変わる問題は
`relations` / `core.entries` 側にも残るので、#2 は「core record を
**変化した部分だけ別レコードに割る**」という一段大きい設計になる。

⇒ **#2 は形式変更を伴う。user 裁定済みの「マイグレーション手段があれば構造変更可」の
範囲だが、設計 doc を先に出すべき規模。本 PR には含めない。**

---

## 2-c. ✅ relations サイドカーを実装した(2026-07-26)

`core` が `...container` を spread しているせいで、**本文 1 文字の編集でも
relations が全件書き直されていた**。relations は滅多に変わらないので、
**変わったときだけ** `__rel__:<cid>` へ書くようにした。

- 読み側は「**サイドカーがあればそれが正本、無ければ core の inline**」。
  形式フラグを増やさずに旧データと両立する(旧データは record が無いので自動的に inline 経路)
- ⚠ **inline へ復帰する経路(`save()`)でサイドカーを必ず消す。**
  残っていると古い relations が正しい inline を上書きして見える。
  `delete()`(コンテナ削除)でも回収する ── segments 孤児と同じ穴を新設しないため
- 変更検出は参照比較(Container は immutable 更新。entries / revisions の差分判定と同じ idiom)

### 実測(N=5000 / M=15000 / R=3074、1 編集あたり)

| 腕 | セッション開始時 | tab-strip 修正後 | **relations サイドカー後** |
|---|---|---|---|
| **B 差分保存(split v1)** | 1,270 KB | 635 KB | **194 KB** |
| **C 差分保存+lazy(layout 5)** | 3,012 KB | 1,564 KB | **1,122 KB** |
| A 既定(inline) | 51,378 KB | 25,688 KB | 25,688 KB |

**B は開始時比 6.5 倍の削減。** core record の項別内訳から `relations 442 KB` が
完全に消え、残るのは:

```
B: revOrder 145 KB / entryOrder 47 KB
C: entries 768 KB / revOrder 145 KB / __pkc_bodyseg__ 57 KB
```

### 残る項と、次の一手

| 項 | B | C | 難度 |
|---|---|---|---|
| `core.entries`(meta 全件) | — | **768 KB** | C の最大項。layout 5 の設計そのもの |
| `revOrder` | 145 KB | 145 KB | **配列順が tie-break として効いている**(§2-b)。別 record へ移すのが安全 |
| `entryOrder` | 47 KB | — | revOrder と同型 |

⚠ **`revOrder` を core から外さない限り、core record は毎保存で必ず変わる**
(revision が 1 件増えると伸びるため)。逆に外せれば、本文だけの編集では
core record 自体を put せずに済む可能性がある ── そこが次の一手。

regression test: `tests/adapter/idb-store-relations-sidecar.test.ts`(7 件)
── とくに「inline 復帰で古い relations が残らない」を pin している。

---

## 2-d. ✅ 順序リストのサイドカーを実装した(2026-07-26)

前節の「次の一手」をそのまま実行した。`marker.revOrder` / `marker.entryOrder` を
core record から出し、**固定長チャンク**(`ORDER_CHUNK = 2000`)に割って
`__order__:<cid>:<kind>:<seq>` へ置いた。

`revOrder` は **毎保存で 1 件ずつ伸びる**ので「変わった時だけ書く」は効かない。
そこで **追記だと確認できたときは末尾チャンクだけ**書き直す:

- 直前 base の revisions が「今回の prefix になっている」ことを **id で確認**して
  初めて追記と見なす(長さ比較だけでは prune + append を追記と誤認する)
- 追記でなければ全チャンク書き直し。件数が減ったときは**余りチャンクを delete**
  (残すと古い順序が末尾に continuation として読まれる)
- `entryOrder` は伸びないので従来どおり「変わった時だけ」

**意味論は 1 ミリも変えていない。** 復元順は保存時の配列順と完全に一致する。
これは必須で、§2-b のとおり配列順は tie-break として効いている ──
しかも**向きが逆の消費者が 2 つある**ことが設計レビューで判明した:

| 消費者 | 比較 | 同着時 |
|---|---|---|
| `findLatestRevisionIdForLid`(`container-ops.ts:359-371`) | `created_at >= best` | **後勝ち** |
| `getRestoreCandidates`(`:546-561`) | `created_at > existing` | **先勝ち** |

「順序を保つ」以外の実装(id 辞書順で replay する等)は、この 2 つを**同時に**
満たせない。`tests/core/revision-order-tiebreak.test.ts` が両方向を pin している。

### 実測(同一条件・N=5000 / M=15000 / R=3074、1 編集あたり)

| 腕 | セッション開始時 | tab-strip 修正後 | relations サイドカー後 | **順序サイドカー後** |
|---|---|---|---|---|
| **B 差分保存(split v1)** | 1,270 KB | 635 KB | 194 KB | **11 KB** |
| **C 差分保存+lazy(layout 5)** | 3,012 KB | 1,564 KB | 1,122 KB | **987 KB** |
| A 既定(inline) | 51,378 KB | 25,688 KB | 25,688 KB | 25,688 KB |

**B は開始時比 115 倍の削減**(1,270 → 11 KB)。内訳は:

```
B(11 KB/編集):
   10 KB  __order__:…:rev:000007  ← 末尾チャンクだけ
    1 KB  __rev__:  (増えた revision 実体)
    1 KB  __entry__:(変えた entry 実体)
    0 KB  core record ← **項別内訳が空になった**
```

予告どおり **core record が「毎保存で必ず変わる」状態を脱した**。
B の実データは 2 KB なので、残る 10 KB は末尾チャンクの書き直し
(2000 件 × revision id)であり、**M に比例しない**(チャンク長で頭打ち)。

C は `entries`(meta 全件)768 KB が残るため 987 KB。これは layout 5 の
設計そのもの(entry meta を core に置く)で、サイドカーでは落ちない。

regression test: `tests/adapter/idb-store-order-sidecar.test.ts`(8 件)
── チャンク境界跨ぎ / 追記 / **prune で余りチャンクが残らない** / 並べ替え /
旧データ fallback / inline 復帰・削除での回収。

---

## 3. ⇒ どこを直すべきか(効果の大きい順)

| # | 対象 | 効く範囲 | 見積り |
|---|---|---|---|
| ~~**1**~~ ✅ | ~~UI 設定の保存でコンテナ全体を書かない~~ → **着地済み**(tab-strip の永続化を flag に従わせた) | 既定パスの全 user | **実測: 選択 5,104 → 0 KB、編集 10,213 → 5,106 KB(半減)** |
| ~~**2**~~ ✅ | ~~差分保存の core record から O(N+M) を抜く~~ → **着地済み**(relations + 順序のサイドカー) | 差分保存 ON の user | **実測: B 1,270 → 11 KB(115 倍)** |
| **3** | 既定パスそのもの(inline = 全件書き) | **既定パスの全 user** | 構造的。#958 の経緯があるので「差分保存を既定 ON」では動かせない。§3-b |

### 3-b. 残ったのは #3 ── そして「既定 ON」では解けない

現時点の数字を並べると、既定と opt-in の差が **2,300 倍**ある:

| 腕 | 1 編集あたり |
|---|---|
| A 既定(inline) | **25,688 KB** |
| B 差分保存(split v1) | **11 KB** |

素直に見れば「B を既定にする」だが、**それは 2026-07-22 に一度やって撤回した道**である
(#938 R6 → #958)。split v1 は書込を O(1) にする代わりに、**読出(boot)を
数千 record の分散読み**にする。遅いストレージ × 巨大 container で初期化が分単位になった。

⇒ 構造として整理すると、両者は **同じ軸の両端**でしかない:

| | 1 record あたりの粒度 | 書込増幅 | boot の read 数 |
|---|---|---|---|
| A inline | ∞(全件 1 record) | **O(N+M)** | 1 |
| B split v1 | 1(entry / revision ごと) | O(1) | **O(N+M)** |

**どちらも端。中間が無いだけである。**
今回の順序サイドカーで使った**固定長チャンク**(2000 件 = 1 record)は、
まさにその中間点を作る道具で、実際に「毎保存 145 KB → 末尾 10 KB」を
**read 数を 8 record しか増やさずに**達成している。

⇒ 次は **core record 本体(entries / revisions)を同じチャンク方式に割る**。
書込は「触ったチャンクだけ」= O(chunk)、boot の read は N/2000 + M/2000 record。
A の O(N+M) 書込も B の O(N+M) read も同時に回避できる。
**これは #958 の再挑戦ではなく、#958 が示した制約を軸として受け入れた設計**である。
着工前に boot 断面の実測(read 数と実時間の関係)を取る。

## 4. 未検証・注意

- バイト数は近似(§冒頭)。**腕の比較と項の同定**にのみ使い、絶対値は主張しない
- **asset は含まない fixture**。実運用の asset 書込は dirty-tracking(#938 R1)で
  既に差分化されており、本計測の対象外
- ✅ 「2 保存/編集」の 2 本目は **tab-strip の永続化**と特定し、修正・再測済み(§2)
- ✅ #2(差分保存の core record から O(N+M) を抜く)は **relations + 順序のサイドカーで着地**
  (§2-c / §2-d、B 1,270 → 11 KB)
- **#3(既定の inline そのもの)は未着手。** A は 1 編集で **25,688 KB = コンテナ全体**を
  書き続けている。既定パスの全 user が踏むので、残る中では最大の対象(§3-b)
- **C(layout 5)は 987 KB で止まっている。** 残る `entries` 768 KB は
  「entry meta を core に置く」という layout 5 の設計そのもので、
  サイドカーでは落ちない ── #3 のチャンク化と同じ道具で解く対象

## 参照

- **手法の正本**: `.claude/skills/perf-measurement/SKILL.md`(`/measure` コマンド)
  ── 本 doc で使った規律(対照群の作り方・fixture のゼロ次元・指標ごとの信頼度)はそちらに資産化済み
- ハーネス: `tests/bench/save-write-volume.mjs`
- 前身(実デバイス書込): [`storage-write-io-bench-2026-07-25.md`](./storage-write-io-bench-2026-07-25.md)
- 断面ごとの設計検討: [`storage-arch-cross-sections-2026-07-26.md`](./storage-arch-cross-sections-2026-07-26.md)
- boot 側の実測: [`boot-cost-profile-2026-07-25.md`](./boot-cost-profile-2026-07-25.md)
