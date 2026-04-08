# UX Regression Recovery (Issue #69)

## 1. 発見された退行・未達一覧

| # | 症状 | 分類 | 原因 | 優先度 |
|---|------|------|------|--------|
| 1 | ダブルクリックが発火しない | バグ (退行) | click→SELECT_ENTRY→同期re-render→DOM置換→dblclickバブリング不達 | P0 |
| 2 | Export/Import/Build導線消失 | 一部欠損 | ZIP Exportボタンが未描画（handlerは存在） | P0 |
| 3 | 添付をダウンロードできない | 誤認 | download機能は完全実装済み。UIも存在。 | — |
| 4 | Markdownレンダリング不可 | 未実装 | 設計ドキュメントでは将来機能として記載。過去にも実装歴なし | P1 |

## 2. 原因分類

### バグ: Double-click DOM Race Condition

`handleClick` が `SELECT_ENTRY` をディスパッチすると、同期的に reducer → state listener → `render()` が実行される。再描画で sidebar/calendar/kanban の DOM 要素が全置換されるため、2回目の click で fire される `dblclick` イベントの target 要素がすでに DOM ツリーから切り離されており、root への delegated listener に到達しない。

### UI欠損: ZIP Export ボタン

`mountZipExportHandler()` (main.ts) が `data-pkc-action="export-zip"` の click を listen しているが、renderer がこの action 属性を持つボタンを描画していなかった。

### 誤認: Attachment download

attachment-presenter.ts の `renderBody()` にダウンロードボタンが実装済み。detached panel にも存在。resolveAttachmentData() で新形式 (container.assets) / 旧形式 (body.data) 両方に対応済み。

### 未実装: Markdown rendering

package.json に markdown ライブラリなし。text presenter は `<pre>` + `textContent` で plain text 表示のみ。設計原則 (05_設計原則.md) に「基本Markdown: 自前の最小パーサーで動作」と記載されているが、未着手だった。

## 3. 回復した導線

### P0-A: Double-click 回復

**修正方式**: `MouseEvent.detail` プロパティを利用。

`handleClick` 内で `select-entry` action の処理時に `detail >= 2` を検出し、dblclick アクションを直接実行。これにより DOM 再描画レースを回避。

| 対象 | single click | double click |
|------|-------------|--------------|
| Sidebar | SELECT_ENTRY | detached read-only panel を開く |
| Calendar item | SELECT_ENTRY | BEGIN_EDIT (detail view で編集) |
| Kanban card | SELECT_ENTRY | BEGIN_EDIT (detail view で編集) |

Calendar/Kanban の double-click は `BEGIN_EDIT` を dispatch する。これは既存の viewMode 強制切替 (BEGIN_EDIT → viewMode: 'detail') と連携し、自動的に編集画面を表示する。

従来の `dblclick` イベントリスナーも fallback として残留（DOM が再描画されなかったケース用）。

### P0-B: ZIP Export ボタン追加

`renderExportImportInline()` に ZIP export ボタンを追加。

現在の導線:

| ボタン | action | 動作 |
|--------|--------|------|
| Export | begin-export (full, editable) | 全データ含む HTML ダウンロード |
| Light | begin-export (light, editable) | テキストのみ HTML ダウンロード |
| ZIP | export-zip | .pkc2.zip パッケージダウンロード |
| Import | begin-import | HTML / ZIP ファイル選択 → プレビュー → 置換 |

### P1-D: Markdown レンダリング新規実装

`src/features/markdown/markdown-render.ts` を新規作成。features 層の純粋関数。

**対応構文**:
- Headings (# ～ ######)
- Bold (\*\*text\*\*), Italic (\*text\*), Bold+Italic
- Inline code, Fenced code blocks
- Unordered / Ordered lists
- Blockquotes
- Horizontal rules
- Links, Images
- Paragraphs

**XSS 防御**: 全入力を最初に HTML エスケープしてから markdown 構文を適用。ユーザーコンテンツからの script injection を防止。

**text presenter の変更**: `hasMarkdownSyntax()` で body 内容を判定し、markdown 構文を含む場合は `renderMarkdown()` で HTML 化して `<div class="pkc-md-rendered">` に表示。含まない場合は従来通り `<pre>` + `textContent`。

## 4. 今回 intentionally やらなかったもの

### Attachment 関連
- HTML attachment の sandbox 実行
- per-attachment の sandbox allow 切替 UI
- PDF ブラウザネイティブプレビュー
- 画像のブラウザネイティブ別窓プレビュー
- 動画のブラウザネイティブプレビュー

### Markdown / HTML 関連
- PKC 独自アセット参照文字列 → BLOB URI 解決
- 汎用 HTML レンダリングパイプライン
- KaTeX 数式レンダリング
- コードシンタックスハイライト
- FORM の multiline textarea への markdown 適用

### 新機能
- TEXTLOG archetype
- multi-text 親型アーキタイプ
- document-set 組版機能

## 5. Attachment Preview / Sandbox の将来方針

段階的に実装する:

| Phase | 対象 | 方式 |
|-------|------|------|
| 現在 | 全 MIME | download のみ (実装済み) |
| 次段 | image/* | inline preview (一部実装済み: PNG/JPEG/GIF/WebP/SVG/BMP/ICO) |
| 次段 | application/pdf | `window.open()` + data URI or Blob URL |
| 次段 | video/*, audio/* | `<video>` / `<audio>` タグで inline or 別窓 |
| 将来 | text/html | iframe sandbox + per-file allow 設定 (右ペイン UI) |

HTML sandbox の allow 設定は `container.assets` の metadata 拡張 or entry body の追加フィールドで管理する想定。

## 6. Markdown / HTML Render の段階分け

| Phase | 対象 | 状態 |
|-------|------|------|
| Phase 0 | plain text (pre + textContent) | 既存・維持 |
| Phase 1 | 基本 markdown → HTML (自前パーサー) | **今回実装** |
| Phase 2 | PKC アセット参照 → BLOB URI 解決 | 未実装 |
| Phase 3 | KaTeX / highlight.js (CDN or 埋込) | 未実装 |
| Phase 4 | 汎用 HTML レンダリング + sanitization | 未実装 |

Phase 2 以降は単一 HTML 成約との整合が必要。CDN 利用時のみ有効化するか、ビルド時に埋め込むかの設計判断が先行する。

## 7. 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/adapter/ui/action-binder.ts` | dblclick を detail>=2 で検出、region 別分岐 |
| `src/adapter/ui/renderer.ts` | ZIP export ボタン追加 |
| `src/adapter/ui/detail-presenter.ts` | markdown render import + 条件分岐 |
| `src/features/markdown/markdown-render.ts` | **新規**: 最小 markdown→HTML レンダラー |
| `src/styles/base.css` | `.pkc-md-rendered` 系スタイル追加 |
| `tests/features/markdown/markdown-render.test.ts` | **新規**: 29 テスト |
| `tests/adapter/renderer.test.ts` | 20 テスト追加 (P0-A/B/C, P1-D, non-regression) |
