# PKC2 — Portable Knowledge Container

PKC2 is a self-contained knowledge container that runs as a single HTML file.
Open it in any browser — no server, no network, no installation required.
Create, organize, and export structured knowledge that goes wherever you go.

## Features

- **Single HTML, zero dependencies** — works offline, from a USB drive, or as an email attachment
- **4 entry types** — Note, Todo, Form, File (attachment)
- **Relations and tags** — connect entries with structural, categorical, semantic, and temporal links
- **Auto-save** — IndexedDB persistence with 300ms debounce
- **Search, filter, sort** — find entries instantly by text, type, or tag
- **Version history** — automatic snapshots with restore capability
- **HTML Export (4 modes)** — Light/Full × Editable/Readonly
- **ZIP Package** — lossless backup with raw binary attachments
- **Rehydrate** — turn a readonly artifact back into an editable workspace
- **PostMessage protocol** — embed in iframes with structured communication

## Quick Start

1. **Open** — Open `dist/bundle.js` output (or a built HTML) in any modern browser
2. **Create** — Click `+ Note`, `+ Todo`, `+ Form`, or `+ File` to add entries
3. **Export** — Use the Export panel to save as HTML or ZIP

## Export / Import Guide

| Format | Best for | Attachments |
|--------|----------|-------------|
| **HTML Light** | Quick sharing, text-focused content | Excluded (metadata only) |
| **HTML Full** | Complete archive, offline use | Included (gzip+base64) |
| **ZIP Package** | Backup, migration, large files | Included (raw binary) |
| **Readonly HTML** | Distribution, presentations | Depends on Light/Full |

For detailed usage, see [Operation Guide](docs/planning/18_運用ガイド_export_import_rehydrate.md).

## Architecture

5-layer architecture with strict dependency direction:

```
core → adapter → feature → runtime → builder
```

- **core** — data model, operations (zero browser API)
- **adapter** — UI, state, browser abstraction
- **features** — search, relations (orthogonal modules)
- **runtime** — contract validation, metadata
- **builder** — Stage 2 HTML generation

## Documentation

| Document | Purpose |
|----------|---------|
| [Design Principles](docs/planning/05_設計原則.md) | Core values and constraints |
| [Architecture](docs/planning/12_基盤方針追補_責務分離.md) | 5-layer structure and rules |
| [Data Model](docs/planning/17_保存再水和可搬モデル.md) | Storage, export, compression |
| [Operation Guide](docs/planning/18_運用ガイド_export_import_rehydrate.md) | How to use export/import |
| [Pre-Release](docs/planning/19_pre_release.md) | Current status, constraints, future |

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build (Vite Stage 1)
npm run typecheck    # TypeScript check
npm test             # Run tests (702 tests)
```

## Status

**Pre-Release v0.1.0** — Core features stable. Specification stabilizing.

## License

See repository for license information.
