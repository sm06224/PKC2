# Archived — v1 post-implementation audits

**Status**: archive(参照のみ、各 v1 feature shipped + audit 完結)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/<feature>-v1-audit.md`(計 7 ファイル)

PKC2 の単独 v1 feature **post-implementation audit** record を集約。各 feature の canonical contract は `docs/spec/<feature>-v1-behavior-contract.md` で **live tree 維持**(behavior contract は実装と並ぶ truth source)。本 archive は audit 完結 history。

## 一覧(計 7 件)

| File | Feature | Outcome |
|---|---|---|
| [`addressbar-url-title-paste-v1-audit.md`](./addressbar-url-title-paste-v1-audit.md) | Address bar URL+title paste(URL のみ paste と URL+title 両対応) | A(実装受理) |
| [`attach-while-editing-insert-internal-link-v1-audit.md`](./attach-while-editing-insert-internal-link-v1-audit.md) | FI-05 編集中 attach insert internal link | A |
| [`attachment-foundation-fi04-v1-audit.md`](./attachment-foundation-fi04-v1-audit.md) | FI-04 attachment foundation v1 | COMPLETE |
| [`entry-ordering-v1-audit.md`](./entry-ordering-v1-audit.md) | C-2 entry ordering v1 | Completed(defect 1 件 fix 済) |
| [`link-index-v1-audit.md`](./link-index-v1-audit.md) | C-3 link-index v1 | COMPLETE |
| [`revision-branch-restore-v1-audit.md`](./revision-branch-restore-v1-audit.md) | C-1 revision-branch restore v1 | FINAL |
| [`search-entry-type-multi-select-v1-audit.md`](./search-entry-type-multi-select-v1-audit.md) | FI-09 search entry-type multi-select | A |

各 audit は **`docs/spec/<feature>-v1-{behavior-contract,minimum-scope}.md`** と pair で運用されており、本 archive は audit 完結時点の record。後続の機能拡張は新たな audit doc を起こすこと。

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical contracts(live): `docs/spec/*-v1-behavior-contract.md`
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
