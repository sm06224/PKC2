# Entry Window Structured Editor Parity

Status: COMPLETED
Created: 2026-04-12

---

## 1. Summary

entry window（ダブルクリック別窓）で TEXTLOG / todo / form エントリを編集する際、
raw JSON テキストエリアではなく、センターペインと同じ構造化エディタを表示する。
加えて、outerHTML シリアライズ時にフォーム要素の値が消失するバグを修正。

---

## 2. 修正したバグ

### A. 構造化 archetype が raw JSON 編集になる

**症状**: TEXTLOG / todo / form エントリを entry window でダブルクリック編集すると、
body の JSON 文字列（`{"entries":[...]}`、`{"status":"open",...}` 等）がそのままテキストエリアに表示された。

**原因**: `buildWindowHtml()` はすべての archetype に対して同一のテキストエリア + Source/Preview タブを生成していた。
センターペインでは `DetailPresenter.renderEditorBody()` が archetype ごとの構造化エディタを返すが、
entry window はこれを利用していなかった。

**修正**: `textlogPresenter` / `todoPresenter` / `formPresenter` を直接 import し、
`renderEditorBody()` の出力を `outerHTML` でシリアライズして entry window に埋め込む。

### B. outerHTML シリアライズで値が消失する

**症状**: 構造化エディタを埋め込んでも、textarea の入力値・select の選択値・checkbox のチェック状態が
entry window で空/未選択になる。

**原因**: `textarea.value`、`select.value`、`checkbox.checked` は DOM プロパティであり、
`.outerHTML` はこれらをシリアライズしない。entry window は `document.write(html)` で
親からの HTML 文字列を注入するため、プロパティ情報が失われる。

**修正**: `syncDomPropertiesToHtml()` ヘルパーを導入し、`.outerHTML` 呼び出し前に
DOM プロパティを HTML 属性/コンテンツに同期する。

---

## 3. 契約

### A. 構造化編集契約

| 規則 | 内容 |
|------|------|
| presenter 使用義務 | TEXTLOG / todo / form は entry window でも presenter ベースの構造化エディタを使う |
| UX 一致 | main window と entry window で editor 表現を可能な限り一致させる |
| raw JSON 禁止 | これらの archetype で raw JSON テキストエリア編集に戻さない |
| text/attachment/generic | 従来通りテキストエリア + Source/Preview タブを使う |

**対象 archetype と presenter**:

| archetype | presenter | import 元 |
|-----------|-----------|-----------|
| textlog | `textlogPresenter` | `./textlog-presenter` |
| todo | `todoPresenter` | `./todo-presenter` |
| form | `formPresenter` | `./form-presenter` |

### B. シリアライズ契約（`syncDomPropertiesToHtml`）

entry window の `document.write()` 経路では、DOM tree を `.outerHTML` で
文字列化する必要がある。以下の同期が **必須**:

| DOM property | HTML 同期先 | 理由 |
|--------------|-------------|------|
| `textarea.value` | `textarea.textContent`（タグ間コンテンツ） | `.outerHTML` は `value` プロパティを出力しない |
| `select.value` | `option[selected]` 属性 | `.outerHTML` は選択状態を反映しない |
| `checkbox.checked` | `input[checked]` 属性 | `.outerHTML` はチェック状態を反映しない |

**これはバグ回避策ではなく、現行のシリアライズ契約である。**

`syncDomPropertiesToHtml()` は `entry-window.ts` 内の named helper として定義。
`buildWindowHtml()` で `presenter.renderEditorBody()` の返り値に対して呼び出す。

**拡張ポイント**: 今後 `radio`、`contenteditable`、`input[type="number"]` 等の
新しいフォーム要素が presenter に追加された場合、このヘルパーの拡張が必要。

### C. dirty state / restore 契約

| 機能 | 関数 | 仕組み |
|------|------|--------|
| dirty 判定 | `isEntryDirty()` | `useStructuredEditor` なら `collectStructuredBody() !== originalBody`、それ以外は `body-edit.value !== originalBody` |
| body 収集 | `collectStructuredBody()` | archetype 別に DOM フィールドから JSON を再構築。センターペインの `collectBody()` と同等 |
| cancel 復元 | `restoreStructuredEditor()` | `originalBody` を JSON.parse して各フィールドに書き戻す |
| save 後の originalBody 更新 | `pkc-entry-saved` handler | `collectStructuredBody()` の出力で `originalBody` を上書き |

**前提**:
- `collectStructuredBody()` の出力は JSON key 順が `originalBody` と一致する必要がある（dirty 判定が文字列比較のため）
- `restoreStructuredEditor()` は JSON.parse の例外を握りつぶす（壊れた body でもクラッシュしない）
- dirty state policy（push stash / flush）はテキストエリア編集と構造化編集で同一ルールに従う

### D. TEXTLOG save 後の body-view 再描画

