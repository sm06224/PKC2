# 17. Domain Model / Action Contract の最小確定

---

## 17.1 目的

PKC2 において以下を混同しないように、最小の型と契約を確定する:

- 何が永続対象か（Persistent Domain Model）
- 何が runtime state か（Runtime UI State）
- 何が user action か（UserAction）
- 何が system command か（SystemCommand）
- 何が domain event か（DomainEvent）
- 何が external message か（MessageEnvelope）

---

## 17.2 6 つの境界

| 分類 | 置き場 | 方向 | 永続 | 例 |
|------|--------|------|------|-----|
| **Persistent Domain Model** | `core/model/` | — | ✅ | Entry, Relation, Revision, Container |
| **Runtime UI State** | `adapter/state/` | — | ❌ | AppPhase, selectedLid, editingLid |
| **UserAction** | `core/action/user-action.ts` | 入力 | ❌ | SELECT_ENTRY, BEGIN_EDIT |
| **SystemCommand** | `core/action/system-command.ts` | 入力 | ❌ | SYS_INIT_COMPLETE, SYS_ERROR |
| **DomainEvent** | `core/action/domain-event.ts` | 出力 | ❌ | ENTRY_CREATED, EDIT_COMMITTED |
| **MessageEnvelope** | `core/model/message.ts` | 外部I/O | ❌ | ping, record:offer |

### 関係図

```
User ──→ UserAction ──┐
                      ├──→ Dispatcher ──→ Reducer ──→ (AppState', DomainEvent[])
System ──→ SystemCommand ┘                               │
                                                          ├──→ State Listeners (UI描画)
                                                          └──→ Event Listeners (ログ, undo, 副作用)

External ──→ MessageEnvelope ──→ Message Handler ──→ SystemCommand ──→ Dispatcher
```

---

## 17.3 Persistent Domain Model

`core/model/` に置く。browser API を一切持たない。

### 17.3.1 Entry（旧 Record）

```typescript
interface Entry {
  lid: string;
  title: string;
  body: string;           // Archetype が解釈
  archetype: ArchetypeId;
  created_at: string;     // ISO 8601
  updated_at: string;
}
```

**名称変更の理由**: TypeScript 組み込みの `Record<K,V>` との衝突回避。

### 17.3.2 Container

```typescript
interface Container {
  meta: ContainerMeta;
  entries: Entry[];       // 旧 records
  relations: Relation[];
  revisions: Revision[];
  assets: { [key: string]: string };
}
```

### 17.3.3 設計判断

- `entries`（複数形）に改名。`records` は使わない
- `Revision.entry_lid`（旧 `record_lid`）に改名
- runtime 都合のフィールド（selection, phase, error）は**含めない**

---

## 17.4 Runtime UI State

`adapter/state/app-state.ts` に置く。

```typescript
interface AppState {
  phase: AppPhase;
  container: Container | null;  // persistent model への参照
  selectedLid: string | null;   // runtime only
  editingLid: string | null;    // runtime only
  error: string | null;         // runtime only
}
```

`container` は persistent model だが、AppState が保持する参照は runtime の文脈。
永続化時は `container` のみを pkc-data に書き出す。

---

## 17.5 UserAction

ユーザーが UI を通じて発行する命令。命令形。

| type | payload | 許可 phase |
|------|---------|-----------|
| `SELECT_ENTRY` | lid | ready |
| `DESELECT_ENTRY` | — | ready |
| `BEGIN_EDIT` | lid | ready |
| `COMMIT_EDIT` | lid, title, body | editing |
| `CANCEL_EDIT` | — | editing |
| `CREATE_ENTRY` | archetype, title | ready |
| `DELETE_ENTRY` | lid | ready |
| `BEGIN_EXPORT` | — | ready |
| `CREATE_RELATION` | from, to, kind | ready |
| `DELETE_RELATION` | id | ready |

---

## 17.6 SystemCommand

runtime/infrastructure が発行するコマンド。`SYS_` prefix で区別。

| type | payload | 用途 |
|------|---------|------|
| `SYS_INIT_COMPLETE` | container | rehydrate 完了 |
| `SYS_INIT_ERROR` | error | rehydrate 失敗 |
| `SYS_FINISH_EXPORT` | — | export 完了 |
| `SYS_ERROR` | error | システムエラー |

---

## 17.7 DomainEvent

reducer が状態遷移に成功した後に emit する事実。過去形。

