# FI-02B FOLDER Ctrl+S 保存不可 — 再現条件スコープ

Status: OPEN — 再現条件未確定
Date: 2026-04-18
Parent: `docs/planning/file-issues/02_editor-safety-textlog-paste-target-and-folder-ctrl-s.md`

---

## 1. 問題の再定義

### 症状

FOLDER エントリを編集モード（`BEGIN_EDIT` → `phase = 'editing'`）に入れ、DESCRIPTION 用 textarea に文章を入力した後、`Ctrl+S` / `Cmd+S` を押しても保存が実行されない。TEXT や TEXTLOG では同じ操作で保存が完了する。

### 期待動作

`Ctrl+S` / `Cmd+S` は archetype に依存せず、`phase === 'editing'` かつ `editingLid` が設定されていれば `COMMIT_EDIT` を dispatch する（I-EditSafety3）。FOLDER も TEXT / TEXTLOG と同等の保存ショートカットを持つ。

### なぜ未確定なのか

FI-02 implementation フェーズで happy-dom テスト環境（vitest + happy-dom）において以下を全検証し、**全テストがパスした**。

| テスト | 結果 |
|--------|------|
| FOLDER が `BEGIN_EDIT` で editing phase に入る | PASS |
| editor が `[data-pkc-mode="edit"]` を持ち `data-pkc-archetype="folder"` | PASS |
| editor が `data-pkc-field="body"` の textarea を持つ | PASS |
| `document` への `keydown(key:'s', ctrlKey:true)` が `EDIT_COMMITTED` を発火 | PASS |
| Ctrl+S 後に phase が ready に遷移 | PASS |
| `metaKey:true`（Cmd+S）も同等に発火 | PASS |

テストファイル: `tests/adapter/action-binder-edit-safety.test.ts` Section B（7件）

**結論**: happy-dom 環境では Ctrl+S → `dispatchCommitEdit` → `COMMIT_EDIT` の経路が FOLDER でも正常に動作する。バグの存在は静的解析でも happy-dom テストでも確認できていない。

---

## 2. 対象 surface

### 編集対象

- FOLDER エントリの DESCRIPTION textarea（`data-pkc-field="body"`）

### 表示コンテキスト

| コンテキスト | 検証対象 |
|-------------|---------|
| センターペイン（メインウィンドウ） | primary |
| Entry Window（別ウィンドウ） | secondary — Entry Window が独自の `bindActions` インスタンスを持つか、keydown 登録が共有されるかを確認する必要あり |

### phase

- `editing`（`BEGIN_EDIT` 後）が前提
- `ready` phase では Ctrl+S は `e.preventDefault()` のみで dispatch なし — これは全 archetype 共通の正常動作

### focus 対象

| focus 位置 | keydown 発火経路 |
|-----------|-----------------|
| FOLDER body textarea にフォーカス | textarea → bubbles → document |
| title input にフォーカス | input → bubbles → document |
| editor 内の他要素にフォーカス | element → bubbles → document |
| document.body にフォーカス（blur 状態） | document 直接 |

`handleKeydown` は `document.addEventListener('keydown', ...)` で登録されているため、focus 位置に関わらず document まで bubble した keydown はすべて捕捉される。

### keydown 発火位置

`handleKeydown` は `document` レベルで登録（`action-binder.ts:3599`）。`e.target` による分岐は Ctrl+S パス（L1741–1747）には存在しない。phase と editingLid のみで判定する。

---

## 3. 再現条件候補

以下は原因の候補であり、**いずれも現時点では未検証**。

### 3-A. interceptor による早期リターン

`handleKeydown` の冒頭（L1622–1633）で 3 つの interceptor がチェックされる。

| interceptor | 条件 | Ctrl+S を消費するか |
|-------------|------|-------------------|
| Asset picker | `isAssetPickerOpen()` | 未検証 — picker が Ctrl+S を `return true` するか要確認 |
| Asset autocomplete | `isAssetAutocompleteOpen()` | 未検証 — 同上 |
| Slash menu | `isSlashMenuOpen()` | 未検証 — slash menu は `/` 起動だが、FOLDER textarea で偶発的に開いた状態が残る可能性 |

