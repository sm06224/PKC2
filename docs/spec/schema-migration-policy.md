# Schema Migration Policy

**Status**: canonical spec（自主運転モード第 3 号 / 2026-04-15 策定、docs-only）。
**Positioning**: `docs/spec/` 配下の正本仕様。`data-model.md §15` を**補完**するものであり、`§15.1`（additive only）と `§15.3`（schema_version 昇格ルール）の具体化を担う。
**Scope**: `Container.meta.schema_version` を将来 `1` から `2` 以降に上げる際の
判断基準・hook 箇所・test 戦略を **実装可能な設計** として固める。実装そのもの
は含まない（現時点では依然 `SCHEMA_VERSION = 1` 固定）。

---

## 1. 概要

PKC2 v0.1.0 時点の schema_version は `1` 固定であり、`data-model.md §15.3` は
昇格機構を「**現状未設計**」と明記している。本書はその「未設計」を解消し、
次のいずれかの事態が発生した時に **即座に着手可能な設計契約** を提供する:

- 既存フィールドの **型変更・削除・改名** を要する P2 機能（C-1〜C-7 等）
- `ArchetypeId` / `RelationKind` の既存値 **semantics 変更**
- ZIP `manifest.format` / `version` の破壊的変更
- IDB v2 → v3 の追加（例: revision 専用 store の切り出し）

本書は **migration 思想ではなく、次に実装可能な設計** として書く。production
code は依然 1 行も触っていない。

## 2. 用語定義

| 用語 | 定義 |
|-----|-----|
| **schema_version** | `ContainerMeta.schema_version: number`。現行 `1`。`src/runtime/release-meta.ts:91` の `SCHEMA_VERSION` 定数がソース側の正本 |
| **additive change** | optional field / 新 enum 値 / 新 archetype の追加など、旧 reader が未知として無視しても container の整合が保たれる変更 |
| **breaking change** | 既存フィールド削除・改名・型変更・既存値 semantics 変更など、旧 reader で誤動作しうる変更 |
| **lazy migration** | read では legacy を受理し、**次回 save のタイミングで new format に書き戻す**。旧ファイルを破壊せず、徐々に移行 |
| **eager migration** | read 時点で即座に new format に正規化する。`onupgradeneeded` 相当 |
| **forward compatibility** | **旧 reader が新 writer の出力を壊さず読める** こと。additive のみなら保証 |
| **backward compatibility** | **新 reader が旧 writer の出力を壊さず読める** こと。migration で保証 |

## 3. 基本原則（再掲 + 精緻化）

`data-model.md §15.1` の 4 原則を本書でも前提として再掲する。そのうえで
schema_version 昇格時の追加契約を 3 つ加える。

### 3.1 既存原則（§15.1）

1. **Additive only**: 新フィールドは必ず optional
2. **Never remove / rename**: schema_version bump なしに既存フィールドの削除・改名禁止
3. **Unknown fields are ignored**: 未知フィールドは reader 側で破棄
4. **Legacy formats auto-migrate on next save**: lazy migration 既定

### 3.2 追加契約（本書）

5. **Lazy is the default, eager is the exception**: 既存の 5 パターン（§15.2）
   は全て lazy。新しい migration も原則 lazy で書く。eager が必要なのは
   **旧形式のまま runtime code path を通すと invariant が破れる** ケースに
   限る（例: IDB スキーマ境界）。
6. **Migration は monotonic**: `migrateContainer(c, from=1, to=N)` は常に
   `from < to` 方向のみ。downgrade は提供しない（破壊的ロスが避けられない）。
   旧 version に戻したい user は **旧 HTML export を保持すること** で代替する。
7. **schema_version bump は単一版ずつ**: `v1 → v3` の直接 jump は書かない。
   `v1 → v2 → v3` のように **1 段階ずつ** migrate を走らせる。migration
   関数が composable であるための最小条件。

## 4. schema_version 昇格の判断基準

以下のフロー図で昇格可否を判定する:

```
変更内容
  │
  ├─ 新しい optional field?           → bump 不要（additive）
  ├─ 新しい archetype?                  → bump 不要（additive）
  ├─ 新しい Relation.kind?              → bump 不要（additive）
  ├─ 既存 optional field の追加値?      → bump 不要（additive、unknown token は drop）
  ├─ 既存 field を optional → required? → bump 必要（breaking）
  ├─ 既存 field の型変更?               → bump 必要（breaking）
  ├─ 既存 field の削除・改名?           → bump 必要（breaking）
  ├─ 既存 enum 値の削除・改名?          → bump 必要（breaking）
  ├─ 既存 enum 値の semantics 変更?     → bump 必要（breaking）
  └─ ZIP manifest.format / SLOT ID 改名? → bump 必要（breaking、かつ要特別議論）
```

**禁止リスト**: `data-model.md §15.4` は P0-P1 期間中の禁止事項を列挙しているが、
schema_version bump を伴う場合は **P2 以降で解除可能**。ただし bump 伴い migration
実装 + test 追加 + HANDOVER_FINAL §18.x に正式記録が条件。

## 5. Forward / Backward compatibility のポリシー

### 5.1 Forward compatibility（旧 reader + 新 writer）

**保証する範囲**:

- `schema_version = N+1` の additive 変更は、`schema_version = N` の reader が
  **unknown field を drop して読む** ことで**部分的に動作** する
- ただし container 全体の `schema_version` は `N+1` のままなので、現在の
  `importer.ts:115-119` は **`SCHEMA_MISMATCH` で reject** する

**結論**: PKC2 の forward compat は **同一 schema_version 内の additive 変更のみ**。
schema_version 自体が上がった時点で、旧 reader は **明示的に reject** する
（silent tolerant read は危険）。

### 5.2 Backward compatibility（新 reader + 旧 writer）

**保証する範囲**:

- `schema_version = N` の container を `schema_version = N+K` の reader が
  読むとき、reader は **段階的に migration を走らせて** new format に変換
- migration 済み結果は **runtime state として扱い**、次回 save で自動的に
  new format で書き戻す（lazy migration）
- これにより旧 HTML / ZIP / IDB データが resurrect 不能になる事態を防ぐ

**結論**: PKC2 の backward compat は **必須契約**。新 reader は `schema_version`
が runtime 未満の container も受理し、最新に引き上げる責務を持つ。

## 6. Lazy vs Eager の適用判定

| 観点 | Lazy （既定） | Eager （例外） |
|-----|--------------|----------------|
| 実装位置 | read 後の正規化 step、save 前の projection | load 時の必須変換、以降 new shape 前提 |
| 旧データの扱い | 破壊せず、保存契機で新形式に更新 | 最初の load で new shape に書き換え |
| コスト | 低（差分反映を後回し） | 高（load 時に全件走査） |
| 用途 | フィールド追加 / 補填 / 別表現への言い換え | store schema 境界（IDB version） / 読取不能な旧形式 |
| 既存例 | attachment data→asset_key、textlog log-id 据置、todo 文字列→JSON、revisions 補填 | IDB v1→v2（`onupgradeneeded` で containers store を scan） |

**判定ルール**:

- `Container` **JSON 構造内部**の migration は原則 **lazy**
- `IndexedDB` **store 構造**の migration は原則 **eager**（`onupgradeneeded`）
- 両方にまたがる場合（例: revision を別 store に分離）は **eager IDB migration + lazy JSON normalization** を組み合わせる

## 7. Migration hook 箇所

schema_version bump 時に migration を注入すべき **正本位置** を列挙する。
現時点では全て「migration は不要」の no-op として実装されるが、v2 到達時に
**ここだけ触れば済む** ように場所を固定する。

