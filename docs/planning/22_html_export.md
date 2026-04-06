# Issue #8: HTML Export — 単一HTML成果物契約の完結

## 目的

Container + ReleaseMeta + shell + Stage1 bundle を用いて、
単一 HTML の export を最小完成させる。
PKC2 の release artifact contract を end-to-end で一度閉じることが目的。

## 設計方針

### export の位置づけ

- **adapter/platform 層に配置**（`src/adapter/platform/exporter.ts`）
- core 汚染禁止を維持（browser API を使うため core に入れない）
- builder（Stage 2）は build 時の artifact 生成
- exporter は runtime 時の artifact 生成
- 両者は同じ shell.html 契約を共有するが、責務は異なる

### builder vs exporter の責務分離

| 項目 | builder (Stage 2) | exporter (runtime) |
|------|-------------------|---------------------|
| 実行時点 | build 時 | ユーザー操作時 |
| 入力 | dist/bundle.js, dist/bundle.css, shell.html | DOM の live 要素 |
| pkc-data | 空 `{}` | 現在の Container |
| pkc-meta | 新規生成 | DOM から読み取り（capability 追加のみ） |
| pkc-core | dist/bundle.js | DOM の pkc-core textContent |
| code_integrity | 新規計算（SHA-256） | 保持（同じコード） |
| 出力 | dist/pkc2.html | Blob URL → ダウンロード |

### pkc-data の shape

```json
{
  "container": {
    "meta": { ... },
    "entries": [ ... ],
    "relations": [ ... ],
    "revisions": [ ... ],
    "assets": { ... }
  }
}
```

- `{ container: Container }` で wrapping — `main.ts` の `readPkcData()` と整合
- runtime state（phase, selectedLid, editingLid）は含めない
- persistent model のみ

### export 時の metadata 方針

| メタデータ項目 | 再計算するか | 理由 |
|---------------|-------------|------|
| app | 保持 | 変わらない |
| version | 保持 | 同じコード |
| schema | 保持 | 同じスキーマ |
| kind | 保持 | build 時に決定 |
| timestamp | 保持 | build timestamp |
| build_at | 保持 | build 時刻 |
| source_commit | 保持 | 同じソース |
| code_integrity | 保持 | 同じ pkc-core |
| capabilities | 'export' 追加 | export 機能の存在を示す |

原則: メタデータはコード/ビルドに関する記述であり、データの変化では変わらない。
唯一 `capabilities` に `'export'` を追加して、
この artifact が export 機能を持つことを示す。

### file naming 規則

```
pkc2-{slug}-{YYYYMMDD}.html
```

- `slug`: Container title を ASCII/CJK のみに正規化、最大 40 文字
- `YYYYMMDD`: export 実行日
- override: `ExportOptions.filename` で完全上書き可能

### 起動時の読み込み優先順位（変更なし）

```
1. IDB (最後に保存された状態)    → SYS_INIT_COMPLETE
2. pkc-data (HTML に埋め込み)    → SYS_INIT_COMPLETE
3. Empty container               → SYS_INIT_COMPLETE
4. All failed                    → SYS_INIT_ERROR
```

- export された HTML は pkc-data を持つため、優先順位 2 で読み込まれる
- IDB が空の初回起動時にのみ pkc-data が使われる
- IDB に保存済みの環境で開くと IDB が優先される（意図的）

### export 導線

```
User clicks [Export] button
  → ActionBinder dispatches BEGIN_EXPORT
  → Reducer: phase → 'exporting'
  → Renderer: "Exporting…" badge 表示
  → onState listener detects exporting phase
  → exportContainerAsHtml(container) 実行
  → Blob URL 生成 → <a download> click → ファイルダウンロード
  → SYS_FINISH_EXPORT dispatch
  → Reducer: phase → 'ready'
  → Renderer: 通常表示に戻る
  → DomainEvent: EXPORT_COMPLETED 発火
```

## 整合性

### pkc-data / pkc-meta / pkc-core の三角整合

```
pkc-core ──sha256──→ pkc-meta.code_integrity
    │                    │
    │                    └── metadata describes the code
    │
    └── code reads pkc-data at boot
         │
         └── pkc-data contains only persistent model
```

- pkc-core と pkc-meta は build 時に生成され、export 時も保持
- pkc-data のみ export 時に更新される
- code_integrity は pkc-core の hash であり、pkc-data の変更では変わらない

### data_integrity（将来）

- 現時点では pkc-data の hash は計算しない
- 将来的に `data_integrity: "sha256:..."` を pkc-meta に追加する可能性
- clone 同型性検証で必要になる

## 追加/変更ファイル一覧

### 新規
| ファイル | 役割 |
|---------|------|
| `src/adapter/platform/exporter.ts` | HTML export 実装 |
| `tests/adapter/exporter.test.ts` | export テスト |
| `docs/planning/22_html_export.md` | 本設計ドキュメント |

### 変更
| ファイル | 変更内容 |
|---------|---------|
| `src/main.ts` | export handler wiring (onState listener) |
| `src/adapter/ui/renderer.ts` | Export ボタン追加、exporting badge |
| `src/adapter/ui/action-binder.ts` | begin-export action handling |
| `src/runtime/release-meta.ts` | CAPABILITIES に 'export' 追加 |
| `build/release-builder.ts` | CAPABILITIES ミラー更新 |
| `tests/adapter/renderer.test.ts` | export UI テスト追加 |
| `docs/planning/00_index.md` | 目次追加 |

## テスト内容

### exporter.test.ts (16 tests)
- `serializePkcData`: Container を `{ container }` 形式で wrap する
- `serializePkcData`: runtime state を含まない
- `buildExportHtml`: 全 fixed-ID slot が存在する
- `buildExportHtml`: pkc-data に Container が埋め込まれる
- `buildExportHtml`: pkc-core 内容が保持される
- `buildExportHtml`: pkc-styles 内容が保持される
- `buildExportHtml`: data-pkc-* 属性が保持される
- `buildExportHtml`: export capability が metadata に追加される
- `buildExportHtml`: code_integrity が保持される
- `buildExportHtml`: Container title が HTML title になる
- `buildExportHtml`: title の特殊文字がエスケープされる
- `generateExportFilename`: 正しい命名規則
- `generateExportFilename`: override 対応
- `generateExportFilename`: 空 title のフォールバック
- `exportContainerAsHtml`: 成功時の result shape
- Round-trip: export → parse → Container 完全一致

### renderer.test.ts (追加 2 tests)
- ready phase で Export ボタンが表示される
- exporting phase で Exporting badge が表示される

## 今回あえて入れなかったもの

| 項目 | 理由 |
|------|------|
| data_integrity | clone 同型性検証の設計が未確定 |
| import（外部 HTML の読み込み） | 別 Issue |
| 部分 export | full export のみで十分 |
| export 形式選択 UI | 最小導線として単ボタンのみ |
| 非同期 export | 現在の Container サイズでは不要 |
| export 履歴 | revision/history の本格化後 |
| export 時の metadata 完全再計算 | コードが変わらないため不要 |

## 次に着手すべき Issue

1. **Import** — 外部 PKC2 HTML からの Container 読み込み
2. **PKC-Message transport** — iframe/embed 間のメッセージング
3. **Revision/History 本格化** — export 時点の snapshot 保存
