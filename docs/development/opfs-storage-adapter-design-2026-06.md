# OPFS Storage Adapter 設計(`opfs-adapter.ts`)

> **状態: 📐 設計のみ・実装は凍結**(2026-06、North Star L3 / プライム・ディレクティブ「実装は go まで凍結」)。
> tracking issue: **#771**(`lane:arch-v3` / `type:design`)。本書は実装を伴わない。着手は user の明示 go が前提。
> 正本方針: [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §4 North Star。

## 0. 目的とスコープ

North Star: **「OPFS をコアに、idb はブラウザ専用レガシーモード」**。`storage-adapter.ts` は既に `opfs-adapter.ts — future, not yet present` を seam として予約済み。本書は OPFS 実装を `StorageAdapter` seam に差し込む設計(I/F 充足表 + feature detection/フォールバック + 既存 IDB データ移行)を先行記録する。**実装はしない。**

参照実コード:
- seam: [`src/adapter/platform/storage/storage-adapter.ts`](../../src/adapter/platform/storage/storage-adapter.ts)(`StorageAdapter` / `StorageBucket` / `BatchOp` / `BucketName`)
- 既存実装: `idb-adapter.ts` / `memory-adapter.ts`
- facade: `idb-store.ts` の `createContainerStore(adapter)`(adapter 非依存)+ `createIDBStore()` / `createMemoryStore()`
- 選択点: `main.ts:569` の `const store = createIDBStore();`(現状 IDB ハードコード)+ `probeIDBAvailability()`

## 1. OPFS の前提(設計に効く制約)

- ルートは `await navigator.storage.getDirectory()` → `FileSystemDirectoryHandle`(**非同期**)。
- **secure context 必須**。`https:` / `localhost` では使えるが、**`file://` では基本使えない**。PKC2 の看板ユースケース「単一 HTML を USB / メール添付で開く(`file://`)」では **OPFS が無効になりうる** → IDB / memory フォールバックは「レガシー」ではなく**必須の現役経路**。North Star の「idb はレガシー」は *secure-context 配備時の優先順位* の意味に限定して解釈する(§3 で明示)。
- **トランザクション無し**。複数ファイル跨ぎの atomic 更新は原理的に不可 → `applyBatch` は best-effort(seam の doc 済み契約どおり)。
- ディレクトリ走査は `dirHandle.entries()`(async iterator)。

## 2. StorageAdapter I/F 充足表(OPFS 写像)

bucket = サブディレクトリ(`containers/` / `assets/`)、key = ファイル名、値 = ファイル内容。

| seam method | OPFS 実装 | 備考 |
|---|---|---|
| `bucket(name)` | ルート直下の `getDirectoryHandle(name, {create:true})` を返す薄い wrapper | name は `'containers'` / `'assets'`(§1 BucketName)|
| `get(key)` | `getFileHandle(enc(key))` → `getFile()` → `text()` → deserialize。`NotFoundError` は `undefined` | containers=JSON.parse / assets=base64 文字列そのまま |
| `put(key,value)` | `getFileHandle(enc(key),{create:true})` → `createWritable()` → `write(serialize(value))` → `close()` | §4 で write-temp-then-rename 検討 |
| `delete(key)` | `dir.removeEntry(enc(key))`、`NotFoundError` は no-op | |
| `getAllByPrefix(prefix)` | `entries()` を走査し `dec(name).startsWith(prefix)` を満たすものを read。**key 昇順 sort**(IDB cursor 順と一致) | 1 走査で (key,value) を揃える(seam の「1 round-trip」契約)|
| `getKeysByPrefix(prefix)` | `entries()` の **name のみ**を集めて filter + sort(ファイル read しない) | save 時 diff-delete 用の軽量経路 |
| `applyBatch(ops)` | **sequential best-effort**(delete → put 順 or 入力順)。トランザクション無し | §4 整合性 |
| `clear()` | `entries()` 走査で各 `removeEntry`、または subdir ごと削除 + 再作成 | |
| `close()`(adapter) | OPFS handle は明示 close 不要 → cache した handle を破棄するだけ | IDB の connection close と非対称 |

### key のファイル名エンコード(設計点)
assets の key は `${cid}:${assetKey}`(`:` 含む)。OS / FS によって `:` 等が不正。**`enc`/`dec` の安全スキーム**を定める(候補: `encodeURIComponent` ベース、または `cid` でサブディレクトリを切る二段構成 `assets/<cid>/<assetKey>`)。`getAllByPrefix(prefix)` の prefix セマンティクスと両立する方式を選ぶ(prefix が `cid:` 境界で効くこと)。**Q-OPFS-1**。

### 値のシリアライズ(設計点)
IDB は structured clone で `unknown` をそのまま格納。OPFS はファイル = テキスト/バイト → **明示シリアライズ**が要る。containers=JSON、assets=base64 文字列(現モデルのまま、テキストファイルで可)。将来 asset を生バイト保存するなら別途(現状は base64 文字列で seam を満たす)。**Q-OPFS-2**。

## 3. feature detection + フォールバック

現 `main.ts:569` の `createIDBStore()` ハードコードを、**優先順位付き chooser** に置換(新規 `createBestStore()` 等、`idb-store.ts` に追加):

```
OPFS 利用可(secure context + navigator.storage.getDirectory 実在 + probe 成功)
  → createContainerStore(await createOPFSAdapter())
else IDB 利用可(probeIDBAvailability)
  → createIDBStore()
else
  → createMemoryStore()（揮発、警告 banner）
```

- **非同期化**: OPFS の `getDirectory()` は async → store factory が async になる。現 `createIDBStore()` は同期。**(a) async store factory にして boot で await** / **(b) handle を遅延 init(初回 op で getDirectory)して factory は同期維持** の選択。`main.ts` boot はすでに async 文脈なので (a) が素直。**Q-OPFS-3**。
- **probe**: `probeIDBAvailability()` と対の `probeOPFSAvailability()` を追加(secure context 判定 + getDirectory 試行 + 1 ファイル read/write/delete の smoke)。fail-closed: probe 失敗時は OPFS を選ばない。
- **`file://` 配備**: §1 のとおり OPFS 不可が普通 → 自動で IDB に落ちる。これが「USB の単一 HTML」を壊さない保証。idb-availability.md の警告経路と統合する。

## 4. applyBatch / 整合性(トランザクション無し)

OPFS にトランザクションが無いため `applyBatch` は **best-effort sequential**(seam の契約)。クラッシュ時の部分適用リスクへの設計方針:

- **per-file atomicity**: `put` を「temp ファイルへ write → `move`/rename で確定」にすると単一ファイルは atomic。複数ファイル跨ぎは依然非 atomic。**Q-OPFS-4**。
- **適用順**: save の意味論(新 entry put → 旧 orphan delete)に合わせ、**delete を put の後**に回すと「中断しても旧データが残る(消えるより安全)」側に倒せる。
- **冪等性**: 再 save で収束する設計(ContainerStore.save は全量 diff ベース)なので、中断後の再 save が自己修復になる。これを移行/障害時の前提として明記。

## 5. 既存 IDB データとの移行 / 共存

既存ユーザーのデータは IDB にある。OPFS を優先にすると IDB データが孤立する。

- **一回限り移行**: OPFS 初期化時、OPFS が空 かつ IDB にデータあり なら **IDB → OPFS にコピー**(`containers` / `assets` 全 key)。完了フラグ(OPFS 側に `__migrated_from_idb__` sentinel)で冪等化。中断時は再実行で収束(§4 冪等性)。
- **`__default__` ポインタ**: default container を指す key(`containers` bucket 内)。両 store とも単なる key として扱うため移行も透過。
- **ロールバック**: 移行は **コピー(非破壊)**。IDB データは消さず残す(min N wave 残置 → 後で GC)。OPFS 側に問題が出たら IDB に戻せる。
- **共存方針**: 移行後の正本は OPFS。IDB は読み取りフォールバック(secure context を失った/別ブラウザ)用に当面残す。**Q-OPFS-5**(IDB を最終的に破棄するタイミング)。

## 6. 決定が要る論点(着手 go の前提)

| # | 論点 | 候補 / 推奨 |
|---|---|---|
| Q-OPFS-1 | key→ファイル名エンコード | `encodeURIComponent` / `cid` サブディレクトリ二段。prefix セマンティクス両立を優先 |
| Q-OPFS-2 | 値シリアライズ | containers=JSON / assets=base64 テキスト(現モデル踏襲)|
| Q-OPFS-3 | store factory の非同期化 | (a) async factory + boot await(推奨)/ (b) 遅延 init で同期維持 |
| Q-OPFS-4 | per-file atomicity | temp→rename を採るか、best-effort のままにするか |
| Q-OPFS-5 | IDB 破棄時期 | 移行後 N wave 残置 → GC。完全破棄は別判断 |
| Q-OPFS-6 | `file://` 方針 | OPFS 不可時 IDB 自動フォールバックで看板ユースケース維持(必須) |

## 7. 不変条件(実装時も死守)

- **ContainerStore surface 不変**(facade は adapter 非依存、seam の存在意義)。`createContainerStore(adapter)` をそのまま使う。
- **seam(`StorageAdapter`/`StorageBucket`)を拡張しない**(OPFS のために method を増やさない。streaming/cursor は seam doc どおり「具体ニーズが立つまで入れない」)。
- **後方互換**(invariant 5): 既存 IDB データを壊さない(非破壊移行)。
- 新 archetype / 新 UI / 新方言は追加しない(本件はストレージ backend の差し替えのみ)。

## 参照

- [`src/adapter/platform/storage/storage-adapter.ts`](../../src/adapter/platform/storage/storage-adapter.ts)(seam)
- [`idb-availability.md`](./idb-availability.md)(IDB 可用性 probe + 警告経路、OPFS probe/フォールバックはこれと統合)
- [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §4 North Star
- tracking issue: #771 / Epic #764
- 関連設計(同 North Star): [`pkc-extensions-host-design-2026-06.md`](./pkc-extensions-host-design-2026-06.md) / workspace 分離(#773、別 doc)
