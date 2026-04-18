# 1. Scope / 非対象

## 1.1 v1 の対象範囲

- **対象 UI 経路**: Merge mode（`importMode === 'merge'`）の import preview dialog 内のみ
- **対象 container 構成**: single imported container vs single host container の 2 項
- **対象 archetype**: 全 archetype（text / textlog / todo / form / attachment / folder / generic / opaque）
- **対象 phase**: `importPreview !== null` の preview 画面内のみ

## 1.2 非対象

- replace import / batch import / folder-scoped import
- multi-way merge（3 container 以上）
- field 単位 cherry-pick / semantic merge
- 3-way merge（common ancestor）
- archetype-aware diff（markdown AST diff、textlog log-level diff）
- attachment binary diff
- revision 持ち込み / 比較
- content-identity policy の user customization
- global auto-resolution policy（永続ルール登録）
