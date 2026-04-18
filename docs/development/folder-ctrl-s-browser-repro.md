# FI-02B FOLDER Ctrl+S — ブラウザ再現調査メモ

Status: UNREPRODUCED (Chromium headless + happy-dom の両環境)
Date: 2026-04-18
Parent: `docs/spec/folder-ctrl-s-repro-scope.md`

---

## 調査概要

`docs/spec/folder-ctrl-s-repro-scope.md` の repro matrix を埋めるため、Playwright (Chromium 1194, headless) を使って 6 ケースを自動実行した。

---

## 実行ケースと結果

| # | 条件 | focus | 操作 | phase 前 | phase 後 | 結果 |
|---|------|-------|------|---------|---------|------|
| 1 | FOLDER / center pane | body textarea | Ctrl+S | editing | ready | ✅ SAVED |
| 2 | FOLDER / center pane | title input | Ctrl+S | editing | ready | ✅ SAVED |
| 3 | FOLDER / center pane | なし（page 直接） | Ctrl+S | editing | ready | ✅ SAVED |
| 4 | TEXT / center pane | body textarea | Ctrl+S（baseline） | editing | ready | ✅ SAVED |
| 5 | FOLDER / center pane | body textarea | save button click（sanity） | editing | ready | ✅ SAVED |
| 6 | FOLDER / center pane | body textarea | Escape（cancel sanity） | editing | ready | ✅ SAVED |

全 6 ケース SAVED（phase = ready に遷移）。browser save dialog は 1 件も発生せず。

---

## FOLDER エディタ DOM 構造（実測）

```
div.pkc-editor[data-pkc-mode="edit"][data-pkc-archetype="folder"]
  div.pkc-editor-title-row
    input[type="text"][data-pkc-field="title"]
    span.pkc-archetype-label[data-pkc-archetype="folder"]
  textarea[data-pkc-field="body"][class="pkc-editor-body"][rows="4"]
```

`[data-pkc-mode="edit"]` は存在し、`data-pkc-archetype="folder"` は正しく設定されている。`textarea[data-pkc-field="body"]` は editor div の **直接の子**（2 番目）として存在する。`dispatchCommitEdit` が必要とする全セレクタが正常に解決できる構造。

---

## 候補の絞り込み（repro scope §3 の 6 候補に対応）

| 候補 | 評価 | 根拠 |
|------|------|------|
| 3-A: interceptor 早期リターン | **不該当**（Chromium でも全 pass） | headless Chromium で Ctrl+S が正常に到達・処理される |
| 3-B: ブラウザ / OS ショートカット競合 | **不確定** — headless では発生しない | headless は OS キーバインドをバイパスする。**headed ブラウザ / OS** 上では依然確認が必要 |
| 3-C: DOM 構造起因 | **不該当** | 実測 DOM で editor / archetype / textarea が全て正常 |
| 3-D: dispatchCommitEdit の archetype 解決失敗 | **不該当** | DOM に `[data-pkc-mode="edit"]` と `data-pkc-archetype="folder"` が存在し、`collectBody` も `[data-pkc-field="body"]` を正常取得できる |
| 3-E: phase 不整合 | **不該当** | `BEGIN_EDIT` 後 phase = editing が全ケースで確認済み |
| 3-F: 操作ミス / UX 誤認 | **残存候補** | FOLDER の空 body は viewer では `"Folder (no description)"` のみ表示。edit button を押さずに viewer のままで Ctrl+S を押しても保存は走らない（ready phase）。ユーザーが editing phase に入っていないまま操作している可能性を排除できない |

---

## 重要な観察事項

### bare textarea の構造差

`folder-presenter.renderEditorBody` が返す bare `<textarea>` は、他の archetype（TEXT / TEXTLOG）と異なりラッパー div を持たない。しかし Chromium headless の実測で問題なく動作しており、この構造差が Ctrl+S 保存を阻害するという証拠はない。

### headless vs headed の差

Playwright headless は OS のグローバルキーバインド（macOS の Cmd+S → Finder 操作等）を受けない。**headed ブラウザ上で OS ショートカット競合が実際に起きている可能性は排除できていない**。ただし、TEXT と TEXTLOG では同じ Ctrl+S で保存が動くという原報告があるとすれば、FOLDER のみ OS 競合が起きるという説明は成立しにくい。

---

## Repro Matrix の更新状態

| # | browser | entry type | open path | focus | expected | observed | reproduced? |
|---|---------|-----------|-----------|-------|----------|----------|-------------|
| 1 | Chromium/headless | FOLDER | center pane | body textarea | COMMIT_EDIT | SAVED | **no** |
| 2 | Chromium/headless | FOLDER | center pane | title input | COMMIT_EDIT | SAVED | **no** |
| 3 | Chromium/headless | FOLDER | center pane | なし | COMMIT_EDIT | SAVED | **no** |
| 4 | Chromium/headless | TEXT | center pane | body textarea | COMMIT_EDIT | SAVED | **no** (baseline) |
| 5 | happy-dom | FOLDER | test harness | — | COMMIT_EDIT | SAVED | **no** |
| 6–11 | 実ブラウザ（headed） | — | — | — | — | — | **unknown** |

---

## 結論

**happy-dom（vitest）と Chromium headless の両環境で FOLDER Ctrl+S は正常に動作する。**

- `handleKeydown` は document レベルで登録されており、FOLDER 編集中の Ctrl+S は正しく `dispatchCommitEdit` まで到達する
- `[data-pkc-mode="edit"]` / `data-pkc-archetype="folder"` / `textarea[data-pkc-field="body"]` はすべて正常に存在し、`dispatchCommitEdit` の archetype 解決と `folderPresenter.collectBody` の呼び出しに問題はない
- バグが現在のコードベースに存在する証拠は得られていない

---

## 次段の推奨

### 推奨: FI-02B を suspended に移行

現段階で取れる自動検証手段（happy-dom + Chromium headless）で再現不可。残る未検証条件は「実ブラウザ（headed）+ 実 OS 環境」のみ。

- 再現報告が再発した場合: OS / browser / protocol / キーバインド設定を具体的に記録して reopen
- 残存候補 3-F（編集モードに入っていないままの操作）については UX 改善（readonly 時に Ctrl+S を押したときのトースト通知等）として別テーマで検討可

### 実施不要な対応

- 現コードへの修正（再現根拠なし）
- FOLDER 専用 Ctrl+S ハンドラの追加（過剰）
- テスト追加（happy-dom で既に全パス確認済み）

---

## References

- Repro scope: `docs/spec/folder-ctrl-s-repro-scope.md`
- Issue ledger: `docs/planning/file-issues/02_editor-safety-textlog-paste-target-and-folder-ctrl-s.md`
- 使用スクリプト: `scripts/repro-fi02b.mjs`（実行後削除可）
- FI-02A audit: `docs/development/textlog-paste-target-fix-audit.md`
