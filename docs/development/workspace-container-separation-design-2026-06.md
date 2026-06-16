# Workspace 概念 + Container 化の分離 設計

> **状態: ✅ 実装済み(2026-06-16、PR #847 / #848 / #851 / #852 / #853)**。container 層 ⇄ workspace 層 分離を実装(workspace レコード + active ポインタ + 複数 workspace UI + `__default__`→default workspace 移行)。multi-window 結線(§4)のみ #4 凍結との整合待ちで未実装(受け皿のみ)。
> tracking issue: **#773**(`lane:arch-v3`)。
> 正本方針: [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §4 North Star。

## 実装メモ(2026-06-16 着地)

| PR | 内容 |
|---|---|
| #847 | `ContainerStore.listContainers()` + `setDefaultContainer()`(多 container 列挙 + active 切替 primitive)|
| #848 | Storage Profile「Containers」UI(一覧/切替/新規/削除)+ `availableContainers` state + boot 列挙(MVP)|
| #851 | workspace store CRUD(`workspace:<id>` 予約 key=設計 §3 option B、bucket 追加なし)+ `__active_workspace__` ポインタ |
| #852 | `workspace.ts` orchestration + boot で `ensureDefaultWorkspace`(§5 非破壊移行)+ container 切替/新規/削除を **active workspace 内**操作に |
| #853 | Storage Profile「Workspaces」UI(複数 workspace の作成/切替/命名)+ `workspaces`/`activeWorkspaceId` state。container 一覧は active workspace に scope |

**採った決定**: Q-WS-1 = (B) `containers` bucket 予約 key(seam/bucket 追加なし)/ アクティブポインタ = `__active_workspace__` + workspace 内 `activeContainerId`、`__default__` は active container と同期(boot の loadDefault 不変)/ Q-WS-5(multi-window 結線)= #4 凍結待ちで受け皿のみ(`windowAssignments` 未使用)。後方互換 = 既存単一 container を「Default」workspace に非破壊で包む。

---


## 0. 目的とスコープ

North Star: **「workspace 概念の導入」+「container 化の分離」**。container(可搬な単一アグリゲート)と workspace(複数 container を束ねる作業空間)を別レイヤに分け、roadmap 10-8(sandbox iframe workspace / multi-window controller)を集約する。本書はレイヤ責務分離 + workspace 永続化 + 移行方針を先行設計する。**実装はしない。**

参照実コード:
- container model: [`src/core/model/container.ts`](../../src/core/model/container.ts)(`Container` / `ContainerMeta.container_id`)
- 永続 facade: [`src/adapter/platform/idb-store.ts`](../../src/adapter/platform/idb-store.ts)(`ContainerStore`: `save` / `load(cid)` / `loadDefault` / `del`)
- storage seam: [`storage-adapter.ts`](../../src/adapter/platform/storage/storage-adapter.ts)(`BucketName = 'containers' | 'assets'`)
- 関連: OPFS backend は [`opfs-storage-adapter-design-2026-06.md`](./opfs-storage-adapter-design-2026-06.md)(#771)

## 1. 現状(設計に効く事実)

- **container は既に複数 storable**。`save(container)` は `containers` bucket に `key = container_id` で格納し、`load(cid)` で任意 container を読める。asset は `assets` bucket に `key = ${cid}:${assetKey}`。
- ただし **アクティブは単一**。`save` は毎回 `__default__`(`DEFAULT_KEY`)を当該 container に向け、boot は `loadDefault()` で**その 1 つだけ**を読む。= **暗黙の「単一アクティブ container」モデル**で、複数 container を束ねて管理する層が**存在しない**。
- `BucketName` は `'containers' | 'assets'` 固定。seam doc に「新 bucket 追加は全 adapter 実装 + IDB 移行計画が要る」と明記済み。
- workspace という語は UI(tab-strip の "View tab"、pgc-87)に断片的に出るが、**永続モデルとしての workspace は無い**。

→ つまり「container 化の分離」は**ゼロから作る**のではなく、**既に分かれている container 層の上に、束ねる workspace 層を薄く乗せる**話。

## 2. レイヤ責務分離

```
┌─────────────────────────────────────────────┐
│ Workspace 層(新規・runtime/orchestration)     │  ← 複数 container を束ねる作業空間
│  - workspace = { id, name, containerIds[],     │     アクティブ container の選択
│                  activeContainerId, windows? } │     window への container 割当(multi-window)
│  - 永続: storage seam 上(§3)                  │     **container を所有しない・参照(id)するだけ**
└───────────────────────┬─────────────────────┘
                        │ 参照(container_id)
┌───────────────────────▼─────────────────────┐
│ Container 層(既存・不変・source of truth)      │  ← invariant 4 維持
│  - Container = entries/relations/revisions/    │     可搬な単一アグリゲート(HTML/ZIP export 単位)
│    assets(`container.ts`、SCHEMA_VERSION 1)    │     workspace を一切知らない(下位は上位に依存しない)
└─────────────────────────────────────────────┘
```

**原則**:
- **container は workspace を知らない**(依存方向 = workspace → container の一方向)。container は今までどおり単独で export/import/rehydrate できる可搬単位のまま(invariant 4/5 死守)。
- **workspace は container を「所有」せず「参照」する**(`containerIds: string[]` で container_id を持つだけ)。同一 container が複数 workspace から参照されてもよい(将来)。
- workspace は **runtime/orchestration 関心**(どれをアクティブに、どの window に出すか)。永続はするが、container の data 不変条件には踏み込まない。

## 3. Workspace スキーマ + 永続化

### スキーマ(案)
```ts
interface Workspace {
  id: string;
  name: string;
  containerIds: string[];          // 参照のみ(所有しない)
  activeContainerId: string | null;
  // multi-window(#4 凍結中)との接続点。実装は別 go。
  windowAssignments?: { windowId: string; containerId: string }[];
  created_at: string; updated_at: string;
}
```

### 永続(storage seam 上)
2 案:
- **(A) 新 bucket `'workspaces'`**: `BucketName` を `'containers' | 'assets' | 'workspaces'` に拡張。clean だが seam 変更 = 全 adapter(idb/memory/opfs)実装 + IDB の `upgradeneeded` で object store 追加 + 移行が必要(seam doc の警告どおり)。
- **(B) `containers` bucket の予約 key 名前空間**: `workspace:<id>` の key で workspace レコードを同居。seam 不変(bucket 追加なし)、ただし `getAllByPrefix('workspace:')` 等で混在を捌く。
- **推奨**: まず **(B)**(seam を増やさない = OPFS/idb/memory 三者同時改修を回避、北極星の「コア薄く」と整合)。需要が育てば (A) に昇格。**Q-WS-1**。

### アクティブポインタの再設計
現 `__default__`(単一グローバル active container)を 2 段に:
- `__active_workspace__` → active workspace id
- workspace レコード内 `activeContainerId` → そのワークスペースの active container
- 後方互換: `__default__` が指す container を **default workspace の唯一メンバ**として読み替え(§5)。

## 4. multi-window controller との関係(整合のみ、実装は凍結)

- v3 提案 #4 マルチウィンドウは凍結中だが、workspace の `windowAssignments` がその受け皿。**window orchestration 層と container data 層は直交**(OPFS 設計や canvas 化と同じ doctrine)。
- 各 window は「workspace 内のどの container を表示するか」を持つ。main は navigation/active 切替、子 window は割り当てられた container を描画 — という将来像と矛盾しない設計に留める(具体実装は #773 とは別 go)。
- roadmap 10-8(sandbox iframe workspace controller)はこの層に属する。

## 5. 後方互換 / 移行

- 既存ユーザーは `__default__` が指す **単一 container** を持つ。移行 = その container を **メンバ 1 個の "default workspace" に包む**(非破壊):
  - 初回起動時、`__active_workspace__` が無ければ default workspace を生成し `containerIds=[<__default__ が指す cid>]`、`activeContainerId` を同 cid に。
  - `__default__` は当面残す(読み取りフォールバック)。破棄は別判断(**Q-WS-2**)。
- container データ自体は**一切変えない**(invariant 5)。workspace レコードを足すだけ。
- export/import/rehydrate は **container 単位のまま**(workspace を export 単位にしない。可搬性は container が持つ)。workspace の export 概念を作るかは将来論点(**Q-WS-3**)。

## 6. 決定が要る論点(着手 go の前提)

| # | 論点 | 推奨 |
|---|---|---|
| Q-WS-1 | workspace 永続先 | (B) `containers` bucket の予約 key(seam を増やさない)。需要で (A) 新 bucket に昇格 |
| Q-WS-2 | `__default__` 破棄時期 | 移行後 N wave 残置 → GC。完全破棄は別判断 |
| Q-WS-3 | workspace の export 単位化 | 当面しない(可搬単位は container)。需要が立てば設計 |
| Q-WS-4 | 同一 container の複数 workspace 参照 | 許容(参照モデル)。削除時の参照カウント方針は実装時に決める |
| Q-WS-5 | multi-window との結線時期 | #4 凍結解除と連動(本設計は受け皿のみ) |

## 7. 不変条件(実装時も死守)

- **invariant 4(Container = source of truth)維持**: workspace は runtime orchestration、container data の正本性に踏み込まない。
- **依存は workspace → container の一方向**(container は workspace を import しない。core は無依存のまま)。
- **invariant 5(後方互換)**: 既存単一 container データを非破壊で default workspace に包む。
- **storage seam を不必要に増やさない**(推奨 (B))。増やす場合 (A) は全 adapter + IDB migration を伴う(OPFS 設計 #771 と歩調)。
- 新 archetype / 新 markdown 方言 / 新 UI mode は追加しない(本件は永続 orchestration 層の追加で、編集体験の新機能ではない)。

## 参照

- [`src/core/model/container.ts`](../../src/core/model/container.ts) / [`idb-store.ts`](../../src/adapter/platform/idb-store.ts)(`__default__` / save・loadDefault)
- [`storage-adapter.ts`](../../src/adapter/platform/storage/storage-adapter.ts)(`BucketName` 拡張点)
- [`opfs-storage-adapter-design-2026-06.md`](./opfs-storage-adapter-design-2026-06.md)(#771、同 North Star の storage backend)
- [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §4 North Star
- tracking issue: #773 / Epic #764 / roadmap 10-8(#776 凍結台帳)
