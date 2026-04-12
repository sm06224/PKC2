# UI Readability & Editor Sizing Hardening

Status: CANDIDATE
Created: 2026-04-12

---

## 1. Summary

3 つの UX 問題を 3 slice に分離して修正する。

| Slice | 問題 | 性質 | 優先度 | Status |
|-------|------|------|--------|--------|
| B | Sandbox PDF に CRT scanline overlay が乗る | バグ | 最高 | **COMPLETED** |
| C | 編集モード textarea のサイズ追従が不自然 | UX 不具合 | 高 | CANDIDATE |
| A | Markdown rendered HTML の行間/密度 | UX 改善 | 中 | CANDIDATE |

実装順: B → C → A

---

## 2. 現状棚卸し

### 2-A. Markdown CSS

**ルート**:
- `#pkc-root`: `font-size: 13px`, `line-height: 1.4`
- `--font-sans` = `--font-mono` = 同一モノスペースフォントスタック（`'BIZ UDGothic', 'Share Tech Mono', ...`）

**view-body コンテナ** (`base.css:794-805`):
- `font-family: var(--font-mono)`, `font-size: 0.8rem` (= 10.4px), `line-height: 1.5`
- `padding: 0.5rem 0.75rem`

**markdown rendered** (`base.css:808-941`):
- `.pkc-md-rendered`: `font-family: var(--font-body)` — **未定義変数**。親の `--font-mono` にフォールバック
- heading margins: `0.5em 0 0.25em` + h1=1.3rem, h2=1.15rem, h3=1.0rem
- paragraph margin: `0.35em 0`
- list margin: `0.35em 0`, item margin: `0.15em 0`
- code block font-size: `0.8rem`
- **line-height は `.pkc-md-rendered` 自体に未指定** → 親の `1.5` を継承

**未定義 CSS 変数**:
| 変数 | 参照行 | フォールバック |
|------|--------|-------------|
| `--font-body` | 809 | 親の `--font-mono`（モノスペース） |
| `--radius-sm` | 826, 833 | `0`（border-radius なし） |
| `--c-text-dim` | 846 | `inherit`（`--c-fg`） |
| `--c-text` | 925 | `inherit`（`--c-fg`） |

**分析**: 行間が広い主因は `line-height: 1.5` × モノスペース。モノスペースは
プロポーショナルフォントより字間が広いため、`1.5` でも視覚的な行間が大きくなる。
さらに `--font-body` が未定義で markdown もモノスペースになっている。

### 2-B. PDF Scanline Overlay

**根本原因特定済み**: `#pkc-root::after` (base.css:113-126, 130-143)

```css
#pkc-root::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: repeating-linear-gradient(
    0deg,
    transparent, transparent 2px,
    rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px
  );
}
```

- `position: fixed` + `inset: 0` + `z-index: 9999` で viewport 全面を覆う
- dark mode および非 light-support 環境で適用
- `pointer-events: none` でクリックは透過するが、**視覚的に全コンテンツに乗る**
- PDF は `<embed>`/`<iframe>`/`<object>` で表示されるが、これらは独自レンダリング面を持つ
- ただし CSS overlay は **iframe の上にも描画される**（同一 origin 内の fixed 要素として）
- light mode では scanline なし

**影響範囲**:
| 要素 | クラス | 影響 |
|------|--------|------|
| PDF (center pane) | `.pkc-attachment-pdf-preview` | scanline 被り |
| PDF (inline) | `.pkc-inline-pdf-preview` | scanline 被り |
| HTML sandbox | `.pkc-attachment-html-preview` | scanline 被り |
| Video/Audio | `.pkc-attachment-video-preview` | 軽微（動画は視覚的に目立ちにくい） |

**entry window は影響なし**: entry window は `#pkc-root` の子ではなく別 window のため、scanline pseudo-element は存在しない。

### 2-C. Editor Textarea Sizing

**センターペイン TEXT 編集** (`detail-presenter.ts:80-89`, `base.css:1015-1027`):
- `pkc-text-split-editor`: CSS grid `1fr 6px 1fr`, `min-height: 200px`
- textarea `rows=10`, `.pkc-editor-body` 内で `height: 100%`, `min-height: 200px`
- `resize: vertical` — ユーザが手動で縦伸縮可能
- grid が `flex: 1` の `.pkc-center-content` 内にあるが、**grid 自体は stretch しない**

