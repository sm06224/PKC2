# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Policy

- Internal reasoning MUST be in American English
- Final output MUST be in Japanese

## Build & Development Commands

```bash
npm run build:bundle     # Vite build → dist/bundle.{js,css}
npm run build:release    # Bundle → single HTML (dist/pkc2.html)
npm run build            # Both steps

npm test                 # vitest run (all tests)
npx vitest run tests/adapter/renderer.test.ts  # single test file
npx vitest run -t "Todo Kanban"                # tests matching name

npm run typecheck        # tsc --noEmit
npm run lint             # eslint src/ tests/
npm run lint:fix         # eslint --fix
```

**Before every commit**: run `npm test` and `npm run build:bundle`. The dist files must be updated.

## Architecture: 5-Layer Structure

```
core/         → Domain model. Pure types + operations. NO browser APIs.
features/     → Pure algorithmic functions (filter, sort, tree, calendar, kanban).
               Imports from core (read-only types) only.
adapter/      → Runtime integration: state machine, UI rendering, persistence, transport.
  state/      → AppState + Dispatcher (Redux-like pure reducer)
  ui/         → renderer.ts, action-binder.ts, *-presenter.ts
  platform/   → IndexedDB, compression, export/import, embed detection
  transport/  → PostMessage protocol for cross-origin communication
runtime/      → Build constants, version, DOM slot contracts
main.ts       → Bootstrap: wires everything together
```

**Import rules**: core ← features ← adapter. Core never imports from adapter or features. Features never import from adapter. Adapter orchestrates everything.

**Path aliases** (tsconfig): `@core/*`, `@adapter/*`, `@features/*`, `@runtime/*`

## Data Model

**Container** is the top-level aggregate (source of truth):
- `entries: Entry[]` — fundamental data units, each with `lid`, `title`, `body` (string), `archetype`
- `relations: Relation[]` — structural, categorical, semantic, temporal links between entries
- `revisions: Revision[]` — historical snapshots of entries
- `assets: Record<string, string>` — base64 file data (separated from body)

**Archetypes**: `text | textlog | todo | form | attachment | folder | generic | opaque`
Each archetype has a **DetailPresenter** (registered at boot) that handles view/edit/collect for its body format.

**Todo body** is JSON stored as string: `{ status: 'open'|'done', description, date?, archived? }`

## State Machine

```
AppPhase: 'initializing' → 'ready' ↔ 'editing' / 'exporting' → 'error'
```

**Dispatchable** = `UserAction | SystemCommand` → pure **reducer** → `(state', DomainEvent[])`

Key state fields: `container`, `selectedLid`, `editingLid`, `viewMode ('detail'|'calendar'|'kanban')`, `phase`

The **Dispatcher** is the single coordination point: dispatch → reduce → notify state listeners → emit events.

## Renderer / ActionBinder / Presenter Pattern

- **Renderer** (`renderer.ts`): pure function `render(state, root)` → DOM. Never reads DOM to derive state. Uses `data-pkc-*` attributes for all functional selectors (minify-safe).
- **ActionBinder** (`action-binder.ts`): event delegation on root via `data-pkc-action` attributes → dispatches UserActions. Never renders DOM.
- **DetailPresenter** (`detail-presenter.ts`): archetype-specific `renderBody` / `renderEditorBody` / `collectBody`. Registry pattern with text fallback.

## Key Conventions

- All functional DOM selectors use `data-pkc-*` attributes, never CSS class names
- `QUICK_UPDATE_ENTRY` updates body only (no title change, no phase transition). Used for inline operations like todo status toggle.
- `selectedLid` is the single source of truth for selection across all views
- `SET_VIEW_MODE` does NOT clear selection
- Todo helpers: `parseTodoBody()`, `serializeTodoBody()`, `formatTodoDate()`, `isTodoPastDue()`
- Kanban always excludes archived todos; Calendar respects `showArchived` flag
- `dispatcher.onState()` / `onEvent()` return an unsubscribe `() => void`. Page-lifetime subscriptions (main.ts) may discard it; any shorter-lived subscription must capture and call it on teardown. See `docs/development/stale-listener-prevention.md`.

## Invariants

1. **5-layer structure** must be maintained — no cross-layer violations
2. **core has NO browser APIs** — pure TypeScript only
3. **Single HTML product** — everything bundles into one file via `build/release-builder.ts`
4. **Container is source of truth** — UI state is runtime-only
5. **Backward compatibility** — never break existing data contracts
6. **No premature abstraction** — three similar lines > one premature helper

