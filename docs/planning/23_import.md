# Issue #9: Import — export/import 往復の完結

## 目的

外部の PKC2 HTML artifact から `pkc-meta` / `pkc-data` を読み出し、
Container を import する最小機能を実装する。
Issue #8 の HTML export と合わせて、単一HTMLの往復を閉じる。

## 設計方針

### import の位置づけ

- **adapter/platform 層に配置**（`src/adapter/platform/importer.ts`）
- core 汚染禁止を維持（DOMParser は browser API）
- import 元 HTML の script は**一切実行しない**（DOMParser は安全）
- export contract を壊さず読む

### import フロー

```
User clicks [Import]
  → hidden file input opens
  → User selects .html file
  → FileReader reads content
  → importFromFile(file) 実行
    → DOMParser で HTML を解析
    → #pkc-meta から ReleaseMeta を抽出・検証
    → #pkc-data から Container を抽出・検証
    → ImportResult を返却
  → 成功: SYS_IMPORT_COMPLETE dispatch
    → Reducer: Container 置換、selectedLid/editingLid リセット
    → DomainEvent: CONTAINER_IMPORTED 発火
    → Persistence: IDB に自動保存（CONTAINER_IMPORTED が SAVE_TRIGGER）
  → 失敗: SYS_ERROR dispatch
    → phase → error、エラーメッセージ表示
```

### 検証項目

| 項目 | 検証内容 | エラーコード |
|------|---------|------------|
| HTML parse | DOMParser が有効な DOM を生成できるか | `PARSE_ERROR` |
| pkc-meta 存在 | `#pkc-meta` 要素が存在し、有効な JSON か | `MISSING_PKC_META` |
| app identity | `meta.app === 'pkc2'` | `INVALID_APP_ID` |
| schema version | `meta.schema === SCHEMA_VERSION` | `SCHEMA_MISMATCH` |
| pkc-data 存在 | `#pkc-data` 要素が存在し、有効な JSON か | `MISSING_PKC_DATA` |
| container key | `data.container` が存在するか | `INVALID_CONTAINER` |
| Container shape | meta, entries, relations が存在するか | `INVALID_CONTAINER` |
| file read | File API でファイルが読めるか | `FILE_READ_ERROR` |

### エラーハンドリング方針

- `ImportResult` は discriminated union: `{ ok: true, ... }` / `{ ok: false, errors: ImportError[] }`
- 複数のエラーを収集（app ID と schema version の両方が不正な場合、両方報告）
- `formatImportErrors()` でユーザー表示用の文字列を生成
- 将来の cross-version import に備え、エラーコードを構造化

### import 後の挙動

| 項目 | 挙動 |
|------|------|
| Container | 完全置換（merge しない） |
| selectedLid | null にリセット |
| editingLid | null にリセット |
| phase | ready 維持 |
| error | null にリセット |
| IDB | CONTAINER_IMPORTED が SAVE_TRIGGER → 自動保存 |
| event-log | CONTAINER_IMPORTED 表示 |

### import が許可される phase

| phase | 可否 | 理由 |
|-------|------|------|
| ready | ○ | 通常の import |
| error | ○ | エラー回復 |
| editing | × | 未保存の編集を失うリスク |
| exporting | × | export 中は操作禁止 |
| initializing | × | 初期化完了前 |

### `</script>` エスケープの往復

- export 時: `serializePkcData()` が `</script>` → `<\/script>` にエスケープ
- import 時: `importFromHtml()` が `<\/script>` → `</script>` にアンエスケープ
- round-trip テストで検証済み

## 追加/変更ファイル一覧

### 新規
| ファイル | 役割 |
|---------|------|
| `src/adapter/platform/importer.ts` | HTML import 実装 |
| `tests/adapter/importer.test.ts` | import テスト |
| `docs/planning/23_import.md` | 本設計ドキュメント |

### 変更
| ファイル | 変更内容 |
|---------|---------|
| `src/core/action/system-command.ts` | `SYS_IMPORT_COMPLETE` 追加 |
| `src/core/action/domain-event.ts` | `CONTAINER_IMPORTED` 追加 |
| `src/adapter/state/app-state.ts` | `SYS_IMPORT_COMPLETE` handling (ready/error) |
| `src/adapter/platform/persistence.ts` | `CONTAINER_IMPORTED` を SAVE_TRIGGER に追加 |
| `src/adapter/ui/renderer.ts` | Import ボタン追加 |
| `src/adapter/ui/event-log.ts` | `source` 表示対応 |
| `src/main.ts` | mountImportHandler wiring |
| `docs/planning/00_index.md` | 目次追加 |

## 判断の記録

### import 時の検証項目
- app identity, schema version, Container shape の3点を最低限検証
- code_integrity は import 時には検証しない（import 側のコードとは無関係）
- full deep validation は将来の migration 機能で対応

### 失敗時のエラー表現
- 構造化された `ImportError[]` を使用
- `ImportErrorCode` で機械的に区別可能
- `formatImportErrors()` で人間可読な表示

### import 後の IDB 保存
- 即保存する（`CONTAINER_IMPORTED` を SAVE_TRIGGER に追加）
- Persistence の passive listener パターンに沿っている

### 既存データの扱い
- 完全置換（merge しない）
- 理由: merge は Container 同士の同型性検証が必要で、今回のスコープを超える

### PKC2 同士限定
- 今回は PKC2 の export artifact のみを import 対象とする
- PKC1 import は別 Issue

## テスト内容

### importer.test.ts (17 tests)
- 有効な PKC2 HTML の parse と Container 抽出
- ReleaseMeta の返却
- source 指定のデフォルトと上書き
- 空 entries/relations の保持
- 非 HTML 入力の拒否
- pkc-meta 欠落の拒否
- 空 pkc-meta の拒否
- 不正な app ID の拒否
- schema version 不一致の拒否
- pkc-data 欠落の拒否
- container key 欠落の拒否
- Container.meta 欠落の拒否
- Container.entries 欠落の拒否
- 複数エラーの収集
- formatImportErrors の表示
- export → import round-trip（Container 完全一致）
- export → import round-trip（特殊文字含む）
- SYS_IMPORT_COMPLETE の reducer 統合テスト

## 今回あえて入れなかったもの

| 項目 | 理由 |
|------|------|
| Container merge | 同型性検証が必要で、スコープ外 |
| PKC1 import | 互換性変換が必要で、別 Issue |
| code_integrity 検証 | import 側のコードとは無関係 |
| data_integrity 検証 | まだ export 側で生成していない |
| drag & drop | 最小導線として file input のみ |
| import 確認ダイアログ | 現在は直接置換（将来追加可能） |
| import 履歴 | revision/history 本格化後 |
| cross-version migration | schema が変わった時に対応 |

## 次に着手すべき Issue

1. **PKC-Message transport** — iframe/embed 間のメッセージング
2. **Revision/History 本格化** — import/export 時点の snapshot 保存
3. **Import 確認 UI** — 既存データ置換前の確認ダイアログ