**Entry window TEXT 編集** (`entry-window.ts:1216`):
- textarea `rows=10`, `.pkc-editor-body` の `min-height: 120px`
- `resize: vertical`
- **viewport 追従なし**: `#edit-pane` に `flex: 1` や `height` 指定がない
- body は `display: flex; flex-direction: column; min-height: 100vh`
- `.pkc-window-content` は `flex: 1; overflow-y: auto`
- しかし `#edit-pane` は通常の block で flex 子ではない（`.pkc-window-content` の子）

**構造化エディタ**: textlog `rows=2`/per-row, todo description `rows=5`, form note `rows=4` — いずれも固定

**問題の本質**:
1. センターペイン: split-editor grid が `flex: 1` を持つ `.pkc-center-content` 内にあるが、grid 自体は固定高さ。短い body でも長い body でも同じ 200px
2. Entry window: textarea が viewport を埋めない。大きな別窓を開いても小さな textarea が上部に固定
3. 両方とも auto-resize ロジックが存在しない

---

## 3. Slice 設計

### Slice B: Sandbox PDF Readability Bug Fix

#### 問題

CRT scanline overlay (`#pkc-root::after`) が `z-index: 9999` で viewport 全面を覆い、
PDF / HTML sandbox / video プレビューの視認性を低下させている。

#### 修正方針

**案 1: scanline の z-index を下げ、preview 要素に `isolation: isolate` + 高い z-index を付与**
- scanline 自体を消さずテーマ性を維持
- PDF / sandbox 面だけ scanline の上に出す
- 問題: `position: fixed` の pseudo-element は stacking context を無視する場合がある

**案 2: preview 要素の stacking context を `position: relative; z-index: 10000` で上昇**
- simpler: preview 系要素に `position: relative; z-index: 10000` を付けるだけ
- 問題: `z-index: 10000` は他の要素との競合リスク

**案 3: scanline overlay を preview 領域で clip する**
- scanline の `background` を `clip-path` で preview 領域を避ける
- 問題: 動的な preview 位置に追従するのが困難

**推奨: 案 2（preview 要素の z-index 上昇）**

理由:
- 最小差分（CSS 数行）
- 確実に動作する
- scanline のテーマ性を維持
- preview 要素は元々 content 上で最前面に表示されるべき

#### 対象セレクタ

```css
.pkc-attachment-pdf-preview,
.pkc-inline-pdf-preview,
.pkc-attachment-html-preview,
.pkc-attachment-video-preview,
.pkc-attachment-audio-preview {
  position: relative;
  z-index: 10000;
}
```

#### 受け入れ条件

| # | 条件 | 検証 |
|---|------|------|
| B-1 | PDF preview に scanline pattern が視認されない | 手動: dark mode で PDF attachment 表示 |
| B-2 | HTML sandbox に scanline pattern が視認されない | 手動: dark mode で HTML sandbox 表示 |
| B-3 | light mode で表示に変化がない | 手動: light mode で各 preview 表示 |
| B-4 | scanline は非 preview 領域で維持される | 手動: sidebar / detail 文字列上で確認 |
| B-5 | preview 要素のクリック/スクロールが正常 | 手動: PDF スクロール、HTML sandbox 操作 |
| B-6 | task badge / checkbox が正常 | 自動: 既存テスト pass |

---

### Slice C: Editor Sizing Policy

#### 問題

| 編集導線 | 現状 | 期待 |
|---------|------|------|
| センターペイン | split-editor `min-height: 200px` 固定 | 横: container 追従（現状 OK）、縦: content 行数ベース or 最低 15 行 |
| Entry window | `rows=10`, `min-height: 120px` | 縦横とも window/viewport 追従 |

#### 修正方針

**センターペイン**:
- `rows` 属性を body の行数から動的に計算する
- 最低 15 行を保証
- 計算式: `max(15, bodyLineCount + 3)`（+3 は余白行）
- split-editor の `min-height` を `300px` に引き上げ
- auto-resize は **やらない**（入力中の動的リサイズは UX 的に不安定）
- `resize: vertical` は維持（ユーザ手動調整を許容）

