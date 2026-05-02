# Archived — Image Intake Optimization v1

**Status**: archive(参照のみ、v1 shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/image-intake-optimization-v1-*.md`(計 3 ファイル)

PKC2 の image intake optimization v1 — **paste / drop / attach 3 surface での画像最適化(WebP 変換 / リサイズ / OffscreenCanvas worker)** の段階実装記録。Phase 1 → Phase 2 で着地、各 surface の audit を含む。実装は `src/adapter/ui/image-optimize/` および `src/adapter/ui/image-optimize/optimize-worker-client.ts`。

canonical spec: [`../../../spec/image-intake-optimization-v1-behavior-contract.md`](../../../spec/image-intake-optimization-v1-behavior-contract.md) + [`../../../spec/image-intake-optimization-v1-minimum-scope.md`](../../../spec/image-intake-optimization-v1-minimum-scope.md) は live tree 維持。

## 一覧(計 3 件)

| File | Topic | Implemented |
|---|---|---|
| [`image-intake-optimization-v1-audit.md`](./image-intake-optimization-v1-audit.md) | Full audit(Phase 2 完了時、A1-A10 audit table 全 pass) | 2026-04-19 |
| [`image-intake-optimization-v1-paste-audit.md`](./image-intake-optimization-v1-paste-audit.md) | Paste surface 専用 audit | 2026-04-19 |
| [`image-intake-optimization-v1-phase2-impl.md`](./image-intake-optimization-v1-phase2-impl.md) | Phase 2 実装メモ(OffscreenCanvas worker 化) | 2026-04-19 |

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical spec(live): `docs/spec/image-intake-optimization-v1-behavior-contract.md`
- 並行 PR retrospective: [`../pr-findings/image-optimize-worker-pr187-findings.md`](../pr-findings/image-optimize-worker-pr187-findings.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
