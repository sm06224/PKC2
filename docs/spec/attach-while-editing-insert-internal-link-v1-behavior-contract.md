# FI-05 編集中の添付経路を TEXTAREA 自動 internal link 貼付に揃える — v1 Behavior Contract

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は behavior contract / historical design record として保持。実装の現物は `src/adapter/ui/attachment-presenter.ts` / `src/adapter/ui/action-binder.ts` / `tests/adapter/action-binder-attach-while-editing.test.ts`。
Pipeline position: behavior contract
Predecessor: `docs/spec/attach-while-editing-insert-internal-link-v1-minimum-scope.md`

---

## 0. 位置づけ

本文書は FI-05 の実装者が迷わず進めるための確定仕様書である。minimum scope で「何をするか」を定義したのに対し、本文書は「どう判定し・どう挿入し・どこで止まるか」を逐条で固定する。

---

## 1. 対象 surface

### 対象 editing surface

editing phase（`state.phase === 'editing'`）かつ以下の archetype のとき、DnD / ボタン添付の完了後にリンク挿入処理を行う。

| Archetype | 対象 textarea `data-pkc-field` | `data-pkc-log-id` |
|-----------|-------------------------------|-------------------|
| **text** | `"body"` | なし |
| **folder** | `"body"` | なし |
| **textlog** (ログセル) | `"textlog-entry-text"` | あり（セル識別子） |
| **textlog** (追記欄) | `"textlog-append-text"` | なし |

text と folder は同一パスで処理できる（どちらも `data-pkc-field="body"` で logId なし）。

### 非対象 surface

以下の条件のいずれかを満たす場合、リンク挿入処理は行わない。添付生成そのもの（既存フロー）は影響を受けない。

- `state.phase !== 'editing'`（viewer / ready / error）
- `document.activeElement` が対象 textarea でない（フォーカスが外れている）
- 対象外 archetype（todo / form / attachment / generic / opaque）を編集中
- readonly ワークスペース（既存の editing 禁止ガードに委ねる）

---

## 2. Internal link の canonical 形式

添付完了後に挿入するリンク文字列は以下で確定する。

```
画像 MIME（image/*）:
  ![${filename}](asset:${assetKey})

非画像 MIME:
  [${filename}](asset:${assetKey})
```

- `filename`: 元ファイル名。拡張子込み。特殊文字のエスケープは行わない（既存の paste パスと同一）
- `assetKey`: 添付生成時に払い出された asset キー
- 画像 / 非画像の判定: MIME が `image/` で始まるか否か

この形式は既存の `handlePaste` 画像ペーストパスが出力する文字列と完全に一致する。

**複数ファイルの場合**: ファイルごとに上記形式のリンク文字列を `\n` で連結する。

```
![img1.png](asset:ast-aaa)
[doc.pdf](asset:ast-bbb)
```

最後のリンク文字列の後ろに `\n` は付けない（1 件のとき改行なし）。

---

## 3. 操作開始時の activeElement 捕捉

### 捕捉タイミング

| 経路 | 捕捉タイミング | 理由 |
|------|--------------|------|
| **DnD** | `drop` イベントハンドラの先頭（`e.preventDefault()` 直後） | dragenter / dragover 後に focus が移動している可能性があるが、drop の瞬間はまだ元の textarea に留まっているケースが多い |
| **ボタン添付** | ファイル選択ダイアログを開く直前（`<input type="file">` の `.click()` を呼ぶ直前） | ダイアログが開いた後は focus が必ず移動するため、事前に捕捉する |

### 捕捉手順（両経路共通）

```
1. target = document.activeElement
2. target が HTMLTextAreaElement であること
3. fieldAttr = target.getAttribute('data-pkc-field')
4. fieldAttr が 'body' / 'textlog-entry-text' / 'textlog-append-text' のいずれかであること
5. logId = target.getAttribute('data-pkc-log-id')  // null の場合あり
6. cursorPos = target.selectionStart ?? target.value.length
7. existingValue = target.value
```

上記 2〜4 のいずれかを満たさない場合: `insertCtx = null` として以降のリンク挿入処理を行わない。添付生成は続行する。

---

## 4. 添付生成と textarea 再取得

### 生成

捕捉した `insertCtx` の有無にかかわらず、添付生成ディスパッチは実行する（既存フロー）。

### 再レンダリング後の textarea 再取得

