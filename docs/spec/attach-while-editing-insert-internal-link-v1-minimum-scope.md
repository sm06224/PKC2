# FI-05 編集中の添付経路を TEXTAREA 自動 internal link 貼付に揃える — v1 Minimum Scope

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は minimum-scope / historical design record として保持。実装の現物は `src/adapter/ui/attachment-presenter.ts` / `src/adapter/ui/action-binder.ts` / `tests/adapter/action-binder-attach-while-editing.test.ts`。
Pipeline position: minimum scope（behavior contract の前提）

---

## 1. 問題の再定義

### 現在の 3 経路の非対称

PKC2 の添付操作には 3 つの経路があり、**結果が非対称**になっている。

| 経路 | 添付生成 | 本文への内部リンク挿入 |
|------|---------|---------------------|
| **スクショ / 画像ペースト** | ✅ | ✅ `![name](asset:key)` が cursor 位置に挿入される |
| **ファイル DnD（センターペイン）** | ✅ | ❌ 添付は作られるがリンクが入らない |
| **ボタン添付（+ File）** | ✅ | ❌ 同上 |

### どこがユーザーにとって不自然か

スクショを貼ると本文に自動でリンクが入るのに、同じファイルを DnD で渡したりボタン経由で添付すると入らない。ユーザーは毎回手動で `![](asset:...)` を書く必要がある。添付の「生成」と「参照」が編集動作の中で自然につながっていない。

### 既存の「正しいパターン」

`handlePaste`（`action-binder.ts`）の画像ペースト経路は正しく動作している。

```
1. FileReader.onload 開始前に cursor 位置・textarea identity を捕捉
2. PASTE_ATTACHMENT を dispatch（再レンダリング発生）
3. textarea を data-pkc-field / data-pkc-log-id で再取得
4. 新しい value = oldValue.slice(0, pos) + "![name](asset:key)" + oldValue.slice(pos)
5. textarea.focus() + setSelectionRange
```

FI-05 の目標はこのパターンを DnD / ボタン経路にも適用することである。

---

## 2. 対象 surface

### 対象 archetype

| Archetype | 対象 | 理由 |
|-----------|------|------|
| **text** | ✅ | body textarea が本文の主体であり、asset 参照を自然に持てる |
| **textlog** | ✅ | ログセル textarea（`textlog-entry-text`）が対象。ただし v1 では編集中のアクティブセルの特定が必要（FI-02A の教訓）。追記欄（`textlog-append-text`）も対象に含む |
| **folder** | ✅ | body textarea に description を書くため自然な対象 |
| **todo / form** | ❌ | body が JSON / 構造データ。テキスト中への asset 参照挿入は不自然 |
| **attachment** | ❌ | body = asset 参照そのもの。二重リンクになる |

### 対象操作

| 操作 | v1 対象 | 備考 |
|------|---------|------|
| **ファイル DnD（editing 中）** | ✅ | センターペインへの drag-drop。editing mode + textarea focus を前提とする |
| **ボタン添付（+ File）** | ✅ | editing 中に `create-entry(archetype=attachment)` を経由して添付を作る場合。ただし追加 UI 分岐が必要かを要確認 |
| **スクショ / 画像ペースト** | — | 既存で正常動作。変更しない |

### 対象外条件（v1 で意図的除外）

- editing mode に入っていない（ready phase）での添付 → リンク挿入なし（無言 no-op）
- TEXTAREA にフォーカスがない状態での操作 → カーソル位置が未確定のためリンク挿入なし
- 添付が完了しなかった場合（キャンセル / エラー） → リンク挿入なし

---

## 3. v1 スコープ

### 含む

