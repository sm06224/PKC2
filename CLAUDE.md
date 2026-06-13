# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **2026-06 スリム化**:本書は「足す時代」の儀式過積載(reform-2026-05 Phase 1–11 の wave 規律堆積)を削ぎ、**削る/選る/着陸の時代**の運用へ書き換えた。削除前の全文は `docs/development/archived/CLAUDE-md-2026-05-pre-slim.md` に保存。詳細な方法論は本書末尾の参照 doc 群に残っている。

## Language Policy

- Internal reasoning MUST be in American English
- Final output MUST be in Japanese

## 現在の運用方針(2026-06、最優先)

> **プライム・ディレクティブ:機能を足さない。削る・選る・着陸させる。**

- 単一正本 = `docs/development/v3-consolidation-and-direction-2026-06.md`(診断 / 凍結表 / 4 レーン / North Star)。**まずこれを読む**
- **live tracking は GitHub Issues が正本**(file ベース台帳は archive 済)。レーン: `lane:perf` / `lane:curation` / `lane:arch-v3` / `lane:process`、`frozen` = 凍結中・参照のみ
- 許可される作業: ① bug fix ② perf ③ bundle 引き算(機能 subtract)④ main 着陸の取捨選択 ⑤ doc/process 整理 ⑥ 設計 doc(実装しない)
- 🚫 新 archetype / feature / markdown 方言 / UI mode の追加は**凍結**。user が「足したい」と言い出したら本方針を引いて一旦止め、Issue 化して優先度判断へ回す
- 凍結中の旧計画(8案v3 / Phase β / 68PR Phase γ / roadmap 領域)は frozen backlog issue #776 に保全

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
  transport/  → PostMessage protocol (PKC-Message) + pkc-ext 拡張チャネル(v2 spec §3.8)
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