実装場所: `detail-presenter.ts` の `renderEditorBody()` 内で `rows` を動的設定

**Entry window**:
- `#edit-pane` に `display: flex; flex-direction: column; flex: 1` を追加
- textarea に `flex: 1` を追加し、`.pkc-window-content` の残高を埋める
- `min-height` 制約は維持
- `max-width: 720px` は維持

実装場所: `entry-window.ts` inline CSS + テンプレート

**構造化エディタ**: 今回は非対象。固定 rows で十分（per-field エディタは大きくする意味がない）

#### 受け入れ条件

| # | 条件 | 検証 |
|---|------|------|
| C-1 | センターペイン: 短い body (3 行) → textarea 15 行分の高さ | 手動 |
| C-2 | センターペイン: 長い body (50 行) → textarea 53 行分の高さ | 手動 |
| C-3 | Entry window: 大きなウィンドウ → textarea が window を埋める | 手動 |
| C-4 | Entry window: 小さなウィンドウ → textarea が最小限で表示される | 手動 |
| C-5 | `resize: vertical` が引き続き機能する | 手動 |
| C-6 | 構造化エディタ (textlog/todo/form) は変更なし | 手動 + 自動 |
| C-7 | dirty state policy が不変 | 自動: dirty-state-policy テスト pass |
| C-8 | split-editor preview pane が正常に連動 | 手動 |

---

### Slice A: Markdown Readability Hardening

#### 問題

1. `line-height: 1.5` がモノスペースでは視覚的に広すぎる
2. `--font-body` が未定義で markdown がモノスペース表示になっている
3. いくつかの CSS 変数（`--radius-sm`, `--c-text-dim`, `--c-text`）が未定義

#### 修正方針

**line-height 調整**:
- `.pkc-view-body` の `line-height: 1.5` → `1.45` に微減
- `.pkc-md-rendered` に明示的 `line-height: 1.4` を追加（本文テキストの密度向上）
- code block (`pre code`) は `line-height: 1.35` に設定（コード閲覧は密度優先）

**font-size はそのまま**:
- `0.8rem` (10.4px) は PKC2 のテーマ（ターミナル風）に合致している
- font-size 変更は typography system 全体への波及が大きく、今回は scope 外

**未定義 CSS 変数を定義**:
```css
:root {
  --font-body: var(--font-sans);  /* markdown body font */
  --radius-sm: 1px;               /* small border radius */
  --c-text-dim: var(--c-muted);   /* dimmed text color */
  --c-text: var(--c-fg);          /* standard text color */
}
```
**注意**: `--font-sans` = `--font-mono` = 同一フォントスタック（PKC2 テーマ方針）。
`--font-body` を定義することで、将来プロポーショナルフォントに切り替える基盤を作る。
ただし今回はモノスペースのまま（テーマ一貫性を維持）。

**paragraph/list spacing はそのまま**:
- `p { margin: 0.35em 0 }` は既にタイトで妥当
- `li { margin: 0.15em 0 }` も適切
- heading margins `0.5em 0 0.25em` も適切

#### 受け入れ条件

| # | 条件 | 検証 |
|---|------|------|
| A-1 | markdown 本文の行間が目視で改善されている | 手動: 長文 TEXT entry で比較 |
| A-2 | code block の行間が密になっている | 手動: fenced code block 表示 |
| A-3 | heading / list / paragraph の間隔が崩れていない | 手動: 各要素の混在表示 |
| A-4 | task checkbox の配置が崩れていない | 自動: 既存テスト pass + 手動確認 |
| A-5 | `--radius-sm` でコードブロック角丸が出る | 手動: inline code / fenced code |
| A-6 | `--c-text-dim` で blockquote 色が変わる | 手動: blockquote 表示 |
| A-7 | light mode / dark mode 両方で確認 | 手動 |
| A-8 | entry window の markdown 表示も改善される | 手動: entry window 表示確認 |

---

## 4. テスト / 検証計画

### 自動テストで検証するもの