| 項目 | 内容 |
|------|------|
| **添付生成** | 既存の添付生成ロジックは変更しない。追加のみ |
| **内部リンク自動挿入** | 添付完了後に `![name](asset:key)`（画像）または `[name](asset:key)`（非画像）を cursor 位置に挿入 |
| **挿入位置** | DnD / ボタン操作を開始した時点のカーソル位置（selectionStart） |
| **対象 textarea 特定** | editing phase 中の `document.activeElement` が対象 textarea か判定。TEXTLOG の場合は `data-pkc-log-id` も含めて特定（FI-02A で確立したパターン） |
| **複数ファイル時の扱い** | v1 では 1 ファイルずつ順に挿入。改行で区切るか連続挿入かは behavior contract で定義 |

### 含まない（意図的に v1 外）

- 常設 DnD エリアの追加・変更（FI-04 の領域）
- 添付 dedupe（FI-04 の領域）
- 添付プレビュー生成・inline preview
- 非画像ファイルの自動サムネイル
- 複数ファイルの一括添付 UI（FI-04 の領域）
- todo / form / attachment archetype への拡張
- editing mode 外での添付リンク挿入（non-editing DnD の auto-link）

---

## 4. 最小修正戦略

### 既存ペーストパターンの流用可能性

`handlePaste` の FileReader 完了後の経路はそのまま参照できる。DnD / ボタン経路でも同じ手順が使える。

**差分**: ペーストの場合は `e.target`（イベント発火時の textarea）から identity を取れる。DnD / ボタンの場合はイベント発火時に textarea にフォーカスがない可能性があるため、**操作開始時点の `document.activeElement` を捕捉して保持**しておく必要がある。

### アクティブ textarea の捕捉タイミング

```
DnD の場合:
  dragover / dragenter 時点ではまだ textarea にフォーカスがある可能性がある。
  drop 時点でも activeElement を確認。
  drop イベント処理開始時に activeElement を snapshot として保存。

ボタン添付の場合:
  ファイル選択ダイアログが開く前（click ハンドラ時点）に activeElement を保存。
  ダイアログ操作中に focus が移動する可能性があるため、操作開始前に捕捉が必要。
```

### 挿入処理の実装方針

```
1. 操作開始時に activeElement を確認
   → data-pkc-field が 'body' / 'textlog-append-text' / 'textlog-entry-text' か？
   → editing phase か？
   → 該当する場合のみ以後の処理に進む

2. cursorPos = activeElement.selectionStart を保存

3. 添付を dispatch（既存の attachment 生成ロジック）
   → 再レンダリング発生

4. textarea を data-pkc-field [+ data-pkc-log-id] で再取得（FI-02A パターン）

5. 新しい value に asset リンク文字列を挿入
   → 画像 MIME: `![${name}](asset:${assetKey})`
   → 非画像 MIME: `[${name}](asset:${assetKey})`

6. setSelectionRange / focus

7. updateTextEditPreview（既存の debounce 更新）
```

### target textarea 特定と FI-02A との整合

FI-02A（TEXTLOG ペースト先ズレ）と同一の教訓が適用される。

- `data-pkc-field` のみでは TEXTLOG の複数セルを区別できない
- 再取得セレクタには `data-pkc-log-id` を含める（`logId` が null のときは従来パスにフォールバック）

これは `handlePaste` で確立した修正パターンと完全に同一。

---

## 5. 不変条件（Invariants）

### I-FI05-1 — 添付生成の非破壊性

リンク挿入の失敗（textarea が見つからない、focus が移動していた等）は添付生成をロールバックしない。添付は常に成功し、リンク挿入は best-effort。

### I-FI05-2 — 挿入先の単一性

リンクが挿入される textarea はただ 1 つ。意図した textarea 以外に文字列が書き込まれることはない。

### I-FI05-3 — silent reroute 不可

リンク挿入ができなかった場合（フォーカスなし / 編集モード外）はリンクを挿入しない。別の textarea に代替挿入してはならない。

### I-FI05-4 — 非編集中 surface への非干渉

ready phase（viewer / 閲覧モード）での添付操作はリンク挿入を行わない。既存の添付生成のみが実行される。