## Testing

- Framework: Vitest + happy-dom
- Test environment declared per file: `/** @vitest-environment happy-dom */`
- Tests mirror src structure: `tests/adapter/`, `tests/core/`, `tests/features/`
- Renderer tests query DOM using `data-pkc-*` selectors, scoped to regions (`[data-pkc-region="kanban-view"]`)

### 描画と生成は別物 ─ "test pass = ship" 禁止(2026-05 reform)

**生成 (HTML / state mutation) が正しい ≠ ユーザーが見ているピクセルが正しい**。以下を厳守する:

- vitest 単体 / renderer DOM (happy-dom) / Playwright smoke の `locator.click()` は **生成・mutation の正しさ** を確認しているだけ。**ユーザー実機での視認 / 操作の一致を保証しない**。
- 視覚を持つ feature(クリック・ホバー・ドラッグ・スクロール・座標依存の overlay 等)は、`docs/development/visual-state-parity-testing.md` 規定の **parity test を最低 1 件**持つこと。`elementFromPoint` / `page.mouse.click(x, y)` を経由した実 OS event ベースで assert する。
- 視覚を持つ feature の PR では、**parity test が green** であることを確認するまで「ユーザー側で merge 判断してよい状態です」と報告しない。
- ユーザーが「動かない」と報告した瞬間に、自然言語ヒアリングではなく **`?pkc-debug=<feature>` URL flag で再操作 → Report dump** を依頼できる導線を整える。プロトコルは `docs/development/debug-via-url-flag-protocol.md`。

## Specification Documents

- `docs/development/completed/todo-view-consistency.md` — Selection state, click/dblclick, overdue/date/archived rules, empty states, status move, view switching behavior across Detail/Calendar/Kanban
- `docs/development/markdown-render-scope.md` — どの archetype / field が markdown を render するか、`.pkc-md-rendered` を共通 selector とする contract、新 markdown 拡張の scope 規約
- `docs/development/debug-privacy-philosophy.md` — debug 機能が user content をどう扱うかの 4 原則(Local-only / Privacy by default / Graduated opt-in / Schema versioning)。`debug-via-url-flag-protocol.md` の上位規約(reform-2026-05)
- `docs/development/debug-via-url-flag-protocol.md` — `?pkc-debug=<feature>` で feature ごとの debug overlay / Report dump を出すユーザー報告導線の規約(reform-2026-05)
- `docs/development/visual-state-parity-testing.md` — 描画と状態の一致を保証する parity test methodology(reform-2026-05)
- `docs/development/pr-206-paused.md` — caret↔preview sync の保留判断と仕切り直し方針
- `docs/development/doc-archival-discipline.md` — RESOLVED な実装 / 設計 / 計画 doc を archive folder に移動して live 件数を継続削減する discipline(Phase 6 / 2026-05-03)

## Doc lifecycle 自己 binding(2026-05-03 reform-2026-05 Phase 6)

「次の選択肢を提示する前」「PR 着地後の followup を提案する前」「autonomously に進む前」の **すべての分岐点** で、以下を必ず実施:

1. `docs/development/feature-requests-2026-04-28-roadmap.md`(8 領域の現状)を grep
2. `docs/planning/USER_REQUEST_LEDGER.md` §3.6(deferred items + 再評価 trigger)を grep
3. INDEX LIVE Active feature specs(進行中 spec)を grep
4. 直近 PR で archive 候補となった doc を確認

grep 結果を要約してから選択肢を提示する。**grep を skip した提示は禁止**。「目立たないところに記録があるかも」が常に成立するため、roadmap re-read 無しの提案は手抜きと見なす(2026-05-03 user 指摘)。

PR 着地時には `docs/development/doc-archival-discipline.md` §6.1 に従い、触った feature の lifecycle を 1 cycle 進める(完了なら archive、部分なら roadmap 追記)。

**CHANGELOG 更新も同時必須**(2026-05-04 reform-2026-05 Phase 7):feature / fix PR は `docs/release/CHANGELOG_v<current>.md` の該当 section に 1 行追記、新 minor / major bump 時は新規 `CHANGELOG_v<new>.md` を `docs/release/CHANGELOG_v2.2.0.md` を範として起こす。About entry が build 時に CHANGELOG を parse して最新 3 generations を表示するため、CHANGELOG 更新を skip した PR は About に反映されず release context が失われる。詳細は `pr-review-checklist.md` §2.10。

