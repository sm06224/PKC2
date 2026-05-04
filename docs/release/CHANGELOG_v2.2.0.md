# PKC2 v2.2.0 — Release notes

**Release date**: 2026-05-04
**Schema**: 1(変更なし — additive-only)
**Previous release**: v2.1.1

v2.2.0 の主題は **Flags Protocol v1 wave 完了** です。const ハードコードを runtime configurable に置き換える基盤(`defineFlag` API / `__flags__` system entry / inspector overlay)が確立、PoC / 実機 A/B テスト / debug がリビルド不要で可能になりました。同時に **CHANGELOG → About 自動連携**(本リリースで初導入)+ **doctrine 整備**(Phase 6 doc archival discipline / chat-direct workflow)を含みます。schema breaking はなく、既存 container は v2.1.1 と同じ形で読み込めます。

---

## Highlights

- **Flags Protocol v1**:`defineFlag(key, default, options?)` API + `__flags__` system entry + inspector overlay。Chrome `about:flags` 風の動的フラグ機構で、既存 7 件の Tier 0 const(recent.default_limit / textlog.staged_render.* / persistence.debounce_ms / image config / search.max_results_per_entry)を runtime 切替可能化
- **3 layer resolution**:URL `?pkc-flag=KEY=VALUE` > `__flags__` Container entry > defineFlag default。debug / PoC / 実機 A/B が rebuild 不要で可能
- **Flags inspector overlay**:shell-menu「⚑ Flags」link(常時可視)+ URL `?pkc-flag=*` で起動。category 別 grouping、Tier 別 editor、source badge、reset / Save URL→Container ボタン、Build Features (read-only) section
- **About「Active flags」row**:default から外れている flag 数を About entry に表示、click で inspector 起動
- **Doc archival discipline(Phase 6)**:RESOLVED 実装 / 設計 / 計画 doc を archive folder に移動し live 件数を継続削減する canonical doctrine。第 1 回 sweep で `docs/planning/file-issues/` 13 件中 7 件を archive
- **Chat-direct workflow**:user との対話は chat 直接、PR は execution-only(decision 既済前提)に整理。「user 判断が必要な点」を PR description に書く antipattern を廃止
- **CHANGELOG → About 自動連携(NEW)**:本リリースから About の Highlights / Known Limitations は本書をはじめとする `docs/release/CHANGELOG_v*.md` を build 時 parse して最新 3 generations を表示。RELEASE_SUMMARY ハードコード廃止、CHANGELOG が単一 source of truth
- **Flags critical bug fix(2026-05-04)**:`defineFlag` を live getter `() => T` に変更、7 consumer を関数呼出形式に更新、新規 `flags-runtime-effect-parity.spec.ts` で state mutation → consumer behavior change を end-to-end 検証(import-time-capture bug の regression guard)
- **Phase 8 順序性テスト doctrine(2026-05-04)**:user direction「今後は実機テストを省略するので、完璧なテストは君が保証」を canonical 化。動的機構(flag / setting / event)は consumer behavior 変化までを user-visible 観測点で verify する parity test を必須(`pr-review-checklist.md` §2.11、reform-2026-05 §6 visual parity と AND 適用)

詳細は以下のセクション:

---

## Flags Protocol v1

