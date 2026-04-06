# 11. 基盤方針追補 — Vite の効用と限界

本文書は `05_設計原則.md` §5.7「単一HTMLビルドの位置づけ」を深掘りし、
Vite に何を任せ、何を Vite の外で守るべきかを明確にする。

---

## 11.1 Vite が楽にすること（Vite の責務）

| # | 責務 | 説明 |
|---|------|------|
| V-1 | **TypeScript → JavaScript 変換** | tsc 代替の高速トランスパイル |
| V-2 | **モジュール解決** | ESM import/export の依存グラフ解決 |
| V-3 | **開発サーバー（HMR）** | `npm run dev` で即時プレビュー + ホットリロード |
| V-4 | **CSS のバンドル** | import された CSS を JS と統合 |
| V-5 | **Tree shaking** | 未使用コードの除去 |
| V-6 | **minify（terser/esbuild）** | JS/CSS の圧縮 |
| V-7 | **依存パッケージの事前バンドル** | node_modules の ESM 変換キャッシュ |

**Vite は「ソースの変換とバンドル」に特化したツールであり、
PKC2 の本質的な問題（単一HTML契約、clone同型性、sandbox主権など）は解決しない。**

---

## 11.2 Vite では解決しない本質課題

| # | 課題 | 理由 |
|---|------|------|
| NV-1 | **単一HTML生成** | Vite標準のHTMLビルドはJS/CSSを外部ファイルに分離する。インライン化は別途必要 |
| NV-2 | **データ埋め込み** | ユーザーデータをHTMLに埋め込む工程はランタイム処理であり、ビルド時タスクではない |
| NV-3 | **rehydrate** | HTML→データ復元はランタイムパーサーの問題 |
| NV-4 | **clone同型性** | clone時にコード+構造を複製する契約はアプリケーションロジック |
| NV-5 | **sandbox主権** | iframe埋め込み時のオリジン分離・通信制御はブラウザAPI設計 |
| NV-6 | **PKC-Message** | コンテナ間通信プロトコルはアプリケーション層 |
| NV-7 | **操作順序バグ抑止** | 状態遷移設計は Vite と無関係 |
| NV-8 | **バージョン埋め込み** | release metadataの生成・埋め込みはカスタムビルドステップ |
| NV-9 | **外部ライブラリの中間層** | adapter 設計はアーキテクチャ判断 |

---

## 11.3 Vite の責務境界

```
┌─────────────────────────────────────────────────┐
│                 正本 (repository)                 │
│  src/  docs/  tests/                             │
│  ↑ 人間とAIが読み書きする対象                      │
└─────────┬───────────────────────────────────────┘
          │
     ┌────▼─────────────────────────┐
     │  Stage 1: Vite (バンドラ)      │
     │  TS→JS, CSS結合, tree-shake   │
     │  minify, 依存解決              │
     │  → 中間成果物: dist/bundle.*   │
     └────┬─────────────────────────┘
          │
     ┌────▼─────────────────────────┐
     │  Stage 2: release-builder     │
     │  (PKC2 独自スクリプト)          │
     │  - JS/CSSをHTMLにインライン化  │
     │  - release metadataを埋め込み  │
     │  - データ領域プレースホルダ挿入  │
     │  - integrity hash 生成         │
     │  → 最終成果物: dist/pkc2.html  │
     └────┬─────────────────────────┘
          │
     ┌────▼─────────────────────────┐
     │  Stage 3: runtime             │
     │  (ブラウザ内)                   │
     │  - rehydrate                  │
     │  - clone 生成                  │
     │  - export (データ埋め込みHTML)   │
     │  - sandbox / message          │
     └──────────────────────────────┘
```

**核心原則: Vite は Stage 1 のみ担当する。Stage 2・3 は PKC2 独自設計。**

---

## 11.4 build pipeline の段階定義

### Stage 1: `npm run build:bundle` — Vite が担当
- 入力: `src/**/*.ts`, `src/**/*.css`
- 出力: `dist/bundle.js`, `dist/bundle.css`（中間ファイル、配布しない）
- 責務: モジュール解決、TS変換、tree shaking、minify

