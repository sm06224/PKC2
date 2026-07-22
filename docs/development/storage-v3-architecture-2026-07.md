# Storage v3 アーキテクチャ(正本)— 分離・有界・集約・先読み(2026-07)

> **Status**: 設計正本(user レビュー待ち → 承認後に実装正本)。
> 実測・調査・訂正の全記録は
> [`storage-v3-redesign-2026-07.md`](./storage-v3-redesign-2026-07.md)(研究ログ、
> Appendix A.1-A.9)。本 doc はそこから確定した**最終アーキテクチャだけ**を記す。
> 発端: 2026-07-22 の連続障害(#956/#958/#960/#962/#964/#966)と user 設計指示
> (#967)。ハーネス: `tests/bench/storage-arch-bench/`(実機で再実行可)。

---

## 1. 向き合う課題(何が問題か)

| # | 課題 | 現行での破綻(実測/実害) |
|---|---|---|
| C1 | **メモリが総量比例** — Container = 単一 JSON、asset = base64 ヒープ常駐 | 200MB 読出で +293MB 常駐。export で string 上限(#960)・OOM(#962)。ワークスペース破棄に至った |
| C2 | **boot が総量比例** | 実ディスクで 300MB = cold 11 秒(A.1)。#958 |
| C3 | **ディスク I/O 負荷** — 全量書き直し or per-record の書込増幅 | 全量: 追記 10 件に 6.6 秒 + 651ms の fsync spike。per-record: 論理 110MB に実書込 77.6MB(A.7) |
| C4 | **syscall フック渋滞**(AV/EDR)— hook 単価 × syscall 数が体感を決める | 読みパス syscall: 構成間で 97〜5,783 回と 60 倍差(A.9) |
| C5 | **FS 依存の構造破綻と、フォルダバックアップ要件の両立** | per-record ファイル化が #958 を起こした。一方で「ディレクトリごと FS にバックアップを任せたい」は正当な要件 |
| C6 | **履歴の無限成長** — 編集ごとに全文スナップショット追記 | 最も静かに膨らむ領域。ただし冗長度が極端に高い(一括圧縮 587×、A.3) |
| C7 | **高参照可能性データの即応性** — ランチャー登録 app、直近参照の asset/エントリ | 今日の「HTML が開かない・遅すぎる」(#956/#964)は、この層の設計不在が根因 |
| C8 | **整合性・並行性** — durability relaxed 既定、多重タブ last-write-wins、eviction | A.8。多重タブ調停は設計に存在しなかった |
| C9 | **移行の安全** — 移行・障害時にデータを人質に取らない | 今回、復旧手段が ZIP export しか無く、それも 2 度壊れていた |
| C10 | **可搬性の維持** — 単一 HTML 埋め込みは配布・持ち運びの理想形として残す | 二層戦略(user 決定): ローカルは軽く、可搬形式は互換のまま |
| C11 | **ブラウザストレージが死んでいる環境**(user 要望 2026-07-22)—「localStorage やクッキーが必ず初期化されてしまう環境なので、依存しない仕組みが欲しい」。追加ヒアリング: 当該環境は localStorage どころか**ブラウザストレージそのものが死んでいる** | v3 の L1=IDB 前提が成立しない環境が実在。現行はブラウザ保存なしでは運用ループ(開く→作業→保存→復元)が完結しない。UI prefs の localStorage 直依存(9 系統)も同根 |

## 2. 設計原理(3 + 1)

1. **分離** — ユーザー操作が踏む経路(作業系)から、ファイルシステムを構造的に
   到達不能にする。FS は**一方向の出力先(sink)専用**。live な双方向依存を作らない
2. **有界** — どの操作もメモリ・I/O・syscall が「触った分」に有界。総量に比例する
   経路を残さない。ワークスペース分割で作業系そのものの規模も有界に保つ
3. **集約** — 小さいものは束ねて書く。セグメントログ(チャンクパック +
   ゆるいストリーミング圧縮)が正規の書き込み形
4. **先読み(キャッシュ)** — 参照可能性の高いものは、要求される前に
   「per-file 影響ゼロで返せる状態」にしておく

## 3. 全体構成

```
┌─ L0 ホットキャッシュ(メモリ、有界)─────────────────────────┐
│  ・全エントリ meta(タイトル/型/日付)= 常駐(数 MB)          │
│  ・ObjectURL テーブル: pin 済み asset の URL(bytes はヒープ外)   │
│  ・アクティブセグメント(書き込みバッファ、末尾 ~1MB)           │
└──────────────┬───────────────────────────────┘
               │ 需要読み / debounce 書き(すべて短 tx)
┌─ L1 作業ストア(IDB、唯一の読み書き対象)─────────────────────┐
│  meta         : 単一小レコード(cold 16ms、遅いディスクでも 1 read)   │
│  bodies/revs  : セグメントログ(パック + gzip/zstd、実書込 1/4.9)     │
│  assets       : Blob 値(読み 0.8ms・ヒープ 0・syscall 最少)        │
│  Storage Buckets(persistent)+ navigator.storage.persist() で削除保護  │
└──────────────┬───────────────────────────────┘
               │ 一方向・非同期・封印済みのみ(temp→rename)
┌─ L2 保管 sink(読み戻さない出力先)───────────────────────────┐
│  ・ZIP バックアップ(.pkc2.zip、正本)                              │
│  ・FSA フォルダミラー: 封印パック + manifest(少数・大・不変・追記)   │
│  ・単一 HTML export(可搬・配布用、従来互換)                       │
│  復元はすべて import 経路(これも一方向)                           │
└──────────────────────────────────────────────┘
```

## 4. キャッシング設計(C7 の解、user 指示 2026-07-22)

> 「ランチャー登録対象や、若く参照可能性の高いアセットやエントリは、
> 高速性重視かつ per-file 影響の少ない状態がベスト」

**pin セット(常時ウォーム)**:
- launcher 登録 asset(`registered_as_app` / `startup` / PKC-Extension)と app icon
- 直近 N 日に参照されたエントリの本文・asset(参照時刻は meta に記録済み)
- 現在選択の依存 closure(既存 `getEntryAssetDependencies` を流用)

**機構**:
- boot 完了直後、pin セットを**非同期プリウォーム**: asset は Blob handle を取得して
  `URL.createObjectURL` を先に作り、テーブルに保持。**bytes はブラウザ管理で
  ヒープ外・URL 生成は handle 操作なので per-file I/O が発生しない**
- 以後、launcher タイル click / 画像表示 / HTML app 起動は **ObjectURL 参照のみ
  (syscall ゼロ・0ms 級)**。AV 環境でも hook を踏む回数が構造的にゼロ
- 本文はデコード済み文字列を LRU 保持(直近参照ぶんだけ・件数上限)
- **eviction**: ObjectURL は revoke で即解放。pin は件数上限 + LRU(bytes が
  ヒープ外なので上限は緩くてよい)。launcher/startup は常時 pin
- 書き込み側: アクティブセグメント(末尾 ~1MB)がメモリ上の書き込みキャッシュ。
  debounce で封印 → L1 へ。クラッシュ時損失は従来の debounce 窓と同等

これが #956/#964(HTML が開かない・遅い)の**恒久解**でもある: 4MB/8MB 閾値・
miss 記録・3 段 fallback という止血群は、pin + ObjectURL 化の完成をもって撤去する
(DoD)。

## 4.5 C11: ブラウザストレージが死んでいる環境 — ファイル完結モード(**設計 — user 裁定 2026-07-22 反映、実装は go 後**)

> user 要望: 「一部のユーザーから、localStorage やクッキーといったストレージが
> 必ず初期化されてしまう環境なので、そこに依存しない仕組みとして欲しい」
> 追加ヒアリング(user): 当該環境では**ブラウザストレージそのものが死んでいる**
> (localStorage だけでなく IndexedDB も使えない / 残らない)。

### 課題の本質

v3 は L1 = IndexedDB を作業ストアの前提にしているが、**その前提自体が成立しない
環境が実在する**。「localStorage → IDB へ移す」類の対処は無意味。必要なのは、
ブラウザ管理ストレージがゼロでも運用ループ(開く → 作業 → 保存 → 次回復元)が
完結する**ファイル完結モード**を、v3 の一級市民として設計することである。
(なお、クッキーは PKC2 では不使用 — 依存の実体は localStorage / IDB。)

### 方針(user 裁定 2026-07-22)

1. **全て自動にしない。** ストレージ不能を検知しても黙って切り替えず、
   **明示的にフォールバックする旨を掲示**し、ユーザーが承認してから
   ファイル完結モードに入る
2. その掲示では、**新ストレージモードを旧ストレージモードと比較する図解つきの
   丁寧な説明**を提示する(下記の図と同内容を in-app で)
3. 掲示・説明には次を必ず記載する: **新旧ベンチ(体感がどう変わるか)**/
   **可搬型の従来エクスポート形式(単一 HTML)と ZIP 形式の互換が保証される旨**/
   **マイグレーションが提供される旨**

### 図解: 新旧ストレージモードの比較

**旧ストレージモード(現行 v2: ブラウザ保存が前提)**

```
┌─ ブラウザ管理ストレージ(消える環境がある)──────────────┐
│  作業系(メモリ)                                              │
│    ⇅ 自動保存 / 起動時読み込み                                  │
│  IndexedDB: Container 全体 = 単一 JSON + base64                  │ ← ここが死ぬと
│  localStorage: UI 設定                                          │    何も残らない
└────────────────────────────────────┘
      ↓ 手動操作時のみ
   エクスポート(単一 HTML / ZIP)
```

**新ストレージモード A(v3 通常: ブラウザ保存が生きている環境)**

```
L0 メモリキャッシュ ⇄ L1 IndexedDB(meta 1 read + セグメントログ + Blob)
                          ↓ 一方向・封印済みのみ
                        L2 sink(ZIP / 単一 HTML / FSA フォルダミラー)
```

**新ストレージモード B(ファイル完結: ブラウザ保存が死んでいる環境への明示フォールバック)**

```
起動: ユーザーが明示的に開く(単一 HTML の埋め込みデータ / フォルダ / ZIP)
        ↓ import(一方向)
  作業系(メモリのみ — L1 は存在しない)
        ↓ 自動保存(debounce、封印パック + manifest)   ↓ 明示保存
  FSA フォルダ(推奨 sink)                  単一 HTML / ZIP(従来互換)
```

丁寧な説明のポイント(in-app 掲示にもこの構図を使う):

- モード B は不採用にした「FSA 直モード」とは**別物**: 作業系に per-file I/O を
  混ぜない。フォルダに置くのは封印パック + manifest(少数・大・不変・追記)のみで、
  FS は引き続き**一方向 sink 専用**。構造原理(分離)はそのまま保たれる
- ブラウザ仕様上、フォルダハンドルは IDB にしか永続できないため、IDB が死んで
  いる環境では**セッション開始時にフォルダを選び直す 1 操作が必ず要る**。
  起動直後の「前回のフォルダを開く」導線を最短 1 クリックにするのが UX の肝
- 自動保存間隔 = クラッシュ時の損失窓。IDB バッファが無い分、フォルダ sink への
  debounce 保存で窓を詰める(既定値は実装時に実測で決める)

### 新旧ベンチ(実測・実ディスク・300MB。研究ログ A.1/A.7)

| 指標 | 旧モード(現行: 単一JSON+base64) | 新モード A(IDB+Blob) | 新モード B 相当(packfile 形状) |
|---|---|---|---|
| 起動(cold) | 11,076ms | **16ms** | 25ms |
| 1 件読み(~2MB) | 152.5ms | **0.8ms** | 4.9ms |
| 追記 10 件 | 6,618ms | 197ms | **166ms** |
| 実ディスク書込(110MB 履歴) | 全量書き直し型 | セグメントログで **1/4.9** | 同左(パック形式共通) |

※ 新モード B の数値は OPFS packfile 構成(A.1 の C)による近似。**FSA ユーザー
フォルダへの sink 書込は実装時に同ハーネスで追加実測する(DoD)**。in-app 掲示には
この表の要約(「起動 11 秒 → 体感ゼロ」級の言い換え)を載せる。

### 互換保証とマイグレーション(明記)

- **可搬型の従来エクスポート形式(単一 HTML)と ZIP 形式は、互換を保証する。**
  新旧どちらのモードでも入出力形式は同一で、既存のファイルはそのまま読める。
  形式を変更する場合も旧形式 read は import として恒久維持する(§7 M0-M3 と同方針)
- **マイグレーションを提供する**: 旧モード(IDB 内データ)→ モード B(フォルダ
  sink)への移行導線を、M0-M3 と同じ安全装置(**移行直前の ZIP 強制バックアップ
  ゲート**)つきで提供する。逆方向(ファイル → ブラウザ保存へ戻す)も通常の
  import として常に可能
- UI prefs は `__settings__` の uiPrefs バッグとしてデータに同乗させる(§4.6)。
  ファイル完結モードでは prefs もファイルだけで往復する

### フォールバック掲示(UX 仕様)

- **検知**: boot 時に IDB / localStorage の生死を probe(実際の書込→読出で確認)
- **掲示**: 明示ダイアログで「ブラウザ保存が利用できないため、ファイル保存
  モードでの動作を提案する」旨を、上記図解・ベンチ要約・互換保証・
  マイグレーション提供とともに丁寧に説明する。選択肢:
  ① フォルダを選んでファイル完結モードで続行(推奨・自動保存あり)
  ② 都度の明示保存(HTML / ZIP)だけで続行
  ③ 閲覧のみ
- **掲示なしの自動切替はしない**(user 裁定)。probe 誤検知に備え、ダイアログ
  から通常モードの再試行も選べる

### 検証計画

- IDB / localStorage を実際に無効化したブラウザプロファイルでの実機 E2E
  (開く → 編集 → 自動保存 → 再起動 → 復元の一周)
- フォールバック掲示の visual parity test(明示ダイアログ・選択肢 3 系統)
- FSA フォルダ sink の実ディスク書込ベンチ(既存ハーネス流用)

## 4.6 C11 部品: UI prefs の container 同乗(設計 — §4.5 の前提部品)

UI 設定(お知らせ既読 / 編集モード / ペイン / タブ等)が localStorage 直依存の
ままでは、ファイル完結モードでも prefs だけが毎回消える。そこで prefs の正本を
データ側に移す。単独の解ではなく、§4.5 モード B を成立させる前提部品。

### 解決原理(「分離」の系)

**prefs の正本を、データと同じ場所に置く。** container の `__settings__`
payload に `uiPrefs` バッグ(`Record<string, string>`、有界・additive)を追加し、
UI prefs は IDB / 単一 HTML export / Backup ZIP / FSA フォルダに**データと一緒に
同乗**する。「データが生き残る限り prefs も生き残る」— localStorage も IDB も
消える環境でも、L2 からの import が prefs ごと復元経路になる(C9 と共通)。

### 棚卸しと分類(現行 localStorage 依存の全 key)

| key | 用途 | 方針 |
|---|---|---|
| `pkc2.startup-notice.seen` / `.disabled` | お知らせ既読 / 抑止 | **同乗**(初期化環境で毎回再表示される、要望の直接原因級) |
| `pkc2.editMode` | 編集モード(inline / window) | **同乗** |
| `pkc2.panePrefs` | ペイン折り畳み | **同乗** |
| `pkc2.folderPrefs` | フォルダ折り畳み(container 別 map) | **同乗** |
| `pkc2.split-sync-enabled` | Split View ⇄ トグル | **同乗**(子 window の inline JS が直読み — 後述のミラーで無変更対応) |
| `pkc2.filer.column-widths` | ファイラ列幅 | **同乗** |
| `pkc2.tabStrip` | タブ復元(open/active/pinned) | **同乗** |
| `pkc2.extensionBindings` | 拡張紐付け + 既定送り先 | **同乗**(standing opt-in 契約 #806 — 消えてはならない度が最も高い) |
| `pkc2.imageOptimize.preference.*` | 画像最適化の記憶選択 | **同乗** |
| `pkc2.debug` / `pkc2.debug-contents` / `pkc2.split-sync-debug` | デバッグ | **除外**(デバッグ設定を container に載せて他環境へ持ち出さない) |
| `pkc2.storageBackend` | ストレージバックエンド選択 | **除外**(container を読む**前**に必要な bootstrap 設定は container に置けない。FSA 再接続バナーが代替導線) |
| `pkc2.windowLayout` | 子 window geometry | **除外**(端末固有、multi-window spec §4.2 の明示判断を維持) |
| `pkc2.last-known-version` | 更新検知(Last-Modified) | **除外**(配信 URL 固有。消えても更新 toast が 1 回出ないだけの無害値) |

### 機構(facade 案)

`src/adapter/platform/ui-prefs.ts`(新規)に一本化:

- **読み**: バッグ優先 → localStorage fallback。fallback で読めた managed key は
  その場でバッグへ採用(**lazy 移行** — 既存ユーザーは明示移行なしで載る)
- **書き**: バッグ + localStorage の write-through。debounce(~800ms)で
  `SET_UI_PREFS` を 1 dispatch → reducer が `__settings__` へ merge →
  `SETTINGS_CHANGED` → 通常の persistence 経路(revision は作らない —
  既存 settings と同じ扱い)
- **localStorage は「セッション内ミラー」に格下げ**: boot
  (SYS_INIT_COMPLETE dispatch **前** — 初回 render / タブ復元より先)に
  バッグ → localStorage を seed。localStorage を直読みする既存 reader
  (子 window の inline JS 等)は**無変更で正しく動く**。子 window の直書きは
  `storage` event で親が回収してバッグへ
- **未 init は完全 passthrough**(= 従来どおり localStorage のみ)。readonly
  viewer は dispatch せずミラーのみ = 従来挙動。既存テストは無修正で通る想定
- バッグは有界(key 数 / key・value 長の上限)、additive field なので
  旧ビルドの parse は無視するだけ(データ互換は壊れない)

### トレードオフ(レビュー観点)

1. **export 物に UI prefs が同乗する**: 配布した HTML / ZIP に自分のタブ構成・
   既読状態・列幅等が入る。本文情報は含まないが、「配布時に prefs を strip する
   export オプション」を後続で足す余地あり
2. **旧ビルドとの往復で uiPrefs が落ちる**: 旧ビルドで設定変更・保存すると
   serialize が uiPrefs を知らないため落ちる(データは無傷、prefs が既定に
   戻るだけ)
3. **prefs が container 単位になる**: 複数 container を使う場合、prefs は
   container ごと(同一ブラウザ内は localStorage ミラーが橋渡し)。folder-prefs
   等「viewer-local を意図した過去判断」の一部変更になる — C11 要望を優先
4. readonly viewer は構造上 container に書けないため従来どおり(localStorage
   のみ、初期化環境では viewer の既読等は毎回リセット — 許容)

### 検証計画

facade / reducer 単体 + **「localStorage 全消去 → container のみから復元」の
E2E** + 全既存 suite の無修正 pass(passthrough 後方互換の証明)。実装 PR は
STARTUP_NOTICES 掲載(user-facing 変更)。

## 5. 課題 ↔ 解決の対応

| 課題 | 解決 | 根拠(研究ログ) |
|---|---|---|
| C1 メモリ総量比例 | asset = Blob + ObjectURL(ヒープ外)、meta のみ常駐、本文 LRU | A.1: Blob 読出ヒープ ±0 |
| C2 boot 総量比例 | meta 単一小レコード 1 read + 残りは需要読み | A.1: cold 16ms、A.6 |
| C3 ディスク I/O | セグメントログ(パック + ストリーミング圧縮)+ Blob 直書き(base64 変換消滅) | A.7: 実書込 1/4.9 |
| C4 syscall 渋滞 | 読みパス = ObjectURL(ゼロ)/ IDB Blob(最少 97)。書きパス = セグメント集約で record 数削減 | A.9 |
| C5 FS 両立 | **FS は sink 専用**(封印パック + manifest、少数・大・不変)。作業系は FS に到達不能。フォルダには常に完全な復元可能物が置かれ続ける | A.1/A.9 の C 構成 + user 決定 |
| C6 履歴成長 | revision はセグメントログ + グループ圧縮(587×)+ 保持ポリシー。メモリ像から完全分離 | A.3/A.7 |
| C7 即応性 | §4 キャッシング(pin + プリウォーム + ObjectURL) | A.9: 読みパス syscall ゼロ化 |
| C8 整合性 | 要所 `durability:'strict'` / Web Locks writer リース / versionchange 対応 / export 断面バリア / persist() + Storage Buckets | A.8 |
| C9 移行安全 | M1 = **移行直前に ZIP 自動バックアップを強制生成**(完了確認まで移行しない)、resumable chunk 移行、旧形式 read は import として恒久維持 | 今回の教訓 |
| C10 可搬性 | 単一 HTML export / import は現行契約のまま(streaming Blob 実装済 #960/#962/#966)。L2 の一形式として位置づけ | 二層戦略 |
| C11 ブラウザストレージ死亡環境 | §4.5: ファイル完結モード(作業系 = メモリのみ、永続 = ファイル sink のみ)を**明示フォールバック掲示**つきで一級化。単一 HTML / ZIP は互換保証・マイグレーション提供。§4.6: UI prefs のデータ同乗(前提部品) | user 裁定 2026-07-22、**設計のみ・実装 go 待ち** |

**不採用の記録**(理由込み):
- SQLite WASM(bytes が WASM ヒープ経由 + 読みパス syscall 60 倍。ただし
  sqlite-vec 意味検索等「機能」動機が出た時の拡張点として保存 — 研究ログ A.5)
- FSA を作業ストアにする「FSA 直モード」(per-file 経路が作業系に混入する。
  sink 専用に限定 — user 裁定 2026-07-22)
- 4MB/8MB 閾値(止血。§4 完成時に撤去 = DoD)

## 6. データレイアウト

**L1(IDB、DB version 3)**:

```
workspaces   ws_id → {name, containerIds, activeContainerId, …}
containers   cid → ContainerMeta + EntryMeta[](単一小レコード。1 万件でも数 MB)
segments     [cid, plane('body'|'rev'), seq] → Blob(gzip/zstd 圧縮済みパック)
seg_index    [cid, plane] → {lid|rid → {seq, offset}}(小、メモリ常駐)
assets       [cid, key] → Blob
asset_meta   [cid, key] → {mime, size, hash, name, pinned?}
```

**L2(FSA フォルダミラー)**:

```
📁 backup/
  manifest.json          ← 世代・checksum・パック一覧(これだけ上書き、temp→rename)
  packs/pack-000123.pkc  ← 封印済み(不変・追記のみ増える)。中身 = セグメント+asset 群
  ※ 少数・大・不変 — rsync / クラウド同期 / AV に優しい形だけを置く
```

## 7. 移行とフェーズ

- 移行 M0-M3(並行実装 → **ZIP 強制バックアップゲート** → resumable chunk 移行 →
  収束)は研究ログ §7 のとおり。versionchange の blocked 対応を M2 に含める
- フェーズ再編(実施済み分を反映):
  - ✅ P0: Backup ZIP 導線格上げ(#969)
  - ✅ P1 slice 1: store の Blob 受け入れ + 両読み(#970)
  - **P1 slice 2**: asset registry + ObjectURL 描画 + §4 キャッシュ(pin/プリウォーム)
  - **P2**: meta 単一レコード + セグメントログ + 移行 M0-M3 + 閾値撤去(DoD)
  - **P3**: ワークスペースのツリー第一級化 + L2 フォルダミラー
- 各フェーズの DoD: visual parity test + 数百 MB 実データ seed の実機 smoke +
  実ディスク/syscall ベンチの回帰(ハーネスは収録済み)

---
*関連: [`storage-v3-redesign-2026-07.md`](./storage-v3-redesign-2026-07.md)(研究ログ・全実測)/
[`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)(方針正本)/
issue #967(トラッカー)*
