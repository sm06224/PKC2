# FI-01 Dual-Edit Safety v1 — Reject Overlay UI Slice

Status: COMPLETED 2026-04-17
Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
Predecessors: `docs/development/dual-edit-safety-pure-slice.md`, `docs/development/dual-edit-safety-state-slice.md`
Scope: overlay DOM + action-binder wiring. Clipboard is executed in the click handler (user-gesture context).

---

## Delivered

### `src/adapter/ui/dual-edit-conflict-overlay.ts` (new)

- `syncDualEditConflictOverlay(state, root)` — idempotent mount / unmount driven by `state.dualEditConflict`. Handles the orphan case (`!activeOverlay.isConnected`) introduced by renderer's `root.innerHTML = ''` pattern — mirrors `text-to-textlog-modal.ts`.
- `isDualEditConflictOverlayOpen()` — probe for tests / host modules.
- `closeDualEditConflictOverlay()` — test-only force-unmount (reset state between test cases).

Exports 3 action identifier constants so the binder and the overlay stay in sync on a single spelling.

### Renderer integration (`src/adapter/ui/renderer.ts`)

- Calls `syncDualEditConflictOverlay(state, root)` as the **last** step of `render()` so the overlay layers on top of the freshly rebuilt shell.

### Action-binder integration (`src/adapter/ui/action-binder.ts`)

Three new `case`s in the delegated click handler:

| `data-pkc-action` | Behavior |
|-------------------|----------|
| `resolve-dual-edit-save-as-branch` | Dispatches `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'save-as-branch' }` |
| `resolve-dual-edit-discard` | Dispatches `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'discard-my-edits' }` |
| `resolve-dual-edit-copy-clipboard` | Calls `copyPlainText(conflict.draft.body)` (within the user-gesture click) and dispatches `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'copy-to-clipboard' }` for ticket advancement |

One Escape-handler guard added at the top of the document-level `keydown` branch: when `state.dualEditConflict` is populated, `Escape` is a no-op. Honors I-Dual2 and beats every other overlay dismissal path.

### Overlay DOM shape

```
<div data-pkc-region="dual-edit-conflict" role="dialog" aria-modal="true" aria-label="Save conflict" class="pkc-text-replace-overlay">
  <div class="pkc-text-replace-card">
    <h2>別のセッションでこのエントリが更新されました</h2>
    <p>保存は中止されました。編集内容は下のいずれかで処理してください。</p>
    <dl>
      <dt>対象エントリ</dt><dd>{lid}</dd>
      <dt>編集開始時の更新時刻</dt><dd>{base.updated_at}</dd>
      [<dt>現在の更新時刻</dt><dd>{currentUpdatedAt}</dd>]
    </dl>
    <div class="pkc-text-replace-actions">
      <button data-pkc-action="resolve-dual-edit-save-as-branch" data-pkc-lid=… data-pkc-field="dual-edit-default-focus">Save as branch</button>
      <button data-pkc-action="resolve-dual-edit-discard" data-pkc-lid=…>Discard my edits</button>
      <button data-pkc-action="resolve-dual-edit-copy-clipboard" data-pkc-lid=…>Copy to clipboard</button>
    </div>
  </div>
</div>
```

Classes reuse the existing overlay CSS (`pkc-text-replace-*`) to avoid introducing a new class namespace — same trick the boot-source-chooser uses.

---

## Contract invariants surfaced

- **I-Dual2 / §8.1**: Escape / backdrop click do NOT close the overlay. No listeners wired; the Escape-handler guard forces no-op when `state.dualEditConflict` is populated.
- **Supervisor fixed decision 3**: default focus lands on **Save as branch** (primary CTA).
- **I-Dual10**: clipboard call happens in a click-handler (user gesture) to satisfy the browser permission model. State ticket advance is a separate concern, handled by dispatching after the write.
- **Singleton**: only one overlay at a time; `syncDualEditConflictOverlay` treats a lid change as unmount + mount.

---

## Quality gates

- `npx vitest run tests/adapter/dual-edit-conflict-ui.test.ts` — 12/12 pass
- `npm run typecheck` — clean
- `npm test` — 4153/4153 pass (baseline 4141 + 12)
- `npm run build:bundle` — succeeds
- `npm run build:release` — succeeds; `dist/pkc2.html` regenerated

---

## Intentionally not done (deferred)

- advisory banner at edit-start (optional per contract) — not implemented
- kind-specific overlay variants (entry-missing / archetype-changed / version-mismatch) — v1 uses a single overlay for all kinds
- audit / manual sync — next slices

---

## Test coverage (12 cases)

| # | Target |
|---|--------|
| 1 | overlay renders when `state.dualEditConflict` is populated |
| 2 | `role="dialog"` + `aria-modal="true"` + `aria-label` present |
| 3 | 3 action buttons in stable DOM order, carrying `data-pkc-lid` |
| 4 | default focus on Save as branch |
| 5 | no overlay when no conflict |
| 6 | Save as branch click → RESOLVE dispatch + new branch + overlay unmount |
| 7 | Discard click → RESOLVE dispatch + container preserved + overlay unmount |
| 8 | Copy click → `writeText(draft.body)` + ticket bump (x2 press → 2x call + ticket=2) |
| 9 | Escape keydown does NOT close overlay (dualEditConflict guard) |
| 10 | Backdrop overlay click does NOT close overlay |
| 11 | External `CANCEL_EDIT` clears state → overlay unmounts on next render |
| 12 | Ordinary edit flow (no conflict) does NOT render the overlay |