### Stage 2: `npm run build:release` — release-builder が担当
- 入力: `dist/bundle.js`, `dist/bundle.css`, `src/shell.html`（テンプレート）
- 出力: `dist/pkc2.html`（最終成果物）
- 責務:
  - JS/CSSをHTMLテンプレートにインライン化
  - `<script id="pkc-data">` プレースホルダ挿入
  - release metadata（version, build_at, integrity）埋め込み
  - コード領域の integrity hash 計算

### Stage 3: runtime — ブラウザ内で実行
- clone生成: 自身のHTMLを複製し、新しいデータを埋め込む
- export: 現在のデータをHTML内に埋め込んで保存
- rehydrate: HTMLを開いた際にデータ領域からデータを復元

### 統合コマンド
```
npm run build          # Stage 1 + Stage 2 の通し実行
npm run build:bundle   # Stage 1 のみ（Vite）
npm run build:release  # Stage 2 のみ（release-builder）
npm run dev            # Vite dev server（開発時、Stage 2なし）
npm test               # Vitest（コアモデル + 状態 + IO）
```

---

## 11.5 minify-safe のためのコーディング規約

Vite/terser の minify で破綻しやすいパターンと対策:

| # | 危険パターン | 対策 |
|---|-------------|------|
| M-1 | `eval()` / `new Function()` | **禁止**。動的コード生成は使わない |
| M-2 | 文字列での関数名参照 `obj["methodName"]` | 定数キーまたは Symbol で参照 |
| M-3 | `innerHTML` 内の関数呼び出し `onclick="foo()"` | addEventListener で登録。HTML文字列にJS名を書かない |
| M-4 | グローバル変数への依存 `window.XXX` | モジュールスコープで閉じる。公開APIは明示的なexport |
| M-5 | HTML属性でのJS参照 `data-handler="save"` | ディスパッチャーで解決。文字列→関数マッピングを明示登録 |
| M-6 | CSS class名のJS内ハードコード | CSS classは定数ファイルに集約。または CSS Modules |
| M-7 | JSON.parse(JSON.stringify()) の型喪失 | structuredClone() を使う。型アサーションを明示 |

**統一規約**: JS側からDOM要素を特定する場合は `data-pkc-*` 属性を使い、
CSS class名を機能セレクタとして使わない。

---

## 11.6 Vite 推奨構成案

```
build/
├── vite.config.ts        # Stage 1 設定
├── release-builder.ts    # Stage 2 スクリプト
└── shell.html            # 単一HTMLテンプレート（Stage 2入力）
```

### vite.config.ts の方針
```typescript
// 概要のみ — 実装は Issue #1 で行う
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],        // 単一スコープに閉じる
      name: 'PKC2',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,  // 動的importも1ファイルに
      },
    },
    cssCodeSplit: false,         // CSSを分割しない
    minify: 'terser',
    terserOptions: {
      mangle: { reserved: [] }, // 必要なら予約語を追加
    },
  },
});
```

### shell.html の構造（Stage 2 テンプレート）
```html
<!DOCTYPE html>
<html lang="ja" data-pkc-version="{{VERSION}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>PKC2</title>
  <style id="pkc-styles">{{CSS}}</style>
</head>
<body>
  <div id="pkc-root"></div>
  <script id="pkc-data" type="application/json">{{DATA}}</script>
  <script id="pkc-meta" type="application/json">{{META}}</script>
  <script id="pkc-core">{{JS}}</script>
</body>
</html>
```

---

## 11.7 Vite 非依存で守るべき原則一覧

これらは Vite を別のバンドラに変えても不変であるべき原則:

1. **正本はソースコード**: `src/` `docs/` `tests/` が正本。`dist/` は派生物
2. **Stage 2 は自前**: 単一HTML化はPKC2独自スクリプトが担う
3. **データ領域の明確な分離**: `<script id="pkc-data">` に全データ。コードと混在しない
4. **metadata の明確な分離**: `<script id="pkc-meta">` にバージョン・hash等
5. **コア（src/core/）はブラウザAPI非依存**: Node.js/Deno でもテスト可能
6. **minify-safe コーディング**: M-1〜M-7 の規約遵守
7. **外部依存の中間層**: adapter 経由でのみ外部ライブラリにアクセス
8. **操作順序の明示的管理**: 状態機械ベースの遷移制御