ストレージ層は `src/adapter/platform/storage/storage-adapter.ts` で抽象化済(idb / memory adapter)。**OPFS adapter は seam として予約済**(L3 #771、設計のみ)。

## State Machine

```
AppPhase: 'initializing' → 'ready' ↔ 'editing' / 'exporting' → 'error'
```

**Dispatchable** = `UserAction | SystemCommand` → pure **reducer** → `(state', DomainEvent[])`

Key state fields: `container`, `selectedLid`, `editingLid`, `viewMode ('detail'|'calendar'|'kanban'|'filer'|'launcher')`, `phase`

The **Dispatcher** is the single coordination point: dispatch → reduce → notify state listeners → emit events.

## Renderer / ActionBinder / Presenter Pattern

- **Renderer** (`renderer.ts`): pure function `render(state, root)` → DOM. Never reads DOM to derive state. Uses `data-pkc-*` attributes for all functional selectors (minify-safe).
- **ActionBinder** (`action-binder.ts`): event delegation on root via `data-pkc-action` attributes → dispatches UserActions. Never renders DOM.
- **DetailPresenter** (`detail-presenter.ts`): archetype-specific `renderBody` / `renderEditorBody` / `collectBody`. Registry pattern with text fallback.

## Key Conventions

- All functional DOM selectors use `data-pkc-*` attributes, never CSS class names
- `QUICK_UPDATE_ENTRY` updates body only (no title change, no phase transition). Used for inline ops like todo status toggle.
- `selectedLid` is the single source of truth for selection across all views
- `SET_VIEW_MODE` does NOT clear selection
- Todo helpers: `parseTodoBody()`, `serializeTodoBody()`, `formatTodoDate()`, `isTodoPastDue()`
- Kanban always excludes archived todos; Calendar respects `showArchived` flag
- `dispatcher.onState()` / `onEvent()` return an unsubscribe `() => void`. Shorter-lived subscriptions must capture and call it on teardown. See `docs/development/stale-listener-prevention.md`.

## Invariants

1. **5-layer structure** — no cross-layer violations
2. **core has NO browser APIs** — pure TypeScript only
3. **Single HTML product** — everything bundles into one file via `build/release-builder.ts`
4. **Container is source of truth** — UI state is runtime-only
5. **Backward compatibility** — never break existing data contracts
6. **No premature abstraction** — three similar lines > one premature helper

## Testing

- Vitest + happy-dom。test env は per-file:`/** @vitest-environment happy-dom */`
- Tests mirror src: `tests/adapter/`, `tests/core/`, `tests/features/`
- Renderer tests は `data-pkc-*` selector を region scope(`[data-pkc-region="..."]`)で query
- **描画と状態は別物**:vitest / happy-dom の pass は生成の正しさを示すだけで、ユーザー実機の視認を保証しない。**視覚を持つ feature**(click / hover / drag / overlay)は `elementFromPoint` / `page.mouse.click(x,y)` 経由の **visual parity test を最低 1 件**持つ。方法論は `docs/development/visual-state-parity-testing.md`
- 動的機構(flag / event 連携 / dispatch+副作用)は **state mutation → consumer 観測点(DOM 数値 / 表示要素数 / 副作用)** の end-to-end parity を assert(DOM attribute 遷移で止めない)

## PR / Wave 運用(slim)

肥大の根本原因は**儀式過積載で 1 PR が高コスト化 → 着地せず stack に逃げる**こと(50 PR 一本 stack の事故)。最小限の硬い規律に絞る:

1. **stack 上限を守る**:open PR が積み上がったら下から sequential merge で main を最新化してから次を積む。stacked PR の squash は **base retarget が先**(中間 branch 着地事故を防ぐ)
2. **bundle 予算優先**:機能追加より KB を優先。`git diff --stat` + bundle サイズを毎 PR 確認。現状 bundle.js が肥大(5MB 級、L1 #767 で削減中)、新規追加は原則しない
3. **既存問題は別 hotfix PR**:wave に紛れ込ませず即剥がす
4. **視覚機能 PR は visual parity test 最低 1 件**(上記 Testing 参照)
5. **新 doc は同 commit で INDEX 登録**(`check:doc-orphans` CI)
6. **merge は通常時 Claude が実行**(user 委任、2026-06-07)。CI 全 green + audit 通過 + scope 自己監査クリアを確認したうえで squash merge する。ただし次のいずれかに該当する時は merge せず `AskUserQuestion` で user 判断を仰ぐ:scope drift / 後方互換の破壊 / 大規模 refactor / 不可逆操作 / プライム・ディレクティブ(機能を足さない)や frozen 方針への抵触。確認が取れない・CI が green でないものは merge しない

PR の自己監査(scope drift / CI / unresolved / mergeable / 互換性 grep / bundle)は `docs/development/pr-review-checklist.md` を参照(必要時のみ、儀式化しない)。

### markdown 3 surface(新 markup / features 層 DOM 操作を触る時のみ)

markdown は 3 経路で独立 render:center pane(detail-presenter)/ Viewer popup(rendered-viewer、独立 document・inline `<style>`)/ Split View preview(`sourceLineAnchors` 経路)。新 markup 追加時は **3 surface 全部で確認**(base.css → Viewer inline style mirror、features 層 DOM 操作は rendered-viewer でも呼ぶ、preprocessor の行挿入は LineMap で原文 index に逆引き、fence 内は preprocessor skip)。詳細 `docs/development/css-architecture-audit-2026-05.md` §9.5。

## 参照 doc(詳細方法論)

- `docs/development/v3-consolidation-and-direction-2026-06.md` — **方針正本**
- `docs/development/archived/CLAUDE-md-2026-05-pre-slim.md` — スリム化前の全文(reform-2026-05 Phase 1–11 の wave 規律詳細)
- `docs/development/visual-state-parity-testing.md` — parity test 方法論
- `docs/development/pr-review-checklist.md` — PR 自己監査の正本
- `docs/development/markdown-render-scope.md` — markdown render scope 規約
- `docs/development/doc-archival-discipline.md` — doc archive discipline
- `docs/development/debug-via-url-flag-protocol.md` — `?pkc-debug=<feature>` ユーザー報告導線
