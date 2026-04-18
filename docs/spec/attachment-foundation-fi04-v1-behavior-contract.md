# FI-04 添付基盤 — v1 Behavior Contract

Status: DRAFT 2026-04-18  
Pipeline position: behavior contract  
Predecessor: `docs/spec/attachment-foundation-fi04-v1-minimum-scope.md`  
FI-05 ref: `docs/spec/attach-while-editing-insert-internal-link-v1-behavior-contract.md`

---

## 0. 位置づけ

本文書は FI-04 v1 の実装者が迷わず進めるための確定仕様書。minimum scope で「何をするか」を定義したのに対し、本文書は「どう判定し・どう処理し・どこで止まるか」を逐条で固定する。

---

## 1. Scope

### 本文書が扱う 3 つの変更

| 変更 | 対象経路 | phase |
|------|---------|-------|
| **G-1 multi-add** | `handleFileDrop`（non-editing DnD）を複数ファイル対応に拡張 | `ready` |
| **G-2 dedupe** | `processFileAttachment` 呼び出し前に重複検知トースト通知を差し込む | `ready` |
| **G-3 常設 DnD** | サイドバー末尾に `data-pkc-region="file-drop-zone"` 要素を常時レンダリング | `ready` |

### 対象外（Non-goal — 実装で触れてはならない）

- `processEditingFileDrop`・`triggerEditingFileAttach`・`handleEditorFileDrop`（FI-05 領域）
- `handlePaste` の画像ペーストパス（FI-02 領域）
- Asset storage の dedup（asset key 共有・参照カウント）
- 重複時の確認ダイアログ
- IDB key / schema 変更

---

## 2. Multi-add contract（§G-1）

### 2-1. 処理順序

`handleFileDrop` は `e.dataTransfer.files`（`FileList`）を **index 昇順（0 から末尾）** で逐次処理する。並列処理は行わない。

```
入力: FileList = [file_0, file_1, file_2]

処理順: file_0 → file_1 → file_2
dispatch 順: file_0 の PASTE_ATTACHMENT → file_1 の PASTE_ATTACHMENT → file_2 の PASTE_ATTACHMENT
サイドバー表示順: FileList の index 順に一致する
```

「逐次」の定義: `file_n` の FileReader.onload コールバックの中で `processFileAttachment` を完了してから `file_{n+1}` の FileReader を開始する。前の FileReader の完了を待たずに全 FileReader を同時起動しない。

### 2-2. エントリ作成順序の保証

各ファイルは `processFileAttachment` 内で `PASTE_ATTACHMENT` を dispatch する。dispatch は同期 reducer を通るため、**FileList の index 順に attachment エントリが作成される**。

この順序は v1 では保証するが、UIの表示順（サイドバーソート）は別途ソート設定に従う。「順序の保証」とは「dispatch および container.entries への append 順が FileList 順と一致すること」を指す。

### 2-3. 1 件失敗時の継続

| 失敗種別 | 挙動 |
|---------|------|
| FileReader.onerror | `console.warn` を出し、そのファイルをスキップ。次の index に進む |
| ファイルサイズ超過警告 | 既存の guardrails ロジックに委ねる（警告トーストを出しつつ処理継続） |
| `processFileAttachment` 内の例外 | catch して `console.error`。バッチを止めない |

**バッチ全体を中断しない**。1 件の失敗が後続ファイルの処理を妨げない。

### 2-4. 空の FileList

`e.dataTransfer.files.length === 0` の場合は即 return。既存の guard（l.3026）と同じ。

---

## 3. Dedupe contract（§G-2）

### 3-1. 重複判定の計算タイミング

FileReader.onload コールバック内で base64 データが確定した直後、`processFileAttachment` を呼ぶ**前**に重複チェックを実行する。

```
FileReader.onload:
  1. base64Data = btoa(...)
  2. hash = fnv1a64Hex(base64Data)          ← 重複チェック用ハッシュ
  3. isDuplicate = checkDuplicate(hash, file.size, container)
  4. if isDuplicate → dispatch SHOW_TOAST info
  5. processFileAttachment(file, ...)       ← 重複でも必ず実行
```

### 3-2. 重複判定条件

以下の 2 条件が**両方**一致した場合のみ「重複」と判定する。

```
条件 A: fnv1a64Hex(新ファイルの base64) === fnv1a64Hex(既存 asset の base64)
条件 B: 新ファイルの file.size === 既存 attachment entry の body.size（JSON parse 後の size フィールド）
```

**どちらか一方だけでは重複とみなさない（安全寄り）。**

条件 A の「既存 asset の base64」は `dispatcher.getState().container.assets` の全 value を走査して比較する。

条件 B の「body.size」は `container.entries` を走査し `archetype === 'attachment'` かつ `JSON.parse(entry.body).asset_key === existingKey` のエントリの `body.size` を参照する。

### 3-3. 重複検知時の挙動

