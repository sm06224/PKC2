# 16. 基盤方針追補 — versioning / UX操作契約 / Issue案

---

## 16.1 versioning / build metadata 方針

### 16.1.1 バージョン体系

PKC2 は 3 軸でバージョンを管理する:

```
semver:     2.1.3
kind:       dev | stage | product
build_at:   20260406143052  (14桁 YYYYMMDDHHmmss)
```

| 軸 | 用途 | 例 |
|----|------|-----|
| **semver** | コード互換性判断。breaking change = major up | `2.1.3` |
| **kind** | リリース品質段階。CI/CDで自動付与 | `dev` / `stage` / `product` |
| **build_at** | ユーザー向けビルド識別。再現性確保 | `20260406143052` |

### 16.1.2 schema バージョン

semver とは別に、データスキーマバージョンを独立管理する:

| schema | 意味 | semver との関係 |
|--------|------|----------------|
| 1 | 初期スキーマ | 2.0.x |
| 2 | スキーマ変更 | semver major up（3.0.0） |

rehydrate 時に `pkc-meta.schema` を確認し、
必要ならマイグレーションを実行する。

### 16.1.3 release-builder での metadata 生成

```typescript
// build/version.ts
import { execSync } from 'child_process';

export function generateMeta(): ReleaseMeta {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const build_at = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const kind = process.env.PKC_KIND ?? 'dev';
  const commit = execSync('git rev-parse --short HEAD').toString().trim();

  return {
    version: pkg.version,
    schema: 1,
    build_at,
    kind,
    code_integrity: '', // release-builder が後で計算
    source_commit: commit,
  };
}
```

### 16.1.4 ユーザー向け表示

```
PKC2 v2.1.3 (product) build 20260406143052
```

About ダイアログで表示。`pkc-meta` から取得。

---

## 16.2 UX 操作契約

### 16.2.1 操作順序バグ抑止: 状態機械

> **操作順序依存バグは PKC2 の最重要非機能要件として抑止する。**

PKC1 の教訓:
- グローバル `S` の `workingEdit` が null かどうかで振る舞いが変わる
- `renderList()` → `selectEntry()` → `renderDetail()` の順序が暗黙に固定
- IIFE が既存関数を wrap し、実行順序で挙動が変わる

PKC2 の対策: **明示的な状態機械 + action dispatch パターン**

```typescript
// src/adapter/state/app-state.ts

type AppPhase =
  | 'initializing'     // rehydrate 中
  | 'ready'            // 通常操作可能
  | 'editing'          // Record 編集中
  | 'exporting'        // export 処理中
  | 'error';           // エラー状態

interface AppState {
  phase: AppPhase;
  container: Container;
  selectedLid: string | null;
  // ... 以下略
}

type Action =
  | { type: 'SELECT_RECORD'; lid: string }
  | { type: 'BEGIN_EDIT'; lid: string }
  | { type: 'COMMIT_EDIT'; payload: RecordPayload }
  | { type: 'CANCEL_EDIT' }
  | { type: 'CREATE_RECORD'; archetype: ArchetypeId }
  | { type: 'DELETE_RECORD'; lid: string }
  | { type: 'BEGIN_EXPORT' }
  | { type: 'FINISH_EXPORT' }
  // ...

function reduce(state: AppState, action: Action): AppState {
  switch (state.phase) {
    case 'editing':
      // editing 中に許可される action のみ処理
      switch (action.type) {
        case 'COMMIT_EDIT': return { ...state, phase: 'ready', /* ... */ };
        case 'CANCEL_EDIT': return { ...state, phase: 'ready', /* ... */ };
        default:
          console.warn(`Action ${action.type} blocked in phase ${state.phase}`);
          return state; // 無視（操作順序バグの防止）
      }
    case 'ready':
      // ... ready 時の action 処理
    // ...
  }
}
```

**核心**: 各 `AppPhase` で許可される `Action` の型を明示し、
不正な操作順序を **実行時に無視** + **開発時に警告** する。

### 16.2.2 ショートカット / click / double-click / D&D 契約

| 操作 | 振る舞い | 条件（phase） |
|------|---------|--------------|
| **Click** (リスト項目) | Record 選択 | ready |
| **Double-click** (リスト項目) | Record 編集開始 | ready |
| **Click** (フォルダ) | フォルダ展開/折り畳み | ready |
| **Ctrl+S / Cmd+S** | 編集確定 | editing |
| **Escape** | 編集キャンセル / ダイアログ閉じ | editing / dialog |
| **Ctrl+N / Cmd+N** | 新規 Record 作成 | ready |
| **Delete / Backspace** | 選択 Record 削除（確認付き） | ready |
| **Ctrl+Z / Cmd+Z** | Undo（1操作戻し） | ready |
| **Drag** (リスト項目) | フォルダ移動開始 | ready |
| **Drop** (フォルダ) | フォルダ移動確定 | ready (dragging) |
| **Drop** (外部ファイル) | ファイル import | ready |
| **Ctrl+F / Cmd+F** | 検索フォーカス | ready |

**規約**:
- すべてのキーボードショートカットは `src/adapter/ui/keybindings.ts` に一元管理
- ショートカットは phase に応じて有効/無効が切り替わる
- ユーザーカスタマイズは将来対応（Phase 2以降）

### 16.2.3 HELP / 多言語方針

**HELP**: 各画面要素に `data-pkc-help="key"` 属性を付与。
ヘルプ表示時に `key` からヘルプテキストを引く:

```typescript
// src/adapter/ui/help.ts
const helpTexts: Record<string, Record<string, string>> = {
  'sidebar.folder': {
    ja: 'フォルダを作成してレコードを整理できます',
    en: 'Create folders to organize records',
  },
  'detail.save': {
    ja: 'Ctrl+S で保存。変更は新しいリビジョンとして記録されます',
    en: 'Press Ctrl+S to save. Changes are recorded as a new revision',
  },
};
```

**多言語**: 初期は日本語のみ。ただし以下の構造を最初から維持:

1. UI文字列はハードコードしない
2. `src/adapter/ui/i18n.ts` に文字列定義を集約
3. 表示時は `msg('key')` 関数経由
4. Phase 2 以降で言語切り替え UI を追加

```typescript
// src/adapter/ui/i18n.ts
type Locale = 'ja' | 'en';
let currentLocale: Locale = 'ja';

const messages: Record<Locale, Record<string, string>> = {
  ja: {
    'action.save': '保存',
    'action.cancel': 'キャンセル',
    'action.delete': '削除',
    'status.saved': '保存しました',
    // ...
  },
  en: { /* Phase 2 */ },
};

export function msg(key: string): string {
  return messages[currentLocale]?.[key] ?? key;
}
```

---

## 16.3 Issue #1 修正版スコープ

旧 Issue #1（`08_初期Issue案.md`）は「TypeScript + Vite のセットアップ」だったが、
本追補を反映して以下に修正する:

### Issue #1 修正版: プロジェクト基盤セットアップ

**Phase**: 0
**目的**: 5層アーキテクチャの骨格確立 + 2段階ビルドの動作確認

**内容**:

1. **package.json**: TypeScript, Vite, Vitest, terser
2. **tsconfig.json**: strict mode, path aliases
3. **ディレクトリ骨格**:
   ```
   src/core/           # 空の index.ts
   src/adapter/        # 空の index.ts
   src/features/       # 空の index.ts
   src/runtime/        # 空の index.ts
   src/runtime/contract.ts  # SLOT 定数定義
   src/main.ts         # 最小ブートストラップ
   build/vite.config.ts
   build/release-builder.ts  # 最小版: JS+CSS→HTML インライン化
   build/shell.html
   tests/core/         # 空の placeholder.test.ts
   ```
4. **Stage 1**: `npm run build:bundle` で `dist/bundle.js` + `dist/bundle.css` 生成
5. **Stage 2**: `npm run build:release` で `dist/pkc2.html` 生成
6. **統合**: `npm run build` で Stage 1 + 2 を通し実行
7. **開発**: `npm run dev` で Vite dev server 起動
8. **テスト**: `npm test` で Vitest 実行
9. **ESLint**: core の依存方向ルール設定
10. **release-builder 最小版**: shell.html に JS/CSS をインライン化するだけ

**含めないもの**:
- データモデル型定義（Issue #2）
- UI実装
- IDB / rehydrate
- integrity hash 計算（後の Issue で追加）

**完了条件**:
- `npm run build` で `dist/pkc2.html` が生成され、ブラウザで開ける
- `pkc2.html` 内に `<script id="pkc-core">` `<script id="pkc-data">` `<script id="pkc-meta">` が存在
- `npm test` が通る
- `src/core/` 内から `document` 等を import すると ESLint エラーになる

---

## 16.4 次に起票すべき Issue 案（追補分）

既存 Issue #2-#12 に加え、本追補で必要になった Issue:

| 優先 | Issue | Phase | 依存 |
|------|-------|-------|------|
| 1.5 | release artifact 契約の実装（contract.ts + shell.html） | 0 | #1 |
| 2.5 | PKC-Message 型定義 | 0 | #2 |
| 5.5 | ESLint 依存方向ルール整備 | 0 | #1 |
| 6.5 | 状態機械(AppPhase + Action dispatch) | 1 | #6 |
| 7.5 | keybindings 一元管理 + phase 連動 | 1 | #6.5, #7 |
| 12.5 | release-builder 完全版（integrity hash + metadata） | 1 | #12 |
| 13 | i18n 基盤（msg() 関数 + 文字列集約） | 1 | #7 |
| 14 | clone 生成（空 clone） | 1 | #12 |
| 15 | adapter/external/ Markdown adapter | 2 | #8 |

### 統合 Issue 一覧（修正版）

| 優先 | Issue | Phase |
|------|-------|-------|
| 1 | プロジェクト基盤セットアップ（修正版） | 0 |
| 1.5 | release artifact 契約実装 | 0 |
| 2 | コアデータモデル型定義 | 0 |
| 2.5 | PKC-Message 型定義 | 0 |
| 3 | Archetype インターフェース + dispatch registry | 0 |
| 4 | 基礎ドキュメント整備 | 0 |
| 5 | コアモデル単体テスト | 0 |
| 5.5 | ESLint 依存方向ルール | 0 |
| 6 | 状態管理レイヤー | 1 |
| 6.5 | AppPhase 状態機械 + Action dispatch | 1 |
| 7 | 最小UIシェル | 1 |
| 7.5 | keybindings 一元管理 | 1 |
| 8 | Record CRUD + text Archetype | 1 |
| 9 | Relation CRUD | 1 |
| 10 | Revision 管理 | 1 |
| 11 | IDB 永続化 | 1 |
| 12 | HTML Export / Rehydrate | 1 |
| 12.5 | release-builder 完全版 | 1 |
| 13 | i18n 基盤 | 1 |
| 14 | clone 生成（空 clone） | 1 |
| 15 | adapter/external Markdown adapter | 2 |
