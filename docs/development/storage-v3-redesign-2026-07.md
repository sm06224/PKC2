# Storage v3 再設計提案 — 500MB+ 時代のデータ構造とストレージ(2026-07)

> **Status**: 設計提案(実装なし)。user 指示 2026-07-22「データ構造とストレージについて
> 本格化する必要がある。データマイグレーションを含めて、軽量な db エンジンを搭載する案など
> 提案して欲しい。ワークスペースをツリーに露出させて切り替えをデフォルト採用。アセットを
> オブジェクトストレージやファイルシステムストレージで扱う案も。4MB のエントリなんて当たり前に
> 存在するので、今の逃げ方はかなりまずい」への回答。
> 関連 issue: #956 / #958 / #960 / #962 / #964 / #966(2026-07-22 の連続障害)

## 1. 診断 — 2026-07-22 に何が起きたか

同日に 6 件の障害が連続した。個別バグではなく、**同じ 2 つの土台前提の破綻**が別の顔で
現れたもの:

| 障害 | 直接原因 | 土台要因 |
|---|---|---|
| HTML/URL 添付が開けない(#956) | 非画像の miss 未記録 | base64 working-set の複雑さ |
| 起動が分単位(#958) | 差分保存 split の分散読み | Container = 単一 JSON 値 |
| export string length(#960) | 全量 stringify | 同上 + asset = base64 文字列 |
| export OOM(#962) | 全量ヒープ保持 | 同上 |
| 読み込み激遅(#964) | 巨大 asset の描画駆動 hydrate | asset = base64 文字列 |
| export OOM 再発(#966) | 圧縮の per-asset 5 コピー | 同上 |

**土台前提 1: 「Container は 1 つの JSON 値」**。保存・読込・export・メモリ像すべてが
「全体を一度に持てる」前提で書かれている。分割(差分保存)を後付けすると読みが分散して
破綻し、単一に戻すと書きが増幅する — どちらへ倒しても規模で死ぬ。

**土台前提 2: 「asset bytes は JS の base64 文字列」**。bytes が JS ヒープの文字列として
往来するため、読む・持つ・書く・圧縮する・連結する、のすべてが GB 級で
文字列長上限 / OOM / GC 圧に直撃する。4MB/8MB 閾値(#964/#966)はこの前提の中での
**応急止血であり、設計ではない**(user 指摘のとおり 4MB 級エントリ・添付は通常運用)。

ユーザーストレージは既に 500MB 超が常態(画面収録で GB 級へ)。前提を変えない限り、
閾値をどこに置いても同型の障害が再発する。

## 2. 設計原則(v3)

1. **どの操作もメモリ使用が「触った分」に比例する**(総量に比例しない)
2. **bytes は Blob のまま動く**。base64 文字列がヒープを通るのは互換境界(旧 export の
   import 等)だけ
3. **boot は O(メタデータ)**。エントリ本文・revision・asset bytes は需要駆動
4. **移行は双方向・段階的・自動バックアップゲート付き**(split/inline の収束設計と同じ流儀)
5. 単一 HTML 製品・後方互換(既存 export 資産が読めること)は不変条件のまま

## 3. 提案 A — ストレージエンジン

### 比較

| 案 | 実体 | 長所 | 短所 | 判定 |
|---|---|---|---|---|
| A1: **IDB v3 スキーマ**(推奨) | IndexedDB を「単一巨大 record」から「実体別 store + **Blob 値**」へ再設計 | 依存ゼロ / 全ブラウザ / **Blob をネイティブ格納**(ヒープ外・disk 退避可)/ index による部分読み | SQL は無い(必要になった実績もない) | ◎ 採用 |
| A2: SQLite WASM(wa-sqlite / sql.js) | 本物の DB エンジン | SQL・トランザクション表現力 | +1MB 級 WASM dep(bundle 予算・単一 HTML と衝突)/ **blob が WASM メモリを通る**ため GB 級 media にむしろ不利 / OPFS 永続は VFS 依存 | △ 見送り(将来 query 需要が実証されたら再評価) |
| A3: OPFS ファイルシステム直 | asset を実ファイル、メタを JSON | media に最適(stream 読書き)/ eviction 耐性 | すでに `fs-directory-adapter` seam あり。ただし**メタデータの index/部分読みは自前**になる | ○ **asset bytes 層としてハイブリッド採用**(A1 と併用可能な seam) |
| A4: PGlite 等 | — | — | 重量級、論外 | ✕ |

**結論**: 「軽量な db エンジンを搭載する」の実質は **IndexedDB を DB として正しく使う**こと。
今日の障害はエンジン不在ではなく「単一 record + base64 文字列」という使い方が原因。
SQLite WASM は bytes 問題を解決せず(むしろ悪化)、bundle 予算を食う。

### A1: IDB v3 スキーマ(DB version 3)

```
stores(すべて cid スコープの複合 key):
  workspaces      ws_id → {name, containerIds, activeContainerId, ...}
  containers      cid → ContainerMeta(title, created_at, counts, schema…)※ meta のみ
  entries         [cid, lid] → EntryMeta(title, archetype, dates, size_hint)※ body 抜き
  bodies          [cid, lid] → string(本文。4MB 級もこの単位で needs-only 読み)
  revisions       [cid, seq] → Revision(append-only。index: by entry_lid)
  assets          [cid, key] → **Blob**(base64 をやめる)
  asset_meta      [cid, key] → {mime, size, hash, name}
```

- boot = `containers.get + entries.getAll(index)` のみ → **O(エントリ数のメタ)で一定**。
  1 万エントリでもメタは数 MB
- 本文は body working-set(#940 の seam を既定 ON へ昇格)が需要駆動で hydrate
- revisions は **Container のメモリ像から出す**(§4)
- 差分保存論争は消滅する: per-record が正規形なので「変更した record だけ書く」が
  自然形。全量書き(inline)も分散読み(split)も無くなる

## 4. 提案 B — データモデル v3

### B1: asset = Blob + registry(最重要)

- `Container.assets: Record<string, string>`(base64)を廃止し、メモリ上は
  **asset registry**: `Record<key, {mime, size, hash}>` のみ(バイト無し・数 KB)
- 表示は `URL.createObjectURL(blob)`(ヒープ外)。`<img>` / `<video>` / preview iframe /
  HTML app 起動すべて ObjectURL 経由に置換。**working-set の byte 予算・4MB 閾値・
  スラッシングは概念ごと消える**
- export: `Blob` を直接 ZIP / multipart へ(§6)。base64 化は旧 HTML export 互換境界のみ
- 取込み(drop / paste / 収録)も File/Blob のまま store へ — 現在の
  「File → base64 → 文字列運搬 → base64 保存」の 3 重変換が消える

### B2: 本文 lazy を既定に

- `persistence.lazy_entry_bodies`(#940 layout v2、実装済・既定 OFF)を v3 スキーマ移行と
  同時に既定 ON。4MB 本文は「選択したときだけ」読まれる
- エディタ・検索・export は既存の barrier(hydrate 済み保証)を流用

### B3: revisions の分離と保持ポリシー

- revisions は**最も静かに膨らむ領域**(編集のたび全文スナップショット追記、上限なし)。
  メモリ像から外し、revision viewer を開いたときだけ範囲読み
- 保持ポリシー(user 設定): 件数/日数 window + それ以前は間引き(entry ごと最新 N 件保証)。
  既定は保守的に(例: 全保持のまま、まず「読み込みだけ lazy」)

## 5. 提案 C — ワークスペース第一級化

user 指示のとおり、規模問題は**分割統治**でも効く。ワークスペース(実装済 #773)を
運用の中心に昇格する:

1. **ツリー最上位にワークスペース節を常設露出**(現在は Data… メニューの奥)。
   `▣ Workspace A ● / Workspace B / + New` をサイドバー最上部に
2. **切替を既定動線に**: 切替 = アクティブ container の付け替え(reload なしを目標。
   v3 では store が cid スコープなので `SYS_INIT` 相当の再水和で足りる)
3. **推奨運用をお知らせ/manual で提示**: 「収録・メディアは専用ワークスペース」
   「プロジェクトごとに 1 ワークスペース」— 各 container を中規模に保つことが
   すべての操作の応答性に効く
4. 横断検索は v3 の entries store(全 cid)への index scan で実装可能(将来項)

## 6. 提案 D — バックアップ / エクスポート戦略

- **正本バックアップ = ZIP(.pkc2.zip)**: すでに asset 分離形式。v3 では Blob を
  そのまま zip entry へ streaming(メモリ一定)。「バックアップ」ボタンの既定を ZIP に
- **単一 HTML export は「持ち運び用」**として残す(不変条件)。ただし規模警告 +
  自動で ZIP を勧める導線。実装は現行の streaming Blob(#962/#966)を Blob 直結に強化
- **フォルダ同期バックアップ**(FSA): asset を実ファイルとして folder へ増分コピー。
  fs-directory seam の正しい使い道はこちら(per-record 保存ではなく)

## 7. マイグレーション計画(v2 → v3)

split/inline で実証済みの「双方向・収束・自動」の流儀を踏襲する:

- **Phase M0(準備)**: v3 read/write を旧形式と並行実装。`__pkc_layout__: 3` marker。
  旧ビルド互換注意は従来と同型(marker 無視 → 空に見える)を manual に明記
- **Phase M1(自動バックアップゲート)**: 移行実行の直前に **ZIP バックアップを強制生成**
  (完了確認まで移行しない)。今回の教訓の直接反映
- **Phase M2(移行本体)**: 初回 boot で chunk 移行(asset 1 件ずつ base64→Blob、
  entry/revision を per-record へ)。**resumable**(中断しても次回続きから)+
  進捗 UI。500MB で分オーダーを想定、1 回きり
- **Phase M3(収束)**: 移行完了 marker 後は v3 のみ。旧形式 read は import 経路として恒久維持
- **ロールバック**: v3 → ZIP export → 旧ビルドで import(いつでも脱出可能)

## 8. 4MB / 8MB 閾値の扱い

- #964(描画 hydrate 4MB)/ #966(export 無圧縮 8MB)は **B1 が入った時点で撤去**する
  前提の止血と明記(ObjectURL 化でサイズ非依存になる/ Blob 直結 export で圧縮判断が
  per-asset に自由化)。撤去を v3 の完了条件(DoD)に含める

## 9. フェーズ分割(実装順の提案)

| Phase | 内容 | 効果 | 規模 |
|---|---|---|---|
| P0 | ZIP バックアップ導線の格上げ(既定ボタン化 + 大規模時の誘導) | 今すぐの安全網 | 小 |
| P1 | **B1: asset Blob 化 + registry**(IDB v3 assets store、ObjectURL 描画) | 今回の障害群の根絶 | 大 |
| P2 | A1 残り: entries/bodies/revisions per-record + B2 lazy 既定 + M1-M3 移行 | boot O(meta)・4MB 本文常用化 | 大 |
| P3 | C: ワークスペースのツリー露出 + reload なし切替 + D: フォルダ増分バックアップ | 分割統治の定着 | 中 |

P1 と P2 は独立に着地可能(P1 だけでも最大の痛点が消える)。各 Phase とも
visual parity test + 実データ規模の smoke(数百 MB seed)を DoD に含める。

## 10. user 判断をもらいたい点

1. **エンジン**: A1(IDB v3 + Blob)+ A3(OPFS を asset 層のオプション)で進めてよいか。
   SQLite WASM 希望が強い場合はその動機(query? 移植性?)を教えてほしい —
   動機によっては A1 の上に query 層を足す方が安い
2. **優先順**: P1(asset Blob 化)を最優先でよいか。それとも P3(ワークスペース露出)を
   先に小さく出すか
3. **revision 保持ポリシー**の既定(全保持 + lazy 読みから始めるか、間引きまで入れるか)
4. **移行の自動バックアップゲート**(M1)は ZIP 強制で異論ないか

---

## Appendix A — 実測(2026-07-22 追記、user 指示「ベンチも取らずに勝手しないで」への回答)

計測環境: Chromium headless / NVMe。ハーネスは `tests/bench/storage-arch-bench/`
(実機でも実行可)。**予算・単一 HTML は理想であって制約ではない**という前提で、
候補は理想論でなく実測で判定した。

### A.1 アーキテクチャ 5 構成(asset 100KB-5MB × 総量 300MB)

> **計測バグの開示と訂正(2026-07-22)**: 当初の計測は Playwright の ephemeral
> context(incognito 相当)で行われており、**storage がメモリバックで実ディスクを
> 踏んでいなかった**(/proc/diskstats 検証で発覚)。CPU・コピーコストの相対比較と
> しては有効だが、絶対値と一部の順位が変わるため、persistent プロファイル
> (実ディスク)での再計測を正とする。両方を記録する。

**実ディスク(persistent profile)、300MB(114 assets)、単位 ms:**

| 構成 | 投入 | cold start | 1件読み(~2MB→ObjectURL) | 10件読み | 追記10件 |
|---|---|---|---|---|---|
| A 現行: 単一JSON+base64 | 11,644 | **11,076** | 152.5 | 1,202 | 6,618 |
| B OPFS 個別ファイル | 2,026 | 20 | 1.3 | 13 | 167 |
| C OPFS packfile+offset | **1,520** | 25 | 4.9 | 74 | **166** |
| D SQLite WASM(OPFS SAHPool・BLOB) | 2,295 | 22 | 7.1 | 156 | 200 |
| E IDB + Blob(採用) | 2,281 | **16** | **0.8** | **6** | 197 |

参考(incognito = メモリバック、CPU プレーンの比較): A 8,984/3,276/39.8/440/5,057、
B 2,023/12/1.0/9/182、C 1,940/15/6.4/95/207、D 29,296/125/103.6/1,717/2,663、
E 660/8/0.5/4/51。

- **A(現行)は実ディスクでさらに悪化**(cold 11 秒/300MB)— 置換の緊急性を再確認
- **E は読み最速(0.8ms / 6ms)+ cold 最速を維持**。ただし incognito 計測で見えた
  「全項目圧勝」は訂正 — 実ディスクでは投入/追記は B/C と同水準
- **D(SQLite WASM)の「壊滅的に遅い」は incognito アーティファクトであり撤回**。
  実ディスクでは投入・追記とも実用水準。残る劣位は読み(E の ~9 倍)と、bytes が
  WASM リニアメモリを経由するヒープ常駐(sql.js 計測で +246MB)
- C(packfile、Gemini 提案)は**一括投入と追記で最速**。AV の per-file open 走査
  対策としても有効な形。E は per-file open 自体が無く同懸念を構造的に回避
- ヒープ: 別計測(main thread)で base64 200MB 読出は **+293MB 常駐**、Blob は **±0**

### A.2 SQL エンジン(構造データ)

| | boot | 1万行 insert | select | blob 200MB 挿入 | 備考 |
|---|---|---|---|---|---|
| sql.js | 速 | 325ms | 84ms | WASM ヒープ +246MB | 永続化 = DB ファイル全 export(206MB/回) |
| PGlite | 8.1s | 2,736ms | 84ms | 100MB で 25s / +213MB | bytea 20MB 単発読み 1.9s |
| IDB(素) | — | 843ms(1tx 全量)/ **1ms(差分)** | 124ms(getAll) | — | 単一 record 読みなら 13ms |

**bytes が WASM リニアメモリを通る構造は全 WASM エンジン共通の不利**(D の劣位と同根)。

### A.3 zstd 圧縮の賞金(層別)

| データ種別 | gzip6 | zstd3 | zstd19 |
|---|---|---|---|
| entries(markdown) | 6.4x | 15.0x | 30.9x |
| revisions(snapshot 群を**一括**圧縮) | 7.6x | **587x** | 2,211x |
| media(圧縮済みバイナリ近似) | 1.0x | 1.0x | 1.0x |

- 履歴の巨大な賞金は**スナップショット間の冗長**由来 — 行単独圧縮では取れず、
  グループ圧縮 or 辞書(sqlite-zstd の方式)が必要
- → **P2 に「revision log の zstd グループ圧縮」(app 層 codec、zstd-wasm 単体)を追加**。
  custom SQLite ビルドを待たずに取れる

### A.4 FTS5(trigram、日本語 5,000 entries / 5MB)

| クエリ | JS 線形スキャン | FTS5 trigram |
|---|---|---|
| レア語 | 0.8ms | 0.59ms |
| 高頻度語(4,849 hit) | 0.3ms | 55.5ms(rank 込み) |

現規模ではクエリ性能の優位なし。lazy bodies 化後も「検索時に bodies を一括読み
(124ms/1 万件)→ スキャン」で成立する。

### A.5 「PKC2 フレーバー SQLite」の位置づけ(user 提起)

`SQLITE_EXTRA_INIT` 静的リンク(sqlite-zstd / sqlite-vec / FTS5 tokenizer を焼き込んだ
専用 WASM ビルド)は正攻法として成立する。ただし採用は性能でなく**機能**が動機に
なった時: ① sqlite-vec による意味検索の製品化 ② ランク/スニペット付き検索 UX
③ テキスト実体 50MB+ 級への成長。それまでは**設計済み拡張点**として本 doc に保存し、
bytes プレーンは常に E(IDB Blob)側に置く(A.2 の構造的理由)。

### A.6 実測を受けた §3-§4 の修正

- boot 形状: per-record 全面化を撤回し、**「entry meta は小さな単一レコード」**
  (読み 13ms、遅いディスクでも 1 read)+ **本文 / revisions のみ per-record**
  (差分書込 1ms・需要読み)のハイブリッドへ
- Storage Buckets API(Chrome 122+)をメディア層の progressive enhancement として追加
  (バケット分離 + persistent 指定 = ブラウザの自動削除からユーザーデータを保護)

### A.7 実ディスク I/O: セグメントログ + ストリーミング圧縮(user 指示で必須化)

user 指示「**ディスク I/O に負荷をかけたくない。ゆるいストリーミング圧縮とチャンク
パックはスケールのために必須**」を受けた実測(revision snapshot 110.6MB を IDB へ、
/proc/diskstats の実デバイス書込、persistent profile):

| 方式 | wall | 保存後サイズ | **実ディスク書込** |
|---|---|---|---|
| P1 per-record(1 revision = 1 record = 1 tx) | 2.4s | 44.6MB | 77.6MB |
| P2 チャンクパック(1MB セグメント) | 3.4s | 23.4MB | 24.6MB(1/3.2) |
| **P3 パック + gzip ストリーミング圧縮** | 6.9s | 14.6MB | **15.8MB(1/4.9)** |

- per-record は LevelDB の WAL+SST 二重書きで実書込が論理量の ~70% に達する。
  **チャンクパックで 1/3、ゆるい圧縮を重ねて 1/5** — user の主張どおり
- 圧縮 CPU は 2000 revision 一括でも 6.9s(実運用の編集ペースでは ~3.5ms/件)
- → **§4 B3 を改訂: revision log と cold 本文は「セグメントログ」
  (~1MB チャンクへのパック + CompressionStream によるストリーミング圧縮、将来
  zstd-wasm へ差し替え可)で書く。これを v3 の必須構成要素とする。**
  アクティブ(末尾)セグメントのみ debounce 書き足し — 遅延永続の「ゆるさ」は
  末尾 1 セグメントに限定され、クラッシュ時損失は従来の debounce と同等
- メディア(Blob)はパック対象外(圧縮 1.0×・コピー I/O が増えるだけ。A.3)

### A.8 整合性と並行性(ACID / ロック特性、user 質問への回答)

- **原子性・分離性**: IDB tx は同一 DB 内なら複数 store 横断で原子的。readwrite は
  スコープ単位で直列化(dirty read なし)、readonly は並行。**ロックフリーではない**
  が、IDB tx はイベントループでリクエストが尽きると自動 commit するため
  「持ちっぱなしのロック」は構造的に作れない(per-op 短 tx 設計と整合)
- **永続性は relaxed が既定**(Chrome M121+ の `durability: 'relaxed'`)。電源断で
  直近 commit が消え得る(torn write は WAL が防ぐ)。→ **要所(移行完了・インポート
  完了・明示保存)のみ `durability: 'strict'`** の二段構え
- **多重タブの書き込み調停(設計の欠落を補充)**: IDB の直列化はアプリ層の
  last-write-wins を防がない。→ **Web Locks API による writer リース**(アクティブ
  タブが書込権を保持、他タブは読取 + BroadcastChannel で追従)を v3 に追加
- **移行の versionchange**: DB version 2→3 open は旧接続が居る限り blocked。
  `onversionchange` で旧接続を閉じる + blocked 時の user 案内を M2 に追加
- **エクスポートの断面一貫性**: streaming export は複数 tx にまたがる。export 中は
  保存を短時間バリアで待機させる
- **eviction 保護**: `navigator.storage.persist()` 要求 + Storage Buckets の
  persistent 指定(§A.6)

### A.9 syscall プロファイル: 頻度・タイミング・影響の分布(user 指示)

user 指示「回数だけではなく、頻度とタイミングと影響の分布。結局そこ(syscall)が
フック渋滞の原因になる」を受け、strace -f -ttt -T で **per-call タイムスタンプ +
所要時間**を取り、worker のフェーズマーカーと突き合わせた(100MB、Chromium
プロセスツリー全体、file 系 syscall。strace 下の wall は比較に使わない)。

**フェーズ帰属(タイミング)— 特にユーザー体感の読みパス:**

| 構成 | 読みフェーズ syscalls | 同 syscall 合計時間 | ingest syscalls | 追記 syscalls |
|---|---|---|---|---|
| A 単一JSON | 363 | 50ms | 5,511 | 1,229(**fdatasync max 651ms**) |
| B 個別ファイル | 402 | 28ms | 3,618 | 3,880 |
| C packfile | 224 | 63ms | **530** | **165** |
| D SQLite WASM | **5,783** | 310ms | **45,457** | 11,685 |
| E IDB+Blob | **97** | **7ms** | 15,979 | 3,537 |

**頻度(100ms ビンのレート)**: D は中央値 692 回/100ms で**常時高頻度 chatter**
(フック渋滞の最悪形)。A は中央値 35 だが p95 633 の**バースト型**。C は活動時間
自体が最短(31 ビン)。

**影響の分布(レイテンシ tail)**: 全構成で tail の主犯は **fdatasync**
(p50 ~1.2ms)。max は A **651ms** / C 364ms / D 450ms / B 27ms / **E 7.4ms** —
E(LevelDB WAL)は sync が均されて tail が桁で短い。A の 651ms は全量書き直しの
flush で、UI ブロック級の spike。

**フック渋滞の読み方**: AV/EDR の hook 単価 h は全 syscall に一律に乗るため、
体感影響 ≈ フェーズ内 syscall 数 × h。読みパスで **D は E の ~60 倍**(5,783 vs
97)、一括書きで **D は C の ~86 倍**(45,457 vs 530)。

**結論(A.7 と合流)**: hook-heavy 環境の序列は C(総数最少・活動窓最短)と
E(読みパス最少・tail 最短)が二強で、役割が違う —
- **bytes プレーン = E(IDB Blob)**: ユーザー体感パス(読み)の syscall が桁で
  少なく、tail も最短
- **書き込み側の chatter は「セグメントログ」(= C のパック原理を IDB 内で適用)で
  削る**: record 数減 = WAL 操作減 = syscall 減。A.7 の実書込 1/4.9 と同じ手が
  syscall 数にも効く
- D(SQLite WASM)は**全フェーズで syscall 数が桁違いに多く**、フック渋滞観点でも
  最も不利(A.1 の速度訂正とは独立の劣位として記録)

ハーネス: `run-syscall-bench.mjs`(回数)/ `run-syscall-profile.mjs`(頻度・
フェーズ・分布)。ベンチ HTML は `?autorun=1&config=X&size=Y` で単一構成を外部駆動可。

---
*参照: [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)(方針正本)/
[`opfs-storage-adapter-design-2026-06.md`](./opfs-storage-adapter-design-2026-06.md)(fs seam)/
[`refinement-research-2026-07.md`](./refinement-research-2026-07.md)(I/O 棚卸し)/
[`storage-backend-benchmark-2026-07.md`](./storage-backend-benchmark-2026-07.md)(#904 の backend ベンチ)/
`tests/bench/storage-arch-bench/`(本 appendix のハーネス)/
issues #956 #958 #960 #962 #964 #966(発端の障害群)*
