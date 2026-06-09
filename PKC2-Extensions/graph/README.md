# PKC2 Graph — Extension

A standalone, force-directed **graph view** for PKC2 entries and relations,
extracted from the host product (PKC2 issue #790) so it can grow free of the
integrated UI's constraints. It runs as its own web app and talks to a host
PKC2 over **PKC-Message** (postMessage), or works fully offline by loading an
exported container.

> Migrated out of `src/adapter/ui/graph-canvas.ts` + the `renderCenterGraphView`
> support code. The host keeps **no** graph view after #790; this is the new home.

## Why it was separated

In-product, the graph was wired into the renderer / action-binder / app-state,
so every change paid the cost of the whole 5-layer integration and the bundle
budget. As an extension it owns its surface: layout modes, galaxy 3D, Venn
overlays, and future ideas (clustering, timeline scrubbing, edge bundling) can
evolve without touching the core product.

## Architecture

```
src/
  graph-canvas.ts     Canvas renderer + gestures (ported verbatim; deps trimmed to ./flags, ./types)
  force-layout.ts     Pure force simulation (zero deps)
  payload-builder.ts  Container → {nodes, links} per mode + time-proximity seed (ported from renderer)
  protocol.ts         Secure PKC-Graph channel client + minimal GraphProjection types
  flags.ts            Tuning params — decoupled from the core flag registry into a live `graphSettings`
  types.ts            Vendored minimal PKC2 data model (Entry / Relation …)
  util.ts             createElement / isSystemArchetype / structural-parent walk
  demo-container.ts   Sample container for standalone open
  main.ts             Local-state orchestration: toolbar + canvas + legend, fed by the channel
```

The host side lives in PKC2:
`src/features/graph-extension/projection.ts` (build the minimal projection)
and `src/adapter/ui/graph-extension-launcher.ts` (launch + secure channel).

The only host coupling dropped from the original in-product graph: multi-select
bulk operations and the relation wire editor (both needed the host's
dispatcher). Everything else — the five modes (relations / color-tags /
tag-groups / folder-hierarchy / time-proximity), galaxy mode, Venn memberships,
time axis — is intact. (Revision dots are gone: revisions are intentionally not
in the projection.)

## How it is launched + the secure channel

PKC2 stores this extension's single-file HTML in `container.assets`. The host
injects it via `document.write` into a child surface — so the child is
**same-origin** and points back to PKC2:

- **manual launch** (`AttachmentBody.pkc_extension`, user gesture) → a real
  popup `window.open` (child reaches the host via `window.opener`);
- **autostart** (`startup` flag, at boot, no gesture → a popup would be blocked)
  → a same-origin `<iframe>` overlay (child reaches the host via `window.parent`).
  Skipped when the page is opened with `?pkc-safe-mode=1`, so a hanging extension
  can never brick startup.

The single-file is built as a **classic IIFE script** (not `type="module"`):
a module script does *not* execute when injected via `document.write` in Firefox,
which left the graph blank — the IIFE runs reliably on every browser.

The host then serves a **minimal `GraphProjection`** (node/edge metadata only —
never bodies, assets or revisions) over a secure channel.

### Secure handshake — the channel must start safely

| Step | Direction | Message | Security gate |
| --- | --- | --- | --- |
| 1 | child → host | `hello` | host accepts only if `event.source === openedWindow` **and** `event.origin === location.origin` (window identity is unforgeable) |
| 2 | host → child | `welcome { nonce, projection }` | child pins the nonce + `event.source === window.opener` + origin |
| 3 | child → host | `select { nonce, lid }` | host requires matching nonce + source + origin |
| — | host → child | `projection { nonce, ... }` | live update; child requires matching nonce |

`targetOrigin` is the exact origin; for `file://` (origin string `"null"`, not a
valid `postMessage` target) it falls back to `'*'`, with security carried by the
window-identity + nonce binding. Opened standalone (no opener), the extension
shows a small demo.

This replaces the earlier **fabricated** `pkc.container.*` methods (which did
not exist in PKC2) — see git history. The doc-described `export:request` path is
the *inverse* topology (PKC2 embedded as a child) and does not fit a launcher-
opened extension; this host→child channel is the additive PKC-Message flow.

## Develop

Tooling resolves from the PKC2 repo root (`vite`, `typescript` already
installed there), so no separate install is required in the container:

```bash
cd PKC2-Extensions/graph
../../node_modules/.bin/vite          # dev server
../../node_modules/.bin/vite build && node build-singlefile.mjs   # → dist/ + pkc2-graph.html
../../node_modules/.bin/tsc --noEmit  # typecheck
```

(With a normal checkout, `npm install` then `npm run dev` / `npm run build`.)

`npm run build` emits both the `dist/` assets and **`pkc2-graph.html`** — a
single self-contained file (JS + CSS inlined, ~37 KB) that opens straight from
`file://` and embeds in an iframe, the same shape as `PKC2-Extensions/pkc2-manual.html`.

The extension is **excluded from the host's tsconfig / eslint / build**
(root `include` is `src tests build`), so it never affects PKC2 CI.

## Status

- ✅ Ported renderer + force layout + payload builder, typecheck clean, builds
  (~33 KB JS / ~5 KB CSS gzip ~13 KB).
- ✅ Renders a container in a real browser (canvas + legend + mode switch).
- ✅ Single-file embeddable artifact `pkc2-graph.html` (~37 KB, opens from `file://`).
- ✅ **Secure host channel verified with real code on both sides** — the real
  `launchGraphExtension` opened the real extension, served a real 47-entry
  projection over the handshake, the graph rendered it, and a node selection
  flowed back (nonce + source + origin validated). No simulator.
- ☐ Wire `launchGraphExtension` into PKC2's launcher/action-binder (`open-graph-
  extension` action + storing this HTML as a container asset).
- ☐ Feature enrichment now that the UI-integration ceiling is gone.