| # | 内容 | 方法 |
|---|------|------|
| T-1 | preview 要素に `position: relative` + `z-index` が付くこと | CSS class / computed style 検証は困難 → テスト非対象 |
| T-2 | textarea rows が content に応じて変わること (Slice C) | `detail-presenter.ts` の renderEditorBody に対する DOM テスト |
| T-3 | entry window textarea に flex 属性が付くこと (Slice C) | entry-window.test.ts で HTML パース |
| T-4 | 未定義 CSS 変数が `:root` に存在すること (Slice A) | build 成果物 or base.css の grep |
| T-5 | dirty state policy 不変 | 既存テスト pass |
| T-6 | task badge 不変 | 既存テスト pass |

### 手動確認で検証するもの

| # | 内容 |
|---|------|
| M-1 | PDF attachment を dark mode で表示 → scanline なし (Slice B) |
| M-2 | HTML sandbox を dark mode で表示 → scanline なし (Slice B) |
| M-3 | 短い TEXT entry のセンターペイン編集 → 15 行以上の textarea (Slice C) |
| M-4 | 長い TEXT entry のセンターペイン編集 → body 行数 + 余白分の textarea (Slice C) |
| M-5 | Entry window でウィンドウサイズ変更 → textarea 追従 (Slice C) |
| M-6 | 長文 markdown の行間が改善されている (Slice A) |
| M-7 | fenced code block の行間が密になっている (Slice A) |
| M-8 | light mode で表示に変化がないこと (全 Slice) |

---

## 5. 変更ファイル一覧（見込み）

### Slice B

| ファイル | 変更 | 行数 (est.) |
|----------|------|-------------|
| `src/styles/base.css` | preview 要素に `position: relative; z-index: 10000` | ~8 |

### Slice C

| ファイル | 変更 | 行数 (est.) |
|----------|------|-------------|
| `src/adapter/ui/detail-presenter.ts` | `rows` 動的計算 | ~5 |
| `src/styles/base.css` | split-editor min-height 調整 | ~2 |
| `src/adapter/ui/entry-window.ts` | `#edit-pane` flex 化、textarea `flex: 1` | ~10 |
| テスト | rows 動的計算 + entry window flex テスト | ~20 |

### Slice A

| ファイル | 変更 | 行数 (est.) |
|----------|------|-------------|
| `src/styles/base.css` | `:root` 変数追加、line-height 調整 | ~10 |

### 変更なし

| ファイル | 理由 |
|----------|------|
| reducer | UI 層の変更のみ |
| action-binder.ts | dispatch 経路に変更なし |
| renderer.ts | DOM 構造に変更なし |
| entry-window.ts (Slice B) | entry window は `#pkc-root` 外のため影響なし |
| protocol | 追加なし |

---

## 6. Non-goals

| 項目 | 理由 |
|------|------|
| font-size 設定 UI | scope 外。密度改善は CSS default で十分 |
| typography customization | ユーザ設定は将来候補 |
| PDF viewer 差し替え | ブラウザ内蔵 viewer を使用。差し替えは別 issue |
| auto-resize textarea | 入力中の動的リサイズは UX 不安定。手動 resize を維持 |
| entry-window.ts 大規模分割 | 別 issue |
| 構造化エディタの sizing 変更 | per-field エディタは固定 rows で十分 |
| CRT scanline の全面廃止 | PKC2 テーマの意匠として維持。preview 面だけ除外 |
| プロポーショナルフォント導入 | `--font-body` 変数は定義するが値は既存モノスペース |

---

## 7. リスク

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| z-index 10000 が他要素と競合 | context menu / overlay が preview の下に隠れる | 既存の z-index を棚卸し（現状 scanline の 9999 が最大） |
| line-height 変更で task checkbox 配置がずれる | badge / checkbox の vertical-align が崩れる | 既存テストで検出 + 手動確認 |
| textarea flex: 1 で structured editor のレイアウトが壊れる | hidden textarea が不要な高さを取る | `display:none` の textarea には flex: 1 を適用しない |
| entry window の split-editor が未対応 | entry window TEXT は split-editor ではなく単一 textarea | entry window 用の sizing は独立で設計済み |
