# Critical Input & Attachment Recovery

## 1. 概要

ユーザー報告の指摘15項目のうち、P0（プロダクト体験を直接壊す/危険なもの）を
優先して調査・修正したドキュメント。

## 2. 切り分け結果

### 調査対象（P0）

| 項目 | 報告 | 調査結果 | 対応 |
|------|------|---------|------|
| P0-A: attachment download/preview | 動作しない | **正常動作** — 全経路が接続済み | 誤認として確認 |
| P0-B: CLEAR ボタン | 劇薬すぎる | confirm あったが **不十分** | 二段階確認に強化 |
| P0-C: Ctrl+S 保存 | 効かない | **既に実装済み**（action-binder L272-276） | テスト追加で保証 |
| P0-D: スクショ貼付 | できない | **未実装** — paste ハンドラなし | 新規実装 |

### P0-A 詳細: attachment download/preview

コード調査の結果、以下のすべてが正常に接続されていた:

- Download ボタン: `attachment-presenter.ts` で生成 → `action-binder.ts` の click handler で処理
- Preview: `populateAttachmentPreviews()` が render 後に毎回呼び出し → `populatePreviewElement()` で MIME 別に描画
- 全 MIME 分類: image (Data URI), PDF (Blob+object), video/audio (Blob+controls), HTML/SVG (Blob+sandbox iframe)
- メモリ管理: `cleanupBlobUrls()` で render 前に revoke

**考えられるユーザー体験の問題:**
- Light mode では「Data not included」と表示されダウンロード不可（仕様通り）
- asset_key があっても container.assets にデータがない場合サイレントに失敗する
- 初期状態（空 container）ではそもそも attachment がない

### P0-C 詳細: Ctrl+S

action-binder.ts L272-276 で既に実装済み:
```typescript
if (mod && e.key === 's' && state.phase === 'editing' && state.editingLid) {
  e.preventDefault();
  dispatchCommitEdit(root, state.editingLid, dispatcher);
  return;
}
```
- `mod` = Ctrl (Windows/Linux) / Cmd (Mac)
- ブラウザのデフォルト保存動作を `e.preventDefault()` で抑止
- editing phase 以外では無視（ready 時は何もしない）

## 3. 修正内容

### P0-B: CLEAR ボタン安全化

**renderer.ts:**
- ボタンテキスト: `Reset` → `⚠ Reset`
- title 属性: `WARNING: Clears all locally saved data (IndexedDB). This cannot be undone.`

**main.ts (`mountClearLocalDataHandler`):**
- 第1段階: `confirm()` — 影響範囲を詳細に説明（ローカルデータ、未エクスポート変更）
- 第2段階: `prompt()` — 「RESET」の入力を要求

### P0-D: スクショ貼付（clipboard image paste）

**action-binder.ts:**
- `handlePaste()` 関数追加
- `document.addEventListener('paste', handlePaste)` で登録
- cleanup 時に `removeEventListener` で解除

**動作:**
1. `paste` イベントの `clipboardData.items` から `kind=file, type=image/*` を検索
2. ファイル名を `screenshot-YYYY-MM-DDTHH-mm-ss.{ext}` 形式で自動生成
3. 現在選択中の folder エントリがあれば context folder として使用
4. `processFileAttachment()` に委譲（既存の DnD 経路と同じ）

**ガード条件:**
- `state.phase !== 'ready'` → 無視（editing 中はテキスト paste を邪魔しない）
- `state.readonly` → 無視
- `kind !== 'file'` → スキップ（テキスト paste は通常動作）
- 画像以外の file → スキップ

## 4. 今回 intentionally やらなかったもの

| 項目 | 理由 | 後続 Issue |
|------|------|-----------|
| 添付ファイル名変更 | UX 改善、P1 scope | #71 |
| FORM 任意作成導線削除 | 仕様修正、P1 scope | #71 |
| エントリ種別 UI 改修 | UX 改善、P1 scope | #71 |
| NOTE 表記廃止 | 用語統一、P1 scope | #71 |
| New Entry 初期名見直し | 用語統一、P1 scope | #71 |
| rNN バージョン表記 | UI 整理、P1 scope | #71 |
| ダーク/ライト切替 | 新機能、P2 scope | #72 |
| メニュー化 | UI 構造変更、P2 scope | #72 |
| ショートカットヘルプ | 新機能、P2 scope | #72 |
| 日付ショートカット | 新機能、P3 scope | #73 |
| `/` コマンド入力支援 | 新機能、P3 scope | #73 |

## 5. テスト追加

| テスト | ファイル |
|--------|---------|
| Ctrl+S で EDIT_COMMITTED が発火 | action-binder.test.ts |
| Ctrl+S は ready phase では無視 | action-binder.test.ts |
| CLEAR ボタンが danger + warning 表示 | action-binder.test.ts, renderer.test.ts |
| CLEAR ボタンに WARNING title | renderer.test.ts |
| CLEAR は readonly で非表示 | renderer.test.ts |
| テキスト paste は無視 | action-binder.test.ts |
| editing 中の image paste は無視 | action-binder.test.ts |
| attachment download ボタン存在確認 | action-binder.test.ts |
