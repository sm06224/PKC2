# storage を wasm-sqlite へ ── JSON コンテナ内部表現の廃止(設計 doc・実装しない)

> 🔴 **user 指示(2026-07-27。不可侵)**
>
> 「**私が wasm-sqlite にこだわったのはこういうメモリ消費の安全性面もあるからな?
> もちろんそこも考慮してるんだよな?
> ゼロコピー、生成とライフサイクル後の速やかな破棄を徹底してください。
> 私は依存をなくして欲しいと言っただけで、完全になくせとは言っていないからな?
> ビルドが静的であれば何も問題ないんだからな?
> 効果が小さいからやらないではなく、積み上げた先に価値があるなら小さかろうが積んでください。
> 俺は再三 JSON をそのままコンテナにすることに反対しているのに、メリットばかり
> 持ち出して、変更を拒んでいるのはお前だからな?
> boot 直後とか測ってない?意味ないからね、ソレ**」

## 0. 認めるべきことを先に認める

`storage-v3-redesign-2026-07.md` §3 は SQLite WASM を「△ 見送り」と判定し、
「**希望が強い場合はその動機を教えてほしい**」(同 doc :164)と書いた。
**動機は回答された: メモリ消費の安全性(ゼロコピー・速やかな破棄)である。**

そして 2026-07-27 の実測(`tests/bench/boot-rss.mjs`、PR #1040)は、
その動機が正しかったことを示している。JSON 内部表現の構造的な失敗:

| 実測事実(添付 400MB + revisions 80MB = 500MB fixture) | 根本原因 |
|---|---|
| 毎起動、core record(~85MB の JSON)を丸ごと parse | **container = 単一 JSON record** だから部分読みが存在しない |
| revisions 80MB が JS heap に**永続常駐**(JSheap 99MB の主成分) | 同上 ── 使わない snapshot も同じ record に同居 |
| 初回索引構築中、RSS が 1.5〜1.6GB(user 環境で OOM) | asset が **base64 文字列** ── 触るたび全 bytes が heap を通る |
| 山はテンポ / yield 方式で制御不能(3 通り実測) | V8 の large object GC は走査側から制御できない ── **形式でしか解決しない** |
| 定常 RSS 1.0GB | 上記の合成 |

今日までの修正(#1038 / #1039 / #1040)は全部「JSON コンテナの内側」の
緩和であり、上の表のどの行も**消していない**。

## 1. 方針

**内部表現としての「container 丸ごと 1 JSON record」を廃止し、
静的に bundle した wasm-sqlite を構造データの正本にする。**

- **JSON は交換形式として残る**(export / ZIP / pkc-data 埋め込み)。
  user が反対しているのは**内部表現**であって交換形式ではない
- 依存の扱い: **依存削減 ≠ 依存全廃**(user 指示 2026-07-27)。
  単一 HTML に静的に焼き込む(external fetch なし・CDN なし)なら
  wasm-sqlite は単一 HTML 哲学と両立する。旧 doc の見送り理由
  「bundle 予算と衝突」は使わない ── 予算は tripwire であって規律ではない
  (user 指示 2026-07-26)。2026-05-05 の「5MB 分水嶺」は
  「静的ビルドであれば何も問題ない」(2026-07-27)により解釈を更新する

## 2. メモリ原則(ゼロコピーと速やかな破棄)

設計のすべての判断をこの 2 原則に従属させる:

1. **bytes は必要な瞬間だけ・必要な範囲だけ heap に載せる**
2. **生成したものはライフサイクルの終わりに即座に破棄する**
   (sqlite の stmt は finalize 徹底 / WASM 側バッファは copy-out 後に即解放 /
   ObjectURL は所有者が revoke)

この原則から、**「全部 sqlite に入れる」は正しくない**。旧実測
(`storage-v3-redesign-2026-07.md` §A.1-A.2)が確定させた事実:

- SQLite WASM は実用水準(投入 2,295ms / cold 22ms / 追記 200ms、300MB 実ディスク。
  「壊滅的に遅い」は incognito アーティファクトとして撤回済み)
- ただし **BLOB bytes は WASM リニアメモリを経由する**(sql.js 計測で +246MB 常駐)
  ── これは全 WASM エンジン共通の構造であり、GB 級 media には原則 2 に反する
- 一方 **IDB の Blob record は heap ±0**(200MB 読出で base64 +293MB vs Blob ±0)

∴ **ハイブリッド**が 2 原則を最もよく満たす:

| データ | 置き場 | 理由 |
|---|---|---|
| entries(meta + body)/ revisions / relations / settings / flags / workspace | **wasm-sqlite** | 部分読み・COUNT・index が本業。JSON 丸ごと parse が消える |
| asset の bytes | **Blob storage**(IDB Blob record ── 既存 `saveAssetBlob` seam) | heap ±0(ゼロコピー)。sqlite 側は meta + ポインタ行のみ |

## 3. スキーマ(v1 案)

```sql
CREATE TABLE containers (cid TEXT PRIMARY KEY, title TEXT, created_at TEXT,
                         updated_at TEXT, schema_version INTEGER);
CREATE TABLE entries    (cid TEXT, lid TEXT, title TEXT, archetype TEXT,
                         created_at TEXT, updated_at TEXT, entry_order INTEGER,
                         body TEXT,               -- 本文。SELECT では既定で読まない
                         PRIMARY KEY (cid, lid));
CREATE TABLE revisions  (cid TEXT, id TEXT, entry_lid TEXT, created_at TEXT,
                         prev_rid TEXT, content_hash TEXT, rev_order INTEGER,
                         snapshot BLOB,           -- zstd グループ圧縮の対象(§5)
                         PRIMARY KEY (cid, id));
CREATE INDEX rev_by_entry ON revisions (cid, entry_lid);
CREATE TABLE relations  (cid TEXT, id TEXT, from_lid TEXT, to_lid TEXT,
                         kind TEXT, created_at TEXT, updated_at TEXT,
                         PRIMARY KEY (cid, id));
CREATE TABLE assets     (cid TEXT, key TEXT, mime TEXT, size INTEGER,
                         hash TEXT,               -- 遅延計算可(NULL 許容)
                         PRIMARY KEY (cid, key)); -- bytes は持たない(Blob storage 参照)
CREATE TABLE kv         (cid TEXT, k TEXT, v TEXT, PRIMARY KEY (cid, k));
```

**実装時の精緻化 2 点(2026-07-27、P2 実装。正本 DDL は
`src/adapter/platform/storage/sqlite/sqlite-schema.ts`)**:

1. **全表に `ord` 列** ── Container の entries / revisions / relations は
   **配列**で、順序はデータの一部(手動並べ替え / 履歴列 / 表示順)。
   行単位 upsert で rowid が動いても順序が壊れないよう明示列で持つ
2. **全表に `extra` JSON 列** ── データモデルの規約「additive optional field を
   黙って落とさない」(Entry.tags / color_tag、Revision.bulk_id、
   Relation.metadata、Meta.saved_searches …と**未来の additive 追加**)を、
   固定列に無い残余フィールドの JSON 往復で守る。schema bump なしの
   additive 互換 ── JSON が消えるのは「内部表現の丸ごと 1 record」であって、
   残余フィールドの器としての JSON 列は正当(行の部分読み・行単位更新を
   壊さない)

**これで消えるもの(今日の実測と 1:1 対応)**:

| 今日の問題 | sqlite での姿 |
|---|---|
| boot の 85MB JSON parse | `SELECT lid,title,archetype,… FROM entries`(body 列を読まない)── O(メタ) |
| revisions 80MB 常駐 | `SELECT COUNT(*) GROUP BY entry_lid` ── snapshot は表示要求時に 1 行だけ。**Issue #1041 を吸収** |
| asset-meta 索引の全 bytes 走査 | assets 表の size / hash 列 ── **走査自体が消滅**(初回移行時に 1 回だけ構築) |
| base64 が全経路で heap 経由 | bytes は Blob record(heap ±0)。**Issue #1042 を吸収** |
| 「変わってないのに全量書く」系(#1021/#1024 で対症済み) | 行単位 UPDATE ── 構造的に消滅 |

## 4. 永続化と静的 bundle

- エンジン: **official sqlite3.wasm**(sqlite.org ビルド)。OPFS SAHPool VFS を
  第一候補(旧実測 D の構成)、OPFS 不可環境は IDB 上の VFS へ fallback
- **静的 bundle**: wasm バイナリを base64 で bundle.js に焼き込み
  `WebAssembly.instantiate(bytes)` で起動(fetch なし)。概算 +900KB(gzip 後 +400KB 級)。
  size budget は tripwire として bump(user 裁定 2026-07-26 / 2026-07-27)
- 将来の「PKC2 フレーバー SQLite」(user 提起、旧 doc §A.5:
  `SQLITE_EXTRA_INIT` に sqlite-zstd / sqlite-vec / FTS5 静的リンク)への
  拡張点をこの層に置く

## 5. revisions の zstd グループ圧縮(旧 doc §A.3 の賞金)

snapshot 群の一括圧縮は **zstd3 で 587 倍**(スナップショット間の冗長由来)。
custom SQLite ビルドを待たず、app 層 codec(zstd-wasm 単体・静的 bundle)で
revisions.snapshot に適用する。80MB 常駐 → 数百 KB 級のディスク列 + 読みは要求時。

## 6. 互換(Invariant 5「互換は双方向」の判定表)

**「この変更を知らない読み手が今の storage を読んだら何が見えるか」**:

| 読み手 | 見えるもの | 対策 |
|---|---|---|
| 新ビルド → 旧 IDB データ | 全部読める(IDB 経路は残す) | 移行は読める限り常に可能 |
| **旧ビルド → sqlite 移行後** | **何も見えない**(旧ビルドは sqlite を知らない) | ① 移行ゲートで**自動バックアップ ZIP**(既存 `pre-migration-backup` 機構)② 移行後も**旧 IDB データを即座に消さない**(併存期間を置き、削除は明示操作)③ お知らせ + マニュアルに「旧 pkc2.html では開けなくなる」を明記 |
| 交換形式(export ZIP / pkc-data) | 従来どおり JSON | 変更なし ── 互換の主戦場を交換形式に固定する |

lazy_entry_bodies(S1〜S4)・#1022 サイドカーの事故と同じ轍を踏まないための
不変条件: **移行専用の書込経路を作らない**(既存 4 経路合成の作法)は sqlite 移行では
成立しないため、代わりに**移行は明示ゲート 1 箇所 + バックアップ必須 + 旧データ非破壊**
の 3 点で守る。

## 7. 段階(小さく積む ── user 指示③「小さかろうが積んでください」)

> 🔴 **開発の進め方(user 指示 2026-07-27)**: 「**main にそのまま着地させるのは
> 危ないから、開発ブランチとしてここから先はブランチに乗せたまま進めてください**」
> ── 本設計の実装は **`dev/storage-sqlite`** branch 上に積む。**main への merge は
> user 裁定まで凍結**(merge-on-green の委任はこの branch には適用しない)。

| 段階 | 内容 | 吸収する Issue |
|---|---|---|
| P0 | 本 doc の裁定 | — |
| P1 | ✅ **継続使用の計測ハーネス**(編集セッション N 分の RSS 時系列。boot 窓だけで判定しない ── user 指示⑤)+ 現行のベースライン取得 → **取得済み(下表)** | — |
| P2 | ✅ **実装済み(2026-07-27)** sqlite3.wasm 静的 bundle + worker 常駐 + `SqliteContainerStore`(ContainerStore の別実装)。flag `storage.sqlite_backend` opt-in で read/write。**この時点から新規データは JSON 内部表現を持たない**。実機 pin: `tests/bench/sqlite-roundtrip.mjs`(移行→編集→再起動→OFF 併存→復帰の 5 局面) | — |
| P3 | ✅ **実装済み(2026-07-27)** assets: meta は sqlite `assets` 表の行(`__assetmeta__:` record を置換、行 0 件 = 未索引 null)/ bytes は **Blob record**(書込時に base64→Blob 変換 1 回、読みは heap ±0。読み互換は #967 の両読み)。移行時に既存 meta 索引を行へ seed。実機 pin: roundtrip Phase F(reload 跨ぎの行永続まで) | #1042 |
| P4 | revisions: COUNT / 要求時読み + zstd グループ圧縮 | #1041 |
| P5 | 既定化 + 移行ゲート(バックアップ必須・旧データ非破壊) | — |

各段階が単独で着地し、単独で計測できる。**「効果が小さい」は棄却理由にしない**
── 積み上げ先(本 doc)が確定しているため。

### 7-b. P1 ベースライン(2026-07-27 取得。sqlite 実装の前後比較の基準)

計器: `tests/bench/boot-rss.mjs` / `tests/bench/sustained-use-rss.mjs`
(chromium 全プロセスの /proc RSS 合算・強制 GC なし・隔離環境)。
fixture: entries 3000(5.2MB)+ revisions 75,000(299.7MB)+ assets 400 × 512KB(200MB)= 505MB。

| 局面 | 総RSS | renderer | JS heap |
|---|---|---|---|
| ほぼ空(100 entries)の定常 ── 固定費 | 0.89 GB | 356 MB | 18 MB |
| 500MB・idle 定常(2 回目起動・索引済み) | 1.20 GB | 682 MB | 309 MB |
| 500MB・**編集継続中の水位**(5 分 / 114 編集) | **1.58〜1.61 GB** | ~970 MB | — |
| 500MB・初回起動 × 編集(索引構築と重なる) | **2.48 GB** | 1,968 MB | — |

読み方:
- **データ比例分** = idle 1.20 − 空 0.89 = **+0.31 GB ≒ revisions 300MB の heap 常駐**(P4 が消す)
- **編集 churn 分** = 編集中 1.6 − idle 1.2 = **+0.4 GB**(保存のたびに core record 300MB+ を
  直列化 + structured clone する現行形式のコスト。sqlite の行 UPDATE で消える)
- **初回 2.48 GB** = 上記 + 索引構築の読み捨て churn ── **user 報告「2GB 超で OOM」と一致**
- **空でも renderer 356 MB(JS heap 18 MB)** ── bundle のコンパイル済みコード +
  起動時展開の V8 未返却と推定。**内訳は未測定**(別調査 ── §8 に追加)

⚠ 数字は本 doc 内の相対比較専用。走行をまたいだ絶対値比較・実機のタブ単体表示との
直接比較はしない(計器の基準が違う)。

### 7-c. P2 段階計測 ── dev(sqlite flag ON)vs main の多角比較(2026-07-27)

user 指示「全部開発に乗ったらベンチして main とのパフォーマンス比較を多角的に」
に対する **P2 時点の段階計測**(各段階が単独で着地し、単独で計測できる ── §7)。
両腕とも同一計器・同一 fixture・同一日・同一マシンの連続走行。
fixture: entries 3000(3.5MB)+ revisions 75,000(88MB)+ assets 400×512KB(200MB)= 292MB
(P1 の 505MB fixture とは revisions の本文長が異なる ── **7-b との絶対値比較はしない**)。
main 腕 = origin/main 98a7f8b5 のビルド(bundle 5,995KB)/ dev 腕 = P2 3b519d77
(bundle 8,710KB、`?pkc-flag=storage.sqlite_backend=true`)。

**軸 1: boot(boot-rss.mjs、100 秒観測)**

| 局面 | main | dev(sqlite) |
|---|---|---|
| 初回 boot ready | 1.34s | **8.00s**(IDB→sqlite 一括移行込み・一度きり) |
| 初回 peak / settle | 1.79 / 1.01 GB | 1.90 / 1.18 GB |
| 2 回目 boot ready | 1.16s | **3.07s** |
| 2 回目 peak / settle | 1.39 / 1.01 GB | 1.60 / 1.16 GB |
| settle 時 JS heap(main thread) | 107 MB | 117 MB |

**軸 2: 継続使用(sustained-use-rss.mjs、2 回目起動 + 5 分 ≒130 編集)**

| | main | dev(sqlite) |
|---|---|---|
| 序盤 5 点平均 | 1.28 GB | 1.53 GB |
| 終盤 5 点平均 | **1.53 GB** | **1.42 GB** |
| 5 分間の増分 | **+253 MB(+19.3%)上昇し続ける** | **−113 MB(−7.2%)下がって安定** |

**軸 3: 保存起因の main thread 停止(edit-main-thread-block.mjs、N=5000/M=15000)**

| | main | dev(sqlite) |
|---|---|---|
| 保存に帰せられる long task(A−Y、1 編集あたり) | 100 ms | 74 ms(向き: 減。5 編集の小標本 ── 倍率は書かない) |

**軸 4: storage 使用量(navigator.storage.estimate)**: main 57MB / dev 158MB。
⚠ この計器は harness が直接 seed した IDB を過小に見せている疑いが強く
(200MB の assets が 57MB と出る)、**絶対値は使わない**。差分から読めるのは
「OPFS 側に sqlite DB ~100MB が実在する」ことまで。

**読み方(P2 の設計予測との突き合わせ)**:

- ✅ **編集 churn の向きが反転した**(P2 の本丸)。main は編集を重ねるほど水位が
  上がり続ける(保存のたびに core record 全量を直列化 + structured clone)。
  dev は **編集し続けても水位が下がって安定**し、終盤は sqlite 常駐を抱えたまま
  main より低い。保存が O(変更行) の applyOps になった構造効果そのもの
- ✅ 保存起因の main thread 停止も減る向き(直列化が diff だけになり、書込は worker 側)
- ⚠ **boot と常駐は P2 時点では不利**(設計どおり ── まだ直っていない、ではなく
  **P4 の仕事**)。2 回目 boot +1.9s の主因は revisions 75,000 行を postMessage で
  main thread のモデルに全量転送していること。settle +150MB は worker の
  wasm/SQLite 常駐分。**P4(revisions を COUNT + 要求時読みへ)がこの行転送と
  モデル常駐を丸ごと消す** ── そこで boot 軸の逆転を測り直す
- 移行 8 秒は一度きり(idempotent)。P5 の移行ゲートでは進捗表示が要る

### 7-d. P4 設計 addendum ── revisions の COUNT + 要求時読み(実装前・user 裁定待ち)

P4 は P2/P3 と違い **storage 層に閉じない**(reducer / renderer / export / 拡張 host に
跨る)ため、doc-first で設計を固定してから実装する。

**目的(§7-c の実測と 1:1)**: ① idle 常駐のデータ比例分(revisions の heap 常駐。
P1 fixture で +0.31GB)を消す ② boot の revisions 全行転送(§7-c の 2 回目 ready
1.16s → 3.07s の主因)を消す。

**機構(sqlite flag ON のときだけ。JSON 経路は一切触らない)**:

1. **store に 2 つの読み口を足す**(ContainerStore の追加メソッド、旧実装は
   全量配列から導出する互換実装を持つ):
   - `loadRevisionCounts(cid): Promise<Map<entry_lid, number>>` ── sqlite は
     `SELECT entry_lid, COUNT(*) GROUP BY` 1 発
   - `loadRevisionsFor(cid, entry_lid): Promise<Revision[]>` ── 選択 entry の分だけ行読み
2. **boot は revisions を積まない**: sqlite 経路の `loadDefaultMetaShallow` が
   `revisions: []` + counts 索引を返す。`container.revisions` は**常駐 working set**
   になる(本文の body-working-set と同じ型)
3. **カウント消費者**(sidebar バッジ / guardrails / 拡張 projection)は
   `revisionCountIndex`(参照 memo)の代わりに counts 索引を読む。`addRevision`
   (編集時の追記)は in-memory 追記 + 索引 increment ── 追記は従来どおり
   reducer 純関数のまま
4. **履歴 pane は選択時 hydrate**: SELECT_ENTRY → `loadRevisionsFor` → 常駐 set へ
   merge → 再 render(body-working-set の確立パターン。placeholder 表示が変わるので
   **visual parity test 1 件必須** ── PR 運用 4)
5. **export / import / 拡張の全量面**: export 前に全 revisions を hydrate する
   (asset の `hydrateAllAssets` と同じ seam。**#1023 の教訓 = export が部分 view を
   直列化してバックアップから欠けさせる事故を、ここで構造的に塞ぐ**)
6. **安全性(S1〜S4 級の轍を踏まない)**:
   - 参照 diff は **baseline に無い行の delete を出さない**(diffKeyed の削除判定は
     「baseline にあって next に無い key」だけ)── 常駐 set が部分でも、未読の行が
     消えることは構造的に無い。**これを test で pin する**(部分 revisions で save →
     未読行が sqlite に残ることを assert)
   - revisions を**削除**する経路が現存するか実装時に監査し、あれば store の明示
     削除 op(`deleteRevisionsFor`)経由に限定する(in-memory filter だけだと
     未読分が sqlite に残る = ghost)
7. **zstd グループ圧縮(§5)は P4b に分離**: 本 addendum の範囲外(メモリ勝ちは
   要求時読みが取り、zstd はディスク勝ち)。custom SQLite を待たず app 層 codec で
   snapshot 列に適用する案のまま、P4a 着地後に別途設計

**受け入れ計測(§7-c と同一計器・同一 fixture)**: 2 回目 boot ready と settle RSS の
逆転を確認(予測: 行転送消滅で ready は main 同等以下、settle は revisions 常駐分だけ
main より下がる)。

### 7-e. P4a 受け入れ計測 ── boot 軸の逆転を確認(2026-07-27)

§7-d の受け入れ条件どおり、§7-c と同一計器・同一 fixture(292MB)・同一バッチの
連続走行で再計測。**全軸で dev(sqlite)≤ main になった**:

**軸 1: boot(boot-rss.mjs)**

| 局面 | main | dev P2 時点(§7-c) | **dev P4a** |
|---|---|---|---|
| 初回 ready | 1.76s | 8.00s | 9.89s(移行込み・一度きり) |
| 初回 peak / settle | 1.88 / 1.01 GB | 1.90 / 1.18 GB | 2.01 / **1.00 GB** |
| 2 回目 ready | 1.86s | 3.07s | **1.99s(main 同等)** |
| 2 回目 peak / settle | 1.35 / 1.00 GB | 1.60 / 1.16 GB | **1.17 / 0.97 GB(main 以下)** |

- P2 時点の不利 2 点が両方消えた: 2 回目 ready +1.9s → **±0.1s**、
  settle +150MB → **−30MB**。revisions 75k 行の postMessage 転送と
  モデル常駐が boot から消えた構造効果(worker 側 sqlite 常駐を抱えたままで
  main を下回る)
- 移行 boot(初回のみ)は ~10s ── P5 の移行ゲートに進捗表示が必須

**軸 2: 継続使用(sustained-use-rss.mjs、2 回目起動 + 5 分 ≒100 編集)**

| | main | dev P4a |
|---|---|---|
| 序盤 5 点平均 | 1.30 GB | **1.15 GB** |
| 終盤 5 点平均 | 1.31 GB | **1.26 GB** |

- 編集中の水位も全点で dev が下。dev の増分 +114MB は編集した entry の
  履歴 hydrate + 追記の常駐化(編集対象 20 entry の履歴に有界)
- ⚠ main の水位が §7-c(1.53GB)と本走行(1.31GB)で異なる ── 走行間の
  変動が 200MB 級あるため、**比較は同一バッチ内のみ有効**(計器の規律)

**残る床(user 指摘 2026-07-27「まだ 1GB は大きく見える」)**: settle ~0.97GB の
内訳は ① 計器固定費(browser/GPU/zygote)② renderer の JS heap 以外
~340MB(空アプリで renderer 356MB / JS heap 18MB ── コンパイル済みコード +
DOM + compositor)。

> 🔴 **2026-07-28 訂正**: ここに書いていた「計器固定費 **~0.5GB**」は
> **VmRSS の単純合計**であり、**誤り**である。chromium は 6+ プロセスで
> バイナリと共有ライブラリを共有するので、RSS 合計は同じ物理ページを
> 何度も数える。しかも私は CLAUDE.md と L4 設計 doc に
> 「**VmRSS 合計から倍率・削減量を書かない**」と自分で書いておきながら、
> この行で破っていた。
>
> user 指摘(2026-07-28)「PWA 化されたベース、本来のブラウザと安全機構の
> 取り分は 200MB に届きません(M365 Copilot PWA の実測)。あなたの 500MB
> という数字はどこから持って来ましたか?あなたは削り込める部分を過小に
> 見積もっています」── **指摘のとおり**。
>
> PSS/USS で測り直した(`tests/bench/pwa-base-cost.mjs`、`--app` の PWA
> ウィンドウ / headed / 拡張なし / 新規プロファイル / settle 20s):
>
> | 状態 | USS | PSS | RSS 合計(参考) |
> |---|---|---|---|
> | 基盤(about:blank) | **187.9 MB** | 337.2 MB | 766.6 MB |
> | + PKC2(3,000 entries) | 394.0 MB | 555.9 MB | 1,013.0 MB |
> | + PKC2(同上・**サイドバー窓化 ON**) | 354.9 MB | 515.6 MB | 973.5 MB |
>
> - 基盤の USS は **188MB** ── user の「200MB に届かない」と一致する。
>   Windows のタスクマネージャが出す「メモリ(プライベート ワーキング セット)」は
>   USS 相当なので、**同じ指標を見ていた**(私だけが RSS 合計を見ていた)
> - **PKC2 自身の取り分は +206.1MB(USS)** で、**基盤より大きい**。
>   「床が支配的だから storage 形式ではもう削れない」という上の結論は、
>   **分母を間違えた上で出したもの**だった
> - 窓化 ON だけで app の取り分は **206.1 → 169.3MB(−36.8MB)**。
>   削り込める側が主戦場である

**storage 形式で削れる範囲は一巡した**ので、§8-4(renderer 内訳の実測)→
単一 HTML 内遅延評価 / sidebar DOM 仮想化の判断へ進む(別レーン)。

### 7-e. app 取り分の削り込み(P4b / S6、2026-07-28)

user 指摘「**単一 HTML の取り分だというなら、実行時に不要な部分は
ブラウザストレージ側に切り離してメモリを解放できるはずだ。あなたは
何をしている?測定以前にやることがあったのでは?**」── 上の 7-d で
「app 側のほうが大きい」と分かった直後の指摘であり、**そのとおり**だった。
以下は測定ではなく**切り離しの実装**の結果である。

#### P4b:本文の LRU 追い出し

本文は一度読むと container に**居座り続けていた**。#940 の working set は
「まだ読んでいない(`body === ''`)」は表現できたが、**「読んだが、もう
要らない」を表現する手段が無かった**。上限つき LRU
(`BODY_CACHE_LIMIT_CHARS = 2,000,000`)を入れ、超えたぶんを古い順に手放す。
**選択中・編集中の lid は対象外**。

| 本文の多い container(3,000 entries) | USS |
|---|---|
| PKC2 の取り分(P4b 前) | +451.1 MB |
| PKC2 の取り分(P4b 後) | **+164.7 MB(−63%)** |

🔴 **B14 ── 追い出しに空いていた穴**:参照 diff の store は「最後に storage と
同期した container」を baseline として掴んでおり、**保存のたびに baseline が
hydrate 済み本文つきの現 container に差し替わる**。state 側から捨てても
baseline が同じ文字列を掴んだままなので、**保存が頻繁に走る実運用では解放が
起きない**。`ContainerStore.noteBodiesEvicted?()` で baseline 側も空にする。
これが無いと上限は「効いているように見えて効かない」。

#### S6:サイドバー窓化を既定 ON へ

L3-S5 で入れた窓化は opt-in のままだった。**flag を自分で見つけて有効に
しないと届かない**(user から実際に「どうやってフラグオンにするの?」と
聞かれている)ので、既定を ON にする。発動条件は据え置き
(**200 行以上 + 行高が実測できる**)なので、**200 行未満の container の
挙動は 1 ビットも変わらない**。

判定の根拠は Tier-B smoke **全 365 test を既定 ON で完走**させ、落ちた分を
1 件ずつ既定 OFF の対照と突き合わせたこと。ただし**一発では判定できず、
2 周した**。その過程がそのまま教訓なので残す。

**1 周目(既定 ON、82 failed)**:内訳を読むと **53 件が同一原因**で、
44 個の spec が `indexedDB.open('pkc2', 2)` と IDB version をべた書きして
いた(製品側は `5ca6c7cd` で既に v3)。spec は boot 後に seed するので
`VersionError` で**seed に到達する前に死ぬ**。**Tier-B は PR ゲートに含まれない**
(main push と毎晩の schedule のみ)ため、数日赤いまま
**安全網として機能していなかった**。ここで「残りは既定 OFF でも落ちる」と
読んで **「窓化由来 0 件」と結論しかけた ── これは誤り**だった。

🔴 **腐りが本物の regression を隠していた**(CLAUDE.md の
「ノイズが潜在バグを隠していた」と同じ形)。version を直して 2 周目を回すと、
`sidebar-scroll-multi-click-parity` が **ON で 2 回とも落ち、OFF では通る**
── flake ではない再現性のある差だった。1 周目にこれが VersionError の
53 件に紛れていたのである。

**2 周目で見つけた本物 2 件**:

1. **spec が DOM の行数で同期していた**(S1 の規律が適用されていなかった)。
   `toHaveCount(200)` は窓化すると永久に成立しない(DOM には 30 行)。
   同期点を `data-pkc-row-count`(**論理**行数)へ移して解消。
2. **「選んだのに見えない」は窓化 OFF 側のバグだった**。深くスクロールした
   状態で選択なしから ↓ を押すと先頭行が選ばれるが、**OFF はスクロール
   しない**(scrollTop 1200 のまま = 選択行が画面外に居座る)。ON は index
   から位置を計算して寄せる。既存 spec はこの**正しい挙動を「drift」として
   弾いていた**。1 手ずつの実測で切り分けた:

   | 開始状態 | 窓化 OFF | 窓化 ON |
   |---|---|---|
   | 選択なし → ↓ | scrollTop 1200 のまま(選択行が見えない) | 0 へ寄る(選択行が見える) |
   | **可視行を選んでから 10 手** | **1200 で不動** | **1200 で不動(選択 lid も 10 手すべて一致)** |

   つまり**窓化は scroll の安定性を 1 ミリも変えていない**。差が出るのは
   「選択が画面外へ移る」場面だけで、そこは ON のほうが正しい。
   spec 側は前提(可視行を選んでから始める)を明示し、猶予を
   1.5 viewport → 0.5 viewport に**締めた**。改善そのものは
   `sidebar-virtual-list-parity.spec.ts` に新しい pin として足した。

**手続きの教訓**:
- **PR で走らない test 群は、走らせた時に初めて「腐っていた」と分かる**。
  既定を変えるような判断の前に、その群を一度通しで走らせて安全網が
  生きているか確かめる
- **大量の同一原因 failure を「既存の腐り」として一括処理しない**。
  それを剥がすまで、本物の regression は同じ山に埋まったままである
- 再発防止は `tests/build/smoke-idb-version-pin.test.ts`(**vitest 側**
  = PR で走る)。version をべた書きさせない ── 数字を上げて回るのではなく
  **数字を持たないことを規約にする**

## 8. 未確定(裁定・調査が要るもの)

1. ✅ **実機確認済み(2026-07-27、tests/bench/sqlite-spike.mjs)**:
   - crossOriginIsolated: **false**(想定どおり ── 単一 HTML は COOP/COEP を制御できない)
   - 'opfs' VFS(worker+SAB 方式): **未登録**(COI 必須のため)
   - **SAHPool の main thread install: 失敗**(`Missing required OPFS APIs` ──
     `createSyncAccessHandle` は worker 専用)
   ⇒ **永続化 sqlite は worker に置く**(SAHPool + 自前 worker を Blob URL で起動 =
   静的 bundle と両立)。副産物として保存処理が main thread から完全に外れる
   (編集 churn +0.4GB の直列化コストも worker 側へ)。main thread 側は
   postMessage RPC の薄い facade(ContainerStore 実装)になる。
   ✅ **P2 で実装・実機確認済み(2026-07-27)**: `?worker&inline` の worker に
   glue + wasm を**1 部だけ**焼き込み(main 側は RPC のみ)、worker 内
   SAHPool roundtrip 成立(77.6ms)・外部 fetch 0 件・遅延初期化コスト
   main 側 +3.6MB(worker は使い捨て probe を terminate)。
   実装: `sqlite-worker.ts` / `sqlite-client.ts` / `sqlite-store.ts` /
   `sqlite-schema.ts`(行マッパ + 参照 diff → RowOp)
2. sqlite ファイルの export(= .sqlite そのままの持ち出し)を製品機能にするか
3. FTS5 / sqlite-vec は本 doc の範囲外(「機能を足さない」に抵触するため、
   拡張点だけ確保して凍結)
4. ✅ **実測済み(2026-07-27、tests/bench/renderer-memory-breakdown.mjs ──
   memory-infra detailed dump、2 回目 boot + 35s settle)**。
   user 提起「まだ 1GB は大きく見える。wasm で畳める部分を畳む /
   使った後に時間で破棄する案も知りたい」への回答:

   | allocator | 空アプリ | 292MB fixture(JSON) | 292MB fixture(sqlite) |
   |---|---|---|---|
   | **計上合計(renderer)** | **69.9 MB** | 204.1 MB | **146.6 MB** |
   | v8 | 7.0 | **98.0** | **15.3**(main 10.3 + worker 4.6) |
   | partition_alloc + blink_gc(DOM 系) | 16.1 | 43.0 | 59.3 |
   | malloc | 14.1 | 29.5 | 38.3(worker wasm 込み) |
   | parkable_strings(script source) | 20.6 | 20.6 | 20.6 |

   結論:
   - **「renderer 356MB」の大半はアプリの割当ではない**(計上合計は空で 70MB。
     残りは chromium 自体のバイナリ写像等 ── VmRSS 計器は共有ページを
     二重計上する。アプリから削れない床)
   - 🔴 **訂正(2026-07-27、user 指摘を受けて同日中に撤回)**: 当初ここには
     「mermaid を描画しても GC 後ヒープは増えない(36.4 → 25.2MB)ので
     **dep 向けの破棄 lifecycle はいまは作らない**」と書いた。**これは誤りで、
     判定の根拠にした計測が JS heap しか見ていなかった。**
     同じ日の allocator 内訳を突き合わせると、**mermaid を 1 枚描いただけで
     renderer 計上は 69.9 → 76.8MB(+6.9MB)**(v8 +3 / malloc +3 / skia +1.4)。
     JS heap の外(blink 側・skia・コード)に残るものを、JS heap 計器で
     「無い」と言っていた。**dep の遅延評価 + 使用後の破棄には実測の賞金がある。**
     ⇒ 破棄 lifecycle は**作る**(mermaid / chart.js / docx / pptxgenjs、および
     sqlite worker の idle terminate)。効果の測定は **JS heap ではなく
     allocator 内訳**(renderer-memory-breakdown.mjs)で行う。
     ⚠ 規律: 「効果が小さい / 無い」の判定を**単一計器で下してはならない**
     (user 指示③「効果が小さいからやらないではなく、積み上げた先に価値が
     あるなら小さかろうが積んでください」に照らして、そもそも棄却理由に
     しないのが規約。ここでは棄却理由にしたうえ、その根拠すら誤っていた)
   - **v8 のコード常駐は空アプリでは 7MB** ── ただし上記のとおり
     「使うと増えて残る」ので、静的な空アプリ計測だけで判断しない
   - **アプリ側で残る最大の芝**: DOM 系(partition_alloc + blink_gc)が
     3000 entries で 16 → 59MB。**sidebar の DOM 仮想化**が本命
     (編集ごとの 5000 行再構築問題の恒久版でもある)
   - sqlite 経路の追加 malloc(worker の wasm/page cache ~10-20MB)は
     PRAGMA cache_size / idle 時 release で削れる(小、積み上げ先あり)

## 9. 参照

- 実測の全記録: PR #1040 / `tests/bench/boot-rss.mjs`
- 旧評価(D 腕の実測・A.3 zstd・A.5 フレーバー SQLite): `storage-v3-redesign-2026-07.md`
- 吸収する Issue: #1041(revisions 常駐)/ #1042(asset Blob 化)
- 互換の規律: `CLAUDE.md` Invariant 5(2026-07-26「互換は双方向」)
