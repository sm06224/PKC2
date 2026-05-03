# Const discipline + flags 機構 audit — 2026-05-03

**Status**: LIVE(audit + design draft、user 承認済み YES → PR-β 機構実装 / PR-γ 段階移行 を予定)
**Source**: 2026-05-03 user direction「const のビルドオプション化 / 動的変更手段 / 追加ルール doc 化」+「Firefox / Chrome `about:flags` 風」+「`__settings__` / `__about__` system entry 機構流用 OK」

## 1. 背景 — なぜ必要か

PKC2 の src には現状 **30+ の数値 / boolean const が hard-code** で散在している(本書 §3 詳細表)。これらはすべて:
- 変更には rebuild + dist 再生成が必要(PoC / 実機 A/B 試験のサイクルが遅い)
- ユーザーは値の存在を知らない / 変えられない(power user 体験劣化)
- テストで複数パターン coverage が困難

User direction(2026-05-03):
> 本当にそれでいいの? バンドルで注入しなければ品質に影響があるもの以外(jit インライン展開)は PoC やデバッグ、実行時多数パターンテスト検討のために動的変更をしてしまってもいいのでは?
> Firefox や Chrome のフラグみたいな感じで

→ **runtime configurable がデフォルト**、build-time injection は JIT inline 展開 / wire spec / security boundary の 3 例外のみ、という discipline を確立する。

## 2. 既存関連 mechanism との関係(scope 分離)

**重要**: 新 flags 機構は以下の既存 mechanism と **scope を分けて** 共存する。混同禁止。

| 既存 mechanism | scope | 例 |
|---|---|---|
| `BUILD_FEATURES`(`src/runtime/release-meta.ts`) | **build 時固定**、bundle に embed、deploy 単位で決まる feature 一覧 | `['core', 'idb', 'export']` |
| `MESSAGE_CAPABILITIES`(`src/adapter/transport/capability.ts`) | **wire spec normative**、PKC-Message v1 の advertise vocabulary | `['record:offer', 'export:request']` |
| `?pkc-debug=<feature>` URL flag(`debug-via-url-flag-protocol.md`) | **per-feature debug overlay** トグル | `?pkc-debug=textlog-perf`、overlay UI 表示 |
| `globalThis.__PKC2_PROFILE`(`src/runtime/profile.ts`) | **profile collector の on/off**、bench 用 | `true` で計測 instrumentation 起動 |
| **NEW: `defineFlag` + `__flags__` entry**(本 spec) | **runtime configurable な数値 / boolean / enum**、user / dev が値を変えるための機構 | `recent.default_limit = 10`、`textlog.staged_render.initial_count = 8` |

→ **defineFlag は他 mechanism を置換しない**。各 mechanism は固有の責務を持つ。

## 3. 現 const 30 件の分類

`grep -rn "MAX_\|MIN_\|_LIMIT\|_THRESHOLD\|_BUDGET\|_DEFAULT\|_INTERVAL\|_TTL\|_COUNT\|maxBytes" src/` 結果を 3 tier に分類。

### Tier 0(default、runtime flag 化候補) — 17 件

