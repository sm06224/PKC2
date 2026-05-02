# Archived — File-Issue Audits(FI-03, FI-08.x)

**Status**: archive(参照のみ、各 FI 機能 shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/fi-{03,08x}-*.md`(計 4 ファイル)

PKC2 の **planning/file-issues/ で identify した individual feature**(FI-NN)の post-implementation audit を集約。各 FI feature の最終確認記録、新規 FI 追加時の参考。

各 FI feature の canonical spec は `docs/spec/<feature>-v1-behavior-contract.md` + `<feature>-v1-minimum-scope.md` で live keep。本 archive は post-implementation audit のみ収容。

## 一覧(計 4 件)

### FI-03 — TEXTLOG Image Perf v1

| File | Topic |
|---|---|
| [`fi-03-audit.md`](./fi-03-audit.md) | Full audit(Phase 1 + Phase 2 完了時) |
| [`fi-03-phase1-audit.md`](./fi-03-phase1-audit.md) | Phase 1 専用 audit |
| [`fi-03-spike-native-lazy-result.md`](./fi-03-spike-native-lazy-result.md) | Spike — Native Lazy / Async Decoding 実測棄却ノート(closed)|

canonical contract: `docs/spec/textlog-image-perf-v1-behavior-contract.md`(live)

### FI-08.x — Address Bar Paste Fallback

| File | Topic |
|---|---|
| [`fi-08x-audit.md`](./fi-08x-audit.md) | Post-implementation audit(`f3ab830` の実装 gap 修正) |

canonical contract: `docs/spec/addressbar-paste-fallback-v1-behavior-contract.md`(live)

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
- file-issue 起票元: `docs/planning/file-issues/`
