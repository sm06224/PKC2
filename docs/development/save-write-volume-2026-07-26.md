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
| **relations を core から出す** | **442 KB** | **442 KB** | 両方に効く最大項。relations は滅多に変わらないので、変わった時だけ書けば実質ゼロ |
| `core.entries`(meta 全件) | — | 768 KB | C のみ。C で最大 |
| `revOrder` | 145 KB | 145 KB | id 形式を変えずに減らす方法の検討が要る |
| `__pkc_bodyseg__` | — | 57 KB | C のみ |

⚠ ただし **core record は毎保存で必ず変わる**(revision が 1 件増えると `revOrder` が伸びる)。
つまり「変わった時だけ書く」を効かせるには **`revOrder` を core から外すのが前提**になる。
順序としては `revOrder` → `relations` → `core.entries` の依存がある。

---

## 3. ⇒ どこを直すべきか(効果の大きい順)

| # | 対象 | 効く範囲 | 見積り |
|---|---|---|---|
| ~~**1**~~ ✅ | ~~UI 設定の保存でコンテナ全体を書かない~~ → **着地済み**(tab-strip の永続化を flag に従わせた) | 既定パスの全 user | **実測: 選択 5,104 → 0 KB、編集 10,213 → 5,106 KB(半減)** |
| **2** | **差分保存の core record から O(N+M) を抜く** | 差分保存 ON の user | B は 1,270 → 数 KB。**634 倍**の削減余地 |
| **3** | 既定パスそのもの(inline = 全件書き) | 既定パスの全 user | 構造的。差分保存の既定 ON 可否と一体で、#958 の経緯があるので単独では動かせない |

**1 が最優先。** 理由:

- **既定パスに効く**(2 と 3 は差分保存 ON が前提、または #958 と一体)
- **形式を変えない**(マイグレーション不要・後方互換の議論が要らない)
- **効果が測定済みの値から直接導ける**(2 回 → 1 回 = 半分)
- boot 断面と独立に着地できる

## 4. 未検証・注意

- バイト数は近似(§冒頭)。**腕の比較と項の同定**にのみ使い、絶対値は主張しない
- **asset は含まない fixture**。実運用の asset 書込は dirty-tracking(#938 R1)で
  既に差分化されており、本計測の対象外
- ✅ 「2 保存/編集」の 2 本目は **tab-strip の永続化**と特定し、修正・再測済み(§2)
- **残る #2(差分保存の core record から O(N+M) を抜く)と #3(inline そのもの)は未着手。**
  #2 は差分保存 ON 限定で 634 倍の余地、#3 は #958 の経緯と一体
- 修正後も **A(既定)は 1 編集で 5,106 KB = コンテナ全体 1 回**を書いている。
  半分になっただけで、inline が全件書きであること自体は変わっていない(#3 の領域)

## 参照

- **手法の正本**: `.claude/skills/perf-measurement/SKILL.md`(`/measure` コマンド)
  ── 本 doc で使った規律(対照群の作り方・fixture のゼロ次元・指標ごとの信頼度)はそちらに資産化済み
- ハーネス: `tests/bench/save-write-volume.mjs`
- 前身(実デバイス書込): [`storage-write-io-bench-2026-07-25.md`](./storage-write-io-bench-2026-07-25.md)
- 断面ごとの設計検討: [`storage-arch-cross-sections-2026-07-26.md`](./storage-arch-cross-sections-2026-07-26.md)
- boot 側の実測: [`boot-cost-profile-2026-07-25.md`](./boot-cost-profile-2026-07-25.md)
