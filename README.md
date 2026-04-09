# PKC2 — Portable Knowledge Container

**単一HTMLで動作する、ローカル完結型の知識コンテナ**

## What is this?

PKC2 は、以下を1つにまとめたツールです:

- メモ・タスク・構造化データの管理
- 添付ファイルを含む知識の保持
- HTML 1ファイルとしての配布
- ZIP による完全バックアップ
- 再水和（Rehydrate）でどこでも作業環境を復元

**「書く・持ち出す・戻す」を1つのモデルで扱えます。**

## Features

- **Single HTML, zero dependencies** — works offline, from a USB drive, or as an email attachment
- **Auto-save** — IndexedDB persistence, no manual save needed
- **4 entry types** — Note, Todo, Form, File (attachment)
- **HTML / ZIP export** — light sharing, full archive, or lossless backup
- **Rehydrate** — turn a readonly HTML back into an editable workspace
- **Relations and tags** — connect entries structurally
- **Search, filter, sort** — find anything instantly
- **Version history** — automatic snapshots with restore
- **Size guardrails** — warnings before large exports

## Quick Start

1. **Open** `dist/pkc2.html` in any modern browser
2. **Create** entries with `+ Note`, `+ Todo`, `+ Form`, or `+ File`
3. **Export** via the Export panel — choose HTML or ZIP

詳しい使い方は [ユーザーマニュアル（Markdown）](docs/manual/00_index.md) または [PKC2 マニュアル HTML](PKC2-Extensions/pkc2-manual.html) を参照してください。

## Which Export should I use?

| Goal | Recommended |
|------|-------------|
| Quick sharing | HTML Light |
| Share with attachments | HTML Full |
| Distribution (read-only) | Readonly HTML |
| Backup / migration | ZIP Package |

For detailed usage, see the [Operation Guide](docs/planning/18_運用ガイド_export_import_rehydrate.md).

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

Runtime has zero external npm dependencies.

## Documentation

### ユーザー向け

| Document | Purpose |
|----------|---------|
| [ユーザーマニュアル（目次）](docs/manual/00_index.md) | 全 10 章の Markdown マニュアル |
| [PKC2 マニュアル HTML](PKC2-Extensions/pkc2-manual.html) | PKC2 形式の単一 HTML マニュアル（readonly） |
| [運用ガイド](docs/planning/18_運用ガイド_export_import_rehydrate.md) | Export / Import / Rehydrate の詳細 |

### 開発者向け

| Document | Purpose |
|----------|---------|
| [Design Principles](docs/planning/05_設計原則.md) | Core values and constraints |
| [Architecture](docs/planning/12_基盤方針追補_責務分離.md) | 5-layer structure and rules |
| [Data Model](docs/planning/17_保存再水和可搬モデル.md) | Storage, export, compression |
| [Pre-Release Notes](docs/planning/19_pre_release.md) | Current status, constraints, future |

## PKC2 Extensions

`PKC2-Extensions/` ディレクトリは、PKC2 の「拡張機能 HTML」の配布先です。拡張機能 HTML は PKC2 形式の単一 HTML ファイルで、次の 3 通りで利用できます。

- **単体で開く** — ブラウザに HTML をドロップすると PKC2 UI で内容を閲覧
- **Import / Rehydrate** — ご自身のワークスペースに取り込み
- **iframe 埋め込み** — 別ページに組み込んで postMessage で連携

現在は `pkc2-manual.html`（ユーザーマニュアル）が第 1 弾として配置されています。

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build (Stage 1 bundle + Stage 2 HTML)
npm run build:manual # Build the PKC2-Extensions/pkc2-manual.html
npm run build:all    # Build everything (bundle + release + manual)
npm run typecheck    # TypeScript check
npm test             # Run tests
```

## Status

**Pre-Release v0.1.0** — Core features stable. Specification stabilizing.

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.
