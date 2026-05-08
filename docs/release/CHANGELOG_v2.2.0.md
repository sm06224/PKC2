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
- **領域 9 Phase 3b: device-class adaptive media query で UI scale default 切替(2026-05-04)**:Phase 3a の rem cascade を「**user override が device default に勝つ** 2 層 cascade」に拡張。`--theme-scale-default` を `:root` に新規追加(default 1.0)、`@media (pointer: coarse) and (max-width: 640px)` で `0.9`(mobile)、`(min-width: 641px) and (max-width: 1024px)` で `0.95`(tablet)に override。calc fallback chain を `var(--theme-scale, var(--theme-scale-default, 1))` に変更。`applyThemeScale()` を改修 — flag source = `default` なら `removeProperty('--theme-scale')` で device default に委譲、`url` / `container` (explicit user input) なら `setProperty` で override。これにより mobile 端末で **user が theme.scale=1.0 を明示設定すると device default 0.9 を上書きして desktop-size に opt-out** できる UX が成立。**Phase 8 順序性 parity test 拡張**:`theme-scale-parity.spec.ts` に test 2 件目 — mobile viewport (375×812 + pointer:coarse) で baseline `--theme-scale-default=0.9 / root=14.4px` 確認、explicit `theme.scale=1.0` edit 後に root=16px(device default を override)。bundle.css +230 bytes(media query 2 ブロック)。**累計 main 起点 +6.66 KB**(bundle.js 含む)。**Phase 3 wave クローズ**、Phase 4(per-archetype palette)は optional、次は CSS wave 全体 wrap-up + ドキュメンテーション pass → 領域 10 機能改修フェーズ。unit 6259 / 6259、smoke 41 / 41 pass
- **領域 9 wave クローズ + Phase 4 deferred(2026-05-05)**:CSS architecture redesign wave(audit + Phase 1a/1a-tail/1b/1c + Phase 2a/2b + Phase 3a/3b、計 8 PR + 2 hotfix)を完了として一旦クローズ。**Phase 4(per-archetype palette via `insertRule` 経路)は user 確認で「Claude 拡大解釈」と認定 → deferred 判定**(元 user direction「実行時にデータタイプや画面タイプに合わせて自動生成」は概念として「データタイプ」軸を含むが、具体定義は user 未指示で私が `archetype palette + insertRule` と勝手に具体化していた)。Phase 1+2+3 で user 要望(重複削減 / 透過構造化 / runtime auto-gen)は実質充足。Phase 4 は use case 例 + 再 open trigger 5 件(container 独立 palette / extension 注入 / selector 構造差替 / 多 theme 並走 / palette spec export)を `css-architecture-audit-2026-05.md` §6 Phase 4 deferred section + `USER_REQUEST_LEDGER.md` §3.6 deferred items 表に記録、具体要件出現時に再 open。次は documentation pass(docs整備)→ 領域 10 機能改修フェーズ復帰。docs-only、機能変更ゼロ
- **領域 10-1 PR 1: source-line anchor 基盤(2026-05-05)**:Split View 同期スクロール再実装の **pure logic 層**。PR #206(2026-04 v17 まで実装後 user 判断で paused)の保留理由「描画と生成を同じものとして検証」「user debug 報告導線が無い」「Playwright `locator.click()` が OS event を経ていない」を踏まえ、reform-2026-05 doctrines(debug-via-url-flag-protocol / visual-state-parity-testing / Phase 8 順序性)を骨格に据えた red-first 再構築。**PR 1 scope**:`renderMarkdown(text, { sourceLineAnchors: true })` opt-in で markdown-it block-level token に `data-pkc-source-line` / `data-pkc-source-end` を stamp(`tagSourceLines` walker、`SOURCE_LINE_TOKEN_TYPES` Set で paragraph / heading / list_item / blockquote / fence / table / hr / html_block を網羅)。**source-preview-sync.ts**(NEW)に pure DOM helper 5 件 — `caretSourceLine` / `findPreviewElementForLine` / `findSourceLineForElement` / `findSourceLineByPoint` / `caretOffsetForSourceLine`。unit 35 spec(11 renderer + 24 helpers)で全 helper の正常 / edge / out-of-range path を覆う。UI integration(caret tracking / click 結線 / scroll behaviour / ⇄ toggle / debug overlay)はゼロ → PR 2 に分離。bundle.js +0.4 KB、bundle.css 不変。unit 6294 / 6294 pass
- **領域 10-1 PR 2: caret↔preview 同期 + visual-state-parity test(2026-05-05)**:PR 1 の pure logic 層に UI orchestration を結線して同期スクロール feature を完成。**source-preview-sync.ts** 拡張:`isSyncEnabled` / `setSyncEnabled` 永続トグル(localStorage `pkc2.split-sync-enabled`、default-on for desktop / default-off for `(pointer: coarse) and (max-width: 640px)`)、suppression flags(`markProgrammaticScroll` / `consumeScrollSuppression` 等で feedback loop 阻止)、`syncPreviewToCaret` / `syncCaretToPreview` 双方向 sync、safe-scroll comfort zone(中央 50% は移動しない、target は 35% from top に着地)、block-internal progress(長 fence は caret 深度 → block 高さの比例 offset で追従)、`?pkc-debug=split-sync` URL flag opt-in(canonical、debug-via-url-flag-protocol.md 準拠)。**action-binder 結線**:document `selectionchange` / root `focusin` / preview capture-phase `click` / preview `scroll` の 4 listener、interactive child(a/button/input/textarea/select/`[data-pkc-action]`/task-checkbox)上の click は skip。**⇄ toggle button**:resize handle に absolute-positioned で重ね、`data-pkc-action="toggle-source-preview-sync"` で switch case がカバー、handleSplitResizeMouseDown は `[data-pkc-action]` 子要素の mousedown で resize drag を開始しないよう guard。**Playwright parity test 10 件**(`tests/smoke/source-preview-sync-parity.spec.ts`、NEW):短段落 / 長 fence(40 行、中段 caret で block-internal scroll 追従 を **scrollTop 増分** で観測)/ heading / nested list / table / preview→editor 段落 click(`page.mouse.click(x, y)` real OS event)/ fence click / blank gap fallback / ⇄ OFF で active marker 消滅 + 新 caret 移動が sync 起こさない / 再 ON で復活。各 scenario で **state mutation(`[data-pkc-active-source]` 属性、caret offset)+ consumer behaviour(`elementFromPoint` で active block が painted、preview scrollTop 変化)** を Phase 8 順序性 doctrine に従って AND 条件で検証。**PR #206 教訓の活用**:`locator.click()` 同等の synthetic click は使わず `page.mouse.click(x, y)` で OS event を経由、scroll 観測は `getBoundingClientRect` + `scrollTop` の computed value、block visibility は `elementFromPoint` で実 painted pixel を確認。bundle.css 119.50 → 120.15 KB(+0.65 KB:`⇄` toggle button chrome + active-source highlight + handle position relative)、bundle.js +少(orchestration 層 + 結線)。budget は 120 → 122 KB に bump(headroom +1.85 KB、build/check-bundle-size.cjs で justification 記録)。entry-window split editor は別 document context のため follow-up に分離。unit 6294 / 6294、smoke 51 / 51 pass
- **🎯 領域 10-1 hotfix-7 follow-up-4: wheel-then-reselect use case + Flags 化 + 色味 bump + personal content 削除(2026-05-05)**:user 11 周目指示への直接対応。**(1) Wheel-then-reselect use case** = 「user が wheel で view 外に追いやった後、caret 再選択 → band 復帰」の test を `source-preview-sync-wheel-then-reselect.spec.ts`(NEW、R1+R2 scenario)で real OS wheel + caret 移動で再現、screenshot 証憑(R1-step1/2/3 + R2-after-wheel/reselect)を残す。**(2) 防御的 suppress flag flush** = `syncPreviewToCaret` 冒頭で `consumeScrollSuppression()` を pre-flush、prior programmatic scroll の suppress flag が caret-driven scroll を block する race を排除(Playwright では再現せず、user 実機の race condition への保険)。**(3) Flags 化(本 PR 内に取り込み)** = `caret_indicator.{enabled, tint_pct, border_alpha_pct, border_width_px}` を Tier 0 flag として defineFlag、`?pkc-flag=caret_indicator.tint_pct=40` 等で runtime 調整可能。Inspector で 4 row 増加(21 → 25)。**(4) 色味 bump** = caret indicator の tint 25% / border-alpha 90% / border-width 3px に強化(default 値、user feedback「色味がうすい」)。**(5) Personal content 削除**(user 直接指示「テスト用のマークダウンは確実に削除してください」) = visual-check / realcontent-diagnostic / realcontent-multiangle / editor-overlay の 4 spec から店舗名 / 個人 markdown を削除、共通 generic fixture `tests/smoke/_fixtures/split-view-sample.ts` に集約。`候補5案 → candidate-list`、`設計空間 → design-axis`、`kokoko → heading-1` 等で line 数構造保持。bundle.js +0.84 KB(Flags 4 個 + paint logic)、bundle.css 不変。budget 122 KB / 121.74 KB(99.8%)。unit 6301 / 6301、smoke sync 52 件全 green(従来 41 + R1/R2 + visual-check 9)
- **🎯 領域 10-1 hotfix-7 follow-up-3: 「一度しかジャンプしない」修正(comfort-band 追従)+ caret indicator visible 化(2026-05-05)**:user 10 周目報告「一度しかジャンプ動作をしないように見受けられる」「グローバルキャレットインジケータは動作していない」への対応。**(1) Comfort-band tracking** = `ensureRectVisible`(in-view → no-op、out-of-view → minimum scroll)を `ensureRectInBand`(rect が viewport の `[20%, 55%]` band 内なら no-op、外れたら top edge を 20% 位置に持ってくる)に切替。block 内 caret 移動でも rect が band を外れれば連続的に follow scroll する → 「discrete に飛んで止まる」現象を解消。`scroll-behavior: smooth` 一時導入は test の `scrollIntoView` と race して click 座標を狂わせたため撤回(programmatic scroll は instant、comfort band 自体で連続的に見える)。**(2) Caret indicator visibility 修正** = `currentColor` が `<body>` 直下では `#000` に解決され、dark theme で「黒の 6% opacity」= 不可視だった。`color: var(--c-fg)` を inline で set + tint 強さを 12% / 50% に bump。screenshot V0 で薄緑 stripe が明確に visible に。**(3) Editor 側の `ensureCaretVisibleInEditor` は in-view-no-op 維持** = user の type / click / wheel と fight しないよう、editor 側のみ comfort-band ではなく従来通りの「最小 scroll」を保持。bundle.js 不変、bundle.css ±0。budget 122 KB / 121.74 KB(99.8%)。unit 6301 / 6301、smoke sync 41 件全 green、visual-check 9 件全 green
- **🎯 領域 10-1 hotfix-7 follow-up-2: PKC 全体 caret indicator + block-internal progress 復活 + user 提供 markdown fixture(2026-05-05)**:user 9 周目指摘「中途半端に飛んだり飛ばなかったり」「caret 位置を目立たせる別の視覚効果を機能の ON/OFF に関わらず表示」「caret 位置の視覚効果は PKC 全体で入力中部分で適用」「テストに使用するマークダウンは以下を使用しなさい(MacOS+Firefox/Chrome、1680x1050)」への対応。**(1) Global caret indicator** = `src/adapter/ui/caret-indicator.ts`(NEW)、main.ts boot で `installCaretIndicator()` 1 回登録、document focusin / focusout / selectionchange / input / scroll / window resize listener で全 textarea を track、`position: fixed` overlay を `<body>` 直下に配置。sync ON/OFF 不依存、PKC2 全体(title input、body textarea、search、log row inputs 等)で caret 行に薄い stripe 表示。**(2) Block-internal progress 復活** = hotfix-5 で「N:M で諦める」と撤回した caret-row centre interpolation を、`caretRowRectInBlock(block, caretLine)` 経由で再導入。block 内の caret 深度に応じて preview の scroll target を proportional に変える。`ensureRectVisible` の「in-view → no-op、out-of-view → 必要量 scroll」契約は維持(rect が visible 内なら scroll しない)、ただし block 内で caret が移動 → caret-row rect が変わる → 必要なら最小 scroll、で discrete-jump 問題を解消。**(3) User 提供 markdown fixture** = `source-preview-sync-visual-check.spec.ts` を user の ChatGPT→Claude 移行記録 markdown(250 行、7+ table、CSV fence、Mermaid block、blockquote、checklist)+ `viewport: 1680×1050` (user の Mac monitor)に切り替え。9 scenarios(V0〜V8)で screenshot 生成。**Verify**:V0 sync OFF + caret line 30 → caret indicator 薄いグレー stripe visible ✓、V2 sync ON + line 0 → h1 active highlight + L0 同期 ✓、V8 table click → modal 開かず、cursor: text、両方 highlight ✓。bundle.js +0.4 KB(caret-indicator module)、bundle.css 不変。budget 122 KB / 121.74 KB(99.8%)。unit 6301 / 6301、smoke sync 41 件全 green、visual-check 9 件 全 pass(eyes-on artefact)
- **🎯 領域 10-1 hotfix-7 follow-up: badge 外側移動 + refreshEditorActiveLine sync 修正 + cursor 抑制(2026-05-05)**:user 8 周目指摘「#1 と #2 は直っていない、#4 cursor 種類変化も抑制」への即対応。**(1) badge 文字遮蔽 root cause**:hotfix-7 で badge を `right: 4px; top: 4px` に移動したが、長 paragraph で wrap した content の右端と badge が衝突。badge を block の **完全外側右**(`right: -32px; top: 0`、preview pane の右 padding gutter)に移動。content rect の外なので物理的に文字遮蔽不可能。**(2) L 番号統一の復元**:hotfix-7 で `updateEditorActiveLine` 引数を導入したが、`refreshEditorActiveLine`(textarea natural scroll 経由)が引数なしで呼んでいたため、wheel scroll で badge が caret 行番号にリセットされ preview とズレ復活。`refreshEditorActiveLine` 内で active preview block を lookup → start line を渡す修正。**(3) cursor 抑制**:`.pkc-md-block` の view-mode `cursor: zoom-in` が edit-mode preview でも漏れていた(media-viewer modal を gate したのに cursor だけ残った)。`.pkc-text-edit-preview, .pkc-text-edit-preview * { cursor: text !important; }` で edit-mode 内を一律 text cursor に、`<a>` のみ pointer 維持。**Verify(visual)**:L3 → L49 + "Claude" の "C" 完全に見える ✓、L4 → L99 + "blockMeasureRect" の "b" 見える + badge 右外に visible ✓、L7 → L66 + fence の最初行が遮蔽されない ✓、L8 → table wrapper に L124 highlight + L124 同期 ✓。bundle.css 121.54 → 121.74 KB(+0.20 KB:cursor 抑制 rule + badge position 詳細化)、bundle.js +0.18 KB(refreshEditorActiveLine の active lookup)。budget 122 KB / 121.74 KB(99.8%)。unit 6301 / 6301、smoke sync 41 件 + visual-check 8 件 全 green
- **🎯 領域 10-1 hotfix-7: visual-verification screenshots で 3 件の視覚瑕疵を発見 → 修正(badge position / L 番号統一 / table row highlight 委譲)(2026-05-05)**:user 7 周目指示「Playwright で hotfix の結果を確認したか?何を持ってよしとしたか?」「縦に大きくスクロールするマークダウンを使用しないのか?可視エリアと不可視エリアが発生しないデータでは、今回の機能はテストできていないと判断、やり直してください」を受けて、「test pass = ship」の illusory pass 罠を踏みかけていた状態を反省。**長大 markdown(議論ログ風 ~150 行)+ 320×320 panes でオーバーフロー強制した visual check spec を新設**(`source-preview-sync-visual-check.spec.ts`、NEW、L1〜L8、各 screenshot 生成、no-assertion eyes-on harness)し、**screenshot を 1 枚ずつ目視確認** → 3 件の視覚瑕疵を発見:**(1) preview の `L<n>` badge が paragraph / fence / heading の 1 文字目を遮蔽**(L3 / L4 / L6 / L7 で確認、`position: absolute; left: -3px; top: -1px` で accent border の下に重なって "Para 1." の "P" を覆う)、**(2) editor overlay と preview badge で L 番号がズレる**(editor=caret 行 / preview=block start 行、長 fence では 14 行差で「同期していない」と見える)、**(3) table row click で preview 側 highlight 消失**(`:not(table):not(tr)` で highlight 抑制、tr が active 設定されても何も表示されない後退)。**hotfix-7 修正**:**(1)** badge CSS を `right: 4px; top: 4px;`(右上)に移動、文字を覆わない、**(2)** `updateEditorActiveLine(textarea, activeBlockStartLine?)` 引数追加、editor 側の L<n> badge を caret 行ではなく **active block の start line** で表示、両 pane で同 number 同期、**(3)** `resolveHighlightTarget(el)` を新設、target が `<tr>` / `<table>` なら closest `.pkc-md-block` wrapper に highlight delegate、`syncPreviewToCaret` / `syncCaretToPreview` 両方の active line lookup も同 helper 経由(badge label と highlight 要素が一致)。**修正後 screenshot で再目視**:L3 → L49 + "Claude" の "C" 表示 ✓、L4 → L99 + "blockMeasureRect" の "b" 表示 ✓、L7 → L66 + "function" の "f" 表示 ✓、L8 → table wrapper に緑 highlight 出現 ✓、すべて 両 pane 同 L<n> 同期 ✓。**反省**:hotfix-6 までは spec 41 件 green + CI green を「動作確認」と誤認していた。実際には L<n> badge が文字遮蔽していたり L 番号がズレていたり、screenshot を見れば一目瞭然の問題が放置されていた。reform-2026-05 §6「描画と生成は別物」doctrine の再徹底。bundle.css 121.55 → 121.54 KB(badge position の差分)、bundle.js +0.06 KB(resolveHighlightTarget helper)。budget 122 KB / 121.54 KB(99.6%)。unit 6301 / 6301、smoke 41 件全 sync spec green、新規 visual-check 8 件は no-assertion eyes-on artefact
- **🎯 領域 10-1 hotfix-6: ensureRectVisible 双方向統一 + opt-in toggle + table-崩壊 :not() scope + chrome leak gate(2026-05-05)**:user 6 周目指示「(a) editor 選択時、preview block が view 外なら必要量 scroll、(b) preview 選択時、editor caret が view 外なら必要量 scroll、(c) ブロック同期動作はボタン押下時に有効化(オプトイン設計)、(d) preview のテーブルとコードブロックが PiP modal で開く動作を完全 deactivate」への直接対応。**(1) ensureRectVisible 双方向統一**:旧 `safeScrollPane` の "comfort zone middle 50% / aim 35% from top" を撤回。target rect が visible area 内なら **scroll しない**、外なら **必要量だけ** scroll する `ensureRectVisible(scrollContainer, rect, padding)` に統一。preview 側は `blockMeasureRect(target)` を、editor 側は `getCaretViewportCoords` を渡す共通 entry point。`syncCaretToPreview` の手動 35%-from-top scroll を撤回し、`ensureCaretVisibleInEditor` 経由に。**(2) opt-in 設計**:default-on(desktop)/ default-off(mobile)を撤回し、**初期状態 OFF、ユーザーが ⇄ ボタンを押した時のみ ON**(localStorage 永続)。ボタンを押すまで block highlight + scroll は一切走らない。**(3) table layout 崩壊**:`[data-pkc-active-source]` highlight CSS scope を `:not(table):not(tr)` で絞り、`<table>` / `<tr>` への `position:relative + border-left + ::before` cascade で column width / cell border が破壊される問題を修正。table の active marker は wrapper `<div class="pkc-md-block">` のみに付ける。**(4) chrome leak 完全閉鎖**:`handleMediaViewerOpen` / `handleTableSortClick` / `handleTableFilterToggle` / `handleTableFilterInput` の 4 handler に `if (target.closest('.pkc-text-edit-preview')) return;` gate を最上位に追加。CSS で `[data-pkc-action="md-table-sort"]` / `[data-pkc-action="md-table-filter-toggle"]` / `.pkc-md-table-filter-row` / `.pkc-md-table-filter-input` を edit-mode preview scope で `display:none`。preview の table / fence をクリックしても modal が開かない、sort / filter UI も hidden。**Playwright parity 5 件**(`tests/smoke/source-preview-sync-ensure-visible.spec.ts`、NEW、各 screenshot):E1 (editor → preview, target in view → scroll 不変)/ E2 (target out of view → preview scrolls + block 可視) / E3 (preview → editor, caret in view → scroll 不変) / E4 (caret out of view → editor scrolls + caret 可視) / E5 (table click → modal は backdrop.hidden=true 維持、media viewer 開かず)。既存 hotfix-1〜5 spec を opt-in 設計に追従(各 boot helper で `addInitScript` で localStorage 設定 → sync ON 状態でテスト)。bundle.css 121.25 → 121.55 KB(+0.30 KB:edit-mode chrome 抑制 4 selector)、bundle.js 779.7 → 781.3 KB(+1.6 KB:ensureRectVisible / blockMeasureRect / opt-in 縮退)。budget 122 KB / 121.55 KB(99.6%、headroom +0.45 KB)。unit 6301 / 6301、smoke 77 → 82(+5 ensure-visible) pass
- **🎯 領域 10-1 PR 2 hotfix-5: 「同期スクロール」呼称を撤回 → 「block 対応ハイライト + caret auto-scroll」に再定義 + 業界事例調査 + 領域 10-3 IR audit doc draft(2026-05-05)**:user 5 周目指摘「行レベル一致は本質ではない、block 対応の明示が大事、中間表現(IR)導入が筋」に対応。**(1) 方針転換**:hotfix-1〜4 で行レベル sync 精度を追求していたが、markdown source line ↔ rendered HTML line は **N:M 関係**(table cell wrap / heading 高さ違い / 連続空行 / 段落 wrap / fence 行密度差)で原理的に 1:1 mapping 不能。「同期スクロール」呼称を全面撤回し、機能を **「block 対応ハイライト」**に再定義。`source-preview-sync.ts` ヘッダー + ⇄ button title + roadmap §10-1 で明記。**(2) blockTargetY 簡素化**:caret-row centre 内挿(hotfix-1 でやった)を **block 中央のみ**に縮退。block 内の行レベル位置は保証しない。**(3) table layout 崩壊修正**(user 4 周目報告):`[data-pkc-active-source]` highlight の `position:relative + border-left + ::before` が `<table>` / `<tr>` に cascade して column width / cell border を破壊していた。selector を `:not(table):not(tr)` で scope 絞り、table の active marker は wrapper `<div class="pkc-md-block">` のみに付ける。**(4) caret auto-scroll**(user 5 周目要件):`syncPreviewToCaret` 内で `ensureCaretVisibleInEditor(textarea)` を呼ぶ helper 新設。caret pixel 位置(`getCaretViewportCoords`)が textarea の visible 範囲外なら 1 line padding 付けて view 内に scroll。これで「ハイライト時に overlay が必ず可視範囲に居る」を保証。`refreshEditorActiveLine`(natural scroll 由来)からは **呼ばない**(user の wheel input と fight しない)。**(5) 業界事例調査**(Agent、出典 30 件以上、1 次資料込み):VS Code 内蔵 `pluginSourceMap` + `scroll-sync.ts` / Joplin sync_scroll spec / Codebraid Preview Pandoc sourcepos / iA Writer top element matching / Markdown-Edit "fraction → block anchor" 移行記録 等を解析、結論:**PKC2 の現方針(block-level highlight + caret follow + IR は別 wave)は業界 de facto standard と完全一致**。N:M 問題を真面目に解いた事例は誰も無い。boolean lock(VS Code が counter に変更)、hidden 要素 filter(Joplin issue #9920)、scroll fraction 単独(Dillinger / 旧 Markdown-Edit が辿った失敗)等の地雷も整理。**(6) 領域 10-3 IR audit doc draft**(`docs/development/intermediate-representation-audit.md`、NEW):IR 導入の trigger / scope / token shape / 段階移行計画 5 phase / Q1〜Q7 オープンクエスチョン / 業界事例横軸 / 「IR 専用層 vs markdown-it token 直接利用」設計判断 を整理。Phase 1 spec landing 後に Phase 2 parser → Phase 3 HTML renderer → Phase 4 領域 10-1 を IR 上で再構築 → Phase 5 Word / PPT(領域 10-5 と合流可能)。**(7) 既存 hotfix-1〜4 spec の整合**:caret-row 比例 scroll / scrollTop monotonic 等の line-level 主張 assertion を block-level の「同 fence wrapper が active」に書き換え(parity spec scenario 2 / multiangle scenario 6)。bundle.js +1.25 KB(ensureCaretVisible / blockTargetY 簡素化での net 微増)、bundle.css +0.03 KB(:not() selector + IR audit doc は src 不変)。budget 122 KB / 121.25 KB(99.4%、headroom +0.75 KB)。unit 6301 / 6301、smoke 71 → 77 維持(本 hotfix で test 件数変化なし、内容のみ書き換え)
- **🚨 領域 10-1 PR 2 hotfix-4: caret out-of-view で overlay が「視覚効果なし」になる bug 修正 + 同期 line badge + on-screen debug overlay + jitter spec(2026-05-05)**:user 実機テスト 4 周目報告「(a) テストケースが人間の揺らぎを反映していなさすぎる、(b) オーバーレイが可視範囲外にいってしまい視覚効果が意味のないものになっている、(c) 同期要素がない」への直接対応。**(a) jitter diagnostic 新設** = `source-preview-sync-jitter-diagnostic.spec.ts`(NEW、6 scenario)で touchpad-like 揺らぎを `WheelEvent` の小数 deltaY(`12.4 / 18.7 / 22.1 / ...`)+ `~16ms` 間隔の rapid burst + caret 移動 ↔ wheel 反転の suppression-window 衝突 + 30 step mixed-direction loop で再現。各 step で `caretInView` / `overlay display` / `overlay top` / `previewActive line` / `scrollTop` を console log + 5 step ごとに screenshot 添付。**(b) bug 発見 + 修正** = jitter spec の J2 で発見:caret top=−633(textarea 上端を遥かに超えて画面外)なのに hotfix-2 の clamp ロジックは overlay を textarea の top edge に張り付けていた → 「視覚効果が意味のないもの」状態。修正は `updateEditorActiveLine` を **clamp → hide** に変更:`caretBottom <= visibleTop || caretTop >= visibleBottom` なら `overlay.style.display = 'none'`。これでユーザーは「overlay 見える = caret on screen」「overlay 無い = caret は scroll で隠れている」を曖昧さなく読める。J2-assert scenario で hidden state を assert + screenshot 添付。**(c) 同期要素 = line 番号 badge**:editor overlay に CSS pseudo-element `::after { content: "L" attr(data-pkc-active-line); }` で右端 badge、preview active block に `::before { content: "L" attr(data-pkc-source-line); }` で左 border 上 badge。両者が同じ accent 色 + 同じ `L<n>` 表示で、「両方とも L5 = 同期 OK」「片方 L5 / もう片方 L7 = ずれ」を視覚で zero-shot 判定可能。J2-badges scenario で同 line を assert + screenshot。**(d) on-screen debug overlay 強化** = `?pkc-debug=split-sync` URL flag が ON なら、画面右上に固定 panel(`#pkc-split-sync-debug-panel`、9999 z-index)で `caret line / caret top / inView / textarea scroll / preview line / preview scroll / sync enabled / suppress flags` を real-time 表示。`syncPreviewToCaret` / `refreshEditorActiveLine` 各 update 時に refresh、`updateDebugPanel(textarea, preview)` を呼ぶ。実機で symptom が出た時に **画面に出ている数値を user が screenshot するだけで sync state が完全把握できる**ground truth 整備。bundle.css 120.59 → 121.22 KB(+0.63 KB:active-line + active-source の line badge)、bundle.js +1.61 KB(updateDebugPanel + ensureDebugPanel + clamp→hide ロジック)。budget 122 KB / 121.22 KB(99.4%、headroom +0.78 KB)。unit 6301 / 6301、smoke 71 → 77 pass(+6 jitter diagnostic 含む)
- **🚨 領域 10-1 PR 2 hotfix-3: editor overlay Y \"illusory pass\" 修正 + real OS wheel diagnostic + handleEditorScroll を overlay-only に縮退(2026-05-05)**:user 実機テスト 3 周目報告「(a) スクロールの件は治っていない、Playwright で証拠は?(b) 編集窓で選択した行とオーバーレイが一致しない」への直接対応。**(a) overlay Y bug** = hotfix-2 の `updateEditorActiveLine` は `caretLine * lineHeight - textarea.scrollTop` で Y を計算し、textarea の **padding-top / border-top を見落としていた**。Playwright spec も同じ flawed 公式で `expectedTop` を計算していたため、test は trivially pass = **PR #206 と同種の illusory pass**。fix:`getCaretViewportCoords()`(既存 mirror-div helper、PKC2 の snippet sheet で既に使用)を使って **real caret pixel 位置**を取得 → padding / border / line-wrap / font metrics 全て正しく反映。Playwright assert も real caret rect ベースに切り替え(scenario 1)。**(a) "scroll が治っていない" の検証** = `tests/smoke/source-preview-sync-real-wheel-diagnostic.spec.ts`(NEW、4 scenario)で `page.mouse.wheel(0, deltaY)` で **real OS wheel events**(CDP 経由)を発火 → 単方向連続 5 回 / 逆方向 / caret 移動後 / 80ms tight window 全 4 scenario で deltas を console log + screenshot。chromium 環境では **scroll-swallow bug は再現しない**(全 deltas 期待通り `[50, 50, 50, 50, 50]` / `[-50, -50, -50]` / etc.)。証拠 = test artifacts 内の log + screenshot。Mac touchpad inertia / 別 OS 固有挙動の可能性は残るため、**conservative 副作用削減** として `handleEditorScroll` を `syncPreviewToCaret` 呼出から `refreshEditorActiveLine`(overlay 更新のみ)に縮退、editor scroll が preview の programmatic scroll を triggering して inertia と race する経路を排除。**(c) test 設計反省** = scenario 2 で「editor overlay Y ≈ preview active-block Y(±100px)」を assert していたが、editor textarea と preview pane は **independent layout** なので絶対 Y 一致は不成立(line 11 で editor=463 / preview=234 の delta 229)。assert を「両方が同時に visible」に修正。bundle.js +0.32 KB(refreshEditorActiveLine helper + caret-position import)、bundle.css 不変。unit 6301 / 6301、smoke 67 → 71(+4 real-wheel diagnostic)
- **🚨 領域 10-1 PR 2 hotfix-2: scroll suppression flag 早食い + editor active-line overlay + preview chrome 抑制(2026-05-05)**:user 実機テスト 2 周目報告「(a) 編集側でタッチパッドからスクロール後、逆方向 scroll が**一度だけ効かない**、(b) preview の copy button / table chrome の hover overlay が編集中に邪魔、(c) editor 側に現在編集行 overlay が無いため視覚的にずれが見えない」に対する 3 修正。**(a)** `handlePreviewScroll` の filter 順序が逆で、capture-phase root listener が editor textarea の scroll でも `consumeScrollSuppression()` を呼んで flag を**早食い**していた。filter(`data-pkc-region="text-edit-preview"` 以外を return)を `consumeScrollSuppression` の **前** に置く 1 line 修正で解消。**(b)** `.pkc-text-edit-preview .pkc-md-copy-btn { display: none !important; }` で edit-mode preview スコープ限定で copy button を非表示。`:hover` / `:focus-within` も同 scope で抑制。view-mode preview には影響しない。**(c)** 新 element `.pkc-editor-active-line` を split editor wrapper に absolute-positioned で重ね、`source-preview-sync.ts` の `updateEditorActiveLine(textarea)` が caret line × line-height − textarea.scrollTop で Y を計算、textarea visible 領域に clamp。editor の natural scroll(タッチパッド)も `handleEditorScroll` で listen して overlay を追従させる(caret 不変 + scroll のみで overlay が stale になる回帰を防ぐ)。pointer-events: none で textarea 操作を妨げない。**Playwright 視覚 parity spec 6 件**(`tests/smoke/source-preview-sync-editor-overlay.spec.ts`、NEW、各 screenshot 添付):caret 行 × line-height で overlay が出る / editor overlay Y と preview active-block Y が **同じ視覚位置**(±100px、wrapper padding 込み)で並ぶ / ⇄ OFF で hidden / copy button が edit-mode preview で hidden(hover 後も)/ textarea scroll で overlay 追従 / **editor scroll → 逆方向 scroll で flag 早食い回帰 guard**。**user demand 直接対応**:「この機能をつければ、プレイライトでずれが生じたことが視覚的にもわかるんじゃない?」 — editor active-line overlay は **Playwright screenshot で「caret 行 marker と preview block highlight が同じ y で並ぶ」を視覚で zero-shot 判定可能** にする ground truth。bundle.css 120.15 → 120.59 KB(+0.44 KB:.pkc-editor-active-line + edit-mode chrome 抑制 rules)、bundle.js +1.22 KB(updateEditorActiveLine helper + handleEditorScroll listener)。budget 122 KB 内、headroom +1.4 KB。unit 6301 / 6301、smoke 61 → 67 pass(+6 新規 overlay spec)
- **🌿 YAML natural extension wave:自然な YAML 記法 + 防御層 + `/pkcfm*` snippet(2026-05-08)**:user 議論「frontmatter の YAML 実装は独自で簡易?複数行指定はできない?」「YAML 標準準拠が user 期待」「制限 + 警告も同時に」「自然な書き方を維持する範囲のパーサー実装」「/pkcXXXX 系 snippet にコメント付きテンプレ登録」を踏まえた一括 reform。**Parser 拡張**:(1) **nested mapping**(`page:\n  margins:\n    top: 1cm`、深度 ≤ 4)、(2) **block scalar `|`(literal、改行保持)/ `>`(folded、改行を space に fold)**、(3) **quoted-aware comment strip**(`title: "a # b"` の `#` を comment 扱いしない bug 修正、YAML 標準準拠)、(4) **行頭 / 行末 comment**(既存挙動継承、quoted を尊重)。**FrontmatterValue type** を `string | number | boolean | null | FrontmatterValue[] | { [key]: FrontmatterValue }` に拡張、再帰下降 parser に再構築。**防御層**:全 frontmatter サイズ ≤ 16 KB / 全 key 数 ≤ 100 / 階層深度 ≤ 4 / 単一配列 ≤ 500 / 単一 string 値 ≤ 4 KB / 禁止 key `__proto__` / `constructor` / `prototype`(prototype pollution 防御)。**可視 warning**:limit 超過 / forbidden key / 重複 key / 不正 line を `result.warnings: FrontmatterWarning[]` に貯めて、`buildFrontmatterWarningElement(...)` / `buildFrontmatterWarningHtml(...)` 経由で `.pkc-frontmatter-warning` banner として preview 先頭に注入(silent fail を避ける)。6 surface(center / Split View live / Viewer popup / textlog log / 平文 fallback / `<div>` 経由 detail)に wiring。**`/pkcfm*` snippet 登録**:`SLASH_COMMANDS` に 7 件追加 — `/pkcfm`(基本)/ `/pkcvars`(`{{vars.x}}`)/ `/pkcfmbook`(蔵書)/ `/pkcfmpaper`(論文 + `abstract: |`)/ `/pkcfmvideo`(動画)/ `/pkcfmpage`(orientation / margins nested 例)/ `/pkcfmnote`(literal `|` + folded `>` 両方の見本)。各 template に **行頭 `#` コメント**で「どこに何を書くか」を内蔵、user は穴埋めで自然な YAML を覚えなくて書ける。**テスト**:unit `+30` 件(`tests/features/markdown/frontmatter.test.ts` で nested 4 / block scalar 5 / comment 4 / limits 7 / extractVars 5 / warning DOM helper 5)+ slash-menu integration `+8` 件(全 template が parse warning 0 で通る / `/pkcfmnote` の `|` `>` が改行保持 / fold 動作)+ visual parity smoke 1 件(`wave-10-2-phase2-yaml-natural-extension-parity.spec.ts` NEW、warning banner 3 種が preview / detail 両方で visible + prototype pollution 阻止 + screenshot 2 枚)。全 6794 unit pass、wave-10-2 smoke 全 pass。**Out of scope**:YAML anchors / aliases / merge keys / type tags / explicit indent indicator(`|2`)+ chomping(`|-` `|+`)— natural な記法には不要、要望ベースで後追い。**bundle 影響**:bundle.js +0.97 KB(parser ~250 LOC + warning helper)/ bundle.css +0.49 KB(`.pkc-frontmatter-warning` rule)。
- **🚨 M-7 follow-up Split View hotfix:embed 未展開 + line offset ずれ(2026-05-08)**:M-7 follow-up #381 着地の同 wave で user 実機テスト(Detail Split View 編集中)報告「Split View の表示がおかしい」への対応。screenshot で 2 件の bug を確認:(a) **embed `![](entry:LID)` が preview に展開されない**(`![子](entry:moxex164-0004)` が placeholder のまま不可視)、(b) **caret line と preview highlight が乖離**(textarea 行 6 の `# {{vars.title}}` を編集中なのに preview では 3 番目の `# 親` が L6 highlight)。原因:Split View edit mode preview を作る 2 経路(`detail-presenter.ts:renderEditorBody` 初回 + `action-binder.ts:updateTextEditPreview` debounced)で(a)`expandTransclusions` を呼んでいない、(b)`parseFrontmatter().body` で frontmatter 行を削ったぶん `data-pkc-source-line` が原文 textarea と乖離していた。**Fix**:(1) `renderMarkdown` に `sourceLineOffset?: number` option を追加、internal lineMap 初期化を `[offset, offset+1, ...]` に変更して preprocessor lineMap thread と直交。(2) Split View preview の 2 経路(detail-presenter / action-binder + renderer.ts post-creation)で `parseFrontmatter` の strip 行数を計算 → `sourceLineOffset` で渡す。(3) 同 2 経路で markdown render 後に `expandTransclusions(preview, { entries, ..., hostLid })` を呼び、container を取得して transclusion を必ず展開。**テスト**:unit 5 件追加(`markdown-render-source-anchors.test.ts`:offset 0 identity / offset 4 全 block 底上げ / frontmatter strip シミュレーション / offset 未指定後方互換 / source-end への伝播)、visual parity smoke 1 件追加(`wave-10-2-phase2-m7-split-view-embed-frontmatter-parity.spec.ts` NEW、TEXTLOG log を host TEXT entry に embed → Split View edit mode preview で transclusion section 1 件 + `# 親` heading の `data-pkc-source-line="5"` + `# 末尾` heading の `data-pkc-source-line="9"` + frontmatter content 不可視 + screenshot)。全 6761 unit pass、wave-10-2 + source-preview-sync 30 smoke 全 pass。**bundle 影響**:bundle.js +0.3 KB(expandTransclusions 結線 + sourceLineOffset 算定)、bundle.css 不変。
- **🚨 M-7 follow-up: embed / Viewer popup / 平文 fallback の frontmatter 露出 hotfix(2026-05-08)**:user 報告「embed した TEXTLOG エントリで frontmatter が露出する(プレビュー表示もされていない)」への直接対応。M-7 第 1 弾で 3 surface(center pane / Split View preview / Viewer popup)+ Rich copy までは frontmatter strip + vars 展開を contract 化したが、(a) **embed 経路**(`transclusion.ts` の `renderEmbeddedLog` / `renderEntryEmbed`)、(b) **Viewer popup TEXT path**(`rendered-viewer.ts` の `buildBodyHtml`)、(c) **平文 fallback**(`detail-presenter.ts` / `textlog-presenter.ts` の `hasMarkdownSyntax(...) === false` 経路)で `parseFrontmatter(...).body` 適用が抜けていた。embed 内で markdown 経路に流れた場合 `---\nkey: value\n---` が `<hr>+text+<hr>` として render され、平文 fallback では raw frontmatter が `textContent` に直接出力されていた(プレビューが壊れて読めない)。**Fix**:5 経路すべてで `extractVars(rawSource)` + `parseFrontmatter(rawSource).body` を呼んで live presenter と同 contract に揃える(CLAUDE.md §9 dual-render path 規約の 3 surface に embed 経路を追加した形)。embed 経路では vars expansion も同時に有効化し、center pane と Viewer popup の embed で `{{vars.x}}` が同じく展開される。**テスト**:transclusion DOM 11 ケース matrix(simple fm strip / flat dot vars / nested object vars / per-log vars 独立 / fm-only log / unclosed fm / 平文 + fm / fm 無し regression / TEXT entry embed × 3)、rendered-viewer 4 ケース(simple fm strip / flat vars / nested vars / fm 無し regression)、visual parity smoke 1 件(`wave-10-2-phase2-m7-embed-frontmatter-parity.spec.ts` NEW、TEXTLOG log → TEXT host embed → center pane + Viewer popup の両 surface で frontmatter 不可視 + vars 展開 + 未定義 warning 0 件 + screenshot 2 枚)。全 6766 unit pass、177 smoke pass(+1 新規)。**bundle 影響**:bundle.js +0.04 KB / bundle.css 不変(strip ロジック呼び出し追加のみ、新規 CSS rule なし)。
- **wave-10-2 Phase 2 第 1 弾:M-7 Variables `{{vars.x}}` 着地(2026-05-08)**:文書内変数を frontmatter で定義 → 本文中で `{{vars.x}}` 展開する markup を実装。同じ本文を複数の宛先 / 用途別 variant として再利用可能になり、AI(ChatGPT / Claude 等)に「vars だけ書き換えて経営層 / 現場別の variant を生成して」と指示できる文書 production tool としてのポジション確立。**仕様**:frontmatter `vars:` block(YAML object 形式)or `vars.<key>:`(flat dot 形式)で定義 → 本文中 `{{vars.<key>}}` で展開、未定義は赤点線下線の `<span class="pkc-variable-undefined">` で visible warning(silent fail 防止)。展開 timing は render 時(OQ-6 確定)。`{{ vars.x }}` 内側空白許容、`\{{vars.x}}` で literal escape、code span / fenced 内では展開しない。`{{macros.x}}` / `{{export.x}}` 等 vars 以外は Phase 2 では未対応 = literal で残置。**実装**:`extractVars(body)` helper を `frontmatter.ts` に追加(2 形式併用 OK、後者優先)、markdown-it inline rule `pkc_variable` を `emphasis` 後段に登録、`renderMarkdown(text, { vars })` の opts.vars 経由で env に流す、3 surface(center pane / Split View preview / Viewer popup)+ Rich copy 全経路で `extractVars` → 渡し対応(reform-2026-05 §9 dual-render path 規約)。**テスト**:unit 18 件(extractVars 6 + 基本展開 / 未定義 / escape / 衝突 / 13 ケース matrix)、visual parity smoke 1 件(`wave-10-2-phase2-m7-variables-parity.spec.ts` NEW、3 surface で展開 + 未定義 warning visible 確認 + screenshot 3 枚)、全 543/543 markdown unit PASS。**ドキュメント**:AI 規約書 v1 §2.12 NEW + §3.5 「同じ文書を宛先 variant にしたい」when-to-use + §5 checklist 10 番目追加、Manual 章 12 §12.6 NEW(中身 + AI 連携 prompt 例)+ §12.7 Phase 2 残項目に shift、spec doc §3.6 status 更新、roadmap §10-2 + INDEX 同期。**bundle 影響**:bundle.js +0.26 KB / bundle.css +0.16 KB(数十 byte の inline rule + 1 CSS rule)。**Known limitation**:`{{macros.x}}` block 展開 / nested keys(`{{vars.x.y}}`)/ `{{export.format}}` etc. の名前空間は Phase 3 以降で対応予定、Phase 2 範囲外。
- **wave-10-2 Phase 1 完成 wave 締め(2026-05-07〜2026-05-08、27 commits)**:Phase 1 全 9 markup(L-1〜L-9)+ 周辺機能の wave クローズ。**実装着地**:L-1 Section break(`+++ {role=...}`)/ L-2 Inline 修飾(`==hl==` / `[[ruby:base|読み]]` / `[[em:傍点]]`)/ L-3 Blockquote(commonmark 準拠)/ L-4 Comments(`%%inline%%` / `%%%block%%%`)/ L-5 行頭 align prefix(`||` / `|>` / `<|`)/ L-6 簡易 inline `:text:attrs:`(em-based size + `<N>%`/`<N>em` 自由値含む全 vocab)/ L-7 Figure/Table/Equation block + 自動採番 + `[@id]` 参照 / L-8 空行マーカー(`_` / `_<N>`、1〜20)/ L-9 段落先頭 1 字下げ(`__` / `＿`)。**周辺機能**:iPhone snippet toolbar に Phase 1 拡張 9 種を追加(計 20 snippet)、Rich copy で PKC 拡張を inline `style="..."` に変換して ONLYOFFICE/Word/Gmail で書式維持(`htmlForRichCopy` ヘルパ + 13 unit)、CSV cell に inline markdown parser を通して `==hl==` / `:text:attrs:` 等を cell 内で render、favicon を `build/favicon.{svg,png,ico}` から auto-detect で data URI inline する pipeline + apple-touch-icon 同伴。**hotfix 群**(2026-05-07〜08):L-5 連続 prefix 行 merge bug、CSS unclosed brace で iPhone レイアウト崩壊、Viewer popup での L-1〜L-9 CSS 不適用 + transclusion expand 不足、Split View(sourceLineAnchors path)で sentinel が glyph 漏れ、Split View 同期ブロック表示が崩れる(LineMap thread で原文行に逆引き)、fenced code block 内で marker 誤発火、行頭 leading whitespace 統一許容(行頭系シンプル記法は半角 SP / TAB / 全角 SP 全 strip)。**ドキュメント**:human-oriented spec(`markdown-dialect-extensions-spec-2026-05.md`、§3.10 / §3.11 / §4.5 拡充、~800 行)+ **AI 書き手向け規約書 v1**(`docs/spec/markdown-dialect-for-ai-authors-v1.md` NEW、self-contained 構文規約 + when-to-use 判断ガイド + NG 一覧 + 出力前 checklist + 複合例 + version policy)で 2-tier docs strategy 確立。AI が PKC2 entry を生成する際は AI 規約書 v1 単体を prompt に流せば自己完結(user direction 2026-05-08「AI 向け規約書」に応えた)。**テスト**:unit `+177` 件(L-1 11 / L-2 14 / L-3 10 / L-4 9 / L-5 14 / L-6 23 ケース matrix / L-7 11 / L-8 13 / L-9 11 / fence-safety 10 / rich-copy-transform 13 / その他)、visual parity smoke 10 件(L-5 multi-line / Viewer Phase 1 / L-6 size + L-8 blank / Viewer transclusion / Split View glyph leak / Split View line alignment / Rich copy clipboard / hotfix 全部入り / 等)、全 6718 unit + wave-10-2 smoke 全 PASS。**bundle 影響**:bundle.js 943KB / 4608KB(20.5%、余裕)、bundle.css 146KB / 512KB(28.5%)、dist/pkc2.html 1.43 MB / 5MB 予算(28.6%、favicon 200KB inline 込み)。**教訓**(CLAUDE.md に追加候補):surface 別 dual-render path(center pane vs Viewer popup vs Split View preview)を触る時は **CSS mirror + features 層 DOM 操作経路の両方**を確認する習慣を確立。preprocessor 経由の line shift は LineMap で thread して sync 系の lookup を維持する。
- **wave-10-2 Phase 1 補完: L-6 size token 拡張 + L-8 空行マーカー新設(2026-05-07)**:user 報告「文字の大きさを変える仕様を入れ忘れた」「空行を行頭のアンダースコアで指定したい」への対応。**L-6 size token**:`xs/sm/md/lg/xl/2xl/3xl` の 7 段階 + 自由値 `<N>%` / `<N>em` / `<N>rem` / `<N>px` を `parseSimpleInlineAttrs` に追加。size keyword は body text の **相対 size**(em-based、xs=0.75em / lg=1.25em / 2xl=1.875em / 3xl=2.5em)に揃え、`var(--fs-*)` 経由(chrome scale で body と差が出にくかった)から差し替え。既存 attrs(`bold`, `red`, `bg-black` 等)と混在可能。**L-8 空行マーカー**:`_` 単独行 → 1 空行ぶん、`_<N>` → N 空行ぶん(1〜20 で clip)。`<div class="pkc-blank-line" data-pkc-blank-count="N" aria-hidden="true">` を `--pkc-blank-line-h: 1em` × N の高さで描画。CommonMark の空行 collapse 仕様で本文中の余白制御ができない問題に明示マーカーで対応。markdown-render パイプラインの sentinel pattern(L-1 / L-7 と同じ Unicode PUA 経路)を使い、html: false の安全性を保ったまま `<p>` wrap を post-process で剥がして `<div>` 化。**Viewer popup mirror**:reform-2026-05 §6 で確立した「main app base.css + Viewer inline style 双方に CSS を mirror する規約」に従い、両者に同等 rule を追加。**unit 11 件 + 23 ケース matrix(L-6)**(`tests/features/markdown/blank-line-l8.test.ts` NEW、`tests/features/markdown/simple-inline-l6.test.ts` UPDATE)+ **visual parity smoke 1 件**(`tests/smoke/wave-10-2-l6-size-l8-blank-parity.spec.ts` NEW、main app + Viewer popup の computed font-size + blank-line 高さ + 順序関係を assert + screenshot 2 枚)。bundle.css 147.50 → 149.52 KB(+2.02 KB:blank-line 20 段の N×height rule)、bundle.js 957.76 → 960.74 KB(+2.98 KB:size keyword expansion + blank-line preprocessor + post-processor)。spec doc `markdown-dialect-extensions-spec-2026-05.md` §3.10 NEW + §4.5 vocabulary 表 update。
- **🚨 領域 10-1 PR 2 hotfix: 実コンテンツで anchor 消失 / 行単位粒度不足 / 大ブロック内 scroll 暴走の 3 件修正(2026-05-05)**:user が PR 2 を実機テスト → 「画面幅によって縦幅を変えるオブジェクトがあると、あっという間に表示ずれている」報告。PR #206 paused と同じ系統の罠を再露呈したため即時修正。**root cause 3 件**:(a)`md.renderer.rules.fence` の **CSV 専用 custom renderer** が独自 HTML を return して `token.attrs` を bypass、`tagSourceLines` が書いた `data-pkc-source-line` が **silent に消失**、(b)`tr_open` が `SOURCE_LINE_TOKEN_TYPES` 不在のため、長 table 内の click が全行 table_open へ jump して使えない、(c)`blockTargetY` が「proportional offset」で計算していたため、巨大 block(40 行 fence、CSV → table 等)で caret-row が viewport 外に逃げる。**修正**:(a) `wrapWithCopyButton(html, kind, extraAttrs)` を引数化して outermost wrapper に source-line attrs を伝播、`md.renderer.rules.fence` / `md.renderer.rules.table_open` で `collectSourceLineAttrs(token)` を呼ぶ contract 化、(b) `tr_open` を `SOURCE_LINE_TOKEN_TYPES` に追加、(c) `blockTargetY` を「block fits in viewport なら中心、超える場合は caret-row の rendered center を target」に再設計。**将来の IR 経路への配慮**(2026-05-05 user 提言「中間表現からの分岐」):`makeSourceLineAttrs(start, end)` を **token-agnostic** な generic helper として export、`collectSourceLineAttrs(token)` をその薄い wrapper に分解。領域 10-3 で IR walker が来た時、IR token から直接 `makeSourceLineAttrs(node.startLine, node.endLine)` を呼ぶ移行経路を確保。階層を「がちがちに固める」のは避け、入口だけ generic 化。**markdown-render-scope.md** に「拡張時の source-line anchor 規約」§ + 「将来の IR 経路への配慮」§ 追記、custom renderer 開発者の防御線に。**Playwright parity 強化**:user 直接 demand「**スクロール反復 / 上下端 / 上下端後の戻し / preview→editor / editor→preview 多角的検証 + screenshot**」に対応する `source-preview-sync-realcontent-multiangle.spec.ts`(NEW、7 scenario、各 screenshot 添付)+ 診断用 `source-preview-sync-realcontent-diagnostic.spec.ts`(NEW、3 scenario、行ごと console log)。Up→down 反復 / 上端到達 → 戻し / 下端到達 → 戻し / CSV fence 内 monotonic scroll / 候補5案 5 行 click → 異 line / ⇄ OFF 中 sync 抑止、を全件 real OS event で観測。unit 6294 → 6301(+7、makeSourceLineAttrs 4 + fence/table/tr 各 1)、smoke 51 → 61(+10、診断 3 + 多角 7)。bundle 不変。

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

### Wave 10-9 stabilization 連続 hotfix Δ5〜Δ34(2026-05-07、修正指示 9〜10 + user 連続報告)

Wave 10-9 の **stabilization 連続 hotfix**。user 実機テストで挙がった修正指示 9〜10 + wave 中追加報告(Galaxy / Venn / rubber band / Ctrl+click / 楕円 / 右クリック等)を 1 stack PR(#363)に集約して着地。詳細は [`docs/development/wave-10-9-stabilization-summary.md`](../development/wave-10-9-stabilization-summary.md)。

#### 着地内容(Δ5〜Δ34)

- **Δ5**:filer multi-select に **bulk tag / color-tag / relation 一括付与** を追加。`bulk-add-tag-input` / `bulk-set-color-tag` / structural relation 同時連結。tag 入力は Enter 確定で全選択 entry に同 tag を unshift、他要素(タイトル / body / 既存 tags)は完全不変保証。
- **Δ6 combo**:graph theme/WCAG 改修 + **color-tag relations**(同色 group の chain edge を `cssColor` 直指定で描画、`renderer.ts:6441-6467` + `graph-canvas.ts:604`)+ time-proximity 重複改善 + Git 風更新点 dot。
- **Δ7**:filer 行ズレ撃退の決定版。pixel-fixed `line-height: 21px` + `height: 33px` で sub-pixel 起因の行ピクセルズレを完全撃退、`getBoundingClientRect()` で delta 0px 確認 + screenshot crop で視覚 parity 検証。font 差 / theme switch でも崩れない。
- **Δ8** + Δ8-fix2:inline-calc 計算式評価が **indent 行 + list marker 行** で動かない bug を抹本修正。`handleEditorEnter` で `value[start-1] === '='` のとき早期 return して inline-calc に Enter を譲る。`detectInlineCalcRequest` を backward scan + list marker(`-` / `1.`)skip に拡張。**14 ケース matrix**(indent variations / list markers / 全角混在 / decimals / parens / unary minus / div0)で全件 pass 確認、smoke D-10 spec 追加。
- **Δ9**:`TOGGLE_MULTI_SELECT` reducer が `selectedLid` を action.lid に移動して filer scope を破壊する bug を修正。`includeAnchor` flag 導入で sidebar / Filer の multi-select 独立性確保。同 PR で **Venn/Region toggle 不反応** + **graph node 重なり** も改善(linkDistance 240 / charge -1000 / collideRadius 70)。
- **Δ10**:time-proximity mode の同 X bucket(同月 entry)重なりを 38→4 pairs に削減。2D grid 配置 + lane 振り分けで viewport 内に均等散布。
- **Δ11**:Detail→Filer 戻り動線(navigation breadcrumb)+ popup caret indicator 初期実装 + 時系列重なり改善の continuation。
- **Δ12〜Δ16**:popup caret 表示の viewport-absolute clip 修正(Δ12)/ 時系列軸再設計(graphTimeRangeStart/End)(Δ13)/ Flags Tier 1 readonly 化 + UI 表示(Δ14)/ sidebar 震動撃退(Δ15)/ multi-select anchor flag(`TOGGLE_MULTI_SELECT { includeAnchor: false }`)で sidebar/Filer/graph 独立(Δ16)。
- **Δ17〜Δ19**:folder=junction 視覚化(time-proximity では除外、他 mode では diamond)(Δ17)/ filer multi-select 中 row click は detail 切替せず TOGGLE_MULTI_SELECT 経由で誤操作防止(Δ18)/ filer view で create-entry 押下時の screen lock を SET_VIEW_MODE 'detail' 先打ちで解消(Δ19)。
- **Δ20〜Δ22**:region UX 用途を toolbar text で明示(Δ20)/ Venn を真の集合 hull(凸包風 circle envelope + translucent fill + additive blending)に再設計(Δ21)/ Galaxy を perspective scale 1/(1+depth*0.18) + alpha + z-sort で 3D 化(Δ22)。
- **Δ23〜Δ24**:ZIP import OOM 撃退の streaming 化(`streamZipEntries` + `readZipCentralDirectory` + `readZipEntryData`)(Δ23)/ folder 完全除外撤回 → time-proximity 限定で除外、他 mode では junction として描画(Δ24)。
- **Δ25〜Δ26**:Filer 一括操作 UI を **Filer view 内** に移設(sidebar から脱出、`buildFilerMultiActionBar` 関数化)(Δ25)+ 深 folder path の breadcrumb collapse + segment max-width + ellipsis(Δ25-2)/ Galaxy 銀河強化:600 個 starfield + node halo + galactic core radial gradient(Δ26)。
- **Δ27**:ZIP import の **SHA-256 dedup を撤回**(50-200ms × 1000 assets = 100 秒 hang の元凶)、key Set のみで dedup。`bytesToBase64` を 0x8000 byte chunk 分割 + `String.fromCharCode.apply` で高速化。**progress toast** を 250ms throttle で表示、`console.log` checkpoint も整備。
- **Δ28**:時系列 archetype が **一直線並び** に見える違和感を hash-based jitter ±15px(X/Y)で自然散布。
- **Δ29**:Galaxy/Venn の toggle button **caption 即時更新**。dispatcher は state listeners を event listeners より先に notify するため、`SET_FLAG` の state listener 実行時点で flag source が古い値だった root cause を `FLAGS_CHANGED` handler 内 `queueMicrotask` 再 render で解消。
- **Δ30**:graph view 上部にも **multi-action-bar** を表示。Filer まで戻らずに graph 内で直接 bulk delete / move / tag / color。`buildFilerMultiActionBar(state, viewCtx)` を一般化、sidebar 側は `viewMode === 'graph'` のとき skip。
- **Δ31**:region 選択を **矩形 → 楕円** に置換。描画は 64-segment 手動 path(happy-dom が `ctx.ellipse` 未対応のため)、hit test は `((x-cx)/rx)² + ((y-cy)/ry)² ≤ 1`。region-slice test を ellipse 内包前提に再調整。
- **Δ32**:graph node 左クリックで **Ctrl/Meta/Shift 修飾子** を modifier として `pkc-graph-node-click` CustomEvent detail に同梱、action-binder 側で `TOGGLE_MULTI_SELECT { includeAnchor: false }` に分岐。
- **Δ33**:node drag → **接続ノードが rubber band で追従**。dragLid + 1-hop neighbor (factor 0.55) + 2-hop neighbor (factor 0.25) の元位置を保存し、cursor delta を decay 付きで positions Map に直接反映。drag 終了で session 状態破棄。
- **Δ34**:左クリック=**graph 操作専用**(SELECT_ENTRY のみ、view 切替なし)、右クリック=**context menu**(`pkc-graph-node-context` event → `renderContextMenu({ showOpen: true })` で 🔍 Open + 既存 Edit / Delete / Move)。誤操作で意図せず detail に飛ぶ問題を解消。

#### Wave 統計

- 着地 commit 数:**122**(Δ1〜Δ34、Δ8-fix2 等の連続修正含む)
- 着地 PR 数:**100**(#260〜#363、欠 #352、stack の HEAD は #363)
- bundle.js:785 → ~947 KB / bundle.css:120 → ~146 KB(budget 再評価候補)
- tests:6259 → **6564** pass、smoke spec 41 → ~100 件、すべて green

#### 既知の残バグ(merge 後持越し、user 認識済み)

- bundle.css 146 KB:CHANGELOG 記載 budget 98 KB 超過 → 次 wave で領域 9 重複削減 Phase 2c で吸収予定
- rubber band drag は 2-hop までで止まる(N-hop physics は別 wave)
- drag 後の position は次 re-render で消える(pin 留めは未実装、別 wave 候補)
- 既存 lint 警告 2 件(action-binder.ts:242 U+3000 / parse-capture-json.ts:16 import restriction、本 wave 起源ではない)

詳細 + merge 戦略は [`docs/development/wave-10-9-stabilization-summary.md`](../development/wave-10-9-stabilization-summary.md) + [`docs/development/codespaces-merge-playbook-wave-10-9.md`](../development/codespaces-merge-playbook-wave-10-9.md) 参照。

### Wave 10-9 hotfix PR-Δ4(2026-05-07、修正指示9)

- **graph node 過密 + サイズ抹本見直し(PKC1 依存撃退)**:user 報告「ノードサイズがリレーションやタイトルに比べて異常に大きく、ノード間が過密、視認性の著しい低下あり」への対応。
- **修正**:
  - `graph.node_radius_factor` flag default を **0.45 → 0.35**(視覚半径 50 × 0.35 = 17.5 px、PR-TTT の 0.45 比 -22%)。label / edge を node より優先表示
  - `DEFAULT_FORCE_PARAMS` を 抹本見直し:
    - `linkDistance` 120 → **180**(edge 自然長↑、繋がりが見える)
    - `charge` -380 → **-600**(反発↑、銀河風に散らばる)
    - `collideRadius` 36 → **50**(label 重複領域を確保、最低 100 px の間隔)
  - PKC1 force-layout 値からの離脱、PKC2 独自の readability 優先設計
  - 既存 unit test `force-layout.test.ts` の link distance bound を default linkDistance 比相対(0.4× 〜 1.4×)に書き直し、将来の値変更に追従
- **Playwright 視覚確認**:`tests/smoke/diagnostic-2026-05-07.spec.ts D-01` で 30 nodes / 50 edges 配置、screenshot で node が label より小さく、間隔がはっきり開いて relationships を読み取れる状態を確認。canvas 内部 raster と CSS 表示は完全一致(aspect fix)
- bundle.js 925.18 → 925.19 KB(+0.01 KB:flag default 値 1 字)、bundle.css 不変。unit 6563 / 6563 pass + Playwright smoke pass。

### Wave 10-9 hotfix PR-Δ3(2026-05-07、修正指示9)

- **filer multi-select + bulk operations 革命的 UX**:user 報告「ファイラにマルチ選択、一括選択機能をつけ、エントリ整理機能に革命的な操作性を付与しろ」への対応。multi-select infrastructure(`TOGGLE_MULTI_SELECT` action、`getAllSelected` helper、`pkc-multi-action-bar` 描画)は既存だったが、**filer explorer 行からはトリガーできず、視覚 marker も無かった**。
- **修正**:
  - 各 `<tr.pkc-filer-row>` に `data-pkc-multi-selected="true"` を反映、accent 装飾(`color-mix accent 40%` background + `inset 1px accent` shadow、既存)で multi-select 状態が一目で分かる
  - 行先頭に **checkbox cell**(`<td.pkc-filer-cell-check><input class="pkc-filer-row-check" data-pkc-action="filer-toggle-row-multi-select">`)を追加。click で `TOGGLE_MULTI_SELECT` dispatch、`stopPropagation` で行 select-entry 動作と分離
  - **Header checkbox**(`data-pkc-action="filer-toggle-all-multi-select"`)で visible 全選択 / 全解除トグル。`indeterminate` で部分選択 state も表現
  - Shift+click in filer:**filer 表 visible order を range source として優先**(旧実装は sidebar order のみ参照、filer click では `undefined` で歯抜け range が発生)
  - bulk action bar(Delete / Move to.../ Clear、既存)が filer view 中も sidebar に表示される(変更不要)
- **Playwright 視覚確認**:`tests/smoke/diagnostic-2026-05-07.spec.ts D-05` で 3 行 checkbox を実 mouse click → 3 行に `data-pkc-multi-selected="true"` 反映、multi-action-bar に「3 selected」+ Delete / Move / Clear 操作表示を確認、screenshot 添付。
- bundle.js 923.36 → 925.18 KB(+1.82 KB)、bundle.css 145.61 → 145.83 KB(+0.22 KB)。unit 6563 / 6563 pass + Playwright smoke pass。

### Wave 10-9 hotfix PR-Δ2(2026-05-07、修正指示9)

- **filer 列幅 drag-to-resize handle 追加**:user 報告「ファイラの列幅調整の要望はどこで対応している?調整できない」への抹本対応。元 PR-SSS は `table-layout: fixed` + `<th>` 比率指定のみで、resize handle は **deferred** だった。今回実装。
- **修正**:
  - 各 `<th>` の右端に 8px 幅の `<span class="pkc-filer-th-resize" data-pkc-action="filer-col-resize-start">` を追加(最終列除く)
  - `position: absolute; right: 0; cursor: col-resize;` で `<th>` (sticky positioning context) に anchor、`hover` / `[data-pkc-resizing="true"]` で accent 強調
  - action-binder.ts に専用 mousedown / mousemove / mouseup handler を追加。drag delta を `<th>.style.width` に直接反映、`mouseup` で `localStorage["pkc2.filer.column-widths"]` に永続化
  - renderer は `readFilerColumnWidths()` で永続化幅を読み出し、render 時に `<th>.style.width` を上書き反映
  - 列幅 clamp:40px〜1500px(誤操作防止)
- **Playwright 視覚確認**:`tests/smoke/diagnostic-2026-05-07.spec.ts D-04` で実 OS event ベースの drag(mouseDown → move +80px → mouseUp)を発火、`<th>` width 472 → 552(+80px、drag 距離一致)+ localStorage 永続化を確認
- bundle.js 921.42 → 923.36 KB(+1.94 KB)、bundle.css 145.26 → 145.61 KB(+0.35 KB)。unit 6563 / 6563 pass + Playwright smoke pass。

### Wave 10-7 hotfix PR-XX2(2026-05-07、修正指示2 残 正しい意図)

- **別窓 (entry-window popup) の split editor に ⇄ toggle button を追加**:user 訂正指示「左ペインからダブルクリックで起動した別窓で、センターペインと同じブロック同期機能を活かしてほしい(機能がないので追加して欲しい)」への対応。元 PR-CC で popup の inline JS sync ロジックは実装済みだったが、**起動 UI である ⇄ button が popup の resize handle に存在しなかった**ため user は機能を有効化できない状態だった(私の前回 PR-XXX は Firefox 環境特有 bug の調査と読み違えて投機的 hypothesis doc を生成し、user 指摘で撤回)。
- **修正**:
  - `entry-window.ts` の HTML template の `pkc-text-split-resize-handle` 内に `<button class="pkc-btn-toggle-sync" data-pkc-action="toggle-source-preview-sync" id="btn-toggle-sync">⇄</button>` を追加
  - inline CSS で `.pkc-text-split-resize-handle` に `position: relative` 付与、center pane と同じ視覚 design の `.pkc-btn-toggle-sync` rule を popup local CSS に追加
  - inline JS に `pkcUpdateSyncToggleVisuals()` を追加、popup 起動時に **`localStorage["pkc2.split-sync-enabled"]` の現在値を visual に反映**(center pane と key 共有)。click handler は `localStorage` を flip + 即時 sync(ON 時)/ marker 一掃(OFF 時)
  - **`storage` event listener** を追加、center pane や他 popup が toggle した瞬間に本 popup の visual も追従
- bundle.js 918.18 → 921.37 KB(+3.19 KB:button HTML + handler + storage listener)、bundle.css 不変(CSS は inline JS 内 string)。unit 6563 / 6563 pass。

### Wave 10-7 hotfix PR-RRR-V2(2026-05-07)

- **filer 行ストライプ視認性強化(ダークテーマ対応)**:user 報告「ファイラのストライプが見づらいし、ダークテーマだとほぼ違いがわからん」への hotfix。元 PR-RRR の `rgba(0, 0, 0, 0.025)` は dark theme background `#0d0f0a` に黒を 2.5% 重ねても変化が殆ど見えず stripe が機能していなかった。
- **修正**:
  - `--c-bg-stripe` を theme token として 3 ブロック(`:root`/`@media light`/`[data-pkc-theme="light"]`)に追加
  - **dark**:`rgba(255, 255, 255, 0.07)` で薄い lightening(暗背景には白系で重ねる方が見える)
  - **light**:`rgba(0, 0, 0, 0.06)` で薄い darkening
  - fallback も 0.025 → 0.06 に bump、未定義 theme でも視認可能
- bundle.js 不変、bundle.css 145.16 → 145.26 KB(+0.10 KB)。unit 6563 / 6563 pass。

### Wave 10-7 review fix PR-XXX 撤回(2026-05-07)

- 元 PR #352「split sync MacOS+Firefox 再調査(investigation only)」を user 指摘で撤回。**正しい要望**:左ペインからダブルクリックで起動する別窓 (entry-window popup) にセンターペインと同じ block 同期機能を追加してほしい(現状 popup の resize handle に ⇄ toggle button が無く、内部 inline JS 経路を user が起動できない)。
- 当方の誤読:Firefox 環境特有 bug の調査と思い込み、Playwright で popup window の DOM を観察すれば一瞬で「⇄ ボタンが無い」ことに気付けたはずなのに、code grep のみで投機的 hypothesis を doc 化した。reform-2026-05 §6 visual-state-parity を逆に踏みにじる結果に。
- `docs/development/split-sync-firefox-investigation.md` は別 PR で削除、replacement 実装(⇄ button 追加)も別 PR。

### Wave 10-7 review fix PR-WWW(2026-05-07)

- **Graph node hover preview tooltip**:user 修正指示5 残「graph node に hover で title + body excerpt が見える tooltip がほしい」への対応。`GraphCanvasNode.preview` interface は PR-LLL で既に追加済みだったが、実際に tooltip を表示する DOM 機構が未実装だった。
- **修正**:
  - `GraphNodeView` に `preview?: string` を追加、`buildGraphPayload` で entry.body の冒頭 100 char を frontmatter strip + 改行畳み込みで生成し title と組み合わせる
  - graph-canvas.ts の gesture installer に `mousemove` / `mouseleave` listener を追加。`hitTestNodeAt` で node 解決、`payload.nodes.find` で preview 文字列を取得し、canvas 親(`.pkc-center-graph-view` を `position: relative` 化)に absolute 配置の `<div>` tooltip を表示
  - drag / region-select 中は tooltip 非表示(操作の邪魔をしない)
  - tooltip CSS:`.pkc-graph-hover-tooltip` に max-width 320px、`white-space: pre-line` で title の \n + excerpt を 2 行表示、`pointer-events: none` で hit-test 非干渉
- bundle.js 917.13 → 918.18 KB(+1.05 KB:hover handler + tooltip 構築)、bundle.css 144.68 → 145.16 KB(+0.48 KB:tooltip CSS + positioning context)。unit 6563 / 6563 pass。

### Wave 10-7 review fix PR-VVV(2026-05-07)

- **数式計算入力補助、行頭以外でも動作**:user 修正指示7 #8「数式計算入力補助 行頭以外でも動作」への対応。旧仕様は `caretPos === lineEnd` 必須(行末でしか発火しない)。`Total: 1+2=` のように先頭に文脈テキストを書いて式を続けたとき、行末でも `Total: 1+2=` 直後の caret で `=` 直前は数式と非数式文字の混在状態なので発火していた -- が、`= ok` のように後続テキストがあると caret が行末でないため発火しなかった。
- **修正**:
  - `detectInlineCalcRequest` の判定を「caret 直前が `=` か」に変更。直前が `=` なら、そこから後方走査で expression 範囲を抽出。走査は `\n` / 文字列先頭 / 非 calc 文字のいずれかで停止
  - 後方走査の whitelist:digits + operators (`+-*/%`) + parens + dot + whitespace。日本語などの非 ASCII 文字に当たれば即停止し、`結果は 3*4=` から `3*4` を正しく分離
  - `lineStart` / `lineEnd` は caller への informational として依然出力(highlighting / 範囲計算 future use)
- **互換性**:既存仕様(行末で `1+2=` + Enter)は新仕様でも完全互換(後方走査は行頭まで走るので結果同じ)。既存 tests 32 件全 pass、新規 6 ケース(mid-line / 日本語前置 / 改行越え / `foo=` 非数式 reject 等)を追加し計 38 件 pass。
- bundle.js 916.97 → 917.13 KB(+0.16 KB:後方走査 + isCalcChar 関数)、bundle.css 不変。unit 6563 / 6563 pass(+6 新規)。

### Wave 10-7 review fix PR-UUU(2026-05-07)

- **TAB → 半角スペース n 個(行頭限定)**:user 修正指示7 #7 + 修正指示6 残「TAB の行頭挿入を半角スペース n 個に展開して」への対応。プレーン textarea(markdown 拡張外)で行頭 Tab 押下時、`\t` ではなく半角スペース n 個を挿入。
- **修正**:
  - 新 flag `editor.tab_indent_spaces`(Tier 0、default 2、range 0-8)を `editor-flags.ts` に追加。0 で完全 off(従来 `\t`)。
  - action-binder.ts の generic Tab fall-through に行頭判定を追加:`start === 0 || value[start-1] === '\n'` で line head を検出。**行頭 + 単一カーソル + flag>0** の 3 条件 AND で半角スペース展開、それ以外は従来 `\t`。
  - markdown 互換 field(body / textlog / todo-description)は editor-key-helpers の `INDENT_UNIT = "  "` 経由で別系統(常に 2 spaces 固定、list-slot indent)。本変更はその上流の generic textarea Tab 挙動。
- **parity test**(reform-2026-05 Phase 8 順序性 doctrine 必須):新規 `tests/adapter/action-binder-tab-indent.test.ts` で **flag mutation → Tab keydown → textarea value 反映** の 5 ケース(default 2 / 4 / 0 / 行中→\\t / 改行直後→spaces)を全件 assert。`setFlagSource('parity-test', ...)` で flag を mock し、source 優先順を経由して getter 値を切替。
- bundle.js 916.70 → 916.97 KB(+0.27 KB:flag 1 件 + 行頭判定 + 分岐ロジック)、bundle.css 不変。unit 6557 / 6557 pass(+5 新規)。

### Wave 10-7 review fix PR-TTT(2026-05-07)

- **Graph node サイズ縮小、label 優先表示**:user 修正指示7 #6「グラフのノードが大きい、label を優先表示にして」への対応。従来 `collideRadius * 0.6 = 21.6 px` の視覚半径が degree-scaling で最大 38.88 px まで膨張し、label が node に隠れていた。
- **修正**:
  - 新 flag `graph.node_radius_factor`(Tier 0、default 0.45、range 0.2-1.0)を追加。`collideRadius * value` で視覚半径を計算、衝突 hit-test も同値を使用。default で従来比 75%(36 × 0.45 = 16.2 px)に縮小、label が相対的に大きく見える
  - degree scaling を緩和:`min(1.8, 1 + degree * 0.05)` → `min(1.5, 1 + degree * 0.04)`。連結度 10 で 40% 増 → 上限 50% 増、エッジ集中ノードでも label が読める
  - render / hit-test / Venn ring の 3 箇所すべて新 factor を経由(統一)
- **flag 経由 tunability**:user が「もっと小さく」「もっと大きく」と気軽に調整できる。runtime A/B も可能
- bundle.js 916.27 → 916.70 KB(+0.43 KB:flag 1 件 + 3 site 改修)、bundle.css 不変。unit 6552 / 6552 pass。

### Wave 10-7 review fix PR-SSS(2026-05-07)

- **Filer Explorer 列幅固定比率 + 中間省略 + tooltip**:user 修正指示7 #3 への対応。
- 現状 root cause:`table-layout: auto` で長い title が列を支配し、archetype / created / updated / tags が極端に narrow に潰れていた。
- **修正**:
  - `.pkc-filer-table` に `table-layout: fixed`、各 `<th>` に `width: 40 / 12 / 16 / 16 / 16%` を割り当て、長 title でも他列幅が変動しない
  - `.pkc-filer-cell` 全般に `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` で auto trim
  - `truncateMiddle(s, 48, 8)` 関数を renderer に追加。長い filename(>48 char)を「先頭 39 char + … + 末尾 8 char」で表示し、date prefix / 拡張子 / suffix を保持。短いものは無加工
  - **tooltip**:全 cell の primary text に `title` 属性を設定(name=fullTitle / created=ISO / updated=ISO / tags=joined)。hover で full text 確認可能
- **future work**:column resize handle は `resize: horizontal` を試したが table 内の `<th>` で effective でない browser 多数のため deferred。`<colgroup>` + drag handle で完全実装するなら別 PR(scope 大)。
- bundle.js 916.27 → 916.47 KB(+0.20 KB)、bundle.css 144.41 → 144.68 KB(+0.27 KB)。unit 6552 / 6552 pass。

### Wave 10-7 review fix PR-RRR(2026-05-07)

- **Filer Explorer 行ストライプ採用**:user 修正指示7 #4「ファイラのエクスプローラビューは行ストライプを採用し得て視認性を上げて」への対応。`.pkc-filer-tbody .pkc-filer-row:nth-child(even)` に薄い背景 (`var(--c-bg-stripe, rgba(0, 0, 0, 0.025))`) を敷き、長い folder の row 識別を改善。
- **specificity 設計**:`:nth-child(even)` 単独 selector で書き、`.pkc-filer-row:hover` / `[data-pkc-active="true"]` の specificity を超えないようにする。cascade 順は (1) stripe → (2) hover → (3) active で hover/active が必ず勝つ。
- bundle.js 916.15 → 916.27 KB(+0.12 KB:変動誤差レベル)、bundle.css 144.31 → 144.41 KB(+0.10 KB:CSS 1 ルール追加)。unit 6552 / 6552 pass。

### Wave 10-7 review fix PR-PPP(2026-05-07)

修正指示7 への対応開始 wave。**input field UX during dispatch-driven re-renders** という共通テーマで 2 件をまとめて修正:

#### (a) Flags `templates.entries` が編集できない bug
- **root cause**:string flag の editor が `<input type="text">` 固定で、複数行 / 長尺 JSON の入力に向かない。改行が剥落、横スクロールも辛い。
- **修正**:`flags-inspector.ts` の editor builder を分岐、**default value が 60 文字以上 OR 改行を含む** string flag は `<textarea>` editor に切り替え。`monospace` font + `tab-size: 2` + `resize: vertical`、`templates.entries` 等の JSON 編集に最適化。
- **focus 復元**:textarea に `data-pkc-field="flag-editor-${key}"` を付与、`SET_FLAG` dispatch で full re-render が走っても render-continuity helper が caret 位置 + selection range を保持。
- **action-binder 拡張**:`set-flag-string` 受理を `HTMLInputElement` だけだったのを `|| HTMLTextAreaElement` に。

#### (b) Filer 検索窓の focus が勝手に外れる(日本語入力支障)
- **root cause**:filer 検索 input には `data-pkc-field` が無く、`SET_FILER_SEARCH_QUERY` dispatch が full re-render を起こすたび focus が新 DOM に引き継がれない。日本語 IME 合成中も dispatch されてしまい、変換候補が壊れる。
- **修正**:
  - `data-pkc-field="filer-search"` を input に付与、render-continuity が focus + caret + selection を復元
  - `searchImeComposing` フラグの監視対象に `filer-search` を追加、合成中は dispatch スキップ
  - `compositionend` で最終値を 1 回だけ dispatch

bundle.js 915.57 → 916.15 KB(+0.58 KB)、bundle.css 144.07 → 144.31 KB(+0.24 KB)。unit 6552 / 6552 pass。

### Wave 10-6 review fix PR-OOO(2026-05-06)

- **TEXTAREA Tab → 全角空白 入力 bug の defensive layer**:user 修正指示6「TEXTAREA の TAB キー押下で全角空白が入力されることがある(過去のショートカットキーが残っている可能性)」への対応。PKC2 source code 全文 grep でも U+3000(`　`)を Tab に bind するコードは存在せず、bug の出所は browser / IME tab-completion 側 と推定。defensive layer を追加して**根治**:
  - 全 Tab keydown(modifier 有無に関わらず)で `lastTabKeydownAt` + `lastTabKeydownTarget` を module-level に記録
  - `root.addEventListener('beforeinput', ...)` で textarea への入力を監視。`InputEvent.data === '　'` AND **直前 120ms 以内** に Tab keydown が同 textarea で発火していたら、`preventDefault` + `setRangeText('\t')` で半角タブに置換
  - 純粋な日本語入力(明示的に `　` を IME 経由で入力)は Tab keydown を伴わないため影響なし
- bundle.js 915.01 → 915.57 KB(+0.56 KB:beforeinput listener)、bundle.css 不変。unit 6552 / 6552 pass。

### Wave 10-6 review fix PR-NNN(2026-05-06)

- **Filer 検索窓を活性化(render-scope に `filerSearchQuery` を加える)**:user 修正指示6「Filer の検索窓が活きていない」への対応。bug の root cause:`render-scope.ts` の `'full'` re-render trigger に `filerSearchQuery` フィールドが含まれていなかったため、`SET_FILER_SEARCH_QUERY` のみが state を変更すると `computeRenderScope === 'none'` が返り、filer の subtree filter が画面に反映されない状態だった(input 自体は dispatch していた、フィルタロジックも renderer 内に正しく存在していた)。
- 修正:`render-scope.ts` の full-trigger 列に `state.filerSearchQuery !== prev.filerSearchQuery → 'full'` を追加。これだけで `set-filer-search-query` action → SET_FILER_SEARCH_QUERY reducer → 全 shell 再描画(filer の subtree 検索が走る) が完成。
- bundle.js 914.96 → 915.01 KB(+0.05 KB:1 行 if)、bundle.css 不変。unit 6552 / 6552 pass。

### Wave 10-6 review fix PR-MMM(2026-05-06)

- **左ペイン dblclick 検知まで再描画抑止**:user 修正指示5「左ペインのダブルクリック検知までの間だけでも要素の再描画を抑止して左ペインの行ズレ防止をしたい」への対応。sidebar 単一 click による `SELECT_ENTRY` dispatch を **~250ms 遅延** させ、その間に dblclick が来たら timer を cancel して dblclick action を直接実行に切り替える。両 click 間で再描画が走らないため行 / 文字位置が固定される。
- **non-sidebar click(center / meta / overlay)は従来通り即時 dispatch** — 編集対象の選択を delay すると体感悪化のため。multi-select(`Ctrl+Click`)/ range-select(`Shift+Click`)も従来通り即時(dblclick とは別 path)。
- **テスト追従**:`action-binder.test.ts` + `action-binder-keyboard.test.ts` の click → SELECT_ENTRY 系 2 件を `await setTimeout(300)` で 250ms 遅延後にアサート、PR-MMM 由来であることを comment で明示。
- bundle.js 914.67 → 914.96 KB(+0.29 KB:timer 管理)、bundle.css 不変。unit 6552 / 6552 pass。

### Wave 10-6 review fix PR-LLL(2026-05-06)

- **Graph 改善 5 連**:user 修正指示5「グラフについて(センターペインのグラフタブ)」の各項目を実装(hover preview のみ次 wave deferred):
  1. **レスポンシブ アス比**:`.pkc-graph-canvas` の固定 `aspect-ratio: 8/5` を廃止、`width: 100%; height: 100%; max-height: min(72vh, 720px)` で flex 親に追従。canvas 内座標は 960×600 固定だが PR-AAA auto-fit-to-bounds で全 node が収まる scale に自動調整(view 移動なし)。
  2. **リレーションは線の色で分ける**:`GraphCanvasLink.kind` を payload まで運ぶ。`relationColor()` で structural=blue / semantic=purple / categorical=green / temporal=orange / fallback=theme.graphEdge。CB-friendly 配色。
  3. **凡例表示**:`renderCenterGraphView` の末尾に `<div class="pkc-graph-legend">` を overlay。表示中の archetype emoji + 表示中の relation kind 色 swatch のみ列挙(全 archetype を機械的に並べると noise になる)。
  4. **ノードはエントリ種別に応じて絵文字**:`archetypeEmoji(archetype)` を export、draw 時に node 中央に emoji を `Segoe UI Emoji / Apple Color Emoji / Noto Color Emoji` で描画。circle は薄く残して selection / hover の affordance を維持。
  5. **リレーション数に応じてノードサイズ**:`degreeMap` を構築して payload に load、draw 時に `radius * Math.min(1.8, 1 + degree * 0.05)` で stretch。time-proximity モードは links 0 で全 node 同 size(意図通り)。
- **deferred**:hover でプレビューホバーは `mousemove` + tooltip overlay の実装が広範になるため次 wave へ。
- bundle.js 913.01 → 914.67 KB(+1.66 KB:relation color / emoji 描画 / legend)、bundle.css 143.35 → 144.07 KB(+0.72 KB:legend layout + responsive canvas)。unit 6552 / 6552 pass。

### Wave 10-6 review fix PR-KKK(2026-05-06)

- **iPhone コンタクトシート tap で画像 viewer が出るよう順序入替**:user 修正指示5「iPhone ではアルバム表示のコンタクトシート画像をタップ時に画像を閲覧できない」への対応。`open-image-preview-from-filer` action の中で `dispatch SELECT_ENTRY` → 全 shell 再描画(100+ entries で 50-100ms)→ `openImagePreview()` の順だったため、iOS Safari の user-activation 規約上 popup が「stale activation」で抑制されていた。**`openImagePreview()` を `dispatch` より先に呼ぶ順序** に修正、user activation token を温存して `window.open(dataUrl, '_blank')` が確実に native image viewer を起動できるようにした。selection 更新は viewer open 後に dispatch(順序逆転による副作用なし、view layer は冪等)。
- bundle.js -0.01 KB(順序入れ替え net 0)、bundle.css 不変。unit 6552 / 6552 pass。

### Wave 10-6 review fix PR-JJJ(2026-05-06)

- **エントリウィンドウ複数開き — 既存挙動の確認 + regression guard**:user 修正指示5「エントリウィンドウを複数開いて編集可能なようにして(今はエントリフォーカスが外れると勝手に閉じてしまう認識)」への対応。code audit の結果、`openEntryWindow` は既に lid 別 `pkc-entry-${lid}` window 名で **複数同時 open をサポート**(focus 外れでの自動 close ロジックは存在しない)。user 観察に再現可能性が無いため、**regression guard test 3 件** を新設して将来「自動 close」回帰を fingerprint で検出可能にする。
- **テスト**:`tests/adapter/entry-window-multi-open-pr-jjj.test.ts`(3 件):
  1. 異なる 2 lid を順次 open → `getOpenEntryWindowLids()` が両方含む + window.open が 2 種の名前で呼ばれた
  2. 同 lid を 2 回 open → 既存 child の `focus()` が呼ばれ、第 2 window は作成されない
  3. 1 つの child を close 状態にする → `getOpenEntryWindowLids()` から脱落
- 実機で「閉じてしまう」が再現する場合は browser specific(iOS Safari の popup 制限など)の可能性が高く、in-page modal への置換を follow-up wave で検討。
- bundle.js / bundle.css 不変。unit 6549 → 6552(+3)pass。

### Wave 10-6 review fix PR-III(2026-05-06)

- **左ペイン entry に 🔗 copy-link button(編集中も活きる)**:user 修正指示5「エントリ編集中、左ペインのコピーリンク系の挙動のみ活かしてほしい。リンクをたくさん埋め込んだエントリを作成する時に手間」への対応。各 sidebar entry に `<button class="pkc-entry-copy-link" data-pkc-action="copy-entry-permalink">🔗</button>` を常設、CSS で `opacity: 0` → `:hover` / `:focus` 時に visible に。click は `e.target.closest([data-pkc-action])` で button を先にマッチさせるため、parent の `select-entry` を pre-empt して permalink だけが clipboard コピーされる(編集中の body / focus / scroll は一切影響を受けない)。
- system / reserved entries は除外、a11y のため keyboard focus でも visible。既存の center pane title-row の `🔗 Copy link` button (`pkc-action-copy-permalink`)は変更なし、test を class scope で絞って同居許容。
- bundle.js 912.68 → 913.02 KB(+0.34 KB)、bundle.css 142.90 → 143.35 KB(+0.45 KB:hover-fade button styling)。unit 6549 / 6549 pass。

### Wave 10-6 review fix PR-HHH(2026-05-06)

- **Filer Graph subset 廃止(center Graph タブが canonical)**:user 修正指示5「廃止したはずのFilerのGraphがまだ活きている。センターペインのGraphタブが正です」への対応。`folder.body` に display profile `graph` を持つ folder を filer view した際の `renderFilerGraph` SVG レンダリングを **完全削除**。center pane の viewMode='graph' タブ (`renderCenterGraphView`) が canonical な graph 表示として残る(PR-AAA の auto-fit / PR-DD の zoom range などが効く)。
- **影響範囲**:
  - filer 内 subset dispatch の `case 'graph'` を削除 → default(explorer table)に silent fallback。古い container で `profile.kind='graph'` を持つ folder は explorer 表示になる(後方互換、データ破壊なし)
  - folder display profile picker の `<option value="graph">` を除去(新規選択不可)
  - `renderFilerGraph` 関数本体(~90 行)を完全削除、コメントブロックのみ残す
- bundle.js 914.99 → 912.68 KB(**-2.31 KB**:filer graph SVG renderer 削除)、bundle.css 不変。unit 6549 / 6549 pass。

### Wave 10-6 review fix PR-GGG(2026-05-06)

- **Flags Inspector 検索 box が活性化**:user 修正指示5「Flags Inspector で検索ができない」への対応。検索 input + category select は元々 DOM 上にあったが event handler が付いていなかったため filter が効かない状態だった。**`input` event で in-place row filter** を実装、`data-pkc-region="flag-row"` ごとに `display: none` toggle、空 section は heading ごと隠す。
- **module-level memo で filter persist**:`SET_FLAG` 等の re-render で input が再生成されても `inspectorFilter` / `inspectorCategoryFilter` の値を input.value + select.selected に復元、検索文字列 / category 選択が維持される(state machine を膨らませずに対応)。
- 検索範囲:**flag key + description 全文** の case-insensitive 部分一致。category select で category 限定。両方 AND。
- bundle.js 914.13 → 914.99 KB(+0.86 KB:filter helper + event listeners)、bundle.css 不変。unit 6549 / 6549 pass。

### Wave 10-6 review fix PR-FFF(2026-05-06)

- **`📥 Save .pkc-capture.json` でサムネ取得復活**:user 修正指示5「📥 Save .pkc-capture.jsonブックマークレットがサムネを取得できないのは許容できない」への対応。primary `📌 Send to PKC2` bookmarklet と DL bookmarklet で scraper logic が divergence していたため、PR-EEE(YouTube DOM scraper)+ PR-ZZ(Amazon thumbnail DOM fallback)を DL bookmarklet にも inline 反映。
- 追加 logic:
  - YouTube:`#title h1` / channel name selector / description-expander から title / author / excerpt
  - Amazon:`#imgTagWrapperId img` 等の **6 selector chain × `data-old-hires` / `data-a-dynamic-image` / `src`** の順で thumbnail 抽出
- 結果として **2 bookmarklets が完全 feature parity** に。
- bundle.js 912.68 → 914.13 KB(+1.45 KB:DL bookmarklet に YouTube + Amazon scraper を inline)、bundle.css 不変。unit 6549 / 6549 pass。

### Wave 10-6 review fix PR-EEE(2026-05-06)

- **bookmarklet YouTube 拡張(タイトル / 投稿者 / 説明)**:user 修正指示5「Send to PKC2 ブックマークレットでYoutubeの動画タイトルを引っ張れていない。投稿者情報と動画説明欄も引っ張ってほしい」への対応。YouTube watch ページで `og:title` が空 / 古い値のことが多いため、bookmarklet の YouTube ブランチに DOM scraper を追加:
  - **動画タイトル**:`#title h1 yt-formatted-string` / `#title h1` / `h1.ytd-watch-metadata` / `h1.title yt-formatted-string` の最初に hit するもの → `payload.title` 上書き
  - **投稿者**:`ytd-channel-name #text-container a` / `ytd-channel-name a` / `#owner #channel-name a` / `#upload-info #text a` / `[itemprop=author] [itemprop=name]` → `payload.author`(PR-JJ の field を流用)
  - **説明欄**:`#description-inline-expander` / `ytd-text-inline-expander` / `#description ytd-text-inline-expander` / `#description #text` / `meta[name=description]` → `payload.body` 内の excerpt(800 char cap、空白圧縮)
- **DL モード(PR-QQ)も同じ scraper を共有** するため、PR-FF と整合する形で frontmatter に正しい author + 自然な excerpt が入る。
- bundle.js 911.78 → 912.68 KB(+0.90 KB:scraper 拡張 selector list)、bundle.css 不変。unit 6549 / 6549 pass。

### Wave 10-6 review fix PR-DDD(2026-05-06)

- **`/` コマンドリストを caret 直下に出す + viewport flip**:user 修正指示5「『/』コマンドリストがカーソル直下ではなく、テキストエリアの外に出現する」への対応。PR-FF で `position: fixed` + `textarea.boundingRect.bottom` 起点に変えていたが、縦長 textarea で caret が中段にある場合 menu が遠くに離れる / viewport 下端で clip されるケースがあった。
- **修正**:`getCaretViewportCoords(textarea)` で **caret の正確な viewport 座標** を取得、その直下に menu を配置。mount 後に `getBoundingClientRect` で再 measure、viewport 下端を超える場合は **caret 上に flip-up**、右端 clip も同様に flip-left で吸収。`Math.max(8, Math.min(caret.left, taRect.right - 200))` で textarea 右端外への突き出しも防止。
- bundle.js 911.44 → 911.78 KB(+0.34 KB:caret-position import + flip 計算)、bundle.css 不変。unit 6549 / 6549 pass。

### Wave 10-6 review fix PR-CCC(2026-05-06)

- **`/tmp` 公式テンプレ 4 種(video/audio/novel/book)を default に同梱**:user 修正指示5「公式としてVideo,Audio,Novel,Bookのテンプレを用意すべき」+ 修正指示5「Flags InspectorにVideo,Audio,Book,NovelのFormattenのテンプレが登録されていない」への対応。`templates.entries` flag の default JSON を拡張、PR-BBB の `mt` / `rt`(メモ・振り返り)に加えて以下 4 公式テンプレを追加:
  - `vd`(/tmpvd): video — `kind: video / provider / url / thumbnail / duration_sec` frontmatter + 視聴メモ
  - `au`(/tmpau): audio — `kind: audio / author / duration_sec`
  - `nv`(/tmpnv): novel — `kind: novel / author` + あらすじ・感想
  - `bk`(/tmpbk): book — `kind: book / author / isbn / pages` + 読書メモ
- frontmatter shape は v1.1 capture profile と一致、bookmarklet 自動入力 entry と手入力 entry を **filer Auto / hero thumbnail / graph kind 整合** で同等扱い可能。
- bundle.js 910.95 → 911.44 KB(+0.49 KB:default JSON 拡張)、bundle.css 不変。unit 6549 / 6549 pass(default count 増えても dynamic count なので test は green)。

### Wave 10-6 review fix PR-BBB(2026-05-06)

- **`/tmpXX` テンプレ挿入(Flags 管理)**:user 修正指示4「自前で手入力するためのテンプレが必要。「/」コマンドにテンプレ挿入のコマンドを追加し、テンプレを用意「/tmpXX」とし、XXは半角英数２文字、Flagsからjson形式で編集可能とする」への対応。
- **新規 flag**:`templates.entries`(Tier 1、string、JSON)。default は starter set:`{"mt":"## メモ\\n\\n- [ ] \\n","rt":"## 振り返り\\n\\n良かったこと:\\n\\n改善点:\\n"}`。Flags inspector で JSON を編集すると次回 `/` 起動から候補に出る。
- **新規 helper**:`src/features/templates/template-flag.ts`(pure)。`parseUserTemplates(json)` で `{key, body}[]` を抽出、key は **2 文字 alnum 限定**(`/[a-z0-9]{2}/`)で他は silent drop、value 非 string も drop。`getActiveUserTemplates()` で live flag 値を parse。
- **slash menu 結線**:`getAllSlashCommands()` で SLASH_COMMANDS + dynamic templates を連結、`openSlashMenu` / `filterSlashMenu` 両 path で使用。template label は body の先頭 40 char preview を表示(`/tmpmt — ## メモ ↵ - [ ] ↵`)。insert は body verbatim。
- **テスト**:`tests/features/templates/template-flag.test.ts`(8 件)— valid JSON / 不正 JSON / 非 object root / 不正 key 排除 / 非 string body 排除 / sort by key / 空文字列 / multiline body 保持。`tests/adapter/slash-menu.test.ts` の既存 3 件を default template 数を反映するよう更新。
- bundle.js 910.01 → 910.95 KB(+0.94 KB:flag + helper + 結線)、bundle.css 不変。unit 6541 → 6549(+8)pass。

### Wave 10-6 review fix PR-AAA(2026-05-06)

- **グラフビュー auto-fit-to-bounds(銀河風 zoom 整備)**:user 修正指示1「グラフビューが詰まりすぎていて見づらい。できるなら、拡大縮小可能にして欲しい。まるで銀河の星々のように」への対応。`bindGraphCanvas` の初回 bind で全 node の bounding box を canvas viewport にフィットする `fitToBounds(view, payload)` を実行、user は最初から全ノードを俯瞰できる。subsequent re-bind は user の zoom/pan を保持(`autoFitDone` flag で 1 度限り)。既存の wheel zoom + pinch zoom は MIN_SCALE=0.05 / MAX_SCALE=32(PR-DD)の銀河 range をそのまま使える。
- **設計**:auto-fit は **zoom-OUT 専用**(scale ≤ 1.0 にしか効かない)。bbox が viewport 内にすでに収まる場合は identity に保ち、既存の click 座標期待値を壊さない。これは「1 つの近接群を拡大しすぎない」銀河風挙動とも整合。
- **`resetGraphCanvasZoom` も auto-fit に統一**:従来は scale=1, tx/ty=0 への reset。新挙動は `autoFitDone = false` でクリアして再 fit、user が「ズームを戻す」操作で全俯瞰に戻れる。
- **テスト**:`tests/adapter/graph-canvas-fit-bounds-pr-aaa.test.ts`(6 件)— 初回 auto-fit / 2 回目以降 preserve / reset で re-fit / 空 positions 安全 / 単一 node はゼロ in-place / MIN_SCALE clamp。既存 graph-canvas-gestures test も全 9 件 green を維持。
- bundle.js 909.41 → 910.01 KB(+0.60 KB:fitToBounds + autoFitDone flag)、bundle.css 不変。unit 6535 → 6541(+6)pass。

### Wave 10-6 review fix PR-ZZ(2026-05-06)

- **Amazon サムネ DOM 取得 fallback**:user 修正指示4「Amazon からサムネ取得されていない」への対応。bookmarklet の Amazon ブランチに **DOM image fallback chain** を追加。og:image が無い / placeholder のページが大半なため、複数候補 selector(`#imgTagWrapperId img` / `#landingImage` / `#ebooksImgBlkFront img` / `#main-image` / `#imgBlkFront` / `#booksImageBlock_feature_div img`)を順に試して **`data-old-hires` → `data-a-dynamic-image` JSON 第 1 key → `src`** から URL 抽出、http(s) のみ採用。og:image にも何も無ければ既存挙動(thumb=null)に degrade。
- bundle.js 908.85 → 909.41 KB(+0.56 KB:bookmarklet DOM fallback chain)、bundle.css 不変。unit 6535 / 6535 pass。

### Wave 10-6 review fix PR-YY(2026-05-06)

- **TEXT entry サムネ指定 PKC embed 方式統一 + detail view hero 表示**:user 修正指示4「TEXTエントリのサムネイル指定が既存のPKC embed方式と記法が異なる。エントリを開いても適切なサムネが表示されない」への 2 系統対応:
  - **記法統一**:`extractThumbnailRef(rawValue)` を pure helper として export、frontmatter `thumbnail:` value に **markdown image syntax `![](asset:KEY)` / `![alt](url)` 含めた PKC embed 互換** を受理。bare URL / `asset:KEY` / `data:URI` / quoted variants / markdown alt+title は全て同じ scheme prefix 結果に正規化。`findThumbnailHttpUrl` と `pickImageAssetForEntry` の thumbnail step は新 helper 経由で、PKC embed 記法と完全一致。
  - **detail view hero**:`renderView` の body 描画前に `<div data-pkc-region="view-hero-thumb">` を挿入、`pickImageAssetForEntry` resolved URL を `<img>` で hero 表示。frontmatter URL / asset:KEY / data: / 全 grid と同じ contain で長辺合わせ、max-height 360px。filer card grid と一貫した見え方。
- bundle.js 908.17 → 908.85 KB(+0.68 KB:extractor + hero 描画)、bundle.css 142.54 → 142.90 KB(+0.36 KB:hero CSS)。unit 6523 → 6535(+12)pass。

### Wave 10-6 review fix PR-XX(2026-05-06)

- **左ペイン no-op 押し除け継続調査**:user 修正指示4「左ペインの no-op っぽい挙動継続中。何らかの要素によって押し除けられているのかもしれない」への対応。PR-GG が entry-list の scroll 保持を着地済だが user 継続報告のため、4 シナリオの stress test と 3 段目 timer-based fallback を追加。
- **3 段目 fallback**(`render-continuity.ts`):synchronous + rAF に加えて 200ms 後の `setTimeout` 再 apply を追加。Firefox の rAF より遅延する reflow race で「押し除けられた」 scroll を回復させる安全網。`!==` guard で no-op 時は何もしないため高頻度 dispatch 時もコスト最小。
- **Multi-click stress test**(`sidebar-scroll-multi-click-parity.spec.ts`、4 件):
  1. 200 entry seed + scrollTop=1500 + 5 連続 click → drift ≤ 8px
  2. viewport 端で部分 clipped 行を click → drift ≤ 8px
  3. filer→detail mode 切替を含む 3-dispatch chain で entry click → drift ≤ 8px
  4. ArrowDown + click 交互 10 cycle → 1 viewport 内収まる(意図的な選択追従)
- bundle.js 908.07 → 908.17 KB(+0.10 KB:setTimeout fallback)、bundle.css 不変。unit 6523 / 6523 pass、smoke +4 pass。

### Wave 10-6 review fix PR-WW(2026-05-06)

- **bookmarklet 同名 window target で tab 再利用**:user 修正指示4「ブックマークレットで取り込むたびに新しいタブで PKC が開く。UX 低下・許容不可」への対応。primary bookmarklet `📌 Send to PKC2` の `window.open(URL, '_blank')` を `window.open(URL, 'pkc2-bookmarklet')` に変更、ID-named target で同名 tab を reuse する browser default を活用。2 回目以降の click は既存 PKC2 tab に postMessage が届くため新 tab が量産されない。reuse された tab を foreground に出すため `w.focus()` を try/catch で呼び出し(cross-origin focus は silent fail)。
- DL 経由 bookmarklet `📥 Save .pkc-capture.json` は window を開かないので変更なし。
- bundle.js 908.04 → 908.07 KB(+0.03 KB:literal 差分のみ)、bundle.css 不変。unit 6523 / 6523 pass。

### Wave 10-6 review fix PR-VV(2026-05-06)

- **取り込み先 folder picker**:user 修正指示4「取り込み先の指定をしたい」への対応。`PendingOffer` banner に **target folder picker `<select>`** を追加。container に folder entry がある時のみ表示、`📂 (root)` + `📁 <folder name>` を ABC 順で並べる。Accept 時に同 `[data-pkc-offer-id]` item 内の picker から value を読み、`ACCEPT_OFFER { target_folder_lid }` に渡す。
- **action 拡張**:`ACCEPT_OFFER { offer_id, target_folder_lid?: string | null }`(additive、既存 caller は影響なし)。reducer は `target_folder_lid` が valid folder lid に解決した場合のみ structural relation 1 件追加 + RELATION_CREATED event を emit、unknown / non-folder / null は silent root fallback。
- **テスト**:`tests/core/accept-offer-target-folder-pr-vv.test.ts`(5 件)— 未指定 root / valid folder relation 生成 / non-folder fallback / unknown lid fallback / null fallback を網羅。
- bundle.js 906.97 → 908.04 KB(+1.07 KB:reducer 拡張 + folder picker 描画)、bundle.css 不変。unit 6518 → 6523(+5)pass。

### Wave 10-6 review fix PR-UU(2026-05-06)

- **`.pkc-capture.json` 複数取り込み**:user 修正指示4「.pkc-capture.json の複数取り込みを有効化して」への対応。`mountImportHandler` の hidden file input に `multiple = true` を付与、change handler に **all-capture-json branch** を追加。全選択ファイルが capture JSON なら順次 `SYS_RECORD_OFFERED` を dispatch、PendingOffer banner が件数分スタック表示される(PKC-Message §6 user-consent gate は per offer 維持)。混在選択(HTML + capture-json + zip)は legacy 先頭ファイル動作で従来通り(preview dialog flow を壊さない)。
- bundle.js 905.95 → 906.97 KB(+1.02 KB:loop dispatch 経路)、bundle.css 不変。unit 6518 / 6518 pass。

### Wave 10-6 review fix PR-TT(2026-05-06)

- **Data… menu emoji PC/スマホ統一**:user 修正指示2「上部メニューバーの『Date...』のボタン配下のメニューについて、スマホ向け画面と異なり、PC向け画面では絵文字がないなどの違いがあり、統一感がない」(`Date` は `Data…` の typo と user 確認済)への対応。PC `Data…` panel(`renderExportImportInline`)の labels に mobile drawer (action-binder) で使用済の emoji 接頭辞を揃えた。
- **変更**:
  - `Export` → `📤 Export`(Share group)
  - `Light` → `📤 Light`(Share group)
  - `Backup ZIP` → `📦 Backup ZIP`(Archive group)
  - `TEXTLOGs` → `📦 TEXTLOGs`(同)
  - `TEXTs` → `📦 TEXTs`(同)
  - `Mixed` → `📦 Mixed`(同)
  - `Import` → `📥 Import`(Import group)
  - 既存の `🆕 New PKC` / `📤 Selected as HTML` / `📦 Selected (TEXT/TEXTLOG)` / `📥 Textlog` / `📥 Text` / `📥 Entry` / `📥 Batch` は変更なし
- **テスト追従**:`renderer.test.ts` の textContent assertion 計 8 件を新 emoji 付き label に更新、PR-TT 由来であることを comment で明示。
- bundle.js 905.90 → 905.95 KB(+0.05 KB:label 文字列拡張)、bundle.css 不変。unit 6518 / 6518 pass。

### Wave 10-6 review fix PR-SS(2026-05-06)

- **全 grid サムネ contain 統一(長辺合わせ)**:user 修正指示4 補足「サムネは元画像の長辺に合わせて引き伸ばしなしで表示してほしい(全 grid)」への対応。PR-KK の contact-sheet 限定 contain 修正を `.pkc-filer-card-thumb img` 全体の baseline に upgrade、book / video / novel / audio / contact-sheet を統一。cover-art convention の crop が「ノベル系 SVG / Amazon 商品画像」で意図しない切り抜きを引き起こしていたため撤回。letterbox 部の背景は thumb 既存の `bg-tag` neutral grey が見える。
- **PR-KK の override 削除**:`.pkc-filer-grid-contact-sheet .pkc-filer-card-thumb img` の override は redundant になり削除。
- **Phase 8 順序性 parity test 拡張**:`contact-sheet-object-fit-parity.spec.ts` に **book-base grid テスト追加**。folder の display_profile_kind を `book-base` で seed → `.pkc-filer-grid-book-base .pkc-filer-card-thumb img` で `getComputedStyle().objectFit === 'contain'` を assert。spec 名 / 内容を 全 grid 統一に合わせて更新。
- bundle.css 142.62 → 142.54 KB(**-0.08 KB**:override 1 rule 削除 - net 縮小)、bundle.js 不変。unit 6518 / 6518 pass、smoke +1 pass。

### Wave 10-6 review fix PR-RR(2026-05-06)

- **ショートカットメニュー 3 段組 + scroll**:user 修正指示4「ショートカットメニューが画面に収まっていない。３段組にしてスクロールもオンにして」への対応。`.pkc-shortcut-card` を `max-width: min(960px, 95vw)` + `max-height: 85vh` + flex column に拡張、`.pkc-shortcut-table` を `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` で 1〜4 col に auto-fit、`overflow-y: auto` で table 内 scroll を有効化。row は子要素に `min-width: 0` を許可して narrow cell でも key + desc が共存。
- **Phase 8 順序性 parity test**:`tests/smoke/shortcut-help-layout-parity.spec.ts`(NEW)で 1280×720 viewport に対し card height ≤ 85vh、`getComputedStyle().display === 'grid'` + `overflowY === 'auto'` + grid-template-columns col 数 ≥ 2 + scrollHeight > clientHeight を assert。**併せて PR-FF re-verify**(`/` slash menu が viewport fixed 座標で出る)を別 test で固定化。
- bundle.css 142.31 → 142.62 KB(+0.31 KB:grid + flex layout 拡充)、bundle.js 不変。unit 6518 / 6518 pass、smoke +2 pass。

### Wave 10-6 review fix PR-QQ(2026-05-06)

- **bookmarklet ローカル PKC 用 file DL モード**:user 修正指示2「bookmarklet ローカル PKC 用 file DL モード(PKC 哲学的にローカル動作許容)」への対応。file:// で開いた PKC2 では browser cross-origin policy で postMessage handshake が成立しない。代替経路として **`📥 Save .pkc-capture.json` bookmarklet variant** を追加、現ページのキャプチャを PKC-Message v1 envelope JSON ファイルとして download。ファイルを PKC2 の Import picker / drop に渡すと既存の record:offer 受理経路に乗り、user accept で entry mint。
- **新規 helper**:`src/features/auto-fill/parse-capture-json.ts`(pure)。`parseCaptureJson(text)` で envelope を validate(`protocol/version/type` の 3 段 gate + payload field 列の型チェック)、未知 kind は silent drop、v1.1 additive fields(author / brand / pages / isbn / duration_sec)を round-trip。`isCaptureJsonFilename(name)` で `.pkc-capture.json` / `.pkc-capture` 両方を case-insensitive で判定。
- **import 経路結線**:`mountImportHandler` の file picker accept に `.json` を追加、change handler に capture-json 分岐を最上位に設置。validate 通過時は同じ shape の `PendingOffer` を組み立てて `SYS_RECORD_OFFERED` を dispatch、reject 時は `SYS_ERROR` を投げる。既存の HTML / ZIP / textlog 分岐は影響なし。
- **renderer 結線**:bookmarklet section の primary `📌 Send to PKC2` の隣に `📥 Save .pkc-capture.json` リンクを追加。draggable + 同等の scraping logic(YouTube / Niconico / Narou / カクヨム / Amazon scraper を継承、PR-V/JJ 由来)を含む独立 bookmarklet コードを生成。
- **テスト**:`tests/features/auto-fill/parse-capture-json.test.ts`(13 件)— well-formed envelope / malformed JSON / 各 reject path(protocol / version / type / missing title / missing body)/ 未知 kind silent drop / v1.1 additive round-trip / filename matcher の各 case を網羅。
- bundle.js 900.56 → 905.90 KB(+5.34 KB:第 2 bookmarklet コード + import 分岐 + parse-capture helper)、bundle.css 不変。unit 6505 → 6518(+13)pass。

### Wave 10-6 review fix PR-PP(2026-05-06)

- **🆕 New PKC button(system entries のみ export)**:user 修正指示2「New PKC button(system entries のみ export)」への対応。Data menu の Share group に新ボタン追加、現 container から **reserved system entries**(`__settings__` / `__flags__` / `__about__`)だけを抽出して fresh container を作成 → light HTML 形式で download。relations / revisions / assets / 非 reserved entries は全て strip。use case:「私の theme と flag 設定を埋め込んだ blank PKC2 を相手に渡す / 新 workspace の起点にする」。
- **新規 helper**:`src/features/auto-fill/system-only-container.ts`(pure)。`buildSystemOnlyContainer(source, options)` で system 限定 container を組み立てる。container_id は `new-pkc-<isoTimestamp>`、title は default `New PKC2 (system-only)`(override 可)、updated_at は now で stamp。source 不変(no mutation)。
- **action-binder 結線**:新 action `export-system-only` を追加、live state から container を取得 → `buildSystemOnlyContainer` → `exportContainerAsHtml` を直接呼ぶ(BEGIN_EXPORT phase は経由しない、derived container だから)。失敗は console.error に流すのみで dispatcher 状態は汚染しない。
- **テスト**:`tests/features/auto-fill/system-only-container.test.ts`(8 件)— reserved entries のみ抽出 / 全 user content strip / fresh container_id + timestamps / default + override title / source 不変 / system entry body round-trip / 空 source 対応。renderer + grouping test の button count assertion を 12 → 13 に更新。
- bundle.js 899.51 → 900.56 KB(+1.05 KB:helper + button + action 結線)、bundle.css 不変。unit 6497 → 6505(+8)pass。

### Wave 10-6 review fix PR-OO(2026-05-06)

- **テーマカラー Export 修正**:user 修正指示2「テーマカラー Export 修正」への対応。`buildExportHtml` が live `#pkc-root` の `data-pkc-theme` 属性 + inline `style` block(`--c-accent` / `--c-bg` / `--c-fg` 等の CSS variable override)を snapshot して export 済 HTML の `<div id="pkc-root">` 開きタグに inline する。これにより export HTML が **first paint** で正しい theme を出す(boot 後の `RESTORE_SETTINGS` まで待たない)、light source mode(boot 抑制 = `__settings__` re-apply 抑制)でも theme 値が描画に効く。
- **テスト**:`tests/adapter/exporter-theme-snapshot-pr-oo.test.ts`(5 件)— `data-pkc-theme` 注入 / inline `style` 注入 / 両 attribute 同時注入 / 未設定時は bare div / attribute 値の HTML escape(injection 防止)を網羅。
- bundle.js 899.29 → 899.51 KB(+0.22 KB:export root の attribute / style snapshot 路)、bundle.css 不変。unit 6492 → 6497(+5)pass。

### Wave 10-6 review fix PR-NN(2026-05-06)

- **Flags inspector 設定変更時勝手 scroll 修正**:user 修正指示2「Flags 画面で設定変更時の勝手 scroll 修正」への対応。`SET_FLAG` dispatch は `__flags__` system entry を mutate し container identity が変わる → render-scope は `'full'` を返し root.innerHTML が wipe される。inspector body は新規作成され scrollTop=0 になり、ユーザーが下方の flag を編集するたびに上に飛ばされていた。
- **修正**:`pkc-flags-inspector-body` に `data-pkc-region="flags-inspector-body"` を付与、`render-continuity.ts` の SCROLL_REGIONS に追加。PR-GG で導入した synchronous + rAF retry の二段書き経路で scroll 復元。
- **Phase 8 順序性 parity test**:`tests/smoke/flags-inspector-scroll-preservation-parity.spec.ts`(NEW)で inspector 開く → body を 200px scroll → numeric flag を `change` event 経由で更新(focus-induced scroll を回避するため `input.fill()` ではなく直接 DOM mutation)→ 2 rAF 待ち → body の scrollTop が ±2px 以内で保たれることを assert。
- bundle.js 899.21 → 899.29 KB(+0.08 KB:SCROLL_REGIONS 1 entry + body data-pkc-region)、bundle.css 不変。unit 6492 / 6492 pass、smoke +1 pass。

### Wave 10-6 review fix PR-MM(2026-05-06)

- **ショートカットメニュー実態合わせ(Flags 集中管理見据え)**:user 修正指示2「ショートカットメニュー実態合わせ(Flags 集中管理見据え)」への対応。`renderShortcutHelp` の文言を action-binder の actual key handling と完全一致するよう audit-update。漏れていたのは:Arrow keys のサイドバー / カレンダー / カンバン navigation、`Ctrl+Arrow Left/Right`(kanban column move)、`Ctrl+Shift+Arrow Up/Down`(カレンダー週送り)、`Ctrl+Enter` (TEXTLOG append)、`Space`(checkbox toggle)、Esc 系の close target 列挙。新 group:Navigation / Calendar view / Kanban view / Note の 4 つを追加(計 8 group)。最後の Note は「将来的に flags-controlled shortcut registry でユーザー rebinding 可能化」と Flags 集中管理 wave への前置きを記載。
- **テスト追従**:`renderer.test.ts` の `groups.length` assertion を 4 → 8 に更新、PR-MM の audit 由来であることを comment で明示。
- bundle.js 898.25 → 899.21 KB(+0.96 KB:help 文言拡充 4 group + 7 entry)、bundle.css 不変。unit 6492 / 6492 pass。

### Wave 10-6 review fix PR-KK(2026-05-06)

- **contact-sheet サムネ引き伸ばしなし(長辺合わせ contain)**:user 修正指示2「サムネ元画像長辺合わせで引き伸ばしなし」への対応。`.pkc-filer-grid-contact-sheet .pkc-filer-card-thumb img` を `object-fit: contain` 指定に上書き。card grid の `cover`(crop して埋める cover-art 用)とは別に、contact-sheet は写真 grid 想定なので元画像の長辺を 1:1 セルにフィットさせ letterbox を許容する仕様に。letterbox 部の背景は thumb 既存の `bg-tag` neutral grey が見えてくる。
- **Phase 8 順序性 parity test**:`tests/smoke/contact-sheet-object-fit-parity.spec.ts`(NEW)で folder + image attachment を IDB に直 seed → contact-sheet 表示で thumb img を `getComputedStyle().objectFit === 'contain'` を assert。class lookup でなく実 painted DOM の computed style を読む doctrine 準拠。
- bundle.css 142.23 → 142.31 KB(+0.08 KB:`object-fit: contain` 1 rule)、bundle.js 不変。unit 6492 / 6492 / smoke +1(全件 pass)。

### Wave 10-6 review fix PR-JJ(2026-05-06)

- **Amazon 商品名 + メーカー / 著者 抽出**:user 修正指示2「Amazon 商品名+メーカー/著者抽出」への対応。bookmarklet の Amazon ブランチを拡張、`#productTitle` から clean な商品名を取得し、`#bylineInfo` から書籍は **著者**、物販は **ブランド** を拾って payload に乗せる。書籍判定は URL の `/dp/`(B0/4/0/1/9-prefix ASIN)+ bylineInfo の「(著)」「(Author)」テキスト、それ以外は kind を null にして brand を採用。
- **PKC-Message v1.1 spec additive**:`record:offer` payload に `author?: string` / `brand?: string` を追加。`record-offer-handler.ts` の validator + `PendingOffer` type + offer 構築 / `injectCaptureFrontmatter` の field 列 / v1.1 trigger 条件 / `ACCEPT_OFFER` の pass-through を全て更新。author / brand 単独でも v1.1 frontmatter path が起動する(v0 blockquote duplication を回避)。frontmatter は YAML safe-scalar 判定で日本語は JSON-quote、ASCII brand は unquoted。
- **テスト**:`tests/adapter/transport/record-offer-author-brand-pr-jj.test.ts`(5 件、payload 受理 / 型 mismatch reject / 後方互換 backward-compat)+ `tests/core/app-state.test.ts` ACCEPT_OFFER 拡張(3 件、author 注入 / brand 注入 / author 単独 v1.1 trigger)。
- bundle.js 897.05 → 898.25 KB(+1.20 KB:bookmarklet Amazon scraper + payload schema 追記)、bundle.css 不変。unit 6484 → 6492(+8)pass。

### Wave 10-6 review fix PR-II(2026-05-06)

- **ノベル系 SVG サムネ生成(タイトル+作者名+プロバイダ)**:user 修正指示2「ノベル系 SVG サムネ(タイトル+作者名)」への対応。カクヨム / 小説家になろう のような「**本物の表紙画像が無い**」 novel-kind entry は、PR-X の URL 直渡し / PR-HH の materialize でも使える画像が無く、card grid で archetype icon の寂しい box になっていた。本 PR は frontmatter `kind: novel` (および `kind: book`)を検出した場合、entry.title + frontmatter.author + frontmatter.provider から **SVG カバーを合成して data:image/svg+xml URL** で `<img src>` に渡す。
- **新規 helper**:`src/features/auto-fill/novel-cover-svg.ts`(pure)。`buildNovelCoverSvg(fields)` で SVG markup、`buildNovelCoverDataUrl(fields)` で base64-encoded data URL を返す。設計:aspect ratio 2:3(本の表紙標準)、provider 由来の決定論的 gradient(同じ provider は同じ色 → container export 後も再現性)、長 title は最大 4 行で wrap、tail ellipsis、XML escape 済。`小説家になろう` / `カクヨム` には専用パレット(緑系・青系)、未知の provider は generic gray、`kind: book` も別パレット(ベージュ系)。
- **renderer 結線**:`pickImageAssetForEntry` の最後の fallback step (4) として追加。step 0(frontmatter URL)→ 1(attachment asset)→ 2(body asset:KEY)→ 3(folder thumb)が全て null を返した場合、`kind: novel` または `kind: book` で title が空でなければ SVG カバーを返す。既存 path には影響なし(image asset がある場合は従来通り raster 画像優先)。
- **テスト**:`tests/features/auto-fill/novel-cover-svg.test.ts`(10 件)— SVG 生成 / 空 title / author 省略 / provider パレット切替 / XML escape / multi-line wrap / data URL round-trip 復号確認 を網羅。
- bundle.js 894.40 → 897.05 KB(+2.65 KB:SVG generator + provider palette + wrap helper + 結線)、bundle.css 不変。unit 6474 → 6484(+10)pass。

### Wave 10-6 review fix PR-HH(2026-05-06)

- **サムネ URL を保存時に解決・asset 化(動的解決排除)**:user 修正指示2「サムネを保存時 URL 解決・asset 化(動的解決排除)」への対応。bookmarklet 経由 PKC-Message v1.1 capture profile の `thumbnail_url`(YouTube / Niconico / カクヨム / Amazon 等の外部 URL)を、accept 時に **fetch + canvas-encode → base64 asset として container.assets に格納**、frontmatter の `thumbnail: <url>` を `thumbnail: asset:KEY` に書換える。container export 時にもサムネが移植され、original host が落ちても、CORS が変わっても、画像はローカルで描画される。
- **新規モジュール**:`src/features/auto-fill/thumbnail-frontmatter.ts`(pure)で `findThumbnailHttpUrl(body)` / `rewriteThumbnailToAssetKey(body, key)` を提供。frontmatter ブロックを byte-for-byte 保存しつつ thumbnail 行のみ書換え。`src/adapter/platform/fetch-image-asset.ts` で `<img crossorigin="anonymous">` + canvas readback による base64 取得 helper(timeout 8s、CORS taint / network エラーは silent fail で URL fallback path 維持)。
- **新規 action**:`MATERIALIZE_THUMBNAIL { lid, assetKey, assetData, mime }`。`ready` / `editing` 両 phase 許容、phase / selection / edit state を変えない。idempotent — 既に asset:KEY に書き換わっている body は variant 不変、asset write のみ反映され並行 fetcher が converge。emit event なし(post-accept side effect)。
- **side-effect listener**:main.ts の OFFER_ACCEPTED handler に async helper を追加。entry の archetype が `text` で frontmatter に http(s) URL があれば `fetchImageAsBase64(url)` → 成功時のみ `MATERIALIZE_THUMBNAIL` dispatch。**best-effort** — fetch 失敗(network / CORS / canvas error)は silently swallow、既存の URL 直渡し fallback で従来通り描画。
- **テスト**:`tests/features/auto-fill/thumbnail-frontmatter.test.ts`(13 件)+ `tests/core/materialize-thumbnail-pr-hh.test.ts`(6 件、reducer contract 全件)。idempotent / blocked-when-readonly / unknown-lid / editing-phase delegate を網羅。bundle.js 892.08 → 894.40 KB(+2.32 KB:fetch helper + reducer case + 結線)、bundle.css 不変。unit 6455 → 6474(+19)pass。

### Wave 10-6 review fix PR-GG(2026-05-06)

- **左ペイン entry click 時の scroll 位置消失 bug を root-cause 修正**:user 報告「大量のエントリがある状況でクリックすると左ペインのスクロールが上に戻る」の原因は、`<aside class="pkc-sidebar">`(`data-pkc-region="sidebar"`)が実際の scroll container ではなく、その内側の `<ul class="pkc-entry-list">`(`flex:1; overflow-y:auto`)が真の scrollable element だった点。2026-04-26 で導入された scroll 保存ロジックは `sidebar.scrollTop` を読んでいたが値は常に 0、restore は silent な no-op となり毎 render で entry-list が頭に戻っていた。修正:`<ul class="pkc-entry-list">` に `data-pkc-region="entry-list"` を付与、`render-continuity.ts` の `SCROLL_REGIONS` に追加、`renderer.ts` の full-render と `replaceSidebarRegion` 両 path で entry-list scrollTop を capture/restore。layout-clamp race 防止のため rAF 二度書き(synchronous + 1 frame defer の idempotent re-apply)も追加。**Phase 8 順序性 parity test**:`sidebar-scroll-preservation-parity.spec.ts`(NEW)で 80 entry seed → entry-list を 600px scroll → 中央の entry を `page.mouse.click(x, y)` で click → SELECT_ENTRY 後に `entry-list.scrollTop` が ±2px 以内で保たれることを assert。bug 修正前は 0 に戻り test FAIL する設計。bundle.js +0.6 KB(capture/restore 経路 1 region 追加)、bundle.css 不変。unit 6455 / 6455、smoke +1 件 pass。

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
