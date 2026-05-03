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
