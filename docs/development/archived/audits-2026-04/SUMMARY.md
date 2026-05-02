# Archived — point-in-time audits (2026-04 期)

**Status**: archive(参照のみ)
**Audit date**: 2026-05-02、5-gate verification 全件適用済み
**Source**: 旧 `docs/development/<name>-audit-2026-04-*.md`

2026-04 期に実施した一回限りの point-in-time audit。findings は当時の wave で全件 applied されており、本 doc は **history record として保持**(後続 PR が "audit doc を更新" する想定はなく、新たな gap は別 audit を起こす)。

## 一覧(計 2 件)

| File | 概要 | applied 経路 |
|---|---|---|
| [`css-ui-debt-audit-2026-04-25.md`](./css-ui-debt-audit-2026-04-25.md) | 連続 wave(Color / Card / ImportExport / clickable-image)後の CSS / UI debt 6 観点小掃除。削除候補ゼロ + `guardrails.ts` の `ZIP Package` → `Backup ZIP` vocab 整合 1 件のみ実施 | 同 PR で `guardrails.ts:52,158` を修正、`bundle.{js,css,html}` rebuild 済 |
| [`link-system-audit-2026-04-24.md`](./link-system-audit-2026-04-24.md) | Link system 4 surface(Copy / Paste / Render / Receive)棚卸し、gap G1-G7 を優先度付きで列挙、Internal Markdown Dialect / Migration policy / URI scheme allowlist を確定 | 後続 PR #146 / #149 / #167 等で G1-G7 を順次回収、最終的に Known limitations 9 → 8 に削減 |

## 残置 4 件(live tree)

archive 対象外で live tree に残した 2026-04 期 audit:

- `dev-docs-cleanup-audit-2026-04-25.md` — docs-only audit、実装ゼロ、Phase 1 棚卸し本作業の親 doc
- `pr175-spec-violations-audit.md` — 修正候補 2-A / 2-B / 2-C は user 判断待ち、提案段階
- `pkc-message-implementation-gap-audit-2026-04-26.md` — spec 36 項目中 26 完成 / 5 P0-P2 gap、実装回収 PR が未着地
- `visual-smoke-expansion-audit-2026-04-26.md` — smoke 拡充 計画段階(parity / kanban / calendar coverage 含む)、実装未着手

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
