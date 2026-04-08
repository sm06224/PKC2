# Light mode バッジ + 編集制限 UI

## 問題

Light export から開いた HTML では `lightSource` フラグで IDB 保存が抑止されているが、
ユーザーには Light モードであることが視覚的に伝わらなかった。

- attachment のファイルデータが存在しないことに気づけない
- attachment を新規作成しても無意味（IDB 保存されない）
- entry-window でも同様に状況が不明

## 実装内容

### 1. ツールバーの Light バッジ

`state.lightSource === true` のとき、ヘッダーに青い「Light」バッジを表示。
Readonly バッジと同じパターンで `data-pkc-region="light-badge"` を使用。
ツールチップ: "Loaded from Light export — file attachments have no data"

### 2. Attachment 作成ボタンの無効化

Light モードでは、ツールバーの「File」(attachment 作成) ボタンを disabled にする。
他のアーキタイプ（Note, Todo, Form, Folder）は通常通り使用可能。

- `data-pkc-light-disabled="true"` 属性で識別
- ツールチップで理由を説明

### 3. Detail ペインの Light 通知

attachment エントリを選択したとき、コンテンツ領域の上部に通知バナーを表示:
- 表示条件: `state.lightSource && selected.archetype === 'attachment'`
- 編集モード時も同様の警告を表示（`data-pkc-region="light-edit-notice"`）

### 4. Entry-window の Light 通知

`openEntryWindow()` に `lightSource` パラメータを追加。
attachment エントリ × lightSource のとき、conflict banner の下に通知を表示。

## CSS

- `--c-info` / `--c-info-fg`: 新規カラー変数（ダーク: #3b82f6, ライト: #2563eb）
- `.pkc-light-badge`: 青背景のバッジスタイル
- `.pkc-light-notice`: 左ボーダー付き通知バナー

## テスト

renderer.test.ts に 10 件追加:
- Light バッジの表示/非表示（3件）
- Attachment 作成ボタンの無効化（3件）
- Detail ペイン通知の表示/非表示（4件）

entry-window.test.ts に 4 件追加:
- Light 通知の attachment × lightSource 条件（3件）
- Light 通知 CSS の存在確認（1件）

## やっていないこと

- Light モードでの text/todo/form 編集制限（不要 — IDB 保存抑止で十分）
- Light → Full export のアップグレード誘導 UI
- attachment の個別ダウンロード制限（既存の dataStripped 判定で対応済み）
