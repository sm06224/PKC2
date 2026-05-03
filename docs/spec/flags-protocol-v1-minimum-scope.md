# Flags Protocol v1 — Minimum Scope

**Status**: minimum-scope draft(2026-05-03)、実装は別 PR(PR-β、本 spec の承認後着手)
**Pipeline position**: minimum scope
**Scope**: spec のみ、本書では実装しない
**Source direction**: 2026-05-03 user direction「Firefox / Chrome `about:flags` 風の動的フラグ機構を `__settings__` / `__about__` と同 system entry pattern で」
**Relates to**:
- `docs/development/const-discipline-2026-05.md`(audit + tier 分類 + 30 件移行計画、本 spec の上位)
- `docs/spec/system-settings-hidden-entry-v1-{behavior-contract,minimum-scope}.md`(本 spec の構造的祖先 = 流用 base)
- `docs/spec/about-build-info-hidden-entry-v1-{behavior-contract,minimum-scope}.md`(hidden entry pattern)
- `docs/development/debug-via-url-flag-protocol.md`(`?pkc-debug=<feature>` 既存 protocol、URL parameter pattern を参考)
- `docs/development/debug-privacy-philosophy.md`(Local-only / Privacy by default 原則を継承)

---

## 0. 問題の再定義

### 0-1. hard-code const の限界

`docs/development/const-discipline-2026-05.md` §3 に列挙した **20 件の Tier 0 const**(数値 / boolean / enum)は現状すべて hard-code、変更には rebuild + dist 再生成が必要。これは:

- **PoC / 実機 A/B 試験のサイクルが遅い**(値変更 → npm run build → reload → 評価、最低 30 秒)
- **ユーザーが値の存在を知らない**(power user が「もうちょっと debounce 短く」を試せない)
- **テスト多パターン coverage 困難**(parametric testing が build 介在で不可)

### 0-2. 永続化先の選定(`__settings__` と同 trade-off)

| 案 | 評価 |
|----|------|
| localStorage 単独 | container 移動で失われる、AGPL 単一 HTML 哲学と部分的不整合、PKC2 の canonical storage(IDB / 将来 OPFS)モデルに乗らない |
| IndexedDB(別キー) | Container と分離した二重管理 |
| **`__flags__` system entry**(本 spec 採用) | **export/import で持ち運べる**、self-describing container 哲学整合、`__settings__` / `__about__` の既存 pattern 完全流用 |
| URL `?pkc-flag=` のみ | per-session 揮発、永続化なし(単独では不十分、layer の 1 つとして併用) |

→ **採用**: `__flags__` system entry を **canonical 永続層** とし、URL を上位 ephemeral layer として併用(§3 Resolution order、3 layer 構成)。

**localStorage 不採用理由**(2026-05-03 user direction):
PKC2 の canonical configuration storage は IDB(現)/ OPFS(将来)を target、localStorage は `pane-prefs` / `saved-searches` 等の transient UI state でのみ使用、configuration values には使わない方針。flag 値は configuration values(runtime 挙動を変える)なので `__flags__` Container 経路を取る。「browser-wide flag preference」が真に必要になった場合は IDB 上の別 store を後付けできる設計余地を残す(YAGNI、v1 では持たない)。

### 0-3. 方向性

PKC2 の single-HTML / self-describing / self-configuring container 哲学に整合させ、**flag 値も Container 内に保持**(`__settings__` と同 idiom)。URL `?pkc-flag=` は debug / dev / share のための ephemeral layer として薄く併用。

---

## 1. Goal / Non-goal

### 1-1. v1 Goal

- `defineFlag(key, default, options?)` API を `src/runtime/flags.ts` に新設(本 spec の §2)
- 全 registered flag 値を `__flags__` system entry の body JSON に永続化(本 spec の §4)
- **3 layer** の resolution order(URL > Container > default)を確立(本 spec の §3)
- flags inspector overlay の最小実装(`?pkc-flag=*` で起動、shell-menu「⚑ Flags」からも到達可、shell-menu link は **常時可視**)
- hidden entry が trash / search 結果から非表示
- Tier 0 / 1 / 2 の読み書き許可を runtime gate で enforce
- v1 移行対象(PR-γ wave 1 で defineFlag 化する 5-7 件、§7)
- About entry に「Active flags 件数」表示(default から外れた flag 数、click で inspector 起動)
- Settings dialog 最下部に「Advanced ⚑ Open Flags…」 link(settings → flags の単方向参照)

