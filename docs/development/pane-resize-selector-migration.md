# ペインリサイズ data-pkc-* セレクタ移行

## 不変条件違反の内容

`action-binder.ts` のペインリサイズ処理とペイン折りたたみ処理で、
CSS クラス名セレクタ（`.pkc-sidebar`, `.pkc-meta-pane`）が使われていた。

PKC2 の設計方針では、**構造・動作の要素識別は `data-pkc-*` 属性**を一次手段とし、
CSS クラスは見た目専用とする。これに反していた。

## なぜ data-pkc-* に寄せたか

- Minify でクラス名が変わっても壊れない
- DOM 構造とスタイルの責務分離が明確になる
- 既存の renderer はすでに `data-pkc-region="sidebar"` / `data-pkc-region="meta"` を付与していた
- binder 側の取得を揃えるだけで修正完了

## スコープ

今回はペインリサイズ・ペイン折りたたみ処理に限定。

### 変更箇所（action-binder.ts のみ）

| Before | After | 行 |
|--------|-------|-----|
| `.pkc-sidebar` | `[data-pkc-region="sidebar"]` | L828 |
| `.pkc-meta-pane` | `[data-pkc-region="meta"]` | L830 |
| `.pkc-sidebar` / `.pkc-meta-pane` (togglePane) | `[data-pkc-region="sidebar"]` / `[data-pkc-region="meta"]` | L1217 |

renderer.ts は変更不要（すでに正しい `data-pkc-region` が付与済み）。

## 確認事項

- `action-binder.ts` 内に CSS クラスセレクタ（`querySelector('.pkc-*')`）は残っていない
- 全テスト 1174 件パス
- typecheck パス
- ビルドパス
