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
*参照: [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)(方針正本)/
[`opfs-storage-adapter-design-2026-06.md`](./opfs-storage-adapter-design-2026-06.md)(fs seam)/
[`refinement-research-2026-07.md`](./refinement-research-2026-07.md)(I/O 棚卸し)/
issues #956 #958 #960 #962 #964 #966(発端の障害群)*
