# File Issues — archived(RESOLVED)

**Status**: archive(参照のみ、各 FI が live spec / src / audit ですべて解消済み)
**Audit date**: 2026-05-03(reform-2026-05 wave 後の doc archival discipline 第 1 回適用)

`docs/planning/file-issues/` 13 件のうち、現実装で **RESOLVED**(対応 spec + src + tests + audit すべて完了、Phase 4 spec audit でも ALIGNED)と判定された **7 件** を集約。本書は結果サマリ、原文書本体は同 directory に保管(再燃時 = 設計変更 / 仕様改訂が必要になったときにのみ参照)。

## 一覧(計 7 件)

| File | FI | Topic | Outcome | 対応 spec / audit |
|---|---|---|---|---|
| [`01_dual-window-concurrent-edit-safety.md`](./01_dual-window-concurrent-edit-safety.md) | FI-01 | 別ウィンドウ / センターペイン並行編集の安全性 | RESOLVED | `docs/spec/dual-edit-safety-v1-{behavior-contract,minimum-scope}.md`(Phase 4 ALIGNED) |
| [`03_perf-textlog-image-lazy-rendering.md`](./03_perf-textlog-image-lazy-rendering.md) | FI-03 | 複数画像 TEXTLOG の表示 / 編集時の遅延解消 | RESOLVED | `docs/spec/textlog-image-perf-v1-{behavior-contract,minimum-scope}.md`(Phase 4 ALIGNED、staged render 稼働中) |
| [`04_attachment-foundation-multi-add-dedupe-persistent-dnd.md`](./04_attachment-foundation-multi-add-dedupe-persistent-dnd.md) | FI-04 | 添付基盤(まとめて追加 / 重複排除 / 常設 DnD) | COMPLETE | `docs/spec/attachment-foundation-fi04-v1-*.md` + `docs/development/archived/v1-audits/attachment-foundation-fi04-v1-audit.md`(2026-04-18 commit `2daa76a`) |
| [`05_editor-paste-attachment-auto-internal-link.md`](./05_editor-paste-attachment-auto-internal-link.md) | FI-05 | 編集中の添付経路を TEXTAREA 自動 internal link 貼付に揃える | A | `docs/spec/attach-while-editing-insert-internal-link-v1-*.md` + audit archived(commit `2942e49`) |
| [`08_editor-address-bar-link-paste-markdown.md`](./08_editor-address-bar-link-paste-markdown.md) | FI-08 | アドレスバー URL+title を Markdown リンクに整形 | A | `docs/spec/addressbar-url-title-paste-v1-*.md` + audit archived(commit `b5ecac2`) |
| [`09_search-entry-type-filter-multi-select.md`](./09_search-entry-type-filter-multi-select.md) | FI-09 | 検索エントリ種別フィルタの複数選択 + TODO/FILE 既定非表示 | A | `docs/spec/search-entry-type-multi-select-v1-*.md` + audit archived(commit `11e87c8`) |
| [`12_ui-theme-customizable-accent-scanline.md`](./12_ui-theme-customizable-accent-scanline.md) | FI-12 | UI テーマ(Kanban highlight / アクセントカラー / スキャンライン) | RESOLVED | `docs/spec/ui-theme-customizable-accent-scanline-v1-{behavior-contract,minimum-scope}.md`(Phase 4 ALIGNED) |

## live で残る FI(計 6 件)

archive 不可な FI は親 directory(`docs/planning/file-issues/`)に保持:

| File | FI | 状態 | 残課題 |
|---|---|---|---|
| `02_editor-safety-textlog-paste-target-and-folder-ctrl-s.md` | FI-02 | PARTIAL | A 部分着地 / B 部分(FOLDER Ctrl+S)は実ブラウザ再現未確定、`folder-ctrl-s-browser-repro.md` 参照 |
| `06_editor-input-assist-tab-and-indent-width.md` | FI-06 | OPEN | spec 未起こし、TAB 半角化 + indent 幅設定の minimum scope 段階未到達 |
| `07_editor-textlog-alternative-edit-trigger.md` | FI-07 | OPEN | spec 未起こし、ダブルクリック以外の代替トリガ設計議論先 |
| `10_display-csv2table-code-block-lang-alias.md` | FI-10 | OPEN | B-1 現実装に csv2table が含まれるか確認未完、不対応なら alias 追加 |
| `11_display-entry-window-responsive-tab-swap.md` | FI-11 | OPEN | spec 未起こし、FI-01 完了後の実装対象として依存関係あり |
| `13_launcher-tab-customizable-for-extensions.md` | FI-13 | OPEN | spec 未起こし、PKC-Message v2 ACL 完了後に再評価候補 |

## 再燃トリガ(本 archive を再 open する条件)

各 archived FI について、以下のいずれかが起きた場合は archive から live に戻す検討:

- 対応する spec / src の **breaking change** 提案が出た
- audit doc の invariant 違反が runtime 検出された
- user が同種の bug / feature 要望を再度持ち込んだ
- semver / schema_version 更新で contract に影響が及んだ

## 関連

- 上位 archive doctrine: `docs/development/doc-archival-discipline.md`(Phase 6 / 2026-05-03 reform-2026-05 wave 拡張)
- file-issues 親: `../00_index.md`
- INDEX canonical: [`../../../development/INDEX.md`](../../../development/INDEX.md)
