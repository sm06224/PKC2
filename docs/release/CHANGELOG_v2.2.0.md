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
- **PoC 提案 A: textlog staged-render flag sweep bench(2026-05-04)**:Flags Protocol v1 機構の実証として `textlog.staged_render.initial_count` を URL flag で sweep する bench を `tests/bench/textlog-staged-render-flag-sweep.bench.ts` に整備。条件揃え(6 N × 3 logCount × 2 warmup + 12 measured = 216 iterations)+ median ± IQR 統計 + 環境記録(CPU / OS / browser version)で再現可能な PoC record。結果は `bench-results/textlog-staged-render-flag-sweep.md`、bundle 不変で flag だけ変えて挙動が変わることを 216 measurement で確認(機構 end-to-end validation)
- **PR-γ wave 2: 残 13 件 Tier 0 const → defineFlag 化(2026-05-04)**:wave 1(7 件)完了後の残 13 件を 1 PR で migrate、計 20 件を runtime configurable に。対象は `tag.{max_length, max_count_per_entry}` / `import.preview.{body_chars, log_count, log_line_chars}` / `card.excerpt.max_chars` / `storage.{warn_low_bytes, warn_critical_bytes}` / `touch.tap_threshold_px` / `textlog.placeholder.min_height_px` / `attachment.{warn_soft_bytes, warn_heavy_bytes, reject_hard_bytes}`。各 consumer は call-site で getter を呼ぶ形(persistence と同種の destructure-at-call bug 防止)。default 値は不変 → 既存挙動 / contract / Known limitations 完全互換。`flags-inspector-parity.spec.ts` を 20 row 前提に更新、20 行は body 高さを超えるため `overflow-y: scroll` の always-visible scrollbar + 全 row が `scrollIntoView` 後に reachable であることを実機ブラウザで確認。**性能 regression check**:既存 textlog flag-sweep bench(216 iterations × 18 cells、`textlog.placeholder.min_height_px` を placeholder 配置毎 = 1000 logs cell で 1000 回 touch)を同一 host で wave 1 baseline と 2 連走比較、median 差は ±4%(logCount=1000)以内・対称分布で systematic regression なしを確認。詳細は `bench-results/textlog-flag-sweep-wave1-vs-wave2-2026-05-04.md`
- **領域 9 CSS architecture redesign wave 起点 audit(2026-05-04)**:`feature-requests-2026-04-28-roadmap.md` §領域 9 で予約していた CSS redesign の wave 最初の deliverable。`docs/development/css-architecture-audit-2026-05.md`(NEW、~280 行)で base.css 7591 行 / 767 class / 43 var / 964 var 参照 / 1700+ inline 数値の棚卸し、overlay backdrop+panel 11 件のコピペ重複・button variant 重複・spacing/font-size/radius scale 軸の欠落を data 付きで指摘、Phase 1〜4 で 5+ PR の wave migration plan を提示。defineFlag → CSS var pipeline(`theme.spacing_scale` 等の multiplier flag を `:root` cascade に流して runtime adaptive を実現)を Phase 3 の山場として設計。実装ゼロ(docs-only)、後続 PR の起点
- **領域 9 Phase 1a: spacing scale 導入 + 最頻出 4 値 migrate(2026-05-04)**:`--space-{0..7}` 8 段階を `:root` に宣言。spacing context(padding/margin/gap/inset/top/right/bottom/left/border-spacing)限定で `0.25rem` (79) → `var(--space-2)`、`0.5rem` (125) → `var(--space-3)`、`0.75rem` (48) → `var(--space-4)`、`1rem` (54) → `var(--space-5)` を migrate、計 **306 occurrence / 279 行変更**。font-size 等の同値は触らず、`0.35rem`/`0.4rem`/etc. の outlier は Phase 1a-tail で別 PR にて round。bundle.css raw 113.26 → 116.08 KB(**+2.82 KB**、binary 1024)/ gzip 17.74 → 17.96 KB(+0.22 KB)、内訳は `var(--space-X)` 14 chars - `0.5rem` 6 chars = +8 chars × 306 occurrence + `--space-*` 8 行宣言 ~440 bytes、Phase 2 重複削減で吸収予定。tests/styles の hardcoded match 2 件を `var(--space-3)` に追従、unit / smoke regression なし、Playwright で computed pixel(`var(--space-3)` → 8px、main と同値)+ console errors / warnings / page errors 0 件 + 5 view screenshot 目視で visual parity 確認
- **領域 9 Phase 1a-tail: outlier 5 値 → half-step token migrate(2026-05-04)**:Phase 1a で残された outlier 5 値(0.15 / 0.2 / 0.3 / 0.35 / 0.4 rem、計 278 occurrence)を migrate。整数 token のみで丸めると ±1.6〜2.4px の visible shift が出るため、half-step token 2 つ(`--space-1-5: 0.1875rem (3px)` / `--space-2-5: 0.375rem (6px)`)を追加して max +1.2px shift(0.3rem→6px)に抑える設計。Python script で spacing-context-only に 255 行 + 1 行 multi-property single-line manual = 256 行 / 272 occurrence migrate(残 6 件は font-size 等の非 spacing context、正常)。bundle.css raw 116.08 → 118.98 KB(+2.91 KB、main からは +5.72 KB 累計)。**Phase 1b 着手前に Phase 2(overlay base 抽象 + button utility-first)で budget 回復必要**:現在 99.2% / 120 KB、Phase 1b の追加 ~1.9 KB で overflow 確実。unit 6259 / 6259、smoke 39 / 39 pass、visual regression なし
- **領域 9 Phase 2a: overlay base 抽象による dedup(2026-05-04)**:11 overlay/panel rule のうち 7 overlay container + 4+3 panel の 2 family を `selector list` で hoist。**Family A**(accent panel + hostile blur backdrop):shell menu / shortcut help / storage profile / flags inspector の 4 panel が `bg / border / radius / glow shadow` 4 行を共有 → 単一 list に。3 overlay (shell-menu / shortcut / storage-profile) の hostile backdrop も dedup。**Family B**(neutral panel + light backdrop):textlog-preview / text-to-textlog / text-replace の 3 panel が 9 declaration をフルコピー → 単一 list に。共通 5 declaration の overlay container (position: fixed; inset: 0; flexbox centering) も 7 件分 dedup。bundle.css **120,794 bytes** = 117.96 KB(**-1.02 KB**、99.2% → 98.3% / 120 KB、headroom +1 KB 回復)。**Phase 1a + 1a-tail + 2a 累計 net +4.7 KB**(token 化 +5.72 KB - dedup -1.02 KB)、Phase 2b(button utility-first)で更に削減予定。unit 6259 / 6259、smoke 39 / 39 pass、visual regression なし(theme switching / flags inspector / iPhone shell すべて green)
- **🚨 Hotfix(2026-05-04): Phase 1a の word-boundary regex bug で生成された 28 個の壊れた CSS declaration 修正**:Phase 1a(PR #242)の Python migration 用 regex `\b1rem\b` が `0.1rem` の `1rem` 部分にもマッチして `0.var(--space-5)` という invalid CSS を生成していた回帰を修正。28 sites(`.pkc-btn-create` 等の small button padding / shell-menu gap など)で browser が silent ignore して padding が消失し button 高さが詰まっていた。smoke / unit が functional behavior(click 経由)しか見ていなかったため通過。修正:全 28 occurrence を `var(--space-1)` (0.125rem ≈ 2px、原値 0.1rem = 1.6px から +0.4px shift、Phase 1a-tail と同 round 方針) に置換。bundle.css 120,794 → 120,766 bytes(-28 bytes)。教訓:CSS migration の regex は word boundary だけでなく value boundary(`:` / 空白 / `(` / `,` / `;`)を明示する必要があった。今後の Phase 1b/1c は同種 bug を回避する regex を使う
- **領域 9 Phase 2b: button family utility-first 再構成(2026-05-04)**:`.pkc-btn` family の duplicate 削減。共通 chrome(border / radius / bg / color / cursor / font-family / base transition)を `.pkc-btn, .pkc-btn-small` selector list に hoist、default-size のみの property(padding / font-size / white-space / border-color transition)は `.pkc-btn` に分離。`:hover` / `:focus-visible` も共通 list に hoist。semantic variants `.pkc-btn-primary` / `.pkc-btn-danger` を「diff のみ」rule に縮小 — primary は border / bg / color / font-weight / shadow / transition、danger は border-color / color + hover fill 動作 + focus-visible color override(longhand `outline-color` で cascade override)。`.pkc-btn-clear` は別箇所に重複していた rule を統合(2 箇所 → 1 箇所)。bundle.css 120,766 → 119,861 bytes(**-905 bytes / -0.88 KB**)、binary 117.05 KB / 120 KB(98.3% → 97.5%、headroom +1 KB 回復)。**累計 main 起点 +3.80 KB**(Phase 1a +2.82 + 1a-tail +2.91 + 2a -1.02 + hotfix -0.03 + 2b -0.88、token 化総和 vs dedup の差分が +3.80 KB に収束)。`tests/styles/overlay-focus-visible.test.ts` の 2 件 regex を「selector list 内」「shorthand or longhand color override」を許容するよう更新(visual contract 不変、形式柔軟化)。unit 6259 / 6259、smoke 39 / 39 pass
- **領域 9 Phase 1b: font-size scale 軸導入 + 9 token / 265 occ migrate(2026-05-04)**:font-size を runtime configurable 軸に。`--fs-{2xs, xs, sm, base, md, lg, xl, 2xl, 3xl}` 9 段階を `:root` 宣言、0.6rem〜1rem 範囲をカバー。短 prefix `--fs-*` を採用(audit 当初の `--font-size-*` から budget 制約で変更、`var(--fs-base)` 14 chars vs `0.75rem` 7 chars)。**安全な regex** で migrate(Phase 1a の word-boundary bug reflection)— `font-size:\s*VALUE\s*[;}!]` anchor で value boundary 厳密化、`0.1rem` の `1rem` 部分 partial match を構造的に防止。計 **265 occurrence migrate**(0.6rem 21 / 0.65rem 29 / 0.7rem 53 / 0.75rem 45 / 0.8rem 42 / 0.85rem 40 / 0.9rem 14 / 0.95rem 14 / 1rem 7)。`tests/styles/textlog-viewer.test.ts` の 1 件 hardcoded matcher を `var(--fs-2xl)` に追従、`src/adapter/ui/entry-window.ts` の inline font-size は別 string で migrate scope 外。bundle.css 119,861 → 121,857 bytes(**+1,996 bytes / +1.95 KB**、binary 117.05 → 119.00 KB、97.5% → 99.2%、headroom 1 KB に縮小)。**累計 main 起点 +5.74 KB**(Phase 1a +2.82 + 1a-tail +2.91 + 2a -1.02 + hotfix -0.03 + 2b -0.88 + 1b +1.95)。Phase 1c は軽量(2-3 token + 既存 inline 削減で +0〜+0.5 KB 想定)、Phase 3 は CSS var pipeline で同等 byte 維持予定。unit 6259 / 6259、smoke 39 / 39 pass
- **領域 9 Phase 1c: radius scale 拡張 3 → 5 token + 11 occ migrate(2026-05-04)**:`border-radius` 軸を完全 token 化。新規 token 3 件追加:`--radius-md: 3px`(sm と lg の中間)/ `--radius-pill: 999px`(pill chip)/ `--radius-circle: 50%`(circular avatars / dots)。既存 `--radius-sm: 1px / --radius: 2px / --radius-lg: 4px` は不変。安全な regex で 11 occurrence migrate(3px 3 / 999px 1 / 50% 7)。outlier inline 値 5px / 6px / 8px / 12px(計 5 sites)は将来 PR で `--radius-xl` 検討余地として残置。bundle.css 121,857 → 122,087 bytes(**+230 bytes / +0.22 KB**、99.2% → 99.4% / 120 KB)。**累計 main 起点 +5.96 KB**(Phase 1a +2.82 + 1a-tail +2.91 + 2a -1.02 + hotfix -0.03 + 2b -0.88 + 1b +1.95 + 1c +0.22)。Phase 1 token 系 全 wave 完了 — 次は Phase 3 で runtime adaptive 軸(scale flag → CSS var multiplier)。unit 6259 / 6259、smoke 39 / 39 pass
- **領域 9 Phase 3a: runtime UI scale flag → CSS var multiplier pipeline(2026-05-04)**:Tier 0 flag `theme.scale`(default 1.0、range 0.5〜2.0)を `--theme-scale` CSS var として `<html>` に push、`:root { font-size: calc(16px * var(--theme-scale, 1)) }` で rem-based 全 token(`--space-*` / `--fs-*` 計 21 token)が連動 scale。**defineFlag → CSS var pipeline の最初の application**(audit doc §5.2 設計通り)。新規 module `src/adapter/ui/theme-scale.ts`、wiring は (1) renderer.ts applySystemSettings の末尾で applyThemeScale 呼出、(2) main.ts FLAGS_CHANGED handler で setContainerFlagSource 直後に呼出(priming race 回避、PR #236 と同種の bug 防止)、(3) main.ts boot path で初回 render の one-frame flash 防止。**Phase 8 順序性 parity test**:`tests/smoke/theme-scale-parity.spec.ts`(NEW)で end-to-end 確認 — inspector で theme.scale=1.5 編集 → root font-size 16px → 24px、panel padding 16px → 24px(rem cascade)、reset で snap back。inspector parity test の flag count 20 → 21、numeric flag bulk-edit test に「halve 結果が currentVal と同じなら +1」fallback 追加(theme.scale default=1.0 で halving が no-op になる edge case)。bundle.css +51 bytes、bundle.js +0.4 KB、計 ~+0.45 KB。**累計 main 起点 +6.41 KB**。次は Phase 3b で device-class adaptive(`pointer:coarse` / `(max-width)` で multiplier default を mobile/desktop 別に override)。unit 6259 / 6259、smoke 40 / 40 pass
- **🚨 Hotfix(2026-05-04): Phase 2b で `.pkc-btn-danger` standalone 利用が UA default size に collapse していた回帰 修正**:Phase 2b(PR #246)で `.pkc-btn-danger` rule を「diff のみ」(border-color / color)に縮小したが、`.pkc-btn` と組み合わせていない standalone 2 sites — `renderer.ts` の **delete-entry button** と **import confirm button** — が padding / font-size declaration を失って browser default UA size まで collapse(user 報告:「Delete だけ小さくなる」、iPhone + PC 両方で観測)。smoke が click landing しか見ていないため通過。修正:該当 2 sites を `class="pkc-btn pkc-btn-danger"` に変更し utility-first cascade に乗せる(canonical pattern)。教訓:Phase 2b の dedup は variant rule を「standalone 利用される時 vs 常に `.pkc-btn` と組み合わされる時」で扱いを分けるべきだった。danger は両ケース存在、原則 utility-first(JS で `.pkc-btn` 同時付与)に統一する

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