### 1-2. v1 Non-goal

| 項目 | 理由 |
|------|------|
| 100+ flag を一度に移行 | 段階移行(PR-γ → PR-δ wave)、本 v1 は機構と最小 5-7 件まで |
| flag 値の sync(複数 device 間) | container export/import で間接的に同期可、自動 sync は scope 外 |
| flag 値の history / undo | revision 経路に乗らない(本 entry は user-edit gated)、必要なら別 wave |
| flag value の type 拡張(object / array) | v1 は number / string / boolean のみ。複合値は category 別 namespace で fan-out |
| build-time const の defineFlag 化 | Tier 1(BUILD_FEATURES 等)は本 spec の対象外 |
| **localStorage / browser-wide layer** | PKC2 の canonical configuration storage は Container(IDB / 将来 OPFS) 経路。localStorage は transient UI state(pane-prefs 等)専用、configuration には使わない。browser-wide が真に必要になれば IDB 上別 store 後付け |
| settings dialog への flag graduation | flag が成熟したときの「mirror exposure」path は v2/v3 で graduated 単位に追加、v1 では inspector のみ |

---

## 2. defineFlag API

### 2-1. signature

```typescript
// src/runtime/flags.ts (NEW、本 spec で normative 化)

export type FlagPrimitive = number | string | boolean;

export interface DefineFlagOptions<T extends FlagPrimitive> {
  range?: [T, T];                  // numeric 用(inclusive)
  enum?: readonly T[];             // string / number / boolean enum 用
  description?: string;            // inspector に表示
  category?: string;               // 'perf' / 'ui' / 'debug' / 'experiment' / 'storage' / etc
  tier?: 0 | 1 | 2;                // default 0
  requiresReload?: boolean;        // true なら値変更後 reload を inspector が促す
}

export function defineFlag<T extends FlagPrimitive>(
  key: string,                     // dot-separated namespace
  defaultValue: T,
  options?: DefineFlagOptions<T>,
): T;

export interface FlagDescriptor {
  key: string;
  defaultValue: FlagPrimitive;
  currentValue: FlagPrimitive;
  source: 'url' | 'localStorage' | 'container' | 'default';
  options: DefineFlagOptions<FlagPrimitive>;
}

export function getRegisteredFlags(): readonly FlagDescriptor[];
```

### 2-2. key 命名規約

- **dot-separated**: `category.subcategory.name`(例:`textlog.staged_render.initial_count`)
- **lowercase + underscore**: 各 segment は `[a-z][a-z0-9_]*`
- **再 register 禁止**: 同一 key を複数モジュールで `defineFlag` した場合は throw(boot 時エラー)
- **wire spec key と分離**: `pkcMessage.*` / `wire.*` は予約(本 spec 対象外)

### 2-3. 値の検証

`defineFlag` 呼出時 + 各 layer 読込時に下記を検証、不正値は **silent fallback to default + warn**(throw しない):

- numeric: `range` 内、有限数、type 一致
- string: `enum` 配列内(指定時)、type 一致
- boolean: type 一致のみ

検証失敗時は `console.warn` + `__flags__` entry の rewrite で値を修復(corruption 自動修復)。

---

## 3. Resolution order(3 layer)

flag 値の解決は以下の優先順:

```
1. URL parameter      ?pkc-flag=KEY=VALUE              (per-session, ephemeral)
2. Container          entry[lid='__flags__'].body.values[KEY]  (per-container, sharable / exported)
3. defineFlag default                                   (compile-time fallback)
```

各 layer の読書経路:

| Layer | 読み | 書き | 永続性 |
|---|---|---|---|
| URL | parse on boot(page load 時 1 回) | URL 編集のみ(inspector では不可、ephemeral 維持) | session 限定 |
| `__flags__` entry | boot 時 + reducer 変更時 | `SET_FLAG` action 経由 | container ごと(export 同伴) |
| default | 不変 | 不可 | code 上 |

