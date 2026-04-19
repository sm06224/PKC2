# Dead Path Decision — `isUlid` / `updateLogEntry`

## 目的

inventory round 4 (PR #39) で B 候補に分類した `src/features/textlog/` 配下の 2 helper について、単独 smoking-gun 判定を行う。削除前提ではなく、A/B/C/D を確定させるための意思決定文書。

## 対象

| Helper | Module | 定義位置 |
|--------|--------|----------|
| `isUlid(id: string): boolean` | `src/features/textlog/log-id.ts` | L95 |
| `updateLogEntry(body, entryId, newText): TextlogBody` | `src/features/textlog/textlog-body.ts` | L73 |

両者とも inventory 04 時点では以下が共通:

- src 参照 0 件
- tests で直接テスト対象
- docs / spec に固有名での言及なし
- git log 上、src/adapter からの呼出し履歴なし

表面的には同じ pattern。smoking gun の有無だけが運命を分ける。

---

## 1. `isUlid` の判定

### docstring の意図

```ts
/**
 * True when `id` matches the ULID shape (26 Crockford Base32 chars).
 *
 * Used by debugging / audit tooling only. Resolvers must **not**
 * gate on this — legacy IDs are equally valid addresses.
 */
export function isUlid(id: string): boolean { ... }
```

この docstring は **"production で呼ばれないこと"が設計上正しい** ことを明示している:

- "debugging / audit tooling only" — 非 production 用途である宣言
- "Resolvers must not gate on this" — 実装者への警告: production path でこれを条件分岐に使ったらバグ
- "legacy IDs are equally valid addresses" — pre-ULID 形式を受理する backward compat の一部として記述

### runtime 到達性

- 間接到達なし: `parseEntryRef` の log-id 分岐は `TOKEN_RE = /^[A-Za-z0-9_-]+$/` で opaque token として扱う。ULID 形式を gate にしていない。
- `parseTextlogBody` も `id` を string として accept するのみで、形式チェックなし。
- resolver / importer / exporter どれも `isUlid` を呼ばない。

### 判定: **C (retain)**

**smoking gun なし**。むしろ docstring が「非使用は設計どおり」と宣言している。削除すると:

- 将来の debugging / audit script が ULID 形式を判定する際の公式 API を失う
- docstring で explicit に intent を語った関数を削除することは、設計意図の silent な剥奪に等しい
- tests はこの intent の protection として機能している

→ **削除しない**。inventory 04 の B → C に昇格。

---

## 2. `updateLogEntry` の判定

### docstring の意図

```ts
/**
 * Update the text of a log entry by id.
 */
export function updateLogEntry(body: TextlogBody, entryId: string, newText: string): TextlogBody {
  return {
    entries: body.entries.map((e) =>
      e.id === entryId ? { ...e, text: newText } : e,
    ),
  };
}
```

`isUlid` と異なり、debug/audit 用途を示唆する記述なし。CRUD 系兄弟 (`appendLogEntry`, `toggleLogFlag`, `deleteLogEntry`) と同じ書式の「通常の helper」として記述されている。

### 実際の TEXTLOG 編集アーキテクチャ

live viewer + editor は **DOM-based structured editor** を採用 (`src/adapter/ui/textlog-presenter.ts`):

```ts
// textlog-presenter.ts:284-320 collectBody()
collectBody(root: HTMLElement): string {
  const editRows = root.querySelectorAll<HTMLElement>('.pkc-textlog-edit-row');
  // ...
  const original = parseTextlogBody(bodyEl?.value ?? '');
  const originalMap = new Map(original.entries.map((e) => [e.id, e]));
  // ...
  for (const row of editRows) {
    if (row.getAttribute('data-pkc-deleted') === 'true') continue;
    const logId = row.getAttribute('data-pkc-log-id') ?? '';
    const textEl = row.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    const flagEl = row.querySelector<HTMLInputElement>('[data-pkc-field="textlog-flag"]');

    const orig = originalMap.get(logId);
    const text = textEl?.value ?? '';
    const flags: TextlogFlag[] = flagEl?.checked ? ['important'] : [];
    entries.push({
      id: logId,
      text,                                       // ← 新しい text は DOM から
      createdAt: orig?.createdAt ?? new Date().toISOString(),  // ← createdAt は originalMap から復元
      flags,
    });
  }
  // ... 並び順を chronological に戻して serialize
}
```

つまり「id でエントリ 1 つを更新する」ではなく、「edit rows から新しい body 全体を再構築する」パターン。この architecture では `updateLogEntry` の per-entry 更新 helper は **呼び出す経路が存在しない**。

### 兄弟関数との非対称

| Helper | Production 呼出し |
|--------|-------------------|
| `appendLogEntry` | `action-binder.ts:1609` (textlog 追記) |
| `toggleLogFlag` | `action-binder.ts:654` (flag toggle) |
| `deleteLogEntry` | `action-binder.ts:674` (per-entry delete) |
| **`updateLogEntry`** | **なし** |

append / toggle / delete はすべて **id-targeted single-entry operation** として reducer 経路から直接呼ばれる。これらに対し update だけ使われない理由は、上記の DOM-based collectBody で一括再構築するため per-entry update を reducer 経路で呼ぶ必要がないから。

### 過去履歴

`git log -S "updateLogEntry("` で src/adapter から呼ばれた commit は**存在しない**。初回コミット (`db8b218`, 2026-04-11) 以降、src/adapter からの参照履歴ゼロ。

### 判定: **smoking gun あり → 削除**

| 観点 | 状況 |
|------|------|
| アーキテクチャ整合 | `collectBody` 方式と矛盾。update 呼出し経路が構造上存在しない。 |
| 兄弟関数との一貫性 | append / toggle / delete が使われる一方で update だけ orphan。 |
| 履歴 | 全期間にわたり src から呼ばれたことがない。 |
| docs / spec | 記述なし。 |
| docstring の intent | 通常の helper (debug/audit 宣言なし)。 |
| tests | helper の振る舞いだけを test (3 case)。contract 宣言ではない。 |

これは PR #36 で削除した `isPreviewableMedia` と同型:

- 実装と別経路で production が動いている
- helper は test-only
- design 上の "intentionally unused" 宣言なし

→ **削除する**。

---

## 本 PR での削除アクション

### 削除対象

- `src/features/textlog/textlog-body.ts:70-79` の `updateLogEntry` 関数 + JSDoc (計 10 行)
- `tests/features/textlog/textlog-body.test.ts` の import entry + `describe('updateLogEntry', ...)` ブロック (計 2 it / 約 27 行)

### 保持対象

- `src/features/textlog/log-id.ts:95 isUlid` — docstring 明示の debug/audit helper → **retain**

### roll-back 戦略

削除後に何らかの regression が発生した場合:

1. **想定される regression**: ほぼ考えにくい。production call site が git 全履歴で 0、テストでしか触られていない。
2. **安全網**: もし将来 reducer-based per-entry update が必要になったとき、単純な 7 行で再追加可能。インターフェースも pure function で副作用なし。
3. **rollback**: git revert 1 commit で完全復元可能。

---

## 変更ファイル

```
 src/features/textlog/textlog-body.ts            | -10 (updateLogEntry + JSDoc)
 tests/features/textlog/textlog-body.test.ts     | -28 (import line + describe block)
 docs/development/dead-path-decision-isUlid-updateLogEntry.md | +N (this doc)
```

---

## Validation

- [ ] `npm run typecheck`: 次セクションで結果記録
- [ ] `npm test`: 削除前 4539 → 削除後 4537 になる想定 (updateLogEntry の 2 it を削除)
- [ ] `npm run build:bundle`: bundle impact を確認

---

## Backward compat / migration 影響

`updateLogEntry` は TEXTLOG body schema そのものには無関係。body 形状の読み書きは `parseTextlogBody` / `serializeTextlogBody` が担当しており、この helper はその上の CRUD 層の 1 関数に過ぎない。

- schema 変更なし
- stored data への影響なし
- import / export 経路への影響なし
- 外部 API を公開していない (npm package ではないため)

→ **migration 実装不要**。

---

## 結論

| Helper | 判定 |
|--------|------|
| `isUlid` | **C**: retain。docstring 明示の debug/audit 用途。 |
| `updateLogEntry` | **smoking gun あり → 削除**。architectural mismatch + 全履歴で未使用 + docstring 意図なし。|

inventory 04 の B 候補 3 件のうち、本 PR で 1 件 (`updateLogEntry`) のみを削除する。`isUlid` は **C に昇格** として保持。

## 次 PR 候補

1. `docs/development/boot-initialization-order.md` の新設 (inventory 04 agent 2 の boot order 分析を独立 doc 化)
2. Round 5 inventory (action-binder 単独 / transport / todo/calendar/kanban / search / image-optimize)
3. inventory round 1-4 doc への "resolved" マーク追記 (補助)

---

## 付録: 調査コマンド

```
- Grep "\\b<helper>\\b" src/ tests/ docs/
- git log --all --oneline -S "<helper>(" -- src/adapter/
- src/adapter/ui/textlog-presenter.ts:284-320 collectBody 実装確認
- log-id.ts:89-101 docstring の intent 確認
```