| # | 経路 | Entry point | 追加すべき migration 位置 |
|---|-----|-------------|-------------------------|
| 1 | **IDB load**（既存 workspace 起動） | `src/adapter/platform/idb-store.ts` の `load` / `loadDefault` | 戻り値 `container` を `migrateContainerToCurrent(c)` に通す |
| 2 | **IDB onupgradeneeded**（store schema 変更時） | `idb-store.ts:44` の `onupgradeneeded` | 既存 v1→v2 の隣に v2→v3 等を追加 |
| 3 | **HTML Full import** | `src/adapter/platform/importer.ts:115-122` の schema check | `SCHEMA_MISMATCH` return 前に `meta.schema < SCHEMA_VERSION` なら migrate して通過、`>` なら従来通り reject |
| 4 | **HTML Light import** | 同上（HTML Full と経路共有） | 同上 |
| 5 | **ZIP import**（Sister Bundle） | `src/adapter/platform/zip-package.ts` 経由で最終的に importer.ts を通る | 3 と同位置で自動対応 |
| 6 | **textlog-bundle import** | `src/features/bundle/*` の container 合成箇所 | bundle パーサは body を直接扱うため **container レベル migration 非該当**（body-formats 側の lazy migration で吸収） |
| 7 | **text-bundle import** | 同上 | 同上 |
| 8 | **Merge import**（Overlay MVP） | `src/features/import/merge-planner.ts:79` の schema check | `host.schema === SCHEMA_VERSION` 前提で、imported 側のみ migrate して merge に通す。両者が同 schema になってから Overlay を走らせる |
| 9 | **Export** | `src/adapter/platform/exporter.ts` + `src/main.ts:476` の schema_version 書込 | 常に `SCHEMA_VERSION`（= 現行最新）で書き出す。in-memory runtime が既に最新に正規化されているため自然と満たされる |
| 10 | **Transport profile**（postMessage） | `src/adapter/transport/profile.ts:59` | profile は **app_id + schema_version + caps** を宣言するのみ。migration は不要だが、**両端の schema_version が異なる場合の reject 判定ルール**を §9 で定義する |
| 11 | **Test fixtures / bulk snapshot** | `tests/core/*.ts` 全般 + `tests/core/app-state-bulk-snapshot.test.ts` | schema_version を **直書きせず** `SCHEMA_VERSION` 定数を import する形に漸次移行（現在は `1` 直書きが 60 箇所以上。bump 時に一括置換 or fixture helper 経由に寄せる） |

**Canonical entry point 候補**: `src/core/migrations/migrate-container.ts`（新規、P2 着手時に追加）
を **core 層に純関数として作る**。reason: core は browser API を持たないが、
純粋な JSON 変換は core に収まる。IDB / importer / merge-planner / transport の
4 経路が同一の migrator を呼ぶのが最も diff が小さい。

```ts
// 将来の signature（現段階では実装しない）
export function migrateContainerToCurrent(c: Container): Container {
  let cur = c;
  while (cur.meta.schema_version < SCHEMA_VERSION) {
    cur = STEP_MIGRATORS[cur.meta.schema_version](cur);
  }
  return cur;
}

const STEP_MIGRATORS: Record<number, (c: Container) => Container> = {
  // 1: (c) => migrateV1toV2(c),  // 追加時点で埋める
};
```

## 8. Merge import との整合

`merge-import-conflict-resolution.md §8.6` は「schema 不一致は MVP で reject」
と明記する。本書は **その方針を継続** しつつ、v2 以降で以下を許可する:

- `imported.schema_version < host.schema_version` の場合、merge-planner は
  **imported 側のみ migrate** してから overlay 処理に入る（host は既に
  最新前提、host < imported は禁止）
- `imported.schema_version > host.schema_version` の場合は **従来通り reject**。
  host を先に最新化する UI 導線（「save して再起動」を促す）を別途用意する
- どちらの分岐も `merge-planner.ts:79` の `schema_version !== schema_version`
  check を「`!==` → `imported > host` のみ reject」に緩和する形で実装する

この拡張は `merge-import-conflict-resolution.md §9`（将来拡張）の枠に収まる。

## 9. Transport profile（postMessage）との整合

`src/adapter/transport/profile.ts` は **両 window が schema_version を宣言**
する protocol を持つ。両端の schema_version が異なる場合の挙動を以下に固定:

| 状況 | 現行挙動 | 本書での決定 |
|-----|---------|-------------|
| 送信側 = 受信側 | 正常 | 変更なし |
| 送信側 `< ` 受信側 | 未定義 | 受信側で migrate してから処理（backward compat） |
| 送信側 `> ` 受信側 | 未定義 | **受信側が reject し、profile handshake を失敗扱い** にする（forward compat は明示 reject） |

実装タイミングは profile v2 の spec 追補時。本書はその契約位置のみ固定する。

## 10. Test 戦略の雛形

schema_version bump ごとに **以下の 4 系列** のテストを新規追加する:

### 10.1 Migration 単体（core）
- `tests/core/migrate-container.test.ts`（新規）
- 各 step migrator `migrateV1toV2` / `migrateV2toV3` ... を **pure function** として単体テスト
- 入力: version N の fixture container → 出力: version N+1 の期待 container

### 10.2 Chain migration
- `v1 → v3` の 2-step chain で composability が壊れないことを保証
- property test 的に「`migrateToCurrent(migrateToCurrent(c)) === migrateToCurrent(c)`」（冪等性）

### 10.3 Round-trip（adapter / 経路別）
- HTML Full / Light / ZIP / IDB の **4 経路**で「旧 version container を import → 最新 state → export → 再 import」が壊れない
- 既存の `tests/core/app-state-bulk-snapshot.test.ts` 形式を踏襲し、fixture version を param 化

### 10.4 Reject 契約
- `schema_version > SCHEMA_VERSION` の container は **import で必ず reject**
- reject する error code は現行 `SCHEMA_MISMATCH` を維持
- merge import では `imported > host` の reject を pin

### 10.5 Fixture helper
- `tests/helpers/make-container.ts` 等に `makeContainerV(n)` 相当の helper を
  作り、test 内の `schema_version: 1` 直書きを剥がしていく（bump 追従コストを最小化）

## 11. v2 が来たときの標準的な実装位置

将来 v2 への bump が発生したら、以下の順序で **最小差分** に実装する:

1. `src/runtime/release-meta.ts:91` の `SCHEMA_VERSION = 1` → `2` に変更
2. `src/core/migrations/migrate-container.ts`（新規）に `migrateV1toV2` と
   `migrateContainerToCurrent` を実装
3. `src/adapter/platform/importer.ts` の schema check 分岐を「`<` なら
   migrate して通過、`>` なら従来通り reject」に書き換え
4. `src/adapter/platform/idb-store.ts` の `load` / `loadDefault` で戻り値に
   `migrateContainerToCurrent` を通す（`onupgradeneeded` 側は store schema
   が変わる場合のみ v2→v3 追加）
5. `src/features/import/merge-planner.ts:79` の schema check を §8 どおり緩和
6. `src/adapter/platform/exporter.ts` は変更不要（常に最新で書く）
7. 既存 fixture 60 箇所の `schema_version: 1` を helper 経由に段階移行
8. HANDOVER_FINAL.md §18.x に「Tier X — schema v2 migration 実装」を追記
9. CHANGELOG に breaking change の user-facing 影響を明記

**逆に、この順序を逸脱して "複数経路で独自 migration を書く" のは禁止**。
migrator は core に 1 本だけ置き、経路側はそれを呼ぶだけに揃える。

## 12. 本書で意図的に扱わないこと（Intentionally NOT covered）

- **downgrade**: 最新 → 旧形式の逆変換は提供しない（§3.2 #6）
- **schema_version = 0 の実在性調査**: `data-model.md §16.5` で別途 pending
- **container_id 再採番との関係**: 本書は container_id を不変前提で書く
- **runtime feature flag による段階切替**: bump は atomic、flag 制御はしない
- **body-formats 内部の micro-version**: body は string 扱いで archetype ごと
  の契約に委譲。本書は container-level の JSON 構造のみ対象

## 13. 関連文書

- `docs/spec/data-model.md` §15 — 後方互換性と Migration 原則（本書の前提）
- `docs/spec/body-formats.md` §3.6.1 — textlog CSV flags の forward-compat 実例
- `docs/spec/merge-import-conflict-resolution.md` §8.6 / §9 — merge と schema の関係
- `docs/planning/HANDOVER_FINAL.md` §4.7 / §7.3 — additive 原則と migration path の位置づけ
- `src/runtime/release-meta.ts:91` — `SCHEMA_VERSION` 定数
- `src/adapter/platform/idb-store.ts` — `onupgradeneeded` の既存 v1→v2 実装
- `src/adapter/platform/importer.ts:115-167` — schema check + revisions 補填の precedent

## 14. 変更履歴

| 日付 | 変更 |
|------|-----|
| 2026-04-15 | 初版作成（自主運転モード第 3 号 / H-3 対応、docs-only）。`data-model.md §15.3` の「未設計」を解消し、次に v2 が来たときに着手可能な設計を固定 |
