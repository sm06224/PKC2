# TEXT / TEXTLOG Editing UX Consolidation

## 1. 概要

直近の実装で TEXT / TEXTLOG 周辺の編集UXが急速に拡充された。
本ドキュメントは操作体系の整理・優先順位の固定・競合回避を
明文化し、後続機能追加での崩壊を防止する。

---

## 2. TEXT アーキタイプの編集手順

### 2.1 閲覧モード（View）

| 操作                     | 動作                                           |
| ------------------------ | ---------------------------------------------- |
| 左ペインでシングルクリック | `SELECT_ENTRY` → 中央ペインに本文表示          |
| 左ペインでダブルクリック   | 新規ウィンドウで開く（`openEntryWindow`）        |
| 中央ペインで右クリック     | コンテキストメニュー表示                         |
| Markdown 表示の本文       | `hasMarkdownSyntax` → `renderMarkdown` で描画   |

### 2.2 編集モード（Edit）

| 操作                     | 動作                                           |
| ------------------------ | ---------------------------------------------- |
| Edit ボタンまたは context menu Edit | `BEGIN_EDIT` → スプリットエディタ表示 |
| 左ペイン: textarea        | Markdown 入力。`data-pkc-field="body"`          |
| 右ペイン: preview         | `data-pkc-region="text-edit-preview"`           |
| Enter キー押下            | **即座に** preview 更新（`requestAnimationFrame`）|
| タイピング停止 500ms 後   | **debounce** で preview 更新                    |
| 画像ペースト              | `PASTE_ATTACHMENT` → `![name](asset:key)` 挿入 |
| Ctrl+S / Cmd+S           | `COMMIT_EDIT` → 保存                           |
| Escape                   | `CANCEL_EDIT` → 編集キャンセル                  |

### 2.3 preview 更新タイミング（確定仕様）

| トリガー           | 優先度 | 遅延      | 備考                        |
| ------------------ | ------ | --------- | --------------------------- |
| Enter keyup        | 高     | 1 frame   | 行確定の即時フィードバック    |
| debounced input    | 中     | 500ms     | タイピング停止後の自動更新    |
| 画像ペースト完了   | 高     | 即座      | `updateTextEditPreview` 直接 |

Enter keyup が発火した場合、pending の debounce タイマーはキャンセルされる。

---

## 3. TEXTLOG アーキタイプの編集手順

### 3.1 表示順序（確定仕様）

| コンテキスト       | 順序                         | 理由                              |
| ------------------ | ---------------------------- | --------------------------------- |
| viewer（閲覧）     | **降順**（新しい順）          | 最新ログが先頭 = 追記UXの自然な流れ |
| editor（編集）     | **降順**（新しい順）          | viewer と同じ並び = 認知負荷低減    |
| collectBody        | **昇順に復元**（元の格納順）  | ストレージ整合性の保証             |
| append             | 常に末尾に追加（昇順末尾）    | `appendLogEntry` は push          |
| 新規追加後の表示   | 先頭に出現（降順なので）      | ユーザーは書いたものを即確認できる  |

`collectBody` は `originalOrder` マップ（id→元index）で DOM 逆順から
元の時系列昇順に復元する。これにより表示順の変更がストレージに影響しない。

### 3.2 入力エリア（確定仕様）

- 中央ペイン**上部に固定**（`border-bottom` で区切り）
- textarea rows = 6, min-height: 6rem
- `Ctrl+Enter` で追加（`append-log-entry` アクション）
- 追加後: textarea クリア + フォーカス維持

### 3.3 操作一覧

| 操作                           | 動作                                        |
| ------------------------------ | ------------------------------------------- |
| 上部テキストエリアに入力 → Ctrl+Enter | `QUICK_UPDATE_ENTRY` で追加（フェーズ遷移なし）|
| ログ行ダブルクリック            | `BEGIN_EDIT` → エディタモードで全行編集       |
| ログ行右クリック               | コンテキストメニュー（log-line ref コピー可能） |
| ★ ボタンクリック               | `toggle-log-flag` → important フラグ切替     |
| 画像ペースト（テキストエリア内）| `PASTE_ATTACHMENT` → `![name](asset:key)` 挿入 |