**検証方法**: 実ブラウザで FOLDER 編集中に `isSlashMenuOpen()` / `isAssetPickerOpen()` / `isAssetAutocompleteOpen()` の戻り値をコンソールで確認。

### 3-B. ブラウザ / OS のショートカット競合

| 環境 | 競合可能性 |
|------|-----------|
| Chrome / Windows | Ctrl+S → ブラウザの「ページ保存」ダイアログが先に発火し、`e.preventDefault()` が間に合わない可能性。ただし TEXT / TEXTLOG で問題ないなら FOLDER 固有ではない |
| Chrome / macOS | Cmd+S → 同上 |
| Firefox | Ctrl+S → 同上 |
| Safari | Cmd+S → Safari 固有のショートカット処理 |
| `file:///` プロトコル | ブラウザの制限が `http://` と異なる可能性 |

**検証方法**: FOLDER 編集中に devtools console で `document.addEventListener('keydown', e => console.log('keydown', e.key, e.ctrlKey, e.defaultPrevented))` を仕掛けて発火を確認。

### 3-C. DOM 構造起因のイベント妨害

`folder-presenter.renderEditorBody` は bare `<textarea>` を返す（ラッパー div なし）。他の archetype（text / textlog）はより複雑な DOM 構造を持つ。

| archetype | renderEditorBody の戻り値 |
|-----------|--------------------------|
| text | `div.pkc-text-editor` → textarea + preview pane |
| textlog | `div.pkc-textlog-editor` → 複数 textarea + append area |
| folder | bare `<textarea>` 単体 |

差異が keydown に影響するかは不明。`handleKeydown` は `document` レベルで登録されており、`e.target` による archetype 分岐がないため、DOM 構造差が直接影響する経路は静的解析では見つかっていない。

### 3-D. dispatchCommitEdit 内の archetype 解決失敗

`dispatchCommitEdit`（L3670）は `root.querySelector('[data-pkc-mode="edit"]')` で editor 要素を取得し、`data-pkc-archetype` から archetype を読む。

- editor 要素が見つからない → `archetype` は `'text'` にフォールバック → `textPresenter.collectBody` が呼ばれる
- editor 要素が見つかるが `data-pkc-archetype` がない → 同上

いずれの場合も `COMMIT_EDIT` 自体は dispatch される（body の内容は不正確になる可能性があるが、dispatch は行われる）。したがって「Ctrl+S が無反応」の原因にはならない。

### 3-E. phase 状態の不整合

`BEGIN_EDIT` dispatch 後に何らかの理由で `phase` が `'editing'` に遷移していない場合、L1743 の条件 `state.phase === 'editing'` が false となり Ctrl+S は `e.preventDefault()` のみで終わる。

**検証方法**: 実ブラウザで FOLDER を `BEGIN_EDIT` した直後に `dispatcher.getState().phase` をコンソールで確認。

### 3-F. 操作ミス / UX の誤認

FOLDER はデフォルト body が空（`""`）であることが多い。ユーザーが viewer モードのまま（editing phase に入らず）Ctrl+S を押している可能性。viewer には textarea が表示されないが、FOLDER の空 body は `Folder (no description)` というテキストのみで、編集モードに入っていないことに気付きにくい。

**検証方法**: 実際の操作フローを録画で確認。

---

## 4. Repro matrix

