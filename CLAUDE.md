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

## Specification Documents

- `docs/development/todo-view-consistency.md` — Selection state, click/dblclick, overdue/date/archived rules, empty states, status move, view switching behavior across Detail/Calendar/Kanban