`docs/spec/flags-protocol-v1-minimum-scope.md` を canonical spec に、6 PR(#228 OQ → #234 parity)で着地。

### 起動 / 永続層

- **Container 永続**:`__flags__` reserved lid、archetype `system-flags`、body JSON `{ format, version: 1, values: Record<string, primitive> }`(`__settings__` / `__about__` と同 system-entry pattern を完全流用)
- **3 layer resolution**(高優先 → 低優先):
  1. URL `?pkc-flag=KEY=VALUE`(per-session、debug)
  2. `__flags__` entry(per-container、export 同伴)
  3. defineFlag default(compile fallback)
- **localStorage 不採用**:PKC2 の canonical configuration storage は IDB / 将来 OPFS。flag 値は configuration なので Container 経路を取る

### Tier 別読み書き許可

| Tier | URL read | `__flags__` R/W | inspector |
|---|---|---|---|
| **0**(default) | ✅ | ✅ | 編集可 |
| 1(build option / wire spec) | ✅ dev override | ❌ | grayed display |
| 2(security invariant) | ❌ | ❌ | locked display |

### 初期 7 件の Tier 0 flag(本リリースで defineFlag 化)

| key | default | range / category |
|---|---|---|
| `recent.default_limit` | 10 | 1-100 / ui |
| `textlog.staged_render.initial_count` | 8 | 1-64 / perf |
| `textlog.staged_render.lookahead` | 4 | 0-32 / perf |
| `persistence.debounce_ms` | 300 | 0-5000 / perf |
| `image.max_long_edge` | 2560 | 256-8192 / storage |
| `image.optimize_threshold_bytes` | 524288 | 1024-50MB / storage |
| `search.max_results_per_entry` | 5 | 1-50 / ui |

### Inspector overlay

- shell-menu「⚑ Flags」link(常時可視、ℹ About と同 visibility policy)or URL `?pkc-flag=*` で起動
- × button + ESC + backdrop click で閉じる(全部入り)
- search box + category filter + Reset all + Save URL → Container button + Export/Import JSON
- footer に「Build Features (read-only)」section(`BUILD_FEATURES` + `MESSAGE_CAPABILITIES`)

### About 連携

About entry の meta table に「**Active flags: N (N differ from default)**」row、click で inspector 起動。

---

## Doc archival discipline(Phase 6)

reform-2026-05 で導入した doc 整理 wave を **継続活動** に転換する canonical doctrine。

### 原理

live tree に置くべき条件:
- (a) active design / (b) canonical contract / (c) active methodology / policy / (d) 未解消 issue / open question / (e) roadmap / ledger / handover

archive 候補:
- (i) 完了 / (ii) audit Outcome A or FINAL / (iii) PR finding / changelog / wave クローズ / (iv) 上位 doc に結果反映済み

### 標準手順

1. trigger:PR 着地時 / quarterly review で完了判定
2. `git mv <doc>.md <parent>/archived/<doc>.md`
3. `<parent>/archived/SUMMARY.md` に 1 行追加
4. 上位 INDEX cross-link 更新
5. SUMMARY 内に「再燃 trigger」段落

### 第 1 回 sweep(2026-05-03)

`docs/planning/file-issues/` 13 件中 **7 件**(FI-01 / FI-03 / FI-04 / FI-05 / FI-08 / FI-09 / FI-12)を archive、live 6 件 + archived 7 件構成に。`docs/development/doc-archival-discipline.md`(canonical)+ `pr-review-checklist.md` §2.9 に組み込み。

---

## Chat-direct workflow

PR description 内に「user 判断が必要な点」を書く運用は user navigation 経路にないため成立しない(merge 経由では暗黙承認にも明示拒否にもならない)ことを 2026-05-03 user 指摘で明確化。

- user との対話は **chat 直接**
- PR は **execution のみ**(decision 既済前提で起こす)
- 既存 audit doc / spec doc から「user 判断が必要な点」表現を「確定事項」record 形式に変更
- 詳細:`docs/spec/flags-protocol-v1-minimum-scope.md` §10、`docs/development/const-discipline-2026-05.md` §10

---

## CHANGELOG → About 自動連携(NEW)

### 旧経路(廃止)

`build/about-entry-builder.ts` 内の `RELEASE_SUMMARY` ハードコード辞書(version → highlights / knownLimitations)。

### 新経路

build 時に `docs/release/CHANGELOG_v*.md` を全件 parse、各 version の `## Highlights` + `## Known Limitations` セクションを抽出。最新 3 generations を About entry の `releases` array に格納。

- **About payload schema 拡張**:`releases?: AboutRelease[]`(additive、newest first)
- **AboutRelease**:`{ version, highlights, knownLimitations, changelogPath }`
- **`release` field**:legacy backward-compat のため、`releases[0]` を populate して維持
- **renderer**:About view が `releases` array を iterate、各 generation を `v<version>` ヘッダ付きで表示

### Doctrine 化

- `pr-review-checklist.md` §2.10「**CHANGELOG 更新**」追加 — feature PR 着地時に該当 generation の CHANGELOG に 1 行記入を必須化、release timing で本書のような summary ファイル新規起こし
- `doc-archival-discipline.md` に CHANGELOG 編集手順を追加
- `CLAUDE.md` self-binding に「PR 着地時に CHANGELOG 更新」を追記

---

## reform-2026-05 wave クローズ後の派生 deliverables

v2.1.1 → v2.2.0 の間に着地した仕様 / methodology PR(#211〜#234):

- **Phase 1A〜5 doc cleanup**:archive 14 subdir 構築、orphan 0 達成、CI gate(orphan + dead-link)で blocking 維持(#211〜#223)
- **Phase 4 spec audit**:14 paired + 21 standalone = 49 spec 全件 ALIGNED 確認(#224〜#226)
- **Coverage gate**:vitest --coverage を CI に組込、minimum 80% / 78% / 85% / 80% threshold(#227)
- **Color tag simple search UI**:colors-in-use chip strip を Filters disclosure 内に格納(#225)
- **TEXTLOG TOC mismatch fix**:rendered viewer / detached entry-window の TOC 順序を content と一致(#229)
- **PKC-Message v2 OQ decisions**:5 OQ を draft 確定(#228)— 実装は v2.3+ wave で
- **Const discipline + flags audit**:30 件分類 + 5 layer 整合 spec(#230〜#231)
- **Flags 機構コア / inspector / parity**:本リリースの主題(#232〜#234)

---

### Post-release fix(2026-05-04)

- **`persistence.debounce_ms` runtime mutability bug 修正**:`mountPersistence` で `const { debounceMs = persistenceDebounceMs() } = options;` の destructure-at-call により flag 値が mount 時に 1 回のみ resolve されていた問題を修正。`scheduleSave` 呼び出し毎に live で再 resolve するよう変更し、SET_FLAG / inspector edit が次回 save から即時反映されるように。Phase 8 順序性テスト doctrine の継続適用で発見。
- **flags-runtime-effect-parity smoke 拡充**:`textlog.staged_render.initial_count` を URL flag で URL→Container→default の 3 layer 解決経路の visible 副作用として assert する 3 個目の parity test を追加。`recent.default_limit`(URL boot + inspector edit)+ textlog initial_count = 7 件中 3 件を実機ブラウザで確認する形に。残 4 件(image.* / search.* / persistence.debounce_ms / lookahead)は unit test side で live-read を assert。
- **Inspector visible-paint bug 修正(critical UX)**:default 1280×720 viewport で 7 Tier 0 flag rows のうち下 2 件 (`recent.default_limit` / `search.max_results_per_entry`) が body の clip rect 下に押し出され、macOS 既定の auto-overlay scrollbar が常時非可視のため「flag が出てこない/動作していない」と認識されていた現象を修正。
  - `Build Features` section を footer から body 末尾の collapsed `<details>` に移動(footer は summary 1 行に縮減)
  - `.pkc-flags-inspector-body` に `min-height: 0` を追加(flexbox child overflow が parent max-height を効かせる canonical fix)
  - `.pkc-flags-inspector-body` を `overflow-y: scroll` + `scrollbar-width: thin` + visible thumb で常時可視 scrollbar 化
  - panel `max-height: 85vh → 95vh`、row padding / gap / description font 縮減で 7 件全部が初回 paint 時に input まで visible
  - **新 parity test** `flags-inspector-parity > every Tier 0 flag row is fully inside the inspector body without scrolling`:全 7 row の header + input が body の visible rect 内にあることを `getBoundingClientRect()` で実 DOM 値 assert(Playwright auto-scroll 起動前)。Inverse 確認(CSS revert)で本 PR の修正前 build に対し正しく FAIL することを確認済み
  - **新 parity test** `every Tier 0 numeric flag edits via real keyboard input → __flags__ source flips`:全 numeric flag を triple-click→keyboard.type→Tab の OS 実イベント経由で編集し、source DEF→CONT 反映を全件確認

### PoC bench Application(2026-05-04)

- **PoC 提案 A — `textlog.staged_render.initial_count` flag sweep 実行**:Phase 8 順序性テスト doctrine の最初の application として、Flags 機構を経由した bench sweep を実走。同一 `dist/pkc2.html` バンドルに対し URL flag のみ変えて 6 値(1 / 4 / 8 / 16 / 32 / 64)を測定 — リビルドゼロで実機 A/B 取得可能であることを実証。結果:
  - hydrated 件数は flag 値に正確に追従(1 → 5 / 4 → 5 / 8 → 9 / 16 → 17 / 32 → 33 / 64 → 65、内 lookahead 4 + IO 1 の上乗せ)
  - 「click→first hydrated」latency は N=8 で 372.5ms、N=16〜64 では 170〜190ms と低下傾向(N=1 の 433.9ms は warmup ノイズ)
  - 現行 default N=8 は first-paint 視認件数と latency の中庸点だが、device-class ごとに inspector / URL で個別 tuning 可能
- **bench file の `__default__` pointer seed 修正**:`tests/bench/textlog-staged-render-flag-sweep.bench.ts` の `seedIDB` で `__default__` pointer 不足により reload 後に embedded pkc-data fallback してしまう不具合を修正(`flags-runtime-effect-parity.spec.ts` で先に発見した同種 bug)
- **bench-results 出力**:`bench-results/textlog-staged-render-flag-sweep.md` を新規追加(時点付き snapshot)。今後の PoC は同 template に沿って boot variant via URL flag → 測定 → md 1 行の形で蓄積

## Known Limitations

- **Flags inspector のキーボード操作**:Tab / Enter / Space で flag 編集は OS 標準挙動に依存、専用 hotkey は未実装(power user 向け、別 wave で検討)
- **PR-γ wave 2 の defineFlag 化**:残 13 件の Tier 0 const(TAG_MAX_LENGTH / DEFAULT_MAX_PER_ENTRY / 等)は別 PR で段階移行予定
- **領域 9 CSS architecture redesign**:CSS 流用最適化 / 透過構造化 / 実行時自動生成は別 wave に課題化(`feature-requests-2026-04-28-roadmap.md` §領域 9)、Flags 全容着地後の独立 wave
- **TEXTLOG drag-to-reorder**:USER_REQUEST_LEDGER §3.6 deferred items の trigger 解消(2026-05-03)、別 wave で着手予定
- **PKC-Message v2 spec doc 起こし**:OQ decisions は固定済み、v2 spec normative 化は別 wave(v2.3 候補)
- **PoC 提案 A**(`INITIAL_RENDER_ARTICLE_COUNT` bench sweep):**実行済み(2026-05-04 post-release fix wave、上記「PoC bench Application」参照)** — Flags 機構の実証として 6 値 sweep 完了、bench-results/textlog-staged-render-flag-sweep.md に snapshot
- **Cross-container resolver / P2P**:未実装(v2.1.0 / v2.1.1 から継承)
- **OS protocol handler for `pkc://`**:未実装(同)
- **Full container footprint(body + relations + revisions)**:未実装、Storage Profile は asset-only(同)

---

## 互換性

- **Schema**: 1(変更なし)
- **About payload**: `releases?: AboutRelease[]` を additive 追加、既存の `release?: AboutRelease` は populate 維持(legacy reader が読める)
- **`__flags__` system entry**: NEW、reserved lid pattern + isSystemArchetype filter で既存 trash / search / sidebar から自動除外
- **`SET_FLAG` / `RESET_FLAG` / `RESET_ALL_FLAGS`**: NEW user actions、既存 action surface 不変
- **`FLAGS_CHANGED` domain event**: NEW、既存 event 不変
- **既存 7 件の Tier 0 const**:public export 名と default 値は不変、`defineFlag` 化のみ
- **export / import**:`__flags__` entry も export 同伴、import 時は host 側保持(`__settings__` 同 policy)

## 関連 doc

- canonical spec: `docs/spec/flags-protocol-v1-minimum-scope.md`
- audit + tier 分類: `docs/development/const-discipline-2026-05.md`
- doctrine: `docs/development/doc-archival-discipline.md`
- workflow: `docs/development/pr-review-checklist.md` §2.9 / §2.10