### I-FI05-5 — 既存ペーストパスの非破壊

スクショ / 画像ペーストの既存動作は変更しない。FI-02A の修正も保持する。

### I-FI05-6 — TEXTLOG セル独立性

TEXTLOG 編集中の DnD / ボタン添付で挿入先セルは、操作開始時点でフォーカスしていたセルのみ。他のセルは変更されない（I-EditSafety6 の継承）。

---

## 6. 非対象

以下は v1 スコープ外（意図的）。

- **添付基盤全体の再設計**（FI-04）
- **重複添付の検知・排除**（FI-04）
- **常設 DnD エリアの追加**（FI-04）
- **複数ファイルの同時添付 UI**（FI-04 が前提）
- **添付プレビュー / rich inline preview**
- **todo / form archetype への拡張**
- **editing mode 外での auto-link**（viewer での DnD は添付生成のみ）
- **非画像ファイルの画像化・変換**

---

## 7. 推奨 pipeline

1. **minimum scope**（本文書）— 非対称の特定、対象 surface・操作の確定、最小修正戦略の固定
2. **behavior contract** — activeElement 捕捉タイミング、fallback 条件の逐条仕様、複数ファイル時の挿入順序・区切り
3. **implementation** — `handleDrop` / `handleFileButtonAction` への activeElement 捕捉追加、re-find + 挿入のヘルパー化（`handlePaste` と共通化可能か判断）
4. **audit** — スクショペーストのリグレッション確認、TEXTLOG ペースト先（FI-02A）のリグレッション確認、ready phase での DnD に変化がないことの確認
5. **manual** — `05_日常操作.md` の添付節へ「編集中のドロップ」挙動追記

---

## 8. 具体例

### DnD 1件（画像）

```
前提: TEXT エントリ編集中、body textarea の「---」の後にカーソルあり
操作: png ファイルをセンターペインにドロップ
期待（v1 修正後）:
  - attachment エントリが作成される
  - body textarea に "![logo.png](asset:ast-xxxx)" がカーソル位置に挿入される
  - フォーカスは body textarea のままで、挿入後の位置に cursor が移動する
```

### ボタン添付 1件（非画像）

```
前提: TEXTLOG 編集中、中間セル（log-B）にカーソルあり
操作: + File ボタンを押して PDF を選択
期待（v1 修正後）:
  - attachment エントリが作成される
  - log-B の textarea に "[report.pdf](asset:ast-yyyy)" が挿入される
  - log-A / log-C には何も変化しない（I-FI05-6）
```

### 複数添付（DnD 複数ドロップ）

```
前提: TEXT エントリ編集中、cursor 位置あり
操作: 画像 2 件をまとめてドロップ
期待（v1）: ファイルを 1 件ずつ順に処理し、それぞれのリンクを改行で連続挿入
（連続挿入か独立挿入かは behavior contract で確定する）
```

### 非編集中での DnD（非対象例）

```
前提: TEXT エントリを viewer（閲覧モード）で表示中
操作: ファイルをセンターペインにドロップ
期待（v1 / 既存動作を維持）:
  - attachment エントリが作成される（または既存フローに従う）
  - body テキストへのリンク挿入は行われない
```

---

## References

- Issue ledger: `docs/planning/file-issues/05_editor-paste-attachment-auto-internal-link.md`
- 関連 FI-04: `docs/planning/file-issues/04_attachment-foundation-multi-add-dedupe-persistent-dnd.md`
- FI-02A（TEXTLOG paste target）: `docs/development/textlog-paste-target-fix-audit.md`
- ペーストパス先例: `src/adapter/ui/action-binder.ts` — `handlePaste`（L3086–）
- HTML リンクペースト: `docs/development/html-paste-link-markdown.md`
- attachment UX polish: `docs/development/completed/textlog-text-attachment-ux-polish.md` §1