---

## 4. イベントハンドラ優先順位

### 4.1 Click / DblClick 体系

```
handleClick (MouseEvent.detail による判定)
├── detail >= 2 → handleDblClickAction → 新規ウィンドウで開く
├── Ctrl+click  → TOGGLE_MULTI_SELECT
├── Shift+click → SELECT_RANGE
└── detail === 1 → SELECT_ENTRY / action dispatch

handleDblClick (native dblclick イベント — フォールバック)
├── .pkc-textlog-row → BEGIN_EDIT（インプレース編集）
│   └── 除外: .pkc-textlog-flag-btn, a[href^="#asset-"]
└── [data-pkc-action="select-entry"] → handleDblClickAction
```

**設計判断**: `handleClick` の `detail >= 2` が主経路。
`handleDblClick` はSELECT_ENTRY による再描画で DOM が差し替わった
場合に native dblclick が失われる問題のフォールバック。

**TEXTLOG ダブルクリック除外リスト**:
- `pkc-textlog-flag-btn` → ★ トグルに専有
- `a[href^="#asset-"]` → アセットチップダウンロードに専有
- append textarea → 本文入力に専有

### 4.2 ContextMenu 体系

```
handleContextMenu
├── Case 1: .pkc-textlog-row → textlog row menu
│   └── archetype='textlog', logId あり → log-line ref コピー可能
├── Case 2: [data-pkc-mode="view"] → detail pane menu
│   └── archetype 依存の項目表示
└── Case 3: sidebar entry → sidebar menu（最も豊富）
    └── folders 配列付き → Move to Folder サブメニュー表示
```

**サイドバー vs 中央ペインの差異**:
- サイドバー右クリック → `SELECT_ENTRY` を発火（選択移動あり）
- 中央ペイン右クリック → 選択は変更しない

### 4.3 Keyboard 優先順位

```
handleKeydown
├── Asset picker open → handleAssetPickerKeydown（最優先）
├── Asset autocomplete open → handleAssetAutocompleteKeydown
├── Slash menu open → handleSlashMenuKeydown
├── Inline calc (Enter + 末尾 = ) → expression 評価
├── Ctrl+Enter in TEXTLOG append → append-log-entry
├── Ctrl+S in editing → COMMIT_EDIT
├── Ctrl+D/T/... in editing → date/time shortcuts
├── Ctrl+? / ⌘+? → shortcut help toggle
└── Escape → overlay close → cancel edit → deselect（段階的）
```

### 4.4 Paste 優先順位

```
handlePaste
├── pasteInProgress guard → 連続ペースト防止
├── image item in clipboard?
│   ├── markdown textarea focused?
│   │   └── PASTE_ATTACHMENT → ![name](asset:key) 挿入
│   └── not textarea → processFileAttachment（スタンドアロン）
└── no image → ブラウザデフォルト（テキスト貼り付け）
```

---

## 5. コンテキストメニュー項目一覧

### 5.1 全コンテキスト共通

| アクション             | 表示条件           | 説明                                     |
| ---------------------- | ------------------ | ---------------------------------------- |
| Edit                   | canEdit            | `BEGIN_EDIT` 発火                         |
| Delete                 | canEdit            | `DELETE_ENTRY` 発火                       |
| Move to Root           | canEdit && hasParent | 構造リレーション削除                      |
| Copy entry reference   | always             | `[title](entry:lid)` をクリップボードへ    |
| Copy entry embed       | always             | `![title](entry:lid)` をクリップボードへ   |

### 5.2 条件付き項目

| アクション             | 表示条件              | 説明                                    |
| ---------------------- | --------------------- | --------------------------------------- |
| Preview                | text / textlog / attachment | rendered viewer（text/textlog）or entry window（attachment） |
| Sandbox Run            | attachment            | `openEntryWindow` with `sandboxAllow: ['allow-scripts']` |
| Copy asset reference   | attachment            | `![name](asset:key)` or `[name](asset:key)` |
| Copy log line reference| textlog && logId      | `[title › ts](entry:lid#log-id)`        |

