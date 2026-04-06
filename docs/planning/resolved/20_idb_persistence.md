# 20. IDB 永続化

---

## 20.1 目的

Container mutation の結果を IndexedDB に永続化する。
ただし永続化ロジックを core や reducer に逆流させず、
adapter/platform 側の責務として閉じ込める。

---

## 20.2 アーキテクチャ

```
Dispatcher ──onEvent──→ Persistence ──save──→ ContainerStore ──→ IDB
                            ↑                       ↑
                        adapter/platform        adapter/platform
                      (event listener)         (browser API boundary)
```

### 責務分離

| コンポーネント | 置き場 | 責務 |
|--------------|--------|------|
| **ContainerStore** | `adapter/platform/idb-store.ts` | IDB の open/save/load/delete。browser API 境界 |
| **Persistence** | `adapter/platform/persistence.ts` | DomainEvent → save trigger。debounce 管理 |
| **main.ts** | `src/main.ts` | boot 時の IDB/pkc-data 優先度判定と配線 |

### 触らないもの

- core: browser API なし、変更なし
- reducer: pure function、変更なし
- dispatcher: coordination point、変更なし

---

## 20.3 ContainerStore interface

```typescript
interface ContainerStore {
  save(container: Container): Promise<void>;
  load(containerId: string): Promise<Container | null>;
  loadDefault(): Promise<Container | null>;
  delete(containerId: string): Promise<void>;
}
```

### 実装

| 実装 | 用途 |
|------|------|
| `createIDBStore()` | 本番。IndexedDB に保存 |
| `createMemoryStore()` | テスト・SSR。Map に保存。deep copy で参照漏れ防止 |

### IDB 構造

- Database: `pkc2`
- Object Store: `containers`
- Key: `container_id`（文字列キー）
- `__default__` キーに最後に保存した container_id を記録
- 将来の複数 Container 対応を考慮

---

## 20.4 Save トリガ方針

### トリガとなる DomainEvent

| Event | 理由 |
|-------|------|
| `ENTRY_CREATED` | Container に Entry が追加された |
| `ENTRY_UPDATED` | Entry が更新された |
| `ENTRY_DELETED` | Entry が削除された |
| `RELATION_CREATED` | Relation が追加された |
| `RELATION_DELETED` | Relation が削除された |
| `CONTAINER_LOADED` | 初回ロード後の保存（pkc-data からの復元を IDB にも保存） |

### トリガにならない DomainEvent

| Event | 理由 |
|-------|------|
| `ENTRY_SELECTED` | runtime state のみ。persistent model 不変 |
| `ENTRY_DESELECTED` | 同上 |
| `EDIT_BEGUN` | phase 変更のみ |
| `EDIT_COMMITTED` | ENTRY_UPDATED が同時に出るのでそちらで save |
| `EDIT_CANCELLED` | persistent model 不変 |
| `EXPORT_COMPLETED` | persistent model 不変 |
| `ERROR_OCCURRED` | エラーを保存しない |

### Debounce

- デフォルト 300ms
- 連続 mutation は最後のもの 1 回のみ保存
- 理由: IDB write は安価だが、毎 keystroke で保存するのは過剰

---

## 20.5 起動時復元フロー

```
boot()
  ├── 1. IDB loadDefault() → 成功 → SYS_INIT_COMPLETE(idb container)
  ├── 2. IDB 空/失敗 → pkc-data を読む → 成功 → SYS_INIT_COMPLETE
  ├── 3. pkc-data も空 → 空 Container を生成 → SYS_INIT_COMPLETE
  └── 4. すべて失敗 → SYS_INIT_ERROR
```

### IDB 優先の理由

pkc-data は HTML 埋め込みの初期データ。
ユーザーが mutation を行った後は IDB の方が新しい。
release (export) 時に pkc-data は更新されるが、日常使用では IDB が正本。

### 失敗時の挙動

- IDB load 失敗: console.warn して pkc-data にフォールバック
- save 失敗: console.warn + onError callback（アプリは継続動作）
- 致命的でない。PKC はオフラインツールなので、IDB 障害は稀

---

## 20.6 AppPhase との関係

| Phase | Persistence の動作 |
|-------|-------------------|
| `initializing` | loadFromStore → SYS_INIT_COMPLETE/ERROR |
| `ready` | mutation event → debounced save |
| `editing` | COMMIT_EDIT → ENTRY_UPDATED → save |
| `exporting` | 保存しない（export は別経路） |
| `error` | 保存しない |

---

## 20.7 テスト一覧

| テストファイル | テスト数 | 検証内容 |
|--------------|---------|---------|
| `tests/adapter/idb-store.test.ts` | 8 | MemoryStore の ContainerStore 契約 |
| `tests/adapter/persistence.test.ts` | 9 | save trigger, debounce, non-trigger skip, error handling, cleanup |
| 既存テスト | 88 | (変更なし) |

合計: **105 テスト**, 11 ファイル

---

## 20.8 今回あえて入れなかったもの

| 項目 | 理由 |
|------|------|
| Save 状態の UI 表示 | persistence は adapter 内部。UI に dirty/saving 表示は後回し |
| 自動 export | save ≠ export。export は明示的操作 |
| Container 一覧 UI | 複数 Container サポートは Phase 2 以降 |
| migration / schema upgrade | スキーマバージョン 1 のみ。バージョン管理は manifest と合わせて |
| 圧縮 / quota 管理 | 現段階では不要 |
| AppState の保存 | runtime state は保存しない（selectedLid, phase 等） |

---

## 20.9 次に着手すべき Issue

| 優先 | Issue | 内容 |
|------|-------|------|
| 次 | **release metadata / manifest** | pkc-meta の型・生成・検証・builder 接続 |
| 後 | **HTML export** | Container → pkc-data 埋め込み → 単一 HTML 出力 |
| 後 | **dirty 管理** | save 状態の追跡と UI 表示 |
| 後 | **IDB → HTML sync** | IDB 変更を pkc-data に反映する export 連動 |
