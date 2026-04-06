# 15. 基盤方針追補 — type system / dispatch / adapter 方針

UI と Entry が透過的な型構造を持ち、類型ごとにディスパッチしやすい設計を定義する。

---

## 15.1 type system 方針

### 15.1.1 discriminated union による型安全ディスパッチ

Record は共通構造だが、Archetype によって body の解釈が異なる。
TypeScript の discriminated union でこれを型安全に表現する:

```typescript
// src/core/model/record.ts
interface RecordBase {
  lid: string;
  title: string;
  body: string;       // 常に文字列（Archetype が解釈）
  archetype: ArchetypeId;
  created_at: string;
  updated_at: string;
}

// Archetype ID は文字列リテラル union
type ArchetypeId =
  | 'text'
  | 'textlog'
  | 'todo'
  | 'form'
  | 'attachment'
  | 'generic'
  | 'opaque';

// Record は archetype フィールドで discriminate
type Record = RecordBase;
// body の型解釈は Archetype レイヤーで行う（Record 自体は string のまま）
```

### 15.1.2 Archetype ディスパッチテーブル

```typescript
// src/core/archetype/archetype.ts
interface Archetype<TView = unknown> {
  /** 類型ID */
  id: ArchetypeId;
  /** body を解釈してビュー用データに変換 */
  parseBody(body: string): TView;
  /** ビュー用データを body 文字列に戻す */
  serializeBody(view: TView): string;
  /** 表示用タイトルの導出（title が空の場合の fallback 等） */
  deriveTitle(record: Record): string;
  /** 状態判定（todo なら open/done 等） */
  getStatus?(record: Record): string | null;
}

// レジストリ
const archetypeRegistry = new Map<ArchetypeId, Archetype>();

export function registerArchetype(arch: Archetype): void {
  archetypeRegistry.set(arch.id, arch);
}

export function getArchetype(id: ArchetypeId): Archetype {
  return archetypeRegistry.get(id) ?? archetypeRegistry.get('generic')!;
}
```

### 15.1.3 Relation の型安全

```typescript
// src/core/model/relation.ts
type RelationKind =
  | 'structural'   // フォルダ所属
  | 'categorical'  // タグ分類
  | 'semantic'     // 意味的参照
  | 'temporal';    // 時間的順序

interface Relation {
  id: string;
  from: string;       // source Record LID
  to: string;         // target Record LID
  kind: RelationKind;
  created_at: string;
  updated_at: string;
}
```

---

## 15.2 UI dispatch 方針

### 15.2.1 Archetype → View コンポーネント dispatch

UI は Record の archetype に基づいてビューを切り替える:

```typescript
// src/adapter/ui/dispatch.ts
interface ViewRenderer {
  /** 詳細ビュー描画 */
  renderDetail(record: Record, container: HTMLElement): void;
  /** 一覧カード描画 */
  renderCard(record: Record, container: HTMLElement): void;
  /** 編集UI描画 */
  renderEditor?(record: Record, container: HTMLElement): void;
}

const viewRegistry = new Map<ArchetypeId, ViewRenderer>();

export function registerView(archetypeId: ArchetypeId, renderer: ViewRenderer): void {
  viewRegistry.set(archetypeId, renderer);
}

export function dispatchView(record: Record): ViewRenderer {
  return viewRegistry.get(record.archetype) ?? viewRegistry.get('generic')!;
}
```

### 15.2.2 feature module の自己登録パターン

各 feature module は初期化時に自身を registry に登録する:

```typescript
// src/features/form/index.ts（Phase 2 以降）
import { registerArchetype } from '../../core/archetype';
import { registerView } from '../../adapter/ui/dispatch';
import { formArchetype } from './archetype';
import { formViewRenderer } from './view';

export function initFormFeature(): void {
  registerArchetype(formArchetype);
  registerView('form', formViewRenderer);
}
```

ブートストラップで呼び出し:

```typescript
// src/main.ts
import { initFormFeature } from './features/form';
// ... Phase / 設定に応じて feature を選択的に初期化
initFormFeature();
```

---

## 15.3 adapter 層と supply-chain defense

### 15.3.1 外部依存の中間層原則

> **PKC core は外部ライブラリを直接 import しない。**
> **adapter/external/ に wrapper を置き、core が依存するのは wrapper のインターフェースのみ。**

```
core  →  adapter/external/markdown-adapter.ts  →  marked (npm)
core  →  adapter/external/diff-adapter.ts      →  diff (npm)
```

adapter は以下を担う:
- 外部ライブラリの API を PKC2 のインターフェースに変換
- ライブラリが未ロード時のフォールバック提供
- ライブラリのバージョン差異を吸収

```typescript
// src/adapter/external/markdown-adapter.ts
export interface MarkdownRenderer {
  render(source: string): string;
}

// marked がある場合
function createMarkedRenderer(): MarkdownRenderer {
  return { render: (s) => marked.parse(s) };
}

// fallback: 最小自前レンダラ
function createFallbackRenderer(): MarkdownRenderer {
  return { render: (s) => minimalMarkdown(s) };
}

export function getMarkdownRenderer(): MarkdownRenderer {
  return typeof marked !== 'undefined'
    ? createMarkedRenderer()
    : createFallbackRenderer();
}
```

### 15.3.2 dependency governance ルール

| ルール | 説明 |
|--------|------|
| **DG-1**: core 内の外部依存は 0 | `src/core/` は npm パッケージを import しない |
| **DG-2**: 外部依存は adapter/external/ 経由のみ | 直接 import を ESLint で禁止 |
| **DG-3**: 新規外部依存の追加は明示的レビュー | PR に `dependency:new` ラベル |
| **DG-4**: devDependencies と dependencies の厳格分離 | ビルドツール = devDeps、ランタイム = deps |
| **DG-5**: ランタイム依存は必ず fallback を持つ | 外部CDNがなくても core 機能は動作 |
| **DG-6**: lockfile は常にコミット | package-lock.json を .gitignore しない |
| **DG-7**: 定期的な audit | `npm audit` を CI で実行 |

### 15.3.3 ESLint による依存方向の強制

```jsonc
// .eslintrc.jsonc (抜粋)
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        {
          "group": ["../../adapter/*", "../../features/*", "../../runtime/*"],
          "message": "core/ からは adapter/features/runtime を import できません"
        }
      ]
    }]
  },
  "overrides": [
    {
      "files": ["src/core/**/*.ts"],
      "rules": {
        "no-restricted-globals": ["error",
          "document", "window", "navigator", "localStorage",
          "sessionStorage", "indexedDB", "fetch", "XMLHttpRequest"
        ]
      }
    }
  ]
}
```

---

## 15.4 CSS class 名と data 属性の規約

minify-safe かつ機能セレクタと装飾セレクタを分離する:

| 用途 | 形式 | 例 | minify影響 |
|------|------|-----|-----------|
| JS からの要素特定 | `data-pkc-*` 属性 | `data-pkc-action="save"` | なし |
| UI 構造 | `pkc-` prefix class | `.pkc-sidebar` | なし（CSS側で参照） |
| テーマ装飾 | CSS変数 | `var(--c-accent)` | なし |
| 状態表示 | `data-pkc-state` | `data-pkc-state="editing"` | なし |

**禁止**: JS 内で CSS class 名を動的に生成して DOM 操作に使うこと
**推奨**: `data-pkc-*` 属性で機能を表現し、CSS はそれをセレクタとして利用

```css
/* CSS: 機能属性ベースのスタイリング */
[data-pkc-state="editing"] { border-left: 3px solid var(--c-accent); }
[data-pkc-action="save"]:hover { background: var(--c-hover); }
```