### 5.3 Move to Folder サブメニュー

- サイドバー右クリック時のみ表示
- 全 folder archetype エントリを列挙（自身を除外）
- `BULK_MOVE_TO_FOLDER` を `SELECT_ENTRY` 経由で発火

---

## 6. 画像ペースト操作フロー

### 6.1 前提条件
- readonly でないこと
- クリップボードに `image/*` の File が含まれること
- 別のペースト処理が進行中でないこと（`pasteInProgress` ガード）

### 6.2 markdown textarea 内ペースト

1. ユーザーが TEXT body / TEXTLOG append / TEXTLOG edit textarea にフォーカス
2. Ctrl+V（または右クリック→貼り付け）で画像をペースト
3. `handlePaste` が image item を検出
4. `isMarkdownTextarea` でターゲットがマークダウン対応か判定
5. FileReader で画像を base64 変換（非同期）
6. `PASTE_ATTACHMENT` dispatch:
   - attachment entry 作成（フェーズ遷移なし）
   - asset データ merge
   - ASSETS フォルダ自動作成 / 再利用（コンテキストエントリと同階層）
   - attachment → ASSETS フォルダの structural relation 作成
7. カーソル位置に `![screenshot-YYYY-MM-DDTHH-mm-ss.ext](asset:key)` 挿入
8. preview 更新（TEXT split editor の場合）

### 6.3 ASSETS フォルダの配置規則

| コンテキストエントリの位置 | ASSETS フォルダの位置           |
| -------------------------- | ------------------------------- |
| ルート（親フォルダなし）   | ルートレベルに作成/再利用       |
| フォルダ F 内              | F の子として作成/再利用         |

---

## 7. Copy / Viewer の使い分け

| 機能                   | 対象               | 出力先               | 用途                          |
| ---------------------- | ------------------ | -------------------- | ----------------------------- |
| Copy (Ctrl+C on body) | TEXT / TEXTLOG 本文 | クリップボード        | Markdown source + HTML rich copy |
| Copy entry reference   | 全 archetype       | クリップボード        | `[title](entry:lid)` 形式      |
| Copy entry embed       | 全 archetype       | クリップボード        | `![title](entry:lid)` 形式     |
| Copy asset reference   | attachment のみ    | クリップボード        | `![name](asset:key)` 形式      |
| Copy log line ref      | textlog + logId    | クリップボード        | `[title › ts](entry:lid#log)` 形式 |
| Rendered viewer        | text / textlog     | 新規ウィンドウ        | Markdown 描画済み HTML をプレビュー |
| Open in New Window     | 全 archetype       | 新規ウィンドウ        | ダブルクリック → 編集可能ウィンドウ  |
| Preview (context menu) | text / textlog / attachment | 新規ウィンドウ | Rendered viewer or entry window |
| Sandbox Run            | attachment (HTML/SVG) | 新規ウィンドウ     | `allow-scripts` 付きサンドボックス |

---

## 8. 次 Issue 候補

- **text archetype export/import**（`.text.zip`）— 仕様は `text-markdown-zip-export.md` に確定済み
- TEXT split editor の asset 参照解決（preview 内で `asset:` を data URI に変換）
- TEXTLOG CSV エクスポートの container-wide 対応

---

## 9. 確認済み非競合事項

| 懸念                                          | 結論                                    |
| --------------------------------------------- | --------------------------------------- |
| Enter で inline calc と preview 更新が衝突？   | inline calc は `preventDefault` + return で排他 |
| Ctrl+Enter で TEXTLOG append と preview 更新？ | Ctrl+Enter は `data-pkc-field` チェックで分離 |
| ダブルクリックで edit と window open が両方？   | handleClick detail>=2 が window open 専用   |
| 右クリックで sidebar 選択が移動する？           | 意図的。中央ペインでは移動しない           |
| 連続画像ペーストで race condition？             | `pasteInProgress` ガードで防止             |
