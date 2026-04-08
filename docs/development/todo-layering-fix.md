# Todo レイヤー違反の修正

## 何がレイヤー違反だったか

`features/calendar/calendar-data.ts` と `features/kanban/kanban-data.ts` が
`adapter/ui/todo-presenter` から `TodoBody` 型と `parseTodoBody` 関数を import していた。

```
features/calendar → adapter/ui/todo-presenter  ← 違反
features/kanban  → adapter/ui/todo-presenter  ← 違反
```

PKC2 の 5 層構造では `core ← features ← adapter` の方向のみ許可されており、
features 層が adapter 層に依存するのは不変条件違反。

## どこへ移したか

`src/features/todo/todo-body.ts` を新設し、以下を移管:

- `TodoBody` 型
- `parseTodoBody()`
- `serializeTodoBody()`
- `formatTodoDate()`
- `isTodoPastDue()`

`adapter/ui/todo-presenter.ts` は `features/todo/todo-body` から import し、
adapter 内部の既存消費者（renderer, action-binder）向けに re-export。

## 依存方向がどう正されたか

### Before
```
features/calendar ──→ adapter/ui/todo-presenter  (違反)
features/kanban  ──→ adapter/ui/todo-presenter  (違反)
adapter/ui/renderer    ──→ adapter/ui/todo-presenter
adapter/ui/action-binder ──→ adapter/ui/todo-presenter
```

### After
```
features/calendar ──→ features/todo/todo-body  (正)
features/kanban  ──→ features/todo/todo-body  (正)
adapter/ui/todo-presenter ──→ features/todo/todo-body  (正: adapter→features)
adapter/ui/renderer    ──→ adapter/ui/todo-presenter (re-export経由、adapter内部)
adapter/ui/action-binder ──→ adapter/ui/todo-presenter (re-export経由、adapter内部)
```

## なぜ UI 層所有ではダメだったか

`TodoBody` と `parseTodoBody` は **純粋なデータ契約** であり、DOM にもブラウザ API にも依存しない。
calendar-data や kanban-data といった features 層モジュールが必要とする関数であり、
UI 表示に特化した presenter に置く理由がない。

presenter（adapter 層）に置いたままでは features 層からの参照が不可能であり、
5 層構造の不変条件を破らざるを得なかった。
features 層に移すことで、依存方向が正しく保たれる。
