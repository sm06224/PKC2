# Archived — Singleton features(shipped, no further evolution planned)

**Status**: archive(参照のみ、各 feature shipped、追加開発予定なし)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/<feature>.md`(計 7 ファイル)

PKC2 の **単独 feature の実装メモ + retrospective**。各 feature は対応する src/ 実装が稼働中、追加 phase / version 計画なし。新規設計時に「これは既に実装済か」確認の二次窓口として使用(完了状態を `archived/` 配下に集約することで live tree から ノイズ除去)。

## 一覧(計 7 件)

| File | Feature | PR / Date |
|---|---|---|
| [`asset-autocomplete-modifier-enter-v1.md`](./asset-autocomplete-modifier-enter-v1.md) | asset autocomplete modifier-Enter(entry-ref v1.5 mirror policy) | 2026-04-20 |
| [`auto-folder-placement-for-generated-entries.md`](./auto-folder-placement-for-generated-entries.md) | todo / attachment archetype-specific subfolder auto-placing | active |
| [`focus-mode-v1.md`](./focus-mode-v1.md) | Ctrl+Alt+\ Focus mode(両ペーン同時 collapse + UI button) | PR #174 |
| [`html-paste-link-markdown.md`](./html-paste-link-markdown.md) | TEXT body paste 時 HTML → markdown link 正規化 | 2026-04-16 |
| [`perf-wave-pr176-pr193-retrospective.md`](./perf-wave-pr176-pr193-retrospective.md) | perf wave 18 PR retrospective(c-5000 search 実用化達成、3 日完走) | 2026-04 |
| [`sidebar-click-no-autoscroll-v1.md`](./sidebar-click-no-autoscroll-v1.md) | sidebar click による意図しない auto-scroll の修正 | PR #174 |
| [`text-replace-current-entry.md`](./text-replace-current-entry.md) | TEXT body find/replace 機能 | 2026-04-16 |

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
- 並行 archive: [`../pr-findings/SUMMARY.md`](../pr-findings/SUMMARY.md)(PR # 単位 retrospective)
