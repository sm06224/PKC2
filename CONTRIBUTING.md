# Contributing to PKC2

PKC2 は **AGPL-3.0** ライセンスの OSS プロジェクトです。本書は contribution の最短ガイドです。詳細な開発ルールは別の文書に譲ります(下記 References)。

## Quick Start

```bash
git clone https://github.com/sm06224/PKC2.git
cd PKC2
npm install
npm test                  # vitest run, all tests
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
npm run build:bundle      # Vite build → dist/bundle.{js,css}
npm run build             # Bundle + single HTML release
npm run test:smoke        # Playwright smoke (requires browsers installed)
```

PR を作る前に最低 `npm test` + `npm run build:bundle` を pass させてください(`pr-review-checklist.md` §3 で smoke pre-flight も場合により必須)。

## Branch Convention

- `main` — 唯一の長期 branch。直接 push しないでください
- `claude/<topic>` — Claude(AI assistant)が作る作業 branch
- `dependabot/<dep>` — Dependabot が自動生成する依存更新 branch

外部 contributor は **fork** + topic branch で PR を出してください(branch 名は任意)。

## Pull Request Process

1. branch を切って変更を加える
2. `npm test` / `npm run typecheck` / `npm run lint` がローカルで pass することを確認
3. `npm run build:bundle` で `dist/` が更新できることを確認(機能変更時)
4. PR を作成、Test plan を **PR 本文に記載**
5. CI(typecheck+test+build / Playwright smoke / gitleaks scan)が全 green になることを確認
6. Code review を待つ

PR review checklist の詳細は **`docs/development/pr-review-checklist.md`** を参照(8 項目自己監査ルールあり)。

## Coding / Architecture Rules

PKC2 は厳密な **5-layer 構造** を採用しています:

```
core/      → 純粋型と operation、browser API 使用禁止
features/  → algorithmic pure functions、core のみ依存
adapter/   → runtime 統合、reducer / renderer / persistence / transport
runtime/   → build 定数、DOM slot contract
```

詳細(import rules / naming / data model / state machine / DOM contract 等)は **`CLAUDE.md`** を参照してください。これは Claude(AI)向けにも書かれていますが、人間 contributor の開発ルールでもあります。

## Issue / Bug Report

- バグ報告: GitHub Issue で再現手順 + 期待動作 + 実際の動作を記載
- 機能要望: GitHub Discussion で先に提案 → 設計合意後に Issue 化

## Vulnerability Report

セキュリティ脆弱性の報告は **公開 issue ではなく `SECURITY.md`** の手順に従ってください。

## License

PKC2 は **AGPL-3.0** でライセンスされています。本リポジトリへの contribution は **同ライセンス(AGPL-3.0)** で公開されることに同意したものと見なされます。

## References

- `CLAUDE.md` — 開発ルール / architecture / 5-layer 規約 / data model / state machine の正本
- `docs/development/pr-review-checklist.md` — PR 作成時の 8 項目自己監査ルール
- `docs/development/INDEX.md` — wave 履歴 + 過去 PR の経緯
- `LICENSE` — AGPL-3.0 全文
- `SECURITY.md` — 脆弱性報告の窓口