| # | const | 値 | 場所 | 提案 flag key |
|---|---|---|---|---|
| 1 | `TAG_MAX_LENGTH` | 64 | `features/tag/normalize.ts` | `tag.max_length` |
| 2 | `TAG_MAX_COUNT` | 32 | 同上 | `tag.max_count_per_entry` |
| 3 | `DEFAULT_MAX_LONG_EDGE` | 2560 | `features/image-optimize/config.ts` | `image.max_long_edge` |
| 4 | `DEFAULT_OPTIMIZATION_THRESHOLD` | 524288 | 同上 | `image.optimize_threshold_bytes` |
| 5 | `INITIAL_RENDER_ARTICLE_COUNT` | 8 | `adapter/ui/textlog-hydrator.ts` | `textlog.staged_render.initial_count` |
| 6 | `LOOKAHEAD_ARTICLE_COUNT` | 4 | 同上 | `textlog.staged_render.lookahead` |
| 7 | `RECENT_ENTRIES_DEFAULT_LIMIT` | 10 | `features/entry-order/recent-entries.ts` | `recent.default_limit` |
| 8 | `DEFAULT_MAX_PER_ENTRY` | 5 | `features/search/sub-location-search.ts` | `search.max_results_per_entry` |
| 9 | `BODY_SNIPPET_LIMIT` | 200 | `adapter/platform/batch-import.ts` | `import.preview.body_chars` |
| 10 | `LOG_SNIPPET_COUNT` | 3 | 同上 | `import.preview.log_count` |
| 11 | `LOG_LINE_LIMIT` | 80 | 同上 | `import.preview.log_line_chars` |
| 12 | `MAX_LEN`(card excerpt) | 160 | `features/card/excerpt-builder.ts` | `card.excerpt.max_chars` |
| 13 | `DEBOUNCE_MS`(persistence) | 300 | `adapter/platform/persistence.ts` | `persistence.debounce_ms` |
| 14 | `LOW_FREE_THRESHOLD_BYTES` | 524288000 | `adapter/platform/storage-estimate.ts` | `storage.warn_low_bytes` |
| 15 | `CRITICAL_FREE_THRESHOLD_BYTES` | 52428800 | 同上 | `storage.warn_critical_bytes` |
| 16 | `PDR_TAP_THRESHOLD_PX` | 6 | `adapter/ui/action-binder.ts` | `touch.tap_threshold_px` |
| 17 | `PLACEHOLDER_MIN_HEIGHT` | 160 | `adapter/ui/textlog-hydrator.ts` | `textlog.placeholder.min_height_px` |

**Attachment size limit**(既存 doc 化済、`docs/development/attachment-size-limits.md`):

| # | const | 値 | 場所 | 提案 flag key |
|---|---|---|---|---|
| 18 | `SIZE_WARN_SOFT` | 1 MB | `adapter/ui/guardrails.ts` | `attachment.warn_soft_bytes` |
| 19 | `SIZE_WARN_HEAVY` | 5 MB | 同上 | `attachment.warn_heavy_bytes` |
| 20 | `SIZE_REJECT_HARD` | 250 MB | 同上 | `attachment.reject_hard_bytes` |

**計 20 件の Tier 0**(当初 17 → attachment 3 件追加で 20)。

### Tier 1(build option / wire spec) — 7 件

| # | const | 値 | 場所 | 維持理由 |
|---|---|---|---|---|
| 1 | `bundle.js maxBytes` | 1536 KB | `build/check-bundle-size.cjs` | build CI gate、check は build 時のみ意味あり |
| 2 | `bundle.css maxBytes` | 112 KB | 同上 | 同上 |
| 3 | `coverage.thresholds` | 80/78/85/80% | `vitest.config.ts` | CI gate、test 時のみ意味あり |
| 4 | `BUILD_FEATURES` | `['core','idb','export']` | `src/runtime/release-meta.ts` | deploy profile 単位で決まる、wire 上 advertise 用 |
| 5 | `MESSAGE_CAPABILITIES` | derived from `MESSAGE_RULES` | `src/adapter/transport/capability.ts` | wire spec normative |
| 6 | `SCHEMA_VERSION` | 1 | `src/core/model/container.ts`(推定) | spec normative、migration 経路に直結 |
| 7 | `RELEASE_VERSION`(stamp) | dynamic | `src/runtime/release-meta.ts` | git stamp 経由、build 時固定 |

→ **build option として維持**、defineFlag 化しない。

### Tier 2(security / invariant、runtime read-only inspection 可、書き込み拒否) — 7 件