`renderBodyView(body)` は TEXTLOG JSON を per-log-entry の `<div data-pkc-log-id="...">` 構造に
展開する。これにより save 後の body-view が parent push 経路（`pushTextlogViewBodyUpdate`）と
同じ DOM 構造を維持し、task badge の DOM 導出が正しく動作する。

---

## 4. 既知制約

| 制約 | 詳細 |
|------|------|
| 対象 archetype は 3 種 | textlog / todo / form のみ。他の archetype 追加時は `structuredArchetypes` Set と `presenterMap` の両方を更新する必要がある |
| `syncDomPropertiesToHtml` の網羅性 | textarea / select / checkbox のみ対応。新しいフォーム要素種別が増えた場合は同期漏れのリスクがある |
| entry-window.ts の責務肥大 | 構造化エディタの追加で inline script がさらに大きくなった。将来の分割候補だが、今回は非対象 |
| presenter の直接 import | `getPresenter()` レジストリは `main.ts` で初期化されるため、テスト環境や entry-window build-time では使用不可。直接 import で回避している |
| collectStructuredBody の JSON key 順依存 | 文字列比較 dirty 判定のため、key 挿入順序が変わると false positive dirty が発生する。現行は安定しているが、presenter 側の変更時に注意が必要 |

---

## 5. Source of Truth

| 項目 | source of truth | 参照先 |
|------|-----------------|--------|
| 構造化エディタ生成 | 各 presenter の `renderEditorBody()` | `textlog-presenter.ts`, `todo-presenter.ts`, `form-presenter.ts` |
| outerHTML 前同期 | `syncDomPropertiesToHtml()` | `entry-window.ts` |
| child-side body 収集 | `collectStructuredBody()` | `entry-window.ts` inline script |
| child-side cancel 復元 | `restoreStructuredEditor()` | `entry-window.ts` inline script |
| dirty 判定 | `isEntryDirty()` | `entry-window.ts` inline script |
| body-view 再描画 | `renderBodyView()` | `entry-window.ts` inline script |

---

## 6. 再発ポイント

以下の変更時に、この契約が壊れるリスクがある:

| 変更 | リスク | 確認方法 |
|------|--------|---------|
| presenter に新しいフォーム要素を追加 | `syncDomPropertiesToHtml` の同期漏れ | entry window で値が初期値に戻っていないか確認 |
| presenter の `renderEditorBody` の JSON key 順変更 | `collectStructuredBody` との key 順不一致 → 永久 dirty | dirty state policy テストの textlog ケースで検出可能 |
| 新しい structured archetype の追加 | `structuredArchetypes` / `presenterMap` / `collectStructuredBody` / `restoreStructuredEditor` の 4 箇所に追加漏れ | entry window で raw JSON が見えたら漏れ |
| entry-window.ts のリファクタ | inline script 内の関数が壊れる | entry-window.test.ts + dirty-state-policy テストで検出 |

---

## 7. テスト

### 既存テスト（修正・追加なし）

| ファイル | テスト数 | 内容 |
|----------|---------|------|
| `tests/adapter/entry-window.test.ts` | 19 件（構造化エディタ分） | TEXTLOG/todo/form エディタ表示、CSS 存在、child-side 関数、useStructuredEditor フラグ |
| `tests/adapter/entry-window-dirty-state-policy.test.ts` | 11 件 | dirty state policy（textlog ケースは有効な JSON body で round-trip 検証） |

---

## 8. 変更ファイル一覧

### 実装変更あり

| ファイル | 変更内容 |
|----------|----------|
| `src/adapter/ui/entry-window.ts` | `syncDomPropertiesToHtml()` ヘルパー抽出、presenter import、構造化エディタ生成、`collectStructuredBody()` / `restoreStructuredEditor()` / `renderBodyView()` / `updateTaskBadge()` 追加、inline CSS 追加 |
| `tests/adapter/entry-window.test.ts` | 構造化エディタテスト 19 件追加 |
| `tests/adapter/entry-window-dirty-state-policy.test.ts` | textlog テストを有効 JSON body + 構造化エディタフィールド変更に修正 |

### 変更なし

| ファイル | 理由 |
|----------|------|
| `src/adapter/ui/textlog-presenter.ts` | presenter 自体は変更不要。entry-window が output を利用するだけ |
| `src/adapter/ui/todo-presenter.ts` | 同上 |
| `src/adapter/ui/form-presenter.ts` | 同上 |
| `src/adapter/ui/renderer.ts` | main window 側は変更なし |
| `src/adapter/ui/action-binder.ts` | protocol / dispatch 経路は変更なし |
| reducer | action 追加なし |

---

## 9. Non-goals

| 項目 | 理由 |
|------|------|
| entry-window.ts の大規模分割 | 責務肥大は認識しているが、今回は stabilization のみ |
| presenter / entry-window の全面共通化 | 今回は presenter output の再利用で十分 |
| 新しい editor framework | scope 外 |
| `getPresenter()` レジストリの entry-window 対応 | テスト環境との整合が複雑。直接 import で十分 |