| ステップ | 内容 |
|---------|------|
| トースト通知 | `SHOW_TOAST`（level: `'info'`）を dispatch する |
| 添付処理 | **必ず** `processFileAttachment` を実行する。重複でも添付エントリは作成する |
| 既存 asset | 変更しない（新規ファイルは新規 asset key を得る） |

### 3-4. トースト通知の仕様

**単一ファイルの重複**:

```
「${file.name}」は既存の添付と同一内容です
```

**複数ファイルをバッチで処理した際に N 件重複**（N ≥ 2）:

各ファイルごとに個別トーストを出す（バッチまとめトーストは v1 では作らない）。理由: `processFileAttachment` は逐次処理であり、重複検知も逐次なので 1:1 対応が自然。

**重複なし**: トーストは出さない。

### 3-5. hash 計算失敗時の soft-fail

`fnv1a64Hex` が例外を投げた場合:

1. `console.warn` でログを残す
2. 重複チェックをスキップ（`isDuplicate = false` 扱い）
3. `processFileAttachment` を通常通り実行する
4. トーストは出さない

**hash 計算の失敗は添付処理をブロックしない。**

### 3-6. 重複検知の計算コスト

v1 では `container.assets` 全件に対して `fnv1a64Hex` を毎回計算する（O(n)）。典型的な PKC2 コンテナのアセット数（数十〜百件程度）ではユーザーが体感できる遅延はない。キャッシュは v1 では不要。

---

## 4. 常設 DnD ゾーン contract（§G-3）

### 4-1. 表示位置

`renderer.ts` のサイドバー末尾（`data-pkc-region="sidebar"` の子として最後に追加）に以下の要素を常時レンダリングする。

```html
<div
  data-pkc-region="sidebar-file-drop-zone"
  data-pkc-persistent-drop-zone="true"
>
  Drop files here
</div>
```

`data-pkc-region` には `"sidebar-file-drop-zone"` を使用する。center pane ゾーン（`"file-drop-zone"`）と異なる region 名にすることで、`querySelector` の先着問題（sidebar が DOM 上先に来るため center pane ゾーンより先に検出される）を回避する。`data-pkc-persistent-drop-zone="true"` は常設ゾーンを一意に識別するための属性。

### 4-2. アクティブ条件

| 条件 | 挙動 |
|------|------|
| `state.phase === 'ready'` かつ `!state.readonly` | アクティブ（ドロップ受け付け） |
| `state.phase === 'editing'` | 非アクティブ（`pointer-events: none`）。editing phase のファイル添付は center pane の editor DnD パスが担う |
| `state.readonly === true` | 非アクティブ（既存 guard と同じ） |
| `state.phase === 'initializing'` / `'error'` | 非アクティブ |

アクティブ / 非アクティブの切り替えは `renderer.ts` が state を受け取るたびに DOM 属性（または CSS クラス）で表現する。JS の event listener は追加・削除しない。

### 4-3. 既存 DnD との共存

`handleFileDropOver` / `handleFileDropLeave` / `handleFileDrop` のセレクタを以下の複合セレクタに拡張する。追加の event listener は不要。

```
'[data-pkc-region="file-drop-zone"],[data-pkc-region="sidebar-file-drop-zone"]'
```

既存の center pane ドロップゾーンの動作は変更しない。

### 4-4. editing phase での非干渉

`handleFileDrop` は l.3029 の `if (state.phase !== 'ready' || state.readonly) return;` ガードを維持する。editing phase にサイドバー DnD ゾーンがあってもこのガードが発火をブロックする。editing phase のファイルドロップは `handleEditorFileDrop` が受け取る（FI-05、変更なし）。

---

## 5. Operation flow（完全）

### non-editing DnD（G-1 + G-2 + G-3 共通）

```
1. ユーザーがファイルをドロップ（center pane 既存ゾーン または サイドバー常設ゾーン）

2. handleFileDrop:
   a. state.phase !== 'ready' || state.readonly → return（既存 guard）
   b. e.dataTransfer.files.length === 0 → return
   c. e.preventDefault(); e.stopPropagation()
   d. contextFolder = dropZone.getAttribute('data-pkc-context-folder') ?? undefined

3. for (let i = 0; i < files.length; i++):
   a. file = files[i]
   b. FileReader で base64 に変換（逐次）
   c. FileReader.onload:
      i.  base64Data を取得
      ii. hash = fnv1a64Hex(base64Data)（例外 → soft-fail: 重複チェックをスキップ）
      iii. isDuplicate = checkAssetDuplicate(hash, file.size, dispatcher.getState().container)
      iv. if isDuplicate: dispatcher.dispatch({ type: 'SHOW_TOAST', level: 'info', message: `「${file.name}」は既存の添付と同一内容です` })
      v.  processFileAttachment(file, contextFolder, dispatcher)
   d. FileReader.onerror: console.warn; 次の index へ

4. ドロップゾーンに flash フィードバック（既存 data-pkc-drop-success、変更なし）
```

### FI-05 パスとの交差なし