| # | const | 値 | 場所 | 維持理由 |
|---|---|---|---|---|
| 1 | `MAX_ANCESTOR_DEPTH`(auto-placement) | 32 | `features/relation/auto-placement.ts` | cycle 防護、緩めると DoS 可能 |
| 2 | `MAX_ANCESTOR_DEPTH`(build-subset) | 32 | `features/container/build-subset.ts` | 同上 |
| 3 | `MAX_REF_ITERATIONS` | 10000 | 同上 | 無限ループ防護 |
| 4 | `MAX_ERROR_MESSAGE_BYTES` | 200 | `runtime/debug-flags.ts` | debug payload safety |
| 5 | `MAX_REPLAY_BYTES` | 768 KB | 同上 | OOM 防護 |
| 6 | `MAX_REPLAY_ASSET_BYTES` | 512 KB | 同上 | 同上 |
| 7 | `MAX_CONTENT_BYTES` | 64 KB | 同上 | 同上 |
| 8 | `MAX_REPORT_BYTES` | 1 MB | 同上 | 同上 |

→ **hard-code 維持**、変更には spec 改訂 PR 必須。flags inspector では **read-only 表示**(値変更不可)。

### Tier 1 候補(v2 spec で議論中、未着地) — 4 件

`pkc-message-v2-open-questions-decisions-2026-05.md` で固定済:

| # | const | 値 | 配置先(予定) | tier |
|---|---|---|---|---|
| 1 | `heartbeat.intervalMs` | 15000 | `serverCapabilities.heartbeat.intervalMs` | 1(wire spec) |
| 2 | `heartbeat.toleranceMs` | 5000 | 同上 | 1(wire spec) |
| 3 | `subscription.ttlHours` | 24 | spec normative | 1(wire spec) |
| 4 | error code reservations | -32099 等 | spec table | 1(wire spec) |

## 4. defineFlag API 設計

```typescript
// src/runtime/flags.ts (NEW)
export function defineFlag<T extends number | string | boolean>(
  key: string,                     // 'recent.default_limit' (dot-separated namespace)
  defaultValue: T,
  options?: {
    range?: [T, T];                 // numeric の min/max (inclusive)
    enum?: readonly T[];            // string/number の許容集合
    description?: string;           // flags inspector に表示
    category?: string;              // 'perf' / 'ui' / 'debug' / 'experiment' / 'storage' 等
    tier?: 0 | 1 | 2;               // default 0 (runtime)
    requiresReload?: boolean;       // true なら値変更後 reload 必要(例 staged render initial)
  },
): T

// flags inspector が enumerate するためのレジストリ
export function getRegisteredFlags(): readonly FlagDescriptor[]
```

### 解決順(高優先 → 低優先)

```
1. URL parameter      ?pkc-flag=KEY=VALUE      (per-session, debug / dev)
2. localStorage       'pkc-flags' JSON          (browser-wide, power user)
3. __flags__ entry    Container.entries[lid='__flags__'].body.values  (per-container, sharable)
4. defineFlag default                          (compile-time fallback)
```

各 layer は **個別に書込可**:
- URL: 読み取り専用(URL 編集で変更)
- localStorage: flags inspector で edit → localStorage 書込
- `__flags__` entry: SET_FLAG action で reducer 経由 → entry body 更新

### Tier 別読み書き許可

| Tier | URL read | localStorage R/W | `__flags__` R/W | inspector 表示 |
|---|---|---|---|---|
| 0 | ✅ | ✅ | ✅ | ✅ 編集可 |
| 1 | ✅(dev override) | ❌ | ❌ | ✅ 表示のみ(grayed) |
| 2 | ❌ | ❌ | ❌ | ✅ 表示のみ(値固定明記) |

## 5. `__flags__` system entry spec(別 doc で詳細化)

詳細は `docs/spec/flags-protocol-v1-minimum-scope.md`(本 PR で同梱)を参照。要点:

- **reserved lid**: `__flags__`
- **archetype**: `system-flags`(NEW、ArchetypeId union 拡張)
- **body schema**:
  ```json
  {
    "format": "pkc2-system-flags",
    "version": 1,
    "values": {
      "recent.default_limit": 15,
      "image.max_long_edge": 3072,
      "experiment.foo": true
    }
  }
  ```
- **reducer actions**: `SET_FLAG { key, value }` / `RESET_FLAG { key }` / `RESET_ALL_FLAGS`
- **boot inject**: 不在時に空 `values: {}` で auto-inject(既存 `__settings__` と同 pattern)
- **isolation**: `isReservedLid` + `isSystemArchetype` 既存 filter に `__flags__` / `system-flags` を追加 → trash / search 結果から自動除外
- **import / merge**: 既存 Container 経路で round-trip(host 側 `__flags__` 保持、import 側は dropped — `__settings__` と同 policy)

## 6. UI surface 設計

### 6.1 flags inspector overlay

`?pkc-flag=*`(または別途の URL flag)で起動、画面右下に overlay 表示。既存 `?pkc-debug=*` overlay と同 layer pattern。

機能:
- 全 registered flag を category 別に list
- 各 flag: key / current value / default / source(URL / local / container / default)/ range・enum / description
- 編集 UI(localStorage / `__flags__` 書込)
- search box / filter(`tier 0 only` / `category=ui` 等)
- "Reset to default" / "Export current as JSON" / "Import JSON" ボタン

### 6.2 shell-menu link

shell-menu(右上 ⚙ の隣の hamburger)に **「⚑ Flags」** link を追加(既存「🐞 Report」の隣)。click で `?pkc-flag=*` URL に遷移 → overlay 起動。

### 6.3 `__about__` 内の flags 状態 dump

`__about__` entry の build info の隣に「Active Flags」section を追加(read-only、debug 用)。

## 7. const 追加 / 移行ルール(annotation 規約)

### 7.1 新 const 追加時の必須 annotation

```typescript
/**
 * @const-tier {0|1|2}
 * @rationale なぜこの値か(過去測定 / ユーザー要望 / 仕様参照)
 * @adjustable yes(tier 0)| build-option(tier 1)| no(tier 2)
 * @flag-key (tier 0 の場合)対応する flag key
 */
const FOO_MAX = 1234;

// または defineFlag を使う(tier 0 の推奨形)
export const RECENT_ENTRIES_DEFAULT_LIMIT = defineFlag(
  'recent.default_limit', 10,
  { range: [1, 100], category: 'ui', description: 'Recent pane の件数' }
);
```

### 7.2 既存 const 移行ルール(段階適用)

- **PR-γ wave 1**: Tier 0 の **5-7 件** を `defineFlag` に置換(リスク低い ones から)
- **PR-δ wave 2**: 残 Tier 0 を順次置換
- **PR-ε**: Tier 1 / Tier 2 const に annotation 付与のみ(値は変えない)
- **PR-ζ**: CI に annotation grep 検査追加(missing は warn)

### 7.3 PR-review checklist 追加項目(将来 §2.10)

> 10. **Const annotation**: 新 const を src に追加する PR では、`@const-tier` / `@rationale` / `@adjustable` annotation を必須(または `defineFlag` 化)。tier 0 候補(数値 / boolean / enum)は `defineFlag` を強く推奨。

## 8. PR 順序(本 audit 着地後の予定)