**localStorage layer は v1 で持たない**(§0-2、§1-2 参照)。flag 値は Container-bound configuration として `__settings__` と同 idiom で扱う。

### 3-1. URL syntax

- 単一 key: `?pkc-flag=recent.default_limit=15`
- 複数 key: `?pkc-flag=recent.default_limit=15&pkc-flag=textlog.staged_render.initial_count=4`
- inspector 起動: `?pkc-flag=*`(値は default、UI overlay 表示の起動 trigger)
- URL 値を Container に永続化したい場合は inspector で「Save to Container」button 経由(明示操作)

### 3-2. Tier 別読み書き許可

| Tier | URL read | `__flags__` R/W | inspector 表示 | 値変更 |
|---|---|---|---|---|
| 0 | ✅ | ✅ | ✅ | inspector / API で可 |
| 1 | ✅(dev override only) | ❌ | ✅(grayed) | build option 経由のみ |
| 2 | ❌ | ❌ | ✅(値固定明記) | spec 改訂 PR 経由のみ |

---

## 4. `__flags__` system entry

### 4-1. 予約 lid と archetype

- **lid**: `__flags__`(reserved-lid 一覧に追加、`isReservedLid()` 判定で trash / search 除外)
- **archetype**: `system-flags`(NEW、ArchetypeId union 拡張)

### 4-2. body schema

```json
{
  "format": "pkc2-system-flags",
  "version": 1,
  "values": {
    "recent.default_limit": 15,
    "textlog.staged_render.initial_count": 12,
    "image.max_long_edge": 3072,
    "experiment.foo": true
  }
}
```

- `format`: literal `'pkc2-system-flags'`(他 system entry と discriminator 共通化)
- `version`: integer、本 spec で `1`、将来 schema 拡張で incrememnt
- `values`: `Record<string, FlagPrimitive>`、key は §2.2 規約に従う、unknown key は silent drop(forward-compat)

### 4-3. boot inject

container の load 時、`__flags__` entry が存在しなければ **空 `values: {}` で auto-inject**(既存 `__settings__` と同 pattern)。
revision には記録しない(`__settings__` と同様、initial state を pre-populate するだけ)。

### 4-4. reducer actions

| Action | params | 効果 |
|---|---|---|
| `SET_FLAG` | `{ key: string, value: FlagPrimitive }` | `__flags__` entry の body.values[key] を更新、entry の updated_at 更新 |
| `RESET_FLAG` | `{ key: string }` | `__flags__` entry の body.values[key] を削除(default に戻る) |
| `RESET_ALL_FLAGS` | — | `__flags__` entry の body.values を `{}` にリセット |

各 action は **gate 経由**(直接 `UPDATE_ENTRY` で `__flags__` を編集するのは reducer で reject、`__settings__` と同 pattern)。

### 4-5. import / merge policy

- **single import**(既存 `__settings__` と同):host 側 `__flags__` を保持、import 側の `__flags__` は drop
- **merge**:同 policy(host 優先、import 側は dropped)
- **export**:`__flags__` を含む(他 system entry と並列、self-describing)
- **理由**:flag 値は host 環境固有のチューニング。import で上書きすると user の手動調整が消える

### 4-6. isolation

`isReservedLid` + `isSystemArchetype` の既存 filter に追加:
- `isReservedLid('__flags__') === true`
- `isSystemArchetype('system-flags') === true`

これで:
- trash pane から非表示
- search 結果から非表示
- sidebar tree から非表示
- export の archetype filter で system 含めない場合は除外

---

## 5. flags inspector overlay(UI)

### 5-1. 起動 trigger

- URL: `?pkc-flag=*`(`*` で起動、既存 `?pkc-debug=*` と並列 protocol)
- shell-menu「⚑ Flags」link(既存「🐞 Report」の隣):**常時可視**(全 user に常時表示、power user discovery を impose せず、ℹ About と同 visibility policy)
- settings dialog 最下部の「Advanced ⚑ Open Flags…」link(settings → flags 単方向 navigation)

### 5-2. overlay layout

画面右下の固定 overlay(既存 `?pkc-debug=*` overlay と同 layer)。content:

- **Header**: title「PKC2 Flags Inspector」+ search box + category filter dropdown + 「Reset all to default」「Export JSON」「Import JSON」button
- **List**(category 別 grouping):
  - 各 flag 行: key / current value / default / source(URL / container / default、color-coded)/ range・enum / description
  - 編集 UI: numeric は input、boolean は checkbox、enum は dropdown
  - 編集 = `__flags__` への書込(SET_FLAG action 経由)、URL 値は read-only(URL 編集が必要)
  - URL 経由の値が active の場合「This value is overridden by URL parameter」ヒント表示
  - 「Save current URL flags to Container」button:URL で試した値を一括 `__flags__` に永続化(明示操作)
- **Footer**: register flag 総数 / Tier 別件数 / build features(read-only display section、§5-4)

### 5-3. 編集経路

| Tier | 編集 UI | 書込先 |
|---|---|---|
| 0 | input / checkbox / dropdown(enabled) | `__flags__`(SET_FLAG action) |
| 1 | grayed display | 「Build option only」表示、編集不可 |
| 2 | locked display | 「Spec invariant」表示、編集不可 |

### 5-4. Build features 表示

inspector footer に **「Build Features (read-only)」** section を分離表示:

- `BUILD_FEATURES`(`src/runtime/release-meta.ts`)の現値を一覧表示
- 編集不可、build 時固定の事実を明示
- 「Wire-spec capabilities」(`MESSAGE_CAPABILITIES`)も同 section で表示(read-only)

→ flags inspector が「runtime configurable values」と「build / wire-spec の固定値」を **同 inspector 内で見渡せる** 設計、debug self-service の hub にする。

---

## 6. Tier 別 invariants(I-FLAGS-N)

| ID | Invariant |
|---|---|
| I-FLAGS-1 | `__flags__` reserved lid は常時存在(boot inject、`__settings__` 同 pattern) |
| I-FLAGS-2 | `__flags__` の直接 user edit(UPDATE_ENTRY)は reducer gate で reject |
| I-FLAGS-3 | resolution order は `URL > Container > default` の **3 layer 固定**、layer 跨ぎでの順序変動なし |
| I-FLAGS-4 | Tier 1 / Tier 2 flag は `SET_FLAG` action で reject(reducer gate) |
| I-FLAGS-5 | `defineFlag` 同一 key 重複 register は boot 時 throw |
| I-FLAGS-6 | range / enum 違反は silent fallback + warn(throw しない、user 体験劣化を防止) |
| I-FLAGS-7 | flag 編集時、既存 invariants(visual-state-parity / entry-ordering 等)は影響しない(side-effect-free な設定値のみ flag 化、order に影響する flag は禁止) |
| I-FLAGS-8 | `__flags__` entry は import / merge で host 側保持(import side dropped) |
| I-FLAGS-9 | shell-menu「⚑ Flags」link は phase / readonly / embedded を問わず常時可視(ℹ About と同 visibility policy) |

## 6-bis. About entry / Settings dialog 連携

### 6-bis-1. About entry「Active flags」表示

`__about__` entry の build info section の隣に **「Active Flags」section** を追加。content:

- 「Active flags: N (N differ from default)」一覧表示(default から外れた flag 数)
- click で flags inspector 起動(`?pkc-flag=*` URL に遷移 or overlay 直接 open)
- 個別 flag list は表示しない(About は概要のみ、詳細は inspector 担当)

実装:
- `src/core/model/about-payload.ts`(既存)に `getActiveFlagCount(container): number` helper 追加
- `__about__` の renderer で「Active Flags」row を追加(default 一致なら hide / 1 件以上で show)

### 6-bis-2. Settings dialog「Advanced ⚑ Open Flags…」link

settings dialog の **最下部** に link 1 つ追加:

- 「Advanced ⚑ Open Flags…」(中央寄せ、subtle 色)
- click で settings dialog を閉じる + `?pkc-flag=*` で inspector overlay 起動
- settings → flags の **単方向 navigation**(flags inspector からは settings に link しない、依存性は単方向)

実装:
- `src/adapter/ui/settings-dialog.ts` (or 相当) の最下部に link を追加
- `data-pkc-action="open-flags-inspector"` で action-binder に dispatch

