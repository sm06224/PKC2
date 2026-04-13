# Action Surface Consolidation + Contextual Help Polish

## 1. 概要

PKC2 の機能追加に伴い、ボタンや導線が増えすぎて UX が重くなっている問題を、
**減らす / 隠す / 説明する** の 3 軸で整理する。

新機能の追加はしない。既存機能の surfacing / grouping / labeling の見直しのみ。

---

## 2. 整理方針

### primary action（常時露出）

| 定義 | 日常的に毎回使う操作 |
|------|---------------------|
| 上限 | 2〜4 個 |
| 例   | Edit, Delete, Save, Cancel |

### secondary action（折り畳み内に退避）

| 定義 | たまに使うが毎回は不要な操作 |
|------|---------------------------|
| 手段 | `<details>` 要素で折り畳む |
| 例   | Copy MD, Copy Rendered, Open Viewer, Export/Import |

### maintenance action（シェルメニュー内に退避）

| 定義 | 保守・メンテナンス用の操作 |
|------|---------------------------|
| 手段 | ⚙ メニュー内のセクション |
| 例   | Reset, Orphan Asset Cleanup |

---

## 3. 変更対象一覧

### 3.1 Header Export/Import パネル

**Before**: 8 ボタンがフラットに並ぶ
```
| Export | Light | ZIP | TEXTLOGs | Import | 📥 Import Textlog | 📥 Import Text | ⚠ Reset |
```

**After**: `<details>` で折り畳み
```
[▶ Data…]  ← summary（閉じた状態）
  Export | Light | ZIP | TEXTLOGs  ← export グループ
  | Import | Import Textlog | Import Text  ← import グループ
```

- `⚠ Reset` はシェルメニューの maintenance セクションに移動
- readonly モードでは TEXTLOGs ボタンのみ独立表示（既存維持）

### 3.2 Detail Action Bar

**Before (TEXT/TEXTLOG)**: 最大 7 アイテムがフラットに並ぶ
```
✏️ Edit | 🗑️ Delete | 📋 Copy MD | 🎨 Copy Rendered | 📖 Open Viewer | [compact] 📦 Export
```

**After**: primary + secondary `<details>`
```
✏️ Edit | 🗑️ Delete | [▶ More…]
  📋 Copy MD | 🎨 Copy Rendered | 📖 Open Viewer | [compact] 📦 Export
```

- Edit / Delete = primary（日常操作）
- Copy / Viewer / Export = secondary（参照・共有操作）
- 他の archetype (todo, attachment, folder) は primary のみなので変更なし

### 3.3 コンテキストメニュー

変更なし（既に secondary surface）。ラベル・tooltip の改善のみ。

### 3.4 シェルメニュー

- `⚠ Reset` を maintenance セクションに移動
- Help セクションを追加（主要操作の説明）

---

## 4. ラベル・tooltip 改善

### tooltip を付ける対象
- 全ての `<details>` の `<summary>` 要素
- 意味が不明瞭なボタン（略語・英語のみ）
- secondary アクション内の全ボタン

### ラベル変更基準
- 英語だけでは意味が見えにくいものに日本語サブテキストを追加
- 略称（MD, ZIP 等）はそのまま維持し、tooltip で補足

### 具体的な変更

| 対象 | Before | After (label) | tooltip |
|------|--------|---------------|---------|
| Export/Import 折り畳み | (なし) | Data… | エクスポート・インポート操作 |
| Action bar 折り畳み | (なし) | More… | コピー・表示・エクスポート |
| Export | Export | Export | 全データを HTML でエクスポート |
| Light | Light | Light | アセットなし HTML エクスポート |
| ZIP | ZIP | ZIP | .pkc2.zip パッケージとしてエクスポート |
| TEXTLOGs | TEXTLOGs | TEXTLOGs | 全テキストログをまとめて ZIP エクスポート |
| Import | Import | Import | HTML または ZIP からインポート |
| Import Textlog | 📥 Import Textlog | 📥 Textlog | .textlog.zip を新規エントリとしてインポート |
| Import Text | 📥 Import Text | 📥 Text | .text.zip を新規エントリとしてインポート |
| Copy MD | 📋 Copy MD | 📋 MD | Markdown ソースをクリップボードにコピー |
| Copy Rendered | 🎨 Copy Rendered | 🎨 Rich | Markdown + HTML をリッチコピー |
| Open Viewer | 📖 Open Viewer | 📖 Viewer | 印刷可能なビューを新しいウィンドウで開く |
| Export CSV+ZIP | 📦 Export CSV+ZIP | 📦 Export | CSV + アセット ZIP バンドルをダウンロード |
| Export .text.zip | 📦 Export .text.zip | 📦 Export | Markdown + アセット ZIP バンドルをダウンロード |

---

## 5. Help セクション

シェルメニュー (⚙) 内に「使い方ガイド」セクションを追加。

内容:
- 基本操作（作成 / 編集 / 削除）
- データ操作（Export / Import / ZIP）
- コピー・参照（MD コピー / 参照文字列）
- ショートカット（`Ctrl+?` / `⌘+?` で一覧表示）

長文マニュアルではなく、1 行ずつの usage-oriented な箇条書き。

---

## 6. readonly 時の扱い

- Header: Data… 折り畳みは非表示（既存 export パネルと同じ）
- readonly TEXTLOGs ボタン: 独立表示（既存維持）
- Detail action bar: Edit / Delete は非表示、More… は表示
  （Copy MD / Rendered / Viewer は readonly でも使える）

---

## 7. live state 不変

- ボタンの表示・非表示のみ変更
- reducer / dispatcher への変更なし
- アクションの処理ロジックは一切変更しない

---

## 8. intentionally やらなかったこと

- context menu の構造変更（既に secondary surface）
- 大規模 UI フレームワーク変更
- ドラッグ & ドロップ UI の整理
- 新しい export/import 形式の追加
- archetype 別のアクション体系変更
- JavaScript で制御するドロップダウンメニュー（HTML native `<details>` で十分）

---

## 9. 次候補

- container-wide batch import/export
- folder 配下限定 export
- action surface のカスタマイズ機能
- ユーザー設定による primary/secondary 切り替え
