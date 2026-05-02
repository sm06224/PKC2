# Archived — Entry-ref autocomplete v1.0 → v1.5

**Status**: archive(参照のみ、全 version shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/entry-autocomplete-v1*.md`

PKC2 の **entry-ref autocomplete** は v1.0(基盤、2026-04-19)+ v1.1〜v1.5 の 5 つの incremental version で段階的に拡充された。v1.0 で `(entry:<query>` を検出して popup を出す軽量補助 UI を確立し、後続版で textlog 対応 / recent-first / fragment / modifier-Enter 等を追加。

各 version は shipped、`src/adapter/ui/entry-ref-autocomplete.ts` および関連 test で網羅されている。

## 一覧(version 順、計 6 件)

| Version | File | Topic | Implemented |
|---|---|---|---|
| v1.0 | [`entry-autocomplete-v1.md`](./entry-autocomplete-v1.md) | 基盤 — text archetype 編集中の `(entry:<query>` 検出と popup | 2026-04-19 |
| v1.1 | [`entry-autocomplete-v1.1.md`](./entry-autocomplete-v1.1.md) | refinement 1(候補 ranking / debounce 改善) | 2026-04-19 |
| v1.2 | [`entry-autocomplete-v1.2-textlog.md`](./entry-autocomplete-v1.2-textlog.md) | textlog archetype 対応 | 2026-04-19 |
| v1.3 | [`entry-autocomplete-v1.3-recent-first.md`](./entry-autocomplete-v1.3-recent-first.md) | recent-first ordering(直近触ったエントリを上位に) | 2026-04-20 |
| v1.4 | [`entry-autocomplete-v1.4-fragment.md`](./entry-autocomplete-v1.4-fragment.md) | fragment(`#log/<id>`)対応 | 2026-04-20 |
| v1.5 | [`entry-autocomplete-v1.5-modifier-enter.md`](./entry-autocomplete-v1.5-modifier-enter.md) | modifier-Enter で確定挿入 | 2026-04-22 |

## Terminology の取り扱い

v1.0 §1 で 5 用語(entry-ref / internal entry link / relations-based backlinks / link-index / entry-ref autocomplete)を厳密区別。後続 version で同じ語彙体系を維持。新規設計時に backlink-related 機能を触る場合は v1.0 doc の用語表を参照すること。

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
- 関連 spec: `docs/spec/pkc-link-unification-v0.md`(URI scheme 全体)