---

## 7. v1 で defineFlag 化する初期 5-7 件(PR-γ wave 1 候補)

`docs/development/const-discipline-2026-05.md` §3 Tier 0 から、リスク低・効果高な ones を選出:

| # | 旧 const | 新 flag key | category | 理由 |
|---|---|---|---|---|
| 1 | `RECENT_ENTRIES_DEFAULT_LIMIT` | `recent.default_limit` | ui | user が直接体感、変更頻度高 |
| 2 | `INITIAL_RENDER_ARTICLE_COUNT` | `textlog.staged_render.initial_count` | perf | 大コンテナで体感差大、PoC needed |
| 3 | `LOOKAHEAD_ARTICLE_COUNT` | `textlog.staged_render.lookahead` | perf | 同上 |
| 4 | `DEBOUNCE_MS`(persistence) | `persistence.debounce_ms` | perf | 永続化 latency 直結 |
| 5 | `DEFAULT_MAX_LONG_EDGE` | `image.max_long_edge` | storage | 画質 vs サイズ trade-off |
| 6 | `DEFAULT_OPTIMIZATION_THRESHOLD` | `image.optimize_threshold_bytes` | storage | 同上 |
| 7 | `DEFAULT_MAX_PER_ENTRY`(search) | `search.max_results_per_entry` | ui | 検索結果の見やすさ |

各 flag は本 spec §2 の defineFlag に従って register、PR-γ で 1 PR にまとめて移行。

---

## 8. テスト戦略

### 8-1. unit(features 層 / runtime 層)

- `defineFlag` の type guard: numeric / string / boolean ごとの fallback 動作
- range / enum 違反時の warn + fallback
- 同一 key 重複 register の throw
- resolution order の各 layer source 表示
- `getRegisteredFlags()` の completeness

### 8-2. unit(adapter / state)

- `SET_FLAG` / `RESET_FLAG` / `RESET_ALL_FLAGS` reducer の挙動
- `__flags__` entry boot inject(不在 → 空 values)
- `__flags__` への direct UPDATE_ENTRY reject
- import / merge での host 側保持

### 8-3. integration

- URL `?pkc-flag=KEY=VALUE` 設定時の resolution
- localStorage layer の読書
- 4 layer 跨ぎでの優先順序

### 8-4. parity(visual-state-parity-testing.md §6 適用)

- shell-menu 「⚑ Flags」link click → overlay 起動の real OS event parity
- overlay 内の flag 値変更 → 即座反映の visual parity
- inspector の boundingBox + elementFromPoint 確認

### 8-5. coverage gate impact

- `defineFlag` 化で既存 const の test が引き続き機能(default 値で動作)
- flag 移行 PR ごとに coverage threshold(80%)を維持

---

## 9. 既知の制約

- **JIT inline 展開**: `defineFlag` 化で hot path const は inline されなくなる。実測 baseline は PR-β 着地後に bench で取得、Tier 2 への demote 候補を抽出
- **flag 数の膨張**: 30 → 100+ で inspector UX 劣化。category filter で吸収、200 超で sub-page 分割
- **schema 変更時の互換**: defineFlag の signature 変更は既存値が範囲外になり得る、boot 時 silent clamp で吸収
- **localStorage と Container layer の同期**: 同一 key の二重管理は inspector の source 表示で警告、編集時に明示 confirm

---

## 10. 関連

- 上位 audit: [`../development/const-discipline-2026-05.md`](../development/const-discipline-2026-05.md)
- 流用 base spec: [`./system-settings-hidden-entry-v1-minimum-scope.md`](./system-settings-hidden-entry-v1-minimum-scope.md), [`./about-build-info-hidden-entry-v1-minimum-scope.md`](./about-build-info-hidden-entry-v1-minimum-scope.md)
- 既存 URL flag: [`../development/debug-via-url-flag-protocol.md`](../development/debug-via-url-flag-protocol.md)
- 既存 build feature flag: `src/runtime/release-meta.ts` の `BUILD_FEATURES`
- privacy doctrine: [`../development/debug-privacy-philosophy.md`](../development/debug-privacy-philosophy.md)