| 条件 | 担当 |
|------|------|
| `state.phase === 'ready'` でのファイル添付 | **FI-04**（G-1/G-2/G-3） |
| `state.phase === 'editing'` でのファイル添付 + リンク挿入 | **FI-05**（変更なし） |

2 つのパスは `state.phase` で完全に分岐しており、コードパスが交差しない。

---

## 6. Invariants

| # | 条件 | 違反した場合の影響 |
|---|------|-----------------|
| I-FI04-1 | **添付消失禁止** — 重複検知の結果にかかわらず `processFileAttachment` は必ず実行する | 添付エントリが作成されない（データ損失） |
| I-FI04-2 | **上書き禁止** — 新規ファイルは常に新規 asset key を得る。既存の `container.assets[key]` を上書きしない | 既存添付データが破壊される |
| I-FI04-3 | **FI-05 非破壊** — `processEditingFileDrop` / `triggerEditingFileAttach` / `handleEditorFileDrop` / `handlePaste` は変更しない | editing phase の添付+リンク挿入が壊れる |
| I-FI04-4 | **処理順序一貫性** — FileList の index 順 = dispatch 順 = `container.entries` への追記順 | サイドバー表示順が予測不能になる |
| I-FI04-5 | **hash 失敗は soft-fail** — `fnv1a64Hex` の例外は添付処理をブロックしない | hash 計算失敗で添付できなくなる |
| I-FI04-6 | **editing phase 隔離** — 常設 DnD ゾーンは editing phase では非アクティブ | editor DnD（FI-05）と重複してファイルが二重処理される |

---

## 7. Gate 条件 / エラーパス

| 状況 | 挙動 |
|------|------|
| `state.phase !== 'ready'` | `handleFileDrop` は即 return。何もしない |
| `state.readonly === true` | 同上 |
| `e.dataTransfer.files.length === 0` | 即 return |
| FileReader.onerror | `console.warn`。そのファイルをスキップ。バッチ継続 |
| `fnv1a64Hex` が例外 | `console.warn`。重複チェックをスキップ。添付処理は続行 |
| body.size が存在しない attachment entry | size 照合は「一致せず」として扱う（重複と判定しない）|
| サイズ 0 のファイル | 既存の guardrails に委ねる。dedupe チェックは通常通り実行 |
| 未対応 MIME | 特別処理なし。全 MIME を受け付ける（既存動作と同じ） |
| 常設 DnD ゾーンへの editing phase ドロップ | `handleFileDrop` の `phase !== 'ready'` ガードで弾かれる。`handleEditorFileDrop` も `target.closest('[data-pkc-region="editor-drop-zone"]')` で弾く（競合なし）|

---

## 8. Non-goal（明示的除外）

以下は v1 実装で**触れてはならない**。

- asset key 共有による storage dedup
- dedupe による添付キャンセル / 確認ダイアログ
- 重複検知結果の永続化
- 「+ File」ボタン（non-editing）の multi-add 化
- editing DnD パスへの変更（FI-05 領域）
- ファイルマネージャー UI・プレビュー UI
- hash アルゴリズムの変更

---

## 9. Testability

### Pure（単体テスト候補）

| # | テスト内容 | 検証対象 |
|---|-----------|---------|
| 1 | hash 一致 + size 一致 → `isDuplicate = true` | `checkAssetDuplicate` |
| 2 | hash 一致 + size 不一致 → `isDuplicate = false` | 条件 B の必要性 |
| 3 | hash 不一致 + size 一致 → `isDuplicate = false` | 条件 A の必要性 |
| 4 | container.assets が空 → `isDuplicate = false` | 空コンテナ |
| 5 | fnv1a64Hex が例外 → soft-fail（`false` を返す） | エラー耐性 |

### Integration（action-binder + renderer）

| # | テスト内容 | 検証対象 |
|---|-----------|---------|
| 6 | ready phase で 3 ファイルを drop → attachment エントリ 3 件、FileList 順で作成 | G-1 multi-add |
| 7 | 同一 base64 + 同 size のファイルを 2 回 drop → 2 件目で info toast、2 件とも添付される | G-2 dedupe |
| 8 | FileReader エラーが 2 件中 1 件で発生 → 成功した 1 件は添付される | G-1 エラー耐性 |
| 9 | サイドバー常設 DnD ゾーンへ drop → attachment エントリ作成 | G-3 |
| 10 | editing phase でサイドバー DnD ゾーンへ drop → `handleFileDrop` が発火しない | G-3 / editing 隔離 |
| 11 | editing 中の center pane DnD → FI-05 の既存動作（リンク挿入）が変わらない | FI-05 regression |

合計: pure 5 件 + integration 6 件 = **11 件**

---

## References

- Minimum scope: `docs/spec/attachment-foundation-fi04-v1-minimum-scope.md`
- FI-05 behavior contract: `docs/spec/attach-while-editing-insert-internal-link-v1-behavior-contract.md`
- Hash helper: `src/core/operations/hash.ts`（`fnv1a64Hex`）
- Issue ledger: `docs/planning/file-issues/04_attachment-foundation-multi-add-dedupe-persistent-dnd.md`