**順序性テストも必須**(2026-05-04 reform-2026-05 Phase 8、user 実機テスト省略前提):動的機構(flag / setting / event 連携 / dispatch + 副作用)を含む PR では、**state mutation → consumer behavior change** の end-to-end parity test を必須。DOM attribute 遷移までで止めず、consumer の挙動が user-visible 観測点(DOM 数値 / 表示要素数 / 副作用)で変化することを assert する。reform-2026-05 §6 visual-state-parity-testing(描画と状態の一致)と AND 条件で適用。詳細は `pr-review-checklist.md` §2.11。Claude 側で **boot → action → consumer 観測の鎖を全件 covered** であることを保証する責務を負う。

**CSS migration / dedup の落とし穴 2 件**(2026-05-05 reform-2026-05 Phase 9、領域 9 CSS wave 2 hotfix の教訓):

1. **value boundary を厳密に anchor**(PR #245 教訓):CSS value migration の regex は `\b1rem\b` のような word boundary だけでは不可。`0.1rem` 中の `1rem` 部分にもマッチして invalid CSS 28 site を生成した実例あり。必須 pattern:
   ```python
   re.compile(
     r'(font-size:\s*)(VALUE_ALT)(\s*(?:;|!important|\}|$))',
     re.MULTILINE,
   )
   ```
   property name(LHS)と terminating context(`;` / `}` / `!important` / 行末)で value 全体を anchor し、partial substring match を構造的に阻止する。

2. **variant rule 縮小時の standalone audit**(PR #252 教訓):CSS dedup で variant rule(`.pkc-btn-danger` 等)を「diff のみ」に縮小する PR では、必ず JS 側の class 生成 site を全件 grep して standalone usage(`pkc-btn-VARIANT` 単独)が無いか確認する。`grep -rEh "createElement\('button',\s*'pkc-btn-(VARIANT)" src/` を全 variant に対し実行、standalone があれば (a) `'pkc-btn pkc-btn-VARIANT'` への JS 修正、(b) 必要 base property の variant 残置、(c) selector list での chrome share、のいずれかで対応。Phase 8 順序性 doctrine の延長で、variant 縮小 PR には computed pixel parity test を追加する余地あり(future enhancement)。

詳細は `docs/development/css-architecture-audit-2026-05.md` §9.5 lessons-learned。

## PR Workflow / Review Checklist

PKC2 は 2026-04-25 以降 **User + Claude の 2 名体制**(ChatGPT 統括役は外れ、Gemini 等が将来加わる可能性あり)で運用されている。Claude が implementer + auditor を兼任するため、**PR 作成時に必ず 8 項目の自己監査を行う**。

監査項目(必ず 8 つ全部、PR 作成直後に実行):
1. **Scope drift** — 合意した方針 / 禁止事項から外れていないか、`git diff --stat` で確認
2. **CI 3 checks の conclusion** — typecheck+test+build × 2 + Playwright smoke すべて `success`
3. **Review comments / unresolved threads** — `totalCount === 0`
4. **mergeable_state** — `clean`、`mergeable: true`
5. **PR body Test plan checklist** — manual 確認項目を source-based confirmation で埋める or 注記付きで残す
6. **互換性 / contract grep** — schema / version / `data-pkc-*` / 既存 selector / Known limitations 文言の意図しない変更なし
7. **Bundle / budget** — bundle.css 98 KB / bundle.js 1536 KB を超えない、headroom が 1 KB を切ったら次 PR 前に bump 検討
8. **Merge 判断の報告** — 全 OK で「ユーザー側で merge 判断してよい状態です」、merge 自体は User が GitHub UI で実行

詳細は `docs/development/pr-review-checklist.md` を参照(失敗パターン / セルフチェック / Gemini onboard 手順も同 doc)。

**PR 作成前のセルフチェックでは `npm run test:smoke` を必ず実行**(src / tests / dist / build / adapter / features を触る PR は必須、docs-only PR は省略可)。Playwright smoke は実ブラウザでの視覚レイアウト確認も兼ねるため、CI green を待つ前に手元で見つけられる失敗を pre-flight で潰す。

**Merge 自体は Claude が実行しない**。`mcp__github__merge_pull_request` は使用せず、CI green + audit 通過を確認後に User の判断に委ねる。

## Wave 運用規律(2026-05-07 reform-2026-05 Phase 10、wave 10-9 の教訓)

Wave 10-9 stabilization(122 commit / 100 PR / 2 日)で得られた運用教訓。「user が叩く前に Claude が先回りして潰す」を狙う構造規律。

### 1. 1 wave あたりの PR 数は **30〜50 件** で打ち止め

100 PR 溜めてからの一括 merge は **Δ6 着地事故**(stacked PR の base を retarget せず squash → 中間 branch に着地、main は変化なし)を引き起こす。30〜50 件溜まった時点で **下から sequential merge** して main を最新化、次 stack を再開。

### 2. Stacked PR の squash merge は **base retarget が先**

`gh pr merge <top> --squash` は **PR の現在の base** に merge する。stack の頂点 PR の base が中間 branch のままだと中間 branch に着地して main は更新されない。**top PR を main に squash する前に必ず base を main に付け替える**(GitHub UI の "Edit base branch" or `gh pr edit <num> --base main`)。

### 3. 「既存問題」は通さない、必ず別 hotfix PR を立てる

wave 中に「これは既存問題で本 wave 起源ではない」と判断したものは:
- ❌ 「通す」(放置して wave に紛れ込ませる)→ CI で詰まる、後始末コストが膨らむ
- ✅ **その場で別 hotfix PR を立てる**(scope は最小、`fix(<area>): pre-existing X 解消` で 1 commit)

wave 10-9 では lint 2 件(U+3000 + features→adapter import)を「既存」として通した結果、wave 締め直後の CI で 100 件の bulk close 後に詰まり recovery PR を 2 本(#365 + INDEX 登録)足す羽目になった。**通さない、即剥がす**。

### 4. Case matrix の最低件数を規約化

Inline operation(キーボード入力 / 1 行 commit / state mutation 等)を加える PR では、**case matrix を最低 10 件以上 + user 提供ケースを必ず含める**。私は wave 10-9 中に「3 ケース」で OK と判断して user 報告(「具体ケース 3 件に根拠はあるのか?」)で 14 ケースに拡張させられた。最初から 10〜14 ケース matrix を default にする:

| 軸 | 最低カバー |
|----|----------|
| 入力長 | 短 / 中 / 長 |
| 文字種 | ASCII / CJK / 混在 / 絵文字 |
| 構造 | 行頭 / 行中 / 行末 / indent / list marker |
| エッジ | 空 / 1 文字 / 不正値 / 境界値 |

### 5. visual parity test を **最低 1 件** 視覚機能 PR に必須

`docs/development/visual-state-parity-testing.md` 既定の **`elementFromPoint` / `page.mouse.click(x, y)` で実 OS event 経由の assert** を、視覚を持つ feature(クリック / ホバー / ドラッグ / overlay)の PR で必ず 1 件以上添付。**vitest unit / happy-dom DOM だけで「test pass = ship」と判定するのは禁止**(reform-2026-05 §6 既定、Phase 10 で「最低 1 件」を数値規律化)。

### 6. user の典型的な叩きを Claude が先回りして潰す

wave 10-9 で頻発した user 指摘の傾向と先回り対応:

| user 指摘パターン | Claude 側の先回り |
|-----------------|-----------------|
| 「ケース 3 件に根拠あるのか」 | §4 の matrix 10 件以上を default に |
| 「視覚的に確認したか」 | §5 の visual parity test を必須化 |
| 「想定未熟」 | user 提供ケースを必ず matrix に組み入れ + edge case を自発的に追加 |
| 「動かない」 | `?pkc-debug=<feature>` URL flag overlay + Report dump 導線を機能ごとに用意(`debug-via-url-flag-protocol.md`)|
| 「サブピクセル差を体感影響なしと判断」 | delta = 0 が ship 基準、computed pixel parity test で確認 |

### 7. Doc orphan / dead-link は **作成と同時に登録**(後回し禁止)

wave 締めで急いで作った doc を `docs/development/INDEX.md` 登録忘れ → CI `check:doc-orphans` で fail。`Write` で新 doc を作ったら **同 commit で INDEX への 1 行追加** を必須に。`doc-archival-discipline.md` §6.1 の register-each-orphan rule を厳守。

### 8. user の疲弊は Claude の責任

「鉄人レース」スタイル(納得まで叩き続ける)は user 側を疲弊させる。私が「疲れない」のを免罪符にせず、**叩かれる前に詰める精度** を上げるのが私の仕事。本 §1〜§7 を Claude が能動的に守り、user の叩き回数を減らす。叩かれてから直すのは妥協、叩かれる前に詰めるのが本筋。