`PASTE_ATTACHMENT`（または同等の）dispatch が同期レンダリングを引き起こした後、textarea を再取得する。セレクタは FI-02A で確立したパターンと同一。

```typescript
const freshSelector = insertCtx.logId
  ? `textarea[data-pkc-field="${insertCtx.fieldAttr}"][data-pkc-log-id="${CSS.escape(insertCtx.logId)}"]`
  : `textarea[data-pkc-field="${insertCtx.fieldAttr}"]`;

const freshTextarea = root.querySelector<HTMLTextAreaElement>(freshSelector);
```

`freshTextarea === null` の場合: リンク挿入をスキップする（添付は作成済み）。

---

## 5. 複数ファイルの挿入規則

複数ファイルを一度に DnD / ボタン選択した場合、以下の規則で処理する。

1. ファイルを `FileList` または `DataTransferItemList` の順序（index 昇順）で処理する
2. 各ファイルを個別に FileReader で読み込み、個別に dispatch する
3. **最初のファイルの挿入位置**: 操作開始時に捕捉した `cursorPos`
4. **2 件目以降の挿入位置**: 直前の挿入が終了した時点の cursor 後（= 挿入文字列の末尾の次）
5. ファイル間のセパレータ: `\n`（改行 1 本）

```
cursorPos = 5 で 2 件ドロップした場合:

挿入前: "Hello world"
1件目後: "Hello![a.png](asset:ast-1)\n world"  ← cursorPos=5 に挿入
2件目後: "Hello![a.png](asset:ast-1)\n[b.pdf](asset:ast-2)\n world"  ← \n の直後に挿入
```

各ファイルの添付生成は直列に処理する（並列 dispatch による race 条件を避けるため）。

---

## 6. 不変条件（Invariants）

### I-FI05-1 — 添付生成の非破壊性

リンク挿入処理の失敗（activeElement なし / textarea 再取得失敗 / ファイル読み取りエラー等）は、添付エントリの生成をロールバックしない。添付は生成済みとして残る。

### I-FI05-2 — 挿入先の単一性

1 回の添付操作（1 ファイル）で挿入されるリンク文字列はちょうど 1 つ。複数の textarea への同時挿入は行わない。

### I-FI05-3 — silent reroute 不可

activeElement が対象外だった場合、別の textarea へ代替挿入しない。挿入先が確定できなければ挿入は行わない（添付は生成済み）。

### I-FI05-4 — 非編集中 surface への非干渉

`state.phase !== 'editing'` での添付操作は既存動作（添付生成のみ）を変えない。

### I-FI05-5 — 既存ペーストパスの非破壊

`handlePaste` の画像ペースト経路（FI-02A 修正済み）は本変更で改変しない。共通ヘルパーを導入する場合も `handlePaste` の呼び出しパスを変更しない。

### I-FI05-6 — TEXTLOG セル独立性

TEXTLOG の編集中に DnD / ボタン添付を行った場合、挿入先は操作開始時点でフォーカスしていたログセルのみ。他のセル（log-A / log-C 等）は変更されない。

---

## 7. Gate 条件 / エラーパス

| 状況 | 挙動 |
|------|------|
| `state.phase !== 'editing'` | リンク挿入しない。添付生成は既存フロー通り |
| activeElement が対象外 textarea | リンク挿入しない。添付生成は続行 |
| 対象外 archetype（todo / form 等） | リンク挿入しない。添付生成は続行 |
| ファイル読み取りエラー（FileReader.onerror） | 添付生成せず、リンク挿入もしない。既存エラーパスに委ねる |
| dispatch 後の textarea 再取得が null | リンク挿入をスキップ。添付は作成済みのまま |
| 複数ファイルの途中でエラー | エラーが出た件をスキップして次の処理に進む。成功した件のリンクは挿入済み |
| 複数ファイルで一部の textarea 再取得が null | 再取得できたファイルのみ挿入し、できなかった件はスキップ |

エラー時にユーザー向けの通知を出す義務は v1 にはない（既存の `console.warn` レベルで十分）。ただし既存の `reader.onerror` ハンドラが出すメッセージは維持する。

---

## 8. UI contract（最小）

### 成功時

- フォーカスはリンクを挿入した textarea に戻る
- cursor は挿入文字列の末尾の直後に位置する（複数ファイルの場合は最後のリンクの末尾）
- `updateTextEditPreview`（または同等の debounce 更新）を呼び出してプレビューを更新する
- 専用のトースト通知・ダイアログは出さない（添付エントリがサイドバーに現れることで完結）