| type | payload | 意味 |
|------|---------|------|
| `ENTRY_SELECTED` | lid | Entry が選択された |
| `ENTRY_DESELECTED` | — | 選択解除 |
| `EDIT_BEGUN` | lid | 編集が開始された |
| `EDIT_COMMITTED` | lid | 編集が確定された |
| `EDIT_CANCELLED` | — | 編集がキャンセルされた |
| `ENTRY_CREATED` | lid, archetype | Entry が作成された |
| `ENTRY_UPDATED` | lid | Entry が更新された |
| `ENTRY_DELETED` | lid | Entry が削除された |
| `RELATION_CREATED` | id, from, to, kind | Relation が作成された |
| `RELATION_DELETED` | id | Relation が削除された |
| `CONTAINER_LOADED` | container_id | Container がロードされた |
| `EXPORT_COMPLETED` | — | export が完了した |
| `ERROR_OCCURRED` | error | エラーが発生した |

---

## 17.8 MessageEnvelope（外部プロトコル）

PKC2 インスタンス間の postMessage 通信用。内部 action とは完全に別。

| 区別ポイント | 内部 action | MessageEnvelope |
|-------------|------------|-----------------|
| discriminant | `type` フィールド | `protocol: 'pkc-message'` |
| 発行元 | Dispatcher | postMessage |
| 受信先 | Reducer | Message Handler → SystemCommand |
| 名前空間 | `SCREAMING_SNAKE` | `verb:noun` (ping, record:offer) |

---

## 17.9 Dispatcher 契約

```typescript
interface Dispatcher {
  dispatch(action: Dispatchable): ReduceResult;
  getState(): AppState;
  onState(listener: StateListener): () => void;
  onEvent(listener: EventListener): () => void;
}
```

### 責務

1. `Dispatchable`（UserAction | SystemCommand）を受け取る
2. pure reducer で `(AppState', DomainEvent[])` を計算
3. state が変わったら StateListener に通知
4. 発生した DomainEvent を EventListener に通知

### やらないこと

- MessageEnvelope の直接受信（Message Handler 経由で SystemCommand に変換後）
- 副作用の実行（Listener が行う）
- action の有効性判断（reducer が行う）

---

## 17.10 Reducer の設計

### ReduceResult

```typescript
interface ReduceResult {
  state: AppState;
  events: DomainEvent[];
}
```

### phase-first switch

```
reduce(state, action)
  └── switch(state.phase)
        ├── 'initializing' → switch(action.type) → ...
        ├── 'ready'        → switch(action.type) → ...
        ├── 'editing'      → switch(action.type) → ...
        ├── 'exporting'    → switch(action.type) → ...
        └── 'error'        → switch(action.type) → ...
```

各 phase で許可されない action は `blocked()` → 同じ state + 空 events。
TypeScript の exhaustive switch で phase の追加漏れを防ぐ。

---

## 17.11 今回あえて入れなかったもの

| 項目 | 理由 |
|------|------|
| Undo/Redo スタック | DomainEvent を蓄積すれば後から追加可能。今は構造だけ |
| Container への実際の mutation | reducer は intent を記録するのみ。mutation は dispatcher 層の後工程 |
| Message transport 実装 | 型定義のみ。Phase 2 |
| i18n 実装 | Phase 2 |
| Feature 層の実装 | domain/action が固まるまで不要 |
| IDB 永続化 | Event listener として後から追加可能 |

---

## 17.12 テスト一覧

| テストファイル | テスト数 | 検証内容 |
|--------------|---------|---------|
| `tests/core/model.test.ts` | 3 | Entry/Relation/Container の構造 |
| `tests/core/contract.test.ts` | 3 | SLOT 定数 |
| `tests/core/app-state.test.ts` | 18 | reducer の全 phase × action 組み合わせ + event 出力 |
| `tests/core/dispatcher.test.ts` | 6 | Dispatcher lifecycle + listener 通知 |
| `tests/core/action-types.test.ts` | 6 | 型境界の検証（重複なし, prefix 規約, protocol 分離） |

---

## 17.13 次に着手すべき Issue

| 優先 | Issue | 内容 |
|------|-------|------|
| 次 | **最小 UI Shell** | Dispatcher + AppState → DOM 描画の最小実装 |
| 次 | **release metadata / manifest** | pkc-meta 生成の型と実装 |
| 後 | **PKC-Message transport** | MessageEnvelope → SystemCommand 変換 |
| 後 | **IDB 永続化** | DomainEvent listener として実装 |
| 後 | **Undo/Redo** | DomainEvent の蓄積 + 逆操作生成 |
