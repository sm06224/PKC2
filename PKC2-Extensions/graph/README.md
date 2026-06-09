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
  flags.ts            Tuning params — decoupled from the core flag registry into a live `graphSettings`
  types.ts            Vendored minimal PKC2 data model (Entry / Relation / Container …)
  util.ts             createElement / isSystemArchetype / structural-parent walk
  demo-container.ts   Sample container for first open
  main.ts             Local-state orchestration: toolbar + canvas + legend + container sources
```

The only host coupling that was dropped: multi-select bulk operations and the
relation wire editor (both needed the host's dispatcher). Everything else —
the five modes (relations / color-tags / tag-groups / folder-hierarchy /
time-proximity), galaxy mode, Venn memberships, time axis, revision dots — is
intact.

## Container sources

1. **Host postMessage** — the host posts `{ type: 'pkc-graph:container', container }`.
2. **File load** — the 📂 toolbar button reads a `.pkc` / pkc-data JSON, or a
   PKC2 HTML artifact with an embedded `<script type="application/pkc-data">`.
3. **Demo** — a bundled sample container renders on first open.

### PKC-Message contract (v0)

| Direction | Message | Payload |
| --- | --- | --- |
| host → ext | `pkc-graph:container` | `{ container: Container }` |
| ext → host | `pkc-graph:node-selected` | `{ lid: string }` |

This v0 uses bare `window.postMessage`. Wiring it onto the formal PKC-Message
**envelope v2** (`src/adapter/transport/envelope-v2.ts` in the host) — request/
response, capability negotiation, heartbeat — is the next integration step (the
host's `multi-window-vscode-extension-spec` is the reference).

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
- ✅ Renders the demo container in a real browser (canvas + legend + mode switch).
- ✅ Single-file embeddable artifact `pkc2-graph.html` (~37 KB, opens from `file://`).
- ☐ Formal PKC-Message envelope v2 integration (host-side push of the container).
- ☐ Feature enrichment now that the UI-integration ceiling is gone.
