# TEXT Split Editor Preview — Asset Reference Resolution

## 1. 概要

TEXT split editor の右ペイン（live preview）で、本文中の `asset:` 参照を
既存 resolver で解決し、画像インライン表示 / non-image chip / missing marker を
プレビューに反映する。

**ソース body は一切変更しない**。解決結果は表示専用の一時文字列として生成される。

---

## 2. 解決方針

### 既存 resolver 完全再利用

- `resolveAssetReferences()` (`features/markdown/asset-resolver.ts`) をそのまま使用
- `buildAssetMimeMap()` / `buildAssetNameMap()` (`adapter/ui/renderer.ts`) で context 構築
- split editor preview 専用の asset 解決ルールは一切追加しない

### 解決タイミング

| トリガー             | 遅延     | 備考                                          |
| -------------------- | -------- | --------------------------------------------- |
| 初期表示             | 即座     | `renderEditor()` 内で初回 preview 描画時に解決 |
| Enter keyup          | 1 frame  | `updateTextEditPreview()` で解決後にレンダリング |
| debounced input      | 500ms    | 同上                                          |
| 画像ペースト完了     | 即座     | 同上                                          |

### 早期スキップ

`hasAssetReferences(src)` で `asset:` 参照の存在を事前チェックし、
参照がない場合は resolver を呼ばない。これにより通常のテキスト入力時のオーバーヘッドはゼロ。

---

## 3. 表示仕様

| 参照形式                        | 解決結果                                    |
| ------------------------------- | ------------------------------------------- |
| `![alt](asset:key)` + 画像MIME  | `data:image/*;base64,...` インライン表示     |
| `[label](asset:key)` + 非画像   | `#asset-key` リンク + カテゴリアイコン chip |
| missing key                     | `*[missing asset: key]*` マーカー           |
| unsupported MIME                | `*[unsupported asset: key]*` マーカー       |

全て既存 `resolveAssetReferences()` の出力仕様と同一。

---

## 4. 実装箇所

### `updateTextEditPreview()` (action-binder.ts)

```
textarea.value
  → hasAssetReferences? → resolveAssetReferences(src, ctx) → resolved
  → hasMarkdownSyntax?  → renderMarkdown(resolved) → preview.innerHTML
  → else                → preview.textContent = src
```

context は `dispatcher.getState().container` から毎回構築。
container が変更されても常に最新の asset 状態を反映する。

### `renderEditor()` (renderer.ts)

初期 preview 描画時に、text archetype かつ `hasAssetReferences` の場合のみ
resolver を通す。container は render 関数のスコープから渡される。

---

## 5. source body の保持

- `collectBody()` は textarea の `.value` をそのまま返す
- resolver は preview DOM への反映のみに使用
- 保存データに resolved 結果が混入することはない

---

## 6. intentionally やらなかったこと

- TEXTLOG editor preview の asset 解決（別の表示構造のため別 Issue）
- entry-window の edit-mode Preview（既に別経路で解決済み）
- `renderEditorBody()` interface への context 引数追加（renderer 側で後処理する設計を選択）
- asset context のキャッシュ（毎回構築で十分軽量）
- 非 TEXT archetype への拡張

---

## 7. 次 Issue 候補

- **TEXTLOG CSV の container-wide export**
- TEXTLOG editor preview の asset 解決
- container-wide batch export/import
