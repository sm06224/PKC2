# FI-02 編集安全性 v1 — Minimum Scope
# TEXTLOG 貼付先ズレ / FOLDER Ctrl+S 不可

Status: 実装済み / 再現不可としてクローズ(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。1-A(TEXTLOG 貼付先ズレ)は `src/adapter/ui/action-binder.ts` の `handlePaste` に `data-pkc-log-id` 付き selector を追加する形で **CLOSED 2026-04-18 commit `af43ab2`**(audit `../development/textlog-paste-target-fix-audit.md`)、`tests/adapter/action-binder-edit-safety.test.ts` で pin。1-B(FOLDER Ctrl+S)は Chromium + happy-dom の両環境で **UNREPRODUCED**(`../development/folder-ctrl-s-browser-repro.md`、repro matrix 全ケース SAVED)、コード変更なしで close。本書は minimum-scope / historical design record として保持。
Pipeline position: minimum scope（behavior contract の前提）

---

## 1. 問題の再定義

### 1-A. TEXTLOG 貼付先ズレ

**症状**: TEXTLOG に複数ログが存在する状態で編集モードに入り、中段や末尾のログセルにスクリーンショットをペーストすると、挿入されたアセットリンク（`![name](asset:key)`）が **先頭ログセルの本文** に書き込まれる。ペースト後のフォーカスも先頭セルに移動する。

**根本原因（特定済み）**: `action-binder.ts` の `handlePaste` 内、`PASTE_ATTACHMENT` dispatch 後の textarea 再取得クエリが `fieldAttr`（`"textlog-entry-text"`）のみを使用している（line 3212）。TEXTLOG のすべてのログセルは同一の `data-pkc-field="textlog-entry-text"` を持つため、`root.querySelector('textarea[data-pkc-field="textlog-entry-text"]')` は常に **DOM 上で先頭の要素**（エディタが desc 順で表示するため最新ログ = 視覚的に一番上のセル）を返す。ユーザーがペーストしていた中間・末尾セルの `data-pkc-log-id` が再取得クエリに含まれていないことが直接の原因。

**正常系との対比**:
- ログが 1 件だけの TEXTLOG: DOM 上の first match = 唯一のセル → 現状でも正常。
- 複数ログの TEXTLOG でペースト対象が先頭セル: DOM 上の first match = ペースト元 → 現状でも正常。
- 複数ログの TEXTLOG でペースト対象が 2 件目以降: first match ≠ ペースト元 → **バグ発現**。

**サイレント破壊経路**: ユーザーは自分が対象にしていないログセルが書き換わったことを保存後まで気付かないことがある。ペースト操作の結果が視覚的にフォーカスの先頭セルにしか出ないため、見た目の「なんかフォーカスが動いた」で気付けるかどうかはユーザー依存。

### 1-B. FOLDER Ctrl+S 保存不可

**症状**: FOLDER エントリを編集モード（`BEGIN_EDIT` 後の `phase = 'editing'`）に入れ、DESCRIPTION 用 textarea に文章を入力した後、`Ctrl+S` / `Cmd+S` を押しても保存が実行されない。TEXT や TEXTLOG では同じ操作で保存が完了する。

**現状コード上の手がかり**: `handleKeydown`（line 1741）の `mod && e.key === 's'` ブランチは archetype を問わず `state.phase === 'editing' && state.editingLid` が真であれば `dispatchCommitEdit` を呼ぶ。`dispatchCommitEdit` は `root.querySelector('[data-pkc-mode="edit"]')` で archetype を取得し presenter 経由で `collectBody` を呼ぶ設計になっている。静的解析では阻害経路の特定に至っていないが、`folder-presenter.ts` の `renderEditorBody` が他の archetype と異なり **bare `<textarea>` を直接返す**（ラッパー div なし）点が唯一の構造的差異であり、実行時に何らかの form、DOM 構造、または focus 管理上の問題を生じさせている可能性がある。実装フェーズで再現テストにより根本原因を確定する。

**パリティギャップ**: TEXT エントリは `Ctrl+S` → `dispatchCommitEdit` → `COMMIT_EDIT` → 保存完了。FOLDER エントリは `Ctrl+S` で保存が発火しない（保存ボタンをクリックすれば保存できる）。

---

## 2. 共通テーマとして束ねる理由

2 件は原因が異なるが、**「ユーザーの編集意図した対象と、実際に作用する対象がずれる」** という同一の安全性クラスに属する。

| 問題 | 意図した対象 | 実際に作用した対象 |
|------|-------------|-------------------|
| TEXTLOG ペースト先ズレ | ユーザーが選んだログセル | DOM 先頭のログセル |
| FOLDER Ctrl+S 不可 | FOLDER entry を保存 | 無操作（キーイベントが保存に繋がらない） |

共通 invariant: **"ユーザーが意図した編集操作は、ユーザーが意図した対象エントリ・フィールドにのみ作用する。他の場所への暗黙的な re-routing や保存の暗黙的な失敗は許容しない。"**

---

## 3. v1 スコープ

### 対象 surface

| Surface | 対象操作 | 対象エントリ |
|---------|---------|------------|
| TEXTLOG 編集モードのログセル | 画像ペースト（スクリーンショット/ファイル系） | TEXTLOG（複数ログあり） |
| FOLDER 編集モード | `Ctrl+S` / `Cmd+S` キーバインド | FOLDER |

### 対象外操作（意図的除外）

- HTML リンクペースト（TEXT body の `maybeHandleHtmlLinkPaste` 経路）: FI-02 の対象外。TEXTLOG のリンクペースト正規化は別 slice で扱われる（FI-02 issue scope 境界 §「含まない」参照）
- ドラッグ&ドロップによる画像貼り付け（drag-drop 系）
- TEXTLOG 追記欄（`data-pkc-field="textlog-append-text"`）へのペースト: 追記欄は単一 textarea であり today always a single target
- `Ctrl+S` の全 archetype 統合 contract 再設計
- FOLDER 以外の archetype で保存キーが動かない場合の一括対処

---

## 4. 最小修正戦略

### 4-A. TEXTLOG ペースト先修正

**修正箇所**: `src/adapter/ui/action-binder.ts` の `handlePaste`（line 3175 付近）

**現行コード**（問題箇所）:
```typescript
// Capture textarea identity for re-finding after re-render
const fieldAttr = textarea.getAttribute('data-pkc-field') ?? 'body';
// ... dispatch ... re-render ...
const freshTextarea = root.querySelector<HTMLTextAreaElement>(
  `textarea[data-pkc-field="${fieldAttr}"]`,   // ← log-id なし: 常に first match
);
```

**修正方針**: ペースト対象 textarea の `data-pkc-log-id` を `fieldAttr` と同時に捕捉し、再取得クエリに含める。`data-pkc-log-id` が存在しない場合（TEXT body など）は従来通り `fieldAttr` のみで re-find。

```typescript
const fieldAttr = textarea.getAttribute('data-pkc-field') ?? 'body';
const logId = textarea.getAttribute('data-pkc-log-id');  // 追加
// ... dispatch + re-render ...
const selector = logId
  ? `textarea[data-pkc-field="${fieldAttr}"][data-pkc-log-id="${CSS.escape(logId)}"]`
  : `textarea[data-pkc-field="${fieldAttr}"]`;
const freshTextarea = root.querySelector<HTMLTextAreaElement>(selector);
```

この修正パターンは既に同ファイル line 300 で確立されている（`open-log-replace-dialog` の log-id 参照）。

**副作用なし**: TEXT body（`data-pkc-field="body"`）は `data-pkc-log-id` を持たないため `logId === null` → 従来パス。TEXTLOG 追記欄（`data-pkc-field="textlog-append-text"`）も同様。

### 4-B. FOLDER Ctrl+S 修正

**修正箇所**: 実装フェーズで再現テストを書いて根本原因を確定してから修正する。静的解析で候補を 2 点挙げておく。

**候補 1**: `dispatchCommitEdit` 内の `root.querySelector('[data-pkc-mode="edit"]')` が FOLDER 編集モードで `null` を返す場合、archetype が `'text'` にフォールバックして `collectBody` が期待通りに動かない。確認方法: 再現テストで `dispatcher.dispatch` 呼び出し有無を spy。

**候補 2**: `folder-presenter.renderEditorBody` が bare `<textarea>` を返すため、`<div data-pkc-mode="edit">` の直下構造がほかの archetype と異なり、何らかの focus イベントが Ctrl+S を interceptしている。

修正の方向性はいずれの場合も「FOLDER 編集モードで `Ctrl+S` を押したとき、`COMMIT_EDIT` が dispatch されること」を invariant として、その経路の疎通を保証する最小コード変更に限定する。既存の `handleKeydown` → `dispatchCommitEdit` パスが FOLDER に対して正しく機能すれば十分であり、FOLDER 専用の Ctrl+S ハンドラを追加することは過剰。

---

## 5. 不変条件（Invariants）

### I-EditSafety1 — ペースト先の単一性

ユーザーがフォーカスしていた textarea にのみアセットリンクが挿入される。他のログセル・他のエントリの textarea は変更されない。

### I-EditSafety2 — ペースト後 focus の一貫性

ペースト完了後、フォーカスと cursor は挿入を行った textarea の挿入点直後に位置する。focus が別のセルに移動することはない。

### I-EditSafety3 — 保存コマンドの archetype 統一

`Ctrl+S` / `Cmd+S` は `phase === 'editing'` かつ `editingLid` が設定されていれば、archetype に依存せず `COMMIT_EDIT` を dispatch する。FOLDER は TEXT / TEXTLOG と同等の保存ショートカットを持つ。

### I-EditSafety4 — 既存 archetype 非破壊

TEXT body textarea へのペースト（`data-pkc-field="body"` で `data-pkc-log-id` なし）の動作は変更されない。TEXT / TEXTLOG の Ctrl+S パスは変更されない。

### I-EditSafety5 — silent re-route 不可

操作が意図した対象に届かない場合は、エラー / no-op とする。別のセル・別のエントリへ暗黙的にリダイレクトしてはならない。

### I-EditSafety6 — ログセル独立性

TEXTLOG の各ログセルへの編集操作（ペースト・テキスト変更）は、他のログセルの本文・タイムスタンプ・フラグ・ID に副作用しない。

---

## 6. 非対象

以下は v1 の対象外（意図的）。

- TEXTLOG 全体のペースト UX 再設計
- リッチペースト（HTML paste）の TEXTLOG 対応（別 FI で扱う）
- FOLDER の編集 UX 刷新（inline-edit 化、autosave 等）
- エディタショートカット全体の archetype 共通 contract 定義
- TEXTLOG 以外のマルチセル archetype へのペースト（現時点では存在しない）
- 保存失敗時のユーザー向けエラー表示の改善

---

## 7. 再現条件（実装フェーズで確認する具体例）

### ケース 1: TEXTLOG 中段ペースト → 先頭セルに貼付（バグ）

```
前提: TEXTLOG に 3 件ログ（id=A / B / C、A が最新、エディタ上は A→B→C の順）
操作: ログ B の textarea にフォーカスし、スクリーンショットをペースト
期待（修正後）: ログ B の本文に ![...](asset:...) が挿入、フォーカスも B に残る
実際（修正前）: ログ A の本文に挿入、フォーカスが A に移動
```

### ケース 2: FOLDER Ctrl+S 不可（バグ）

```
前提: FOLDER エントリを BEGIN_EDIT して description textarea を編集中
操作: Ctrl+S を押す
期待（修正後）: COMMIT_EDIT dispatch → 保存完了 → phase = 'ready'
実際（修正前）: 何も起きない（保存ボタンクリックは動作する）
```

### ケース 3: TEXTLOG 先頭セルペースト（正常系・regression 確認）

```
前提: TEXTLOG に 3 件ログ、エディタ上の先頭（最新）ログにフォーカス
操作: スクリーンショットをペースト
期待（修正前後共通）: 先頭ログの本文に挿入、フォーカス維持
```

### ケース 4: TEXT body ペースト（正常系・regression 確認）

```
前提: TEXT エントリを編集中、body textarea にフォーカス
操作: スクリーンショットをペースト
期待（修正前後共通）: body textarea に挿入（data-pkc-log-id なし → 従来パス）
```

### ケース 5: TEXT Ctrl+S（regression 確認）

```
前提: TEXT エントリを編集中
操作: Ctrl+S
期待（修正前後共通）: COMMIT_EDIT dispatch → 保存完了
```

---

## 8. 推奨 pipeline

1. **minimum scope**（本文書）— 再現条件と修正戦略を固定
2. **behavior contract** — I-EditSafety1〜6 の逐条実装仕様、テスト分類（純粋ロジックはなく UI binder 修正のみのため slim な contract でよい）
3. **implementation** — action-binder.ts の 2 箇所を最小修正。FOLDER 根本原因を再現テストで確定後に修正
4. **audit** — 他 archetype での Ctrl+S / paste の regression 確認、TEXTLOG 単一ログ時の non-regression
5. **manual** — 09 トラブルシューティングへの FOLDER 保存関連 QA 追加（もし既存記述と矛盾があれば訂正）

---

## 9. 依存ファイル（修正候補）

| ファイル | 修正内容 |
|---------|---------|
| `src/adapter/ui/action-binder.ts` | `handlePaste` の re-find クエリに `data-pkc-log-id` 追加（1-A）; FOLDER Ctrl+S 阻害原因の解消（1-B） |
| `src/adapter/ui/folder-presenter.ts` | 修正が必要な場合のみ（1-B の根本原因次第） |
| `tests/adapter/action-binder-*.test.ts` または新規テストファイル | 再現テスト追加（両問題とも既存テストでカバーされていない） |

---

## References

- Issue ledger: `docs/planning/file-issues/02_editor-safety-textlog-paste-target-and-folder-ctrl-s.md`
- Paste 経路: `src/adapter/ui/action-binder.ts` — `handlePaste` (line ~3086)
- FOLDER presenter: `src/adapter/ui/folder-presenter.ts`
- TEXTLOG presenter: `src/adapter/ui/textlog-presenter.ts`
- ペースト再取得パターン先例: `action-binder.ts` line 300（`data-pkc-log-id` 付き selector）