| PR | 内容 | 規模 |
|---|---|---|
| **PR-α(本 PR)** | `const-discipline-2026-05.md`(本書、~360 行)+ `flags-protocol-v1-minimum-scope.md`(spec、~200 行) | docs-only |
| **PR-β(機構実装)** | `src/runtime/flags.ts`(URL / localStorage layer + registry)+ `__flags__` system entry(`system-flags-payload.ts` 新設、reducer 3 case、boot inject、isolation filter)+ flags inspector overlay 最小版 | ~400 行 + tests |
| **PR-γ(段階移行 wave 1)** | Tier 0 候補 20 件のうち **5-7 件**(RECENT_ENTRIES_DEFAULT_LIMIT / INITIAL_RENDER_ARTICLE_COUNT / DEBOUNCE_MS / image config 2 件) | ~100 行 |
| **PR-δ(残り wave 2)** | 残 Tier 0(15 件)を順次 defineFlag 化、約 3 sub-PR で分割 | ~200 行 / sub-PR |
| **PR-ε(annotation 規約)** | Tier 1/2 既存 const に annotation 付与 + CI grep 検査追加 + checklist §2.10 追加 | ~150 行 |

## 9. 既知の制約 / 懸念

- **JIT inline 展開の影響**: 一般的に「数 % 以下」と想定するが、hot inner loop の bound(例 `MAX_ANCESTOR_DEPTH`)は Tier 2 で hard-code 維持して回避。実測 baseline は PR-β 着地後に bench 取得して差分 audit。
- **flag 数の膨張**: 30 件の register が 100 件超に膨れると inspector UX が劣化。category filter + search box で吸収、但し 200 件超えたら sub-page 分割を検討。
- **schema migration**: `defineFlag` の signature 変更(default 値変更 / range 変更)は既存 `__flags__` entry の値が範囲外になり得る。boot 時に out-of-range を warn + clamp + entry rewrite で吸収。
- **localStorage と `__flags__` の同期問題**: 同一 key を local と container 両方に持つと混乱。inspector で「source」を明示 + 編集時に「どの layer に書く?」を明示確認 で対処。
- **test isolation**: vitest 環境で `globalThis.__PKC_FLAGS__` を override するテスト helper を提供、test ごとに reset。

## 10. user 判断が必要な点(本書 merge 前)

- **PR-β 着地時の最小 flags inspector UI**: `?pkc-flag=*` overlay vs shell-menu link、どちらを v1 の minimum とするか?(私の推奨: shell-menu link 1 つ + overlay 内に list = minimum、URL flag 個別 override は最初から動く)
- **localStorage layer の有無**: PR-β v1 で含めるか、PR-β v2 に分離するか?(私の推奨: v1 含める、cross-container 体験のため)
- **既存 `BUILD_FEATURES` との UI 統合**: flags inspector に build features も「read-only displayed」で出すか、別画面にするか?(私の推奨: 同 inspector 内で「Build Features(read-only)」section 分離)
- **PR-γ wave 1 で defineFlag 化する 5-7 件の優先**: 私の案 = RECENT_ENTRIES_DEFAULT_LIMIT / INITIAL_RENDER_ARTICLE_COUNT / LOOKAHEAD_ARTICLE_COUNT / DEBOUNCE_MS / DEFAULT_MAX_LONG_EDGE / DEFAULT_OPTIMIZATION_THRESHOLD / DEFAULT_MAX_PER_ENTRY。これで OK か?

## 関連

- spec(本 PR 同梱): [`../spec/flags-protocol-v1-minimum-scope.md`](../spec/flags-protocol-v1-minimum-scope.md)
- 既存類似 mechanism:
  - [`debug-via-url-flag-protocol.md`](./debug-via-url-flag-protocol.md)(per-feature debug overlay の URL flag)
  - [`debug-privacy-philosophy.md`](./debug-privacy-philosophy.md)(debug 4 原則)
  - 既存 `__settings__` system entry: `docs/spec/system-settings-hidden-entry-v1-{behavior-contract,minimum-scope}.md`
  - 既存 `BUILD_FEATURES`: `src/runtime/release-meta.ts`
- 関連 const doc: [`attachment-size-limits.md`](./attachment-size-limits.md)
- 上位 doctrine: [`doc-archival-discipline.md`](./doc-archival-discipline.md)(本 doc は LIVE methodology として継続維持)
- INDEX: [`INDEX.md`](./INDEX.md) §LIVE
