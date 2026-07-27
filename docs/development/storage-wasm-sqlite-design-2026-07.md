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
| P2 | sqlite3.wasm 静的 bundle + `SqliteContainerStore`(ContainerStore の別実装)。flag opt-in で read/write。**この時点から新規データは JSON 内部表現を持たない** | — |
| P3 | assets: sqlite 行(meta)+ Blob record(bytes) | #1042 |
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

## 8. 未確定(裁定・調査が要るもの)

1. ✅ **実機確認済み(2026-07-27、tests/bench/sqlite-spike.mjs)**:
   - crossOriginIsolated: **false**(想定どおり ── 単一 HTML は COOP/COEP を制御できない)
   - 'opfs' VFS(worker+SAB 方式): **未登録**(COI 必須のため)
   - **SAHPool の main thread install: 失敗**(`Missing required OPFS APIs` ──
     `createSyncAccessHandle` は worker 専用)
   ⇒ **永続化 sqlite は worker に置く**(SAHPool + 自前 worker を Blob URL で起動 =
   静的 bundle と両立)。副産物として保存処理が main thread から完全に外れる
   (編集 churn +0.4GB の直列化コストも worker 側へ)。main thread 側は
   postMessage RPC の薄い facade(ContainerStore 実装)になる
2. sqlite ファイルの export(= .sqlite そのままの持ち出し)を製品機能にするか
3. FTS5 / sqlite-vec は本 doc の範囲外(「機能を足さない」に抵触するため、
   拡張点だけ確保して凍結)
4. **空アプリで renderer 356 MB(JS heap 18 MB)の内訳** ── bundle 6MB の
   コンパイル済みコードと boot 時展開の寄与を分解する(sqlite とは独立の調査)

## 9. 参照

- 実測の全記録: PR #1040 / `tests/bench/boot-rss.mjs`
- 旧評価(D 腕の実測・A.3 zstd・A.5 フレーバー SQLite): `storage-v3-redesign-2026-07.md`
- 吸収する Issue: #1041(revisions 常駐)/ #1042(asset Blob 化)
- 互換の規律: `CLAUDE.md` Invariant 5(2026-07-26「互換は双方向」)
