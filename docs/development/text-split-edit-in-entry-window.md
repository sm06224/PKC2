# TEXT Split Edit in Entry Window

Status: CANDIDATE
Created: 2026-04-12
Category: A. Immediate UX Improvements

---

## 1. 短い結論

ダブルクリックで開く別窓（entry window）の TEXT 編集画面を、
センターペインと同じ「左: source / 右: live preview」の split view にする。
現状は Source / Preview タブ切替なので、編集中にプレビュー確認が分断される。

---

## 2. 背景 / 問題

- センターペイン TEXT 編集: `.pkc-text-split-editor` による split view（textarea + preview）
- entry window TEXT 編集: tab bar（Source / Preview）切替型

同じ archetype で編集 UX が二系統あるのは一貫性が低い。
別窓の方が画面が広く、むしろ split view が映える。

---

## 3. ユーザ価値

- 編集しながらリアルタイムに rendered preview を確認できる
- main window と entry window で編集 UX が一致する
- 別窓で広い画面を split view に使える
- task list / asset chip / markdown 装飾の即時フィードバックが得られる

---

## 4. 最小スコープ

- entry window の TEXT archetype 専用に split view を導入
- center pane と同じ `.pkc-text-split-editor` クラス構造を再利用
- textarea の入力に合わせて右 pane の preview を更新
- asset resolution は既存の childPreviewCtx 経路を再利用
- tab bar は TEXT archetype では非表示にする

---

## 5. やらないこと

- TEXTLOG / attachment / todo / form / folder の編集 UI 変更
- split 比率のユーザ調整 UI（必要なら後続）
- preview 内 task checkbox の interactive 化（entry window view pane 側で既に実装済）
- Slice C で既に完了した edit pane sizing policy の再調整
- センターペイン側の実装変更

---

## 6. 設計の方向性

- `#62 entry-window-structured-editor-parity` と同じ方針で、center pane の presenter 出力を再利用する選択肢を第一候補とする
- presenter output を `syncDomPropertiesToHtml()` 経由で HTML 化して `document.write()` に埋め込む契約を踏襲
- live preview の更新は child-side の既存 `pkcRenderEntryPreview` 経路を拡張
- dirty state policy / pending view body stash は不変

---

## 7. リスク / 未確定事項

- Slice C で導入した `data-pkc-viewport-sized` と split layout の競合（flex chain の再検証が必要）
- preview pane の resize handle を entry window で機能させるかどうか
- asset resolver context（childPreviewCtx）の更新契約が live preview 用に十分か
- tab bar を残すか完全撤去するか（readonly mode との兼ね合い）

---

## 8. 将来拡張の余地

- TEXTLOG も split view 化（oldest-first 不変条件を崩さない範囲で）
- split 比率の記憶 / resize 永続化
- preview 内 anchor jump と editor の行同期
- A-3（TOC right-pane）と組み合わせた 3-column layout
