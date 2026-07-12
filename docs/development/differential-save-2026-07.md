# 差分保存(differential save)— split 形式 v1(2026-07)

> 改善バッチ④(user 承認 2026-07-12「推奨順で全部」)。ベンチ
> `storage-backend-benchmark-2026-07.md` §4 の拡張余地「差分保存(現行は
> container 丸ごと 1 record が保存単位)」の実装。

## 1. 問題

自動保存(`persistence.ts` → `ContainerStore.save()`)は編集のたびに
container 全体を 1 record として書き直す。コストは entries 数に線形:
5000 entries で IDB 17ms / OPFS 62ms(ベンチ §1a「1 entry 編集→再保存」)。
体感は損ねないが、スケールの天井が保存コストで決まる構造だった。

## 2. 設計

### 保存形式(split 形式)

containers bucket 内の reserved key prefix で分割する(bucket 追加なし =
adapter 層の変更不要。`workspace:` / `__assetmeta__:` と同じ流儀):

| key | value |
|---|---|
| `<cid>` | core record: `{ meta, relations, entries: [], revisions: [], __pkc_split__: { entryOrder, revOrder } }` |
| `__entry__:<cid>:<lid>` | Entry(1 record / entry) |
| `__rev__:<cid>:<revId>` | Revision(1 record / revision) |

- **順序リスト**(`entryOrder` / `revOrder`)が配列順の正本。per-key record は
  辞書順でしか列挙できないため、`container.entries` の配列順を忠実に復元する
  にはリストが必要。リストに無い stray record は load 時に末尾へ付ける
  (全件書込みの中断残り。消すより安全側)。
- **relations は core record に残す**。構造が小さく(~150B/件)、変更頻度も
  entry body より低い。core record は毎回書くが、entries/revisions を抜いた
  サイズなので差分保存の利得は保たれる。
- assets は従来どおり assets bucket・**additive-only**(段階2 #868 の制約は
  そのまま)。

### 差分の計算

`ContainerStore.saveDiff(container, previous)`。reducer は immutable update
(未変更 entry / revision はオブジェクト参照を保つ)なので、**参照比較**で
変更集合が O(n) の Map 突き合わせだけで出る。ハッシュ・タイムスタンプ比較は
不要。参照が全部変わる最悪ケースでも「全件書く」に退化するだけで正しさは
変わらない。

ベース(`previous`)は persistence 層が持つ「前回 saveDiff が resolve した
時点の container 参照」。保存成功時のみ更新し、legacy `save()` が走ったら
破棄(inline へ書いた時点で split ベースは無効)。

### 双方向の自己回復(flag 切替・混在安全)

- `saveDiff` は storage 上の record に `__pkc_split__` marker が無ければ
  `previous` を無視して**全件書込み**から始める(セッション初回のみ record を
  1 get して判定、以後 memo)。→ caller が stale なベースを渡しても欠損しない。
- legacy `save()` は inline record を書いた**後**に stale な split keys を
  掃除する。→ どの時点で中断しても inline record が完全。
- 書込み順は puts → core record → deletes の 1 バッチ(IDB は単一 tx =
  原子的。FS 系は逐次 best-effort だが、どこで中断しても次回保存で収束)。

### 有効化

`persistence.differential_save` flag(**opt-in・既定 OFF**、category: perf)。
ON で自動保存(debounce / pagehide flush とも)が saveDiff 経路に乗る。
import・backend 切替コピー等の直接 `save()` 呼び出しは従来どおり inline
形式(混在しても上記の自己回復で安全)。

**既定 OFF の理由 = 旧ビルド互換(Invariant 5)**:split 形式で保存された
storage を、この形式を知らない旧ビルドで開くと entries が空に見える
(データは残っており、新ビルドで開けば戻る)。旧ビルドへ戻す前に flag を
OFF にして一度保存するか、export しておくこと。flag 説明にも明記済み。

## 3. 副次改善

- **fs-directory-adapter の `getAllByPrefix` を並列読み**(concurrency 16、
  serialize チェーン内側)。読取りは writable lock を取らないため安全。
  split 形式では per-entry file が数千件になるので、逐次 open→read のままだと
  OPFS/FSA の boot が線形に伸びる — その緩和。
- **`listContainers` を keys-scan → 対象 get に変更**。従来の
  `getAllByPrefix('')` は split 形式だと per-entry record の値まで全部読んで
  しまう(switcher を開くだけで boot 相当のコスト)。

## 4. 使い分け・留意点

- **IDB(既定 backend)で最も効く**。OPFS/FSA でも動くが、boot の読取りが
  1 file → N files になる(並列化で緩和済み、大規模 container では留意)。
  FS 系での chunk 化(k entries / file)は必要が立ったときの拡張余地。
- 初回 ON 後の最初の自動保存は全件書込み(split への移行)。以後は差分。
- boot 直後の最初の保存もベース未確立のため全件(セッション 1 回だけ)。

## 5. テスト

- `tests/adapter/idb-store-differential.test.ts` — store レベル:差分書込みの
  key 単位 assert(計数プロキシ)、順序復元の忠実性、inline ⇄ split 双方向
  移行、stale ベース自己回復、delete/listContainers/additive-only assets。
- `tests/adapter/persistence-differential.test.ts` — 統合:flag ON/OFF の
  経路選択、ベース受け渡し、セッション中 flag 切替、flushPending 経路。