### 失敗時（リンク挿入のみ失敗）

- 添付エントリはサイドバーに出る（正常）
- 本文には何も挿入されない
- ユーザー向け UI は変化しない
- `console.warn` で挿入スキップの理由をログに残す

### 新規 UI を追加しない

DnD / ボタン添付でリンク挿入のために新たなモーダル・確認ダイアログ・プログレス表示を作らない。フィードバックは既存の添付エントリ生成（サイドバーへの追加）のみ。

---

## 9. Source-path contract — 3 経路の共通点と差分

| 項目 | paste（既存） | DnD（追加） | button（追加） |
|------|-------------|-----------|--------------|
| activeElement 捕捉 | `e.target`（textarea 自体） | `document.activeElement`（drop 時） | `document.activeElement`（click 時） |
| cursor 位置 | `textarea.selectionStart`（drop 前に同期取得） | 同左 | 同左 |
| textarea identity 保存 | `fieldAttr` + `logId` | 同左 | 同左 |
| 添付 dispatch | `PASTE_ATTACHMENT` | `PASTE_ATTACHMENT` | `PASTE_ATTACHMENT` |
| 再レンダリング後 re-find | `fieldAttr` + `logId` 複合セレクタ | 同左 | 同左 |
| 挿入文字列の形式 | `![name](asset:key)` / `[name](asset:key)` | 同左 | 同左 |
| 複数ファイル | 1件（paste は通常1ファイル） | 複数対応（直列処理） | 複数対応（直列処理） |

**paste との実質的な差分は activeElement の取得元のみ**。ロジックは同一ヘルパーに集約できる。

---

## 10. 非対象 / Non-goal

以下は v1 の対象外。

- **添付 dedupe**（FI-04）
- **常設 DnD エリアの新設**（FI-04）
- **複数ファイルの一括 UI**（FI-04 が前提）
- **添付プレビュー / rich inline preview**
- **todo / form / attachment archetype への拡張**
- **editing mode 外の auto-link**
- **挿入失敗時のユーザー向けエラー通知**（v1.x 以降）

---

## 11. FI-04 との接続点

FI-04 が実装する「常設 DnD エリア」は editing mode 外でも使える添付受け口になる。その際、「常設 DnD への drop がどのエントリの編集中と関連付けられるか」は FI-04 が定義する問題であり、FI-05 は関与しない。FI-04 完了後に必要であれば FI-05 の追加 surface として拡張できる。

---

## 12. Testability

実装フェーズで最低限カバーすべきテストの範囲。

**Pure / unit（activeElement 判定ヘルパーが純粋関数化できる場合）**

| # | テスト | 検証内容 |
|---|--------|---------|
| 1 | text 編集中 / body textarea にフォーカス | insertCtx が正しく構築される |
| 2 | folder 編集中 / body textarea にフォーカス | 同上 |
| 3 | textlog 編集中 / log セルにフォーカス | insertCtx に logId が含まれる |
| 4 | textlog 編集中 / append 欄にフォーカス | insertCtx に logId が含まれない |
| 5 | ready phase | insertCtx = null |
| 6 | activeElement が textarea でない | insertCtx = null |
| 7 | 対象外 archetype（todo） | insertCtx = null |

**Integration（action-binder + dispatcher + renderer）**

| # | テスト | 検証内容 |
|---|--------|---------|
| 8 | DnD / text body / 画像 1件 | body に `![name](asset:key)` が挿入される |
| 9 | DnD / textlog log-B / 非画像 1件 | log-B に `[name](asset:key)` が挿入、log-A / log-C 不変 |
| 10 | DnD / folder body / 画像 1件 | body に `![name](asset:key)` が挿入される |
| 11 | DnD / 画像 2件 | 2 リンクが `\n` で連結して挿入される |
| 12 | ready phase での DnD | 本文変化なし（添付生成のみ） |
| 13 | 既存 paste（スクショ）regression | 動作不変 |

---

## References

- Minimum scope: `docs/spec/attach-while-editing-insert-internal-link-v1-minimum-scope.md`
- FI-02A audit（TEXTLOG paste target fix / re-find パターン）: `docs/development/textlog-paste-target-fix-audit.md`
- HTML paste link: `docs/development/html-paste-link-markdown.md`
- Issue ledger: `docs/planning/file-issues/05_editor-paste-attachment-auto-internal-link.md`
