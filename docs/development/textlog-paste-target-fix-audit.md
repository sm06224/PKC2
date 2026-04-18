# FI-02A TEXTLOG 貼付先ズレ — 実装監査メモ

Status: CLOSED 2026-04-18
Commit: af43ab2

---

## 修正対象

`src/adapter/ui/action-binder.ts` — `handlePaste` 内の画像ペースト後 textarea 再取得セレクタ（L3175–3218）

---

## バグ概要

TEXTLOG 編集モードで複数ログが存在するとき、2 件目以降のログセルに画像をペーストすると、`PASTE_ATTACHMENT` dispatch + 同期再レンダリング後の textarea 再取得が **DOM 先頭要素（= 最新ログ）** を返していた。結果として、ユーザーが意図したセルではなく先頭セルにアセットリンク `![name](asset:key)` が書き込まれ、フォーカスも先頭セルに移動した。

**発現条件**: TEXTLOG に 2 件以上ログがある状態で、2 件目以降のセルにフォーカスしてペーストしたとき。先頭セルへのペースト / ログが 1 件だけの場合は影響なし。

---

## 根本原因（特定済み）

FileReader 非同期コールバック内のセレクタが `data-pkc-field` のみを使用し、`data-pkc-log-id` を含まなかった。TEXTLOG のすべてのログセルは `data-pkc-field="textlog-entry-text"` を共有するため、`querySelector` は常に DOM 順で先頭の要素を返した。

```typescript
// 修正前（bug）
root.querySelector(`textarea[data-pkc-field="${fieldAttr}"]`)
// ↑ 全 TEXTLOG セルが同じ fieldAttr を持つため常に DOM 先頭 = 最新ログ

// 修正後（fix）
const freshSelector = logId
  ? `textarea[data-pkc-field="${fieldAttr}"][data-pkc-log-id="${CSS.escape(logId)}"]`
  : `textarea[data-pkc-field="${fieldAttr}"]`;
root.querySelector<HTMLTextAreaElement>(freshSelector);
// ↑ logId が null のとき（TEXT body / textlog-append-text 等）は従来パス
```

---

## 修正内容

`src/adapter/ui/action-binder.ts`:

| 行 | 変更 |
|----|------|
| L3177 | `const logId = textarea.getAttribute('data-pkc-log-id');` を追加 |
| L3211–3218 | `freshSelector` を `logId` 有無で分岐。`logId` あり → `fieldAttr + logId` の複合セレクタ、`logId` なし → 従来の `fieldAttr` のみ |

## 既存パターンとの整合

`action-binder.ts:300` の `open-log-replace-dialog` が同一セレクタ形式（`fieldAttr + data-pkc-log-id`）を確立済み。今回はそのパターンへの統一であり、新たな設計判断は不要。

---

## テスト

`tests/adapter/action-binder-edit-safety.test.ts` — 13 テスト（全パス）

**Section A — TEXTLOG DOM セレクタ不変条件（5件）**

| テスト | 検証内容 |
|--------|---------|
| 3 textareas / unique log-ids | 各セルが一意の `data-pkc-log-id` を持つこと |
| DOM-first = newest log | desc 順のため先頭要素 = 最新ログ（バグ発現構造の確認） |
| middle log ≠ DOM-first | 中間ログが先頭要素ではないこと（バグ surface の確認） |
| middle log by log-id | `data-pkc-log-id` セレクタで中間ログが一意に取得できること |
| TEXT body: no log-id | TEXT body は `data-pkc-log-id` を持たず、フォールバックパスが有効なこと |

**Section B — FOLDER Ctrl+S メカニズム（7件、下記 FI-02B 参照）**

全スイート: 4166 テスト / 161 ファイル パス（リグレッションなし）

---

## 影響範囲

| ケース | 影響 |
|--------|------|
| TEXT body ペースト（`data-pkc-log-id` なし） | 変更なし（フォールバックパス通過） |
| TEXTLOG 先頭ログへのペースト | 変更なし（最初の match = 先頭ログ → 正常） |
| TEXTLOG 追記欄（`textlog-append-text`） | 単一 textarea のため影響なし |
| TEXTLOG 2 件目以降のログセルへのペースト | **修正済み**（`logId` セレクタで正しいセルを再取得） |

---

## FI-02B（FOLDER Ctrl+S）の状態

本監査の対象外。happy-dom テスト環境では再現不可（Section B の 7 テスト全パス）。実ブラウザ条件での再現条件が未確定のため、FI-02B は **未再現・未確定** として別スレッドで扱う。FI-02A のクローズは FI-02B の状態に依存しない。

---

## References

- Minimum scope: `docs/spec/edit-safety-textlog-paste-target-and-folder-save-v1-minimum-scope.md`
- 実装コミット: `af43ab2`
- テストファイル: `tests/adapter/action-binder-edit-safety.test.ts`
- 先例パターン: `src/adapter/ui/action-binder.ts:300`（`open-log-replace-dialog`）