| # | browser | entry type | open path | focus path | keydown target | expected | observed | reproduced? |
|---|---------|-----------|-----------|------------|---------------|----------|----------|-------------|
| 1 | Chrome/Win | FOLDER | center pane | body textarea | document | COMMIT_EDIT | unknown | **unknown** |
| 2 | Chrome/Win | FOLDER | entry window | body textarea | document | COMMIT_EDIT | unknown | **unknown** |
| 3 | Chrome/Mac | FOLDER | center pane | body textarea | document | COMMIT_EDIT | unknown | **unknown** |
| 4 | Firefox/Win | FOLDER | center pane | body textarea | document | COMMIT_EDIT | unknown | **unknown** |
| 5 | Safari/Mac | FOLDER | center pane | body textarea | document | COMMIT_EDIT | unknown | **unknown** |
| 6 | Chrome/Win | FOLDER | center pane | title input | document | COMMIT_EDIT | unknown | **unknown** |
| 7 | Chrome/Win | TEXT | center pane | body textarea | document | COMMIT_EDIT | works | **no (baseline)** |
| 8 | Chrome/Win | TEXTLOG | center pane | log cell | document | COMMIT_EDIT | works | **no (baseline)** |
| 9 | happy-dom | FOLDER | test harness | — | document | COMMIT_EDIT | works | **no** |
| 10 | Chrome/Win | FOLDER | center pane | body textarea (slash menu open) | document | COMMIT_EDIT | unknown | **unknown** |
| 11 | file:/// | FOLDER | center pane | body textarea | document | COMMIT_EDIT | unknown | **unknown** |

全 `unknown` セルは実ブラウザでの手動検証が必要。

---

## 5. 不変条件

### I-FolderSave1 — archetype 不変の保存コマンド

`Ctrl+S` / `Cmd+S` は archetype 差で動作が変わってはならない。`phase === 'editing' && editingLid` が真であれば `COMMIT_EDIT` が dispatch される。

### I-FolderSave2 — silent no-op の禁止

保存コマンドが内部的に失敗した場合（editor 要素が見つからない等）、ユーザーに通知なく no-op になってはならない。ただし現行設計では通知経路がないため、v1 では「dispatch 自体が行われること」を invariant とし、通知は将来課題とする。

### I-FolderSave3 — 他 archetype の非破壊

FOLDER の Ctrl+S 修正により、TEXT / TEXTLOG / todo / form / attachment の Ctrl+S パスが変更されてはならない。

### I-FolderSave4 — 未再現段階での原因断定禁止

happy-dom テスト環境で再現していない時点で、コード上の原因を確定したものとして扱わない。実ブラウザでの再現確認が完了するまで、原因候補は候補のまま保持する。

---

## 6. 非対象

以下は本文書の対象外。

- 実装修正（コード変更）
- テスト追加・修正
- マニュアル更新（05 / 09）
- Ctrl+S の全 archetype 共通 contract 再設計
- FOLDER 編集 UX の刷新
- textarea の全面 redesign
- Entry Window の keydown 登録アーキテクチャ再設計

---

## 7. 次段の進め方

### Step 1: 実ブラウザ再現（最優先）

Repro matrix の #1–#6, #10–#11 を手動で検証する。再現した場合は以下を記録する。

- browser / OS / protocol
- `handleKeydown` に到達しているか（console log 挿入で確認）
- `state.phase` / `state.editingLid` の値
- interceptor（slash menu / asset picker / asset autocomplete）の open 状態
- `e.defaultPrevented` の値（keydown 到達時点で既に prevent されていないか）

### Step 2: 分岐

- **再現した場合** → 原因確定 → focused implementation → audit → manual
- **再現しなかった場合** → issue を「元報告の操作条件が特定できない」として suspension。FI-02B は close ではなく suspended とし、再報告があれば reopen。

### Step 3: 実装（再現した場合のみ）

最小修正に限定する。`handleKeydown` → `dispatchCommitEdit` の既存パスが正しく動作するための障害除去のみ。FOLDER 専用の Ctrl+S ハンドラ追加は過剰であり、行わない。

---

## References

- Issue ledger: `docs/planning/file-issues/02_editor-safety-textlog-paste-target-and-folder-ctrl-s.md`
- Minimum scope: `docs/spec/edit-safety-textlog-paste-target-and-folder-save-v1-minimum-scope.md`
- FI-02A audit: `docs/development/textlog-paste-target-fix-audit.md`
- テスト（happy-dom 再現不可を確認）: `tests/adapter/action-binder-edit-safety.test.ts` Section B
- handleKeydown 登録: `src/adapter/ui/action-binder.ts:3599`
- Ctrl+S パス: `src/adapter/ui/action-binder.ts:1741–1747`
- dispatchCommitEdit: `src/adapter/ui/action-binder.ts:3670–3692`
- folder-presenter: `src/adapter/ui/folder-presenter.ts:76–83`
