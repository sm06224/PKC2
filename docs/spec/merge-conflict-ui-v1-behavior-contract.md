# Behavior Contract — Merge Conflict UI v1

Status: DRAFT
Created: 2026-04-17
Category: B. Import / Merge Contracts
Parent: `docs/spec/merge-import-conflict-resolution.md`（canonical spec）
Predecessor: `docs/spec/merge-import-conflict-ui-minimum-scope.md`
Template: `docs/spec/textlog-replace-v1-behavior-contract.md`
Scope: Merge import preview 内の entry 単位 conflict resolution UI の v1 behavior contract を固定


---

## 0. 位置づけ

### 0.1 本書の目的

`docs/spec/merge-import-conflict-ui-minimum-scope.md` の結論（C1/C2/C3 分類、3 操作、2 bulk shortcut）に基づき、merge conflict UI の **v1 behavior contract** を 1 本に固定する。

本書は実装説明ではなく **behavior contract** である：

- どの操作が何をするかの最小仕様
- どの条件で操作が効くか／効かないか
- 永続データに対する不変条件（invariance）
- data contract と UI contract の分離
- State interaction（AppState / reducer / event）
- Gate 条件（Confirm ボタンの enable/disable）
- Error paths
- 意図的に v1 でサポートしないこと

### 0.2 関連 doc との関係

| doc | 関係 |
|-----|------|
| `docs/spec/merge-import-conflict-resolution.md` | 本書の親契約（canonical spec）。§8.1/§8.2 の「非対象」を本書が限定復活させる |
| `docs/spec/merge-import-conflict-ui-minimum-scope.md` | 本書の出発点。scope / 3 分類 / 3 操作 / bulk / provenance を本書が contract 化する |
| `docs/spec/text-textlog-provenance.md` | provenance relation profile。本書は `metadata.kind = 'merge-duplicate'` を additive 追加する |
| `docs/spec/data-model.md` | Container / Entry / Relation schema の定義元 |
| `docs/spec/schema-migration-policy.md` | schema mismatch gate（conflict UI mount より前に reject） |

### 0.3 supervisor 確定事項

本 contract は以下 2 点を supervisor 判断として固定する：

1. **multi-host 代表選定**: `updatedAt` が最新の host entry を代表とする。tie-break は `host.entries` の array index 昇順（先頭を採用）
2. **contentHash 入力範囲**: `body + archetype` のみ。title は除外する（title は C2 分類に別途使用するため、hash 入力に含めない）

### 0.4 章構成

| 章 | タイトル |
|---|---------|
| 0 | 位置づけ（本章） |
| 1 | Scope / 非対象 |
| 2 | Surface 条件 |
| 3 | Invariance（I-MergeUI1〜I-MergeUI10） |
| 4 | Conflict 判定（data contract） |
| 5 | Resolution 操作（data contract） |
| 6 | API / pure helper |
| 7 | State interaction |
| 8 | UI contract |
| 9 | Gate 条件 |
| 10 | Error paths |
| 11 | Testability |
| 12 | Non-goal / v1.x 余地 |

---

## 1. Scope / 非対象

### 1.1 v1 の対象範囲

- **対象 UI 経路**: Merge mode（`importMode === 'merge'`）の import preview dialog 内のみ
- **対象 container 構成**: single imported container vs single host container の 2 項
- **対象 archetype**: 全 archetype（text / textlog / todo / form / attachment / folder / generic / opaque）
- **対象 phase**: `importPreview !== null` の preview 画面内のみ

### 1.2 非対象

- replace import / batch import / folder-scoped import
- multi-way merge（3 container 以上）
- field 単位 cherry-pick / semantic merge
- 3-way merge（common ancestor）
- archetype-aware diff（markdown AST diff、textlog log-level diff）
- attachment binary diff
- revision 持ち込み / 比較
- content-identity policy の user customization
- global auto-resolution policy（永続ルール登録）

---

## 2. Surface 条件

### 2.1 conflict UI が mount される条件

以下のすべてが満たされたときにのみ conflict UI が mount される：

| 条件 | 要求 |
|------|------|
| AppPhase | `'ready'`（import preview は ready phase 内で表示） |
| importMode | `'merge'` |
| importPreview | `!== null` |
| conflict 件数 | `detectEntryConflicts(host, imported).length > 0` |
| schema check | schema mismatch なし（既存 gate 通過済み） |
| access mode | editable workspace（readonly / historical / preservation でない） |

### 2.2 conflict UI が mount されない条件

- `importMode === 'replace'` → conflict UI は出さない
- conflict 0 件 → conflict UI セクションを mount せず、MVP 5 行サマリのみ表示
- schema mismatch → conflict UI mount より前に reject（既存 gate）
- readonly / historical / preservation phase → import 自体が不可

### 2.3 unmount trigger

以下のいずれかで conflict UI は unmount される：

- `CANCEL_IMPORT` dispatch
- `CONFIRM_MERGE_IMPORT` dispatch（merge 完了）
- 新しい `SYS_IMPORT_PREVIEW` dispatch（re-preview）
- `SET_IMPORT_MODE { mode: 'replace' }` dispatch（mode 切替）

---

## 3. Invariance（I-MergeUI1〜I-MergeUI10）

v1 の最重要部分。conflict UI のいかなる操作でも以下の不変条件を保証する。

### I-MergeUI1: host absolute preservation

conflict UI のいかなる操作（keep-current / duplicate-as-branch / skip / bulk / cancel / confirm）でも、host container の entry / relation / revision は **一切変更されない**。host 側に新しい entry が追加されることはあっても（duplicate-as-branch による imported の append）、既存 host entry の title / body / archetype / createdAt / updatedAt / lid は不変。

### I-MergeUI2: keep-current と skip の container 副作用同一

`keep-current` と `skip` は container に対する副作用が **完全に同一**（imported entry を MergePlan から除外する）。区別は `CONTAINER_MERGED` event の `suppressed_by_keep_current` / `suppressed_by_skip` 配列でのみ記録される。

### I-MergeUI3: C1 は default 採用で gate 通過、C2 は explicit 選択必須

C1（content-equal）は `keep-current` が default pre-selected されており、ユーザーが何も操作しなくても gate 通過する。C2（title-only / title-only-multi）は default なしで、ユーザーが明示的に resolution を選ぶまで gate を block する。

### I-MergeUI4: provenance 方向は一方向

`duplicate-as-branch` で追加される provenance relation の方向は常に `from = imported（derived）`, `to = host（source）`。逆方向の relation は作成しない。

### I-MergeUI5: resolution state の reset

`CANCEL_IMPORT` / `CONFIRM_MERGE_IMPORT` / 新しい `SYS_IMPORT_PREVIEW` のいずれでも `mergeConflictResolutions` は `{}` または `undefined` に reset される。resolution state は session を跨いで持ち越さない。

### I-MergeUI6: bulk shortcut は v1 で 2 種のみ

v1 の bulk shortcut は `Accept all host`（全 conflict を keep-current）と `Duplicate all`（全 conflict を duplicate-as-branch）の 2 種のみ。`Skip all` / `Accept all incoming` / archetype 別 bulk は v1 に含めない。

### I-MergeUI7: multi-host C2 では keep-current を disable

同 title の host entry が複数存在する `title-only-multi` conflict では、`keep-current` radio を disable する。どの host を「current」として残すかが曖昧なため。ユーザーの選択肢は `duplicate-as-branch` または `skip` の 2 択。

### I-MergeUI8: schema mismatch は conflict UI mount より前に reject

schema mismatch は既存の preview gate で reject される。conflict UI がこの判定を行うことはない。conflict UI は schema 正常な container のみを前提とする。

### I-MergeUI9: readonly / historical / preservation phase では conflict UI は mount されない

これらの phase では import 自体が不可能であり、conflict UI の mount trigger が発火しない。追加ガードは不要（既存 gate で十分）。

### I-MergeUI10: detectEntryConflicts は pure / deterministic / O(H+I)

conflict 検出関数は pure helper として実装され、同一入力に対して常に同一出力を返す。DOM 操作、AppState 読み書き、dispatcher dispatch は一切行わない。計算量は host entry 数 H + imported entry 数 I に対して O(H+I)。

---

## 4. Conflict 判定（data contract）

### 4.1 normalizeTitle

title 比較に使用する正規化関数。pure / deterministic。

```ts
function normalizeTitle(title: string): string {
  let s = title
  s = s.normalize('NFC')
  s = s.trim()
  s = s.replace(/\s+/g, ' ')
  return s
}
```

- Unicode NFC 正規化を適用
- 前後の空白を除去
- 連続空白を単一スペースに圧縮
- 大文字小文字は区別する（v1 固定）

### 4.2 contentHash

entry の内容同一性を判定するためのハッシュ。既存 `src/core/operations/hash.ts` の FNV-1a-64 helper を再利用する。

**入力範囲（supervisor 確定）**: `body + archetype` のみ。title は除外する。

```ts
function contentHash(body: string, archetype: string): string {
  return fnv1a64(body + '\0' + archetype)
}
```

- title を除外する理由：title は C2 分類（title-only match）の判定に別途使用するため、hash 入力に含めると C1/C2 の区別が不可能になる
- `\0` separator：body と archetype の境界を明確にする（body 末尾が archetype 文字列で終わるケースとの衝突回避）

### 4.3 3 分類の判定ルール

| 分類 | 条件 | default resolution |
|------|------|--------------------|
| **C1: content-equal** | `archetype` 一致 + `normalizeTitle(title)` 一致 + `contentHash` 一致 | `keep-current`（pre-selected） |
| **C2: title-only** | `archetype` 一致 + `normalizeTitle(title)` 一致 + `contentHash` 不一致 + host 候補 1 件 | なし（explicit 選択必須） |
| **C2-multi: title-only-multi** | `archetype` 一致 + `normalizeTitle(title)` 一致 + `contentHash` 不一致 + host 候補 2 件以上 | なし（explicit 選択必須、keep-current disabled） |
| **C3: no-conflict** | 上記いずれにも該当しない | 介入不要（MVP 経路でそのまま append） |

### 4.4 detectEntryConflicts pseudocode

```
function detectEntryConflicts(host: Container, imported: Container): EntryConflict[]
  hostMap = new Map<string, HostEntry[]>()
  for each entry in host.entries:
    key = normalizeTitle(entry.title) + '|' + entry.archetype
    hostMap.get(key)?.push(entry) or hostMap.set(key, [entry])

  conflicts: EntryConflict[] = []
  for each imp in imported.entries:
    key = normalizeTitle(imp.title) + '|' + imp.archetype
    candidates = hostMap.get(key) or []
    if candidates.length === 0: continue  // C3, no conflict

    impHash = contentHash(imp.body, imp.archetype)
    exactMatch = candidates.find(h => contentHash(h.body, h.archetype) === impHash)

    if exactMatch:
      conflicts.push({
        kind: 'content-equal',
        imported_lid: imp.lid,
        host_lid: exactMatch.lid,
        imported_title: imp.title,
        host_title: exactMatch.title,
        archetype: imp.archetype,
        imported_content_hash: impHash,
        host_content_hash: contentHash(exactMatch.body, exactMatch.archetype),
        imported_body_preview: bodyPreview(imp.body),
        host_body_preview: bodyPreview(exactMatch.body),
        imported_created_at: imp.createdAt,
        imported_updated_at: imp.updatedAt,
        host_created_at: exactMatch.createdAt,
        host_updated_at: exactMatch.updatedAt,
      })
    else if candidates.length === 1:
      conflicts.push({
        kind: 'title-only',
        imported_lid: imp.lid,
        host_lid: candidates[0].lid,
        ...timestamps and previews...
      })
    else:
      // multi-host: 代表 = updatedAt 最新、tie-break = array index 昇順
      representative = candidates.sort((a, b) => {
        const cmp = b.updatedAt.localeCompare(a.updatedAt)
        if (cmp !== 0) return cmp
        return host.entries.indexOf(a) - host.entries.indexOf(b)
      })[0]
      conflicts.push({
        kind: 'title-only-multi',
        imported_lid: imp.lid,
        host_lid: representative.lid,
        host_candidates: candidates.map(c => c.lid),
        ...timestamps and previews...
      })

  return conflicts
```

### 4.5 EntryConflict 型定義

```ts
type ConflictKind = 'content-equal' | 'title-only' | 'title-only-multi';
type Resolution = 'keep-current' | 'duplicate-as-branch' | 'skip';

interface EntryConflict {
  imported_lid: string;
  host_lid: string | null;
  host_candidates?: string[];
  kind: ConflictKind;
  imported_title: string;
  host_title: string;
  archetype: string;
  imported_content_hash: string;
  host_content_hash: string;
  imported_body_preview: string;
  host_body_preview: string;
  imported_created_at: string;
  imported_updated_at: string;
  host_created_at: string;
  host_updated_at: string;
}
```

### 4.6 body preview 規則

- Unicode code-point 単位で先頭 200 code points をスライス（`[...body].slice(0, 200).join('')`）
- 改行は `\n` を visible `↵` に置換
- markdown / JSON の構造記号はそのまま表示（render しない、escape しない）
- 200 code points 未満：末尾に ellipsis なし
- 200 code points 以上：末尾に `...` を追加

---

## 5. Resolution 操作（data contract）

### 5.1 3 操作の定義

| 操作 | container 副作用 | provenance | event 記録 |
|------|-----------------|------------|-----------|
| **`keep-current`** | imported entry を MergePlan から除外 | なし | `suppressed_by_keep_current[]` に追加 |
| **`duplicate-as-branch`** | imported を新 lid で append（MVP default と同じ） | provenance relation 1 件追加 | `added_entries` に計上 |
| **`skip`** | imported entry を MergePlan から除外 | なし | `suppressed_by_skip[]` に追加 |

### 5.2 keep-current の厳密な意味

- MergePlan から該当 imported_lid を除外
- imported 側 relation で from/to に該当 lid を持つものは dangling drop（既存経路）
- imported 側 asset 参照は merge 後 orphan GC で除去（既存経路）
- host 側は一切変更なし（revision も増えない）

### 5.3 duplicate-as-branch の厳密な意味

- MergePlan は無変更（既存 MVP rename 経路でそのまま append）
- provenance relation を 1 件追加（§5.5 参照）
- imported は新 lid で host に並存
- host 側は一切変更なし

### 5.4 skip の厳密な意味

- MergePlan から該当 imported_lid を除外（keep-current と副作用同一 — I-MergeUI2）
- event payload の記録先のみ異なる（`suppressed_by_skip[]`）

### 5.5 provenance relation schema

`duplicate-as-branch` で追加する provenance relation：

```ts
{
  id: "<new relation id>",
  kind: "provenance",
  from_lid: "<imported_new_lid>",   // derived（merge で生成された新 lid）
  to_lid: "<host_lid>",             // source（対応 host entry）
  metadata: {
    kind: "merge-duplicate",
    detected_at: "<ISO datetime>",
    match_kind: "content-equal" | "title-only" | "title-only-multi",
    imported_title: "<snapshot>",
    imported_archetype: "<archetype>",
  }
}
```

**向き**（I-MergeUI4）：`from = imported (derived)`, `to = host (source)`。`text-textlog-provenance.md` §4 の「derived から source を指す」規則を踏襲。

**multi-host の場合**：provenance の `to_lid` は代表 host（updatedAt 最新）を指す。`metadata` に `host_candidates: string[]` を追加して全候補を記録する。

### 5.6 accept-incoming を v1 に含めない理由

canonical spec §6.2（I-Merge1 = append-only）を維持する。host entry の上書きは：

1. host absolute preservation（I-MergeUI1）に違反する
2. 上書き操作は revision 契約の別設計が必要
3. multi-host ambiguous で上書き対象が不定
4. 実運用では duplicate-as-branch → 手動 delete で同等の結果が audit trail 付きで得られる

---

## 6. API / pure helper

### 6.1 detectEntryConflicts

```ts
// features/import/conflict-detect.ts（新規）
export function detectEntryConflicts(
  host: Container,
  imported: Container,
): EntryConflict[];
```

- pure / deterministic / O(H+I)
- DOM / AppState / dispatcher 非依存（I-MergeUI10）
- cross-archetype match を発火しない

### 6.2 applyConflictResolutions

```ts
export function applyConflictResolutions(
  plan: MergePlan,
  resolutions: Record<string, Resolution>,
  conflicts: EntryConflict[],
): { plan: MergePlan; provenance_relations: Relation[] };
```

- pure / deterministic
- `keep-current` / `skip` → 該当 imported entry を plan から除外
- `duplicate-as-branch` → plan に残す + provenance relation を生成
- 既存 `applyMergePlan` は無変更

### 6.3 normalizeTitle

```ts
// features/import/conflict-detect.ts 内 or export
export function normalizeTitle(title: string): string;
```

- NFC 正規化 + trim + 連続空白圧縮
- §4.1 の pseudocode に準拠

### 6.4 bodyPreview

```ts
export function bodyPreview(body: string): string;
```

- §4.6 の規則に準拠
- 200 code points slice + 改行 → `↵` + ellipsis

### 6.5 パイプライン

```
(host, imported)
  → planMergeImport → MergePlan0（MVP 出力）
  → detectEntryConflicts → EntryConflict[]
  → UI でユーザーが resolution を選択
  → applyConflictResolutions(MergePlan0, resolutions, conflicts) → MergePlan1
  → CONFIRM_MERGE_IMPORT(MergePlan1) → 既存 applyMergePlan 経路
```

既存 `applyMergePlan` は無変更。新規 pure helper と reducer 拡張のみで v1 が成立する。

---

## 7. State interaction

### 7.1 AppState 拡張

```ts
interface AppState {
  // ... existing fields ...
  mergeConflictResolutions?: Record<string, Resolution>;
}
```

- optional field。既存 AppState literal を使う test fixture は無変更で通る
- `Resolution = 'keep-current' | 'duplicate-as-branch' | 'skip'`
- key は imported entry の lid

### 7.2 lifecycle

| trigger | mergeConflictResolutions の状態 |
|---------|-------------------------------|
| `SYS_IMPORT_PREVIEW`（mode='merge'） | `{}` で初期化 |
| `SET_CONFLICT_RESOLUTION` | 該当 key を更新 |
| `BULK_SET_CONFLICT_RESOLUTION` | 全 conflict の key を一括更新 |
| `CANCEL_IMPORT` | `undefined` に reset |
| `CONFIRM_MERGE_IMPORT` | `undefined` に reset（merge 完了後） |
| 新しい `SYS_IMPORT_PREVIEW` | `{}` に reset（re-preview） |
| `SET_IMPORT_MODE { mode: 'replace' }` | `undefined` に reset |

### 7.3 新規 action

#### SET_CONFLICT_RESOLUTION

```ts
{
  type: 'SET_CONFLICT_RESOLUTION',
  importedLid: string,
  resolution: Resolution,
}
```

reducer: `state.mergeConflictResolutions[action.importedLid] = action.resolution`

#### BULK_SET_CONFLICT_RESOLUTION

```ts
{
  type: 'BULK_SET_CONFLICT_RESOLUTION',
  resolution: Resolution,
}
```

reducer: 全 conflict の imported_lid に対して `resolution` を設定。ただし `resolution === 'keep-current'` の場合、`title-only-multi` の conflict は skip する（I-MergeUI7: keep-current disabled）。

### 7.4 CONTAINER_MERGED event 拡張

```ts
{
  type: 'CONTAINER_MERGED',
  container_id: string,
  source: string,
  added_entries: number,
  added_assets: number,
  added_relations: number,
  suppressed_by_keep_current: string[],
  suppressed_by_skip: string[],
}
```

`suppressed_by_keep_current` と `suppressed_by_skip` は新規 field。conflict UI を経由しない merge（conflict 0 件）では両配列とも空。

### 7.5 reducer 非依存の原則

- conflict 検出（`detectEntryConflicts`）は reducer 外で実行される pure helper
- reducer が conflict 検出を行うことはない
- reducer は `mergeConflictResolutions` の CRUD と、`CONFIRM_MERGE_IMPORT` 時の `applyConflictResolutions` 適用のみを担当する

---

## 8. UI contract

### 8.1 DOM selectors

| selector | purpose |
|----------|---------|
| `data-pkc-region="merge-conflicts"` | conflict list コンテナ |
| `data-pkc-conflict-id="<lid>"` | 1 件の conflict row（identity は imported 側 lid） |
| `data-pkc-field="conflict-resolution"` | resolution radio group |
| `data-pkc-action="set-conflict-resolution"` | 個別 radio click |
| `data-pkc-value="keep-current\|duplicate-as-branch\|skip"` | radio の値 |
| `data-pkc-action="bulk-resolution"` | bulk shortcut button |
| `data-pkc-conflict-kind="C1\|C2\|C2-multi"` | 分類バッジ |

### 8.2 conflict 分類バッジ

| kind | バッジ表示 | 色 token |
|------|----------|----------|
| C1（content-equal） | `✓ content identical` | `--c-info`（緑系） |
| C2（title-only） | `⚠ title matches, content differs` | `--c-warn`（黄系） |
| C2-multi（title-only-multi） | `⚠ N host candidates` | `--c-warn`（黄系） |

新規 CSS variable は追加しない。既存 PKC2 の token（`--c-accent` / `--c-warn` / `--c-info`）を再利用する。

### 8.3 radio group の表示規則

| conflict kind | keep-current | duplicate-as-branch | skip |
|---------------|-------------|-------------------|------|
| C1 | ● pre-selected（default） | ○ | ○ |
| C2 | ○（選択可） | ○ | ○ |
| C2-multi | disabled（I-MergeUI7） | ○ | ○ |

- C1：`keep-current` が default pre-selected。ユーザーは override 可能
- C2：default なし。全 radio が未選択状態
- C2-multi：`keep-current` は disabled（どの host を残すか曖昧）

### 8.4 bulk shortcut button

| button | action | 適用範囲 |
|--------|--------|---------|
| `Accept all host` | 全 conflict を `keep-current` に設定 | C1 / C2 に適用。C2-multi は skip（I-MergeUI7 維持） |
| `Duplicate all` | 全 conflict を `duplicate-as-branch` に設定 | C1 / C2 / C2-multi すべてに適用 |

### 8.5 body preview 表示

- host 側と imported 側を side-by-side で表示
- diff 表示は出さない（v1 非対象）
- body preview は §4.6 の規則に準拠（200 code points + `↵` + `...`）

### 8.6 表示項目

conflict 1 件について表示する必須項目：

| 区分 | 項目 | 表示形式 |
|------|------|---------|
| Identity | archetype badge | `TEXT` / `TEXTLOG` / `TODO` 等の文字ラベル |
| Identity | title | 生テキスト（省略なし） |
| Match | conflict kind | C1 / C2 / C2-multi バッジ（§8.2） |
| Host side | createdAt | ISO 短縮（`YYYY-MM-DD HH:mm`） |
| Host side | updatedAt | ISO 短縮 |
| Host side | body preview | 先頭 200 code points |
| Incoming | createdAt | ISO 短縮 |
| Incoming | updatedAt | ISO 短縮 |
| Incoming | body preview | 先頭 200 code points |
| Resolution | radio group | 3 択（§8.3 の規則） |

### 8.7 画面レイアウト（概念）

```
┌─────────────────────────────────────────┐
│ Import Preview                          │
├─────────────────────────────────────────┤
│ ○ Replace    ● Merge                    │
├─────────────────────────────────────────┤
│ +12 entries, rename 3, dedup 5 assets,  │
│ drop 2 relations, drop 4 revisions      │  ← MVP 5行サマリ（無変更）
├─────────────────────────────────────────┤
│ Entry conflicts: N                      │  ← v1 追加セクション
│  ├─ #1 [TEXT] "Report 2025" (C1 ✓)      │
│  │   Host   : 2025-03-01 / body...      │
│  │   Incoming: 2025-03-01 / body...     │
│  │   ● Keep current  ○ Branch  ○ Skip   │
│  ├─ #2 [TODO] "Plan A" (C2 ⚠)          │
│  │   ...                                │
│  └─ #3 [TEXTLOG] "Log" (C2-multi ⚠)    │
│   [ Accept all host ] [ Duplicate all ] │
├─────────────────────────────────────────┤
│              [Cancel]  [Confirm merge]  │  ← gate 条件で disable/enable
└─────────────────────────────────────────┘
```

### 8.8 keyboard

v1 では conflict UI 固有のキーボードショートカットは追加しない。radio / button は標準の Tab / Space / Enter で操作可能。

---

## 9. Gate 条件

### 9.1 Confirm ボタンの enable/disable 完全判定表

| C1 全件 resolved | C2 全件 explicit | C2-multi 全件 explicit | Confirm enabled |
|-----------------|-----------------|----------------------|-----------------|
| yes（default or override） | yes | yes | **YES** |
| yes | no | — | **NO** |
| yes | yes | no | **NO** |
| no | — | — | **NO** |

### 9.2 「resolved」の定義

- C1 は `keep-current` が default pre-selected されているため、ユーザーが何も操作しなくても「resolved」として扱う
- C2 / C2-multi はユーザーが明示的に radio を選択するまで「unresolved」

### 9.3 gate 未通過時の表示

- `Confirm merge` button は `disabled` attribute を持つ
- button の近傍に残件数を表示：`Resolve N pending conflicts`（N は unresolved の C2 / C2-multi 件数）

### 9.4 既存 gate との共存

conflict UI の gate は既存の gate 条件（schema mismatch / importPreview null）に **追加** される。既存 gate が block している場合、conflict gate の判定は行わない（既存 gate が先に reject する）。

---

## 10. Error paths

### 10.1 schema mismatch

- 既存の preview gate で reject される（I-MergeUI8）
- conflict UI は mount されない
- 追加対応不要

### 10.2 conflict 0 件

- `detectEntryConflicts` が空配列を返す
- conflict UI セクションを mount しない
- MVP 5 行サマリのみ表示
- `Confirm merge` button は既存 gate のみで enable/disable 判定

### 10.3 re-preview（新しい SYS_IMPORT_PREVIEW）

- `mergeConflictResolutions` を `{}` に reset（I-MergeUI5）
- 新しい `EntryConflict[]` で conflict UI を再描画
- 前回の選択は保持しない（imported container が変わった可能性があるため）

### 10.4 CANCEL_IMPORT

- `mergeConflictResolutions` を `undefined` に clear（I-MergeUI5）
- conflict UI を unmount
- 次回 preview で空から再開

### 10.5 host container null

- 既存 reducer guard が block する
- conflict UI の mount trigger が発火しない
- 追加対応不要

---

## 11. Testability

### 11.1 テスト範囲概要

| 層 | 件数目安 | 対象 |
|----|---------|------|
| pure helper | ~12 件 | detectEntryConflicts / applyConflictResolutions / normalizeTitle / bodyPreview |
| reducer | ~6 件 | SET_CONFLICT_RESOLUTION / BULK_SET_CONFLICT_RESOLUTION / reset on cancel/confirm/re-preview |
| UI/DOM | ~7 件 | mount / badge rendering / radio interaction / bulk buttons / gate disable/enable / unmount |
| **合計** | **~25 件** | |

### 11.2 pure helper テスト詳細

| # | テスト | 検証内容 |
|---|-------|---------|
| 1 | C1 検出（content-equal） | archetype + title + contentHash 一致 → kind='content-equal' |
| 2 | C2 検出（title-only） | archetype + title 一致、contentHash 不一致、host 1 件 → kind='title-only' |
| 3 | C2-multi 検出（title-only-multi） | host 候補 2 件以上 → kind='title-only-multi' + host_candidates |
| 4 | C3 判定（no-conflict） | archetype or title 不一致 → 空配列 |
| 5 | multi-host 代表選定 | updatedAt 最新が host_lid に設定される |
| 6 | multi-host tie-break | updatedAt 同一 → array index 昇順（先頭）が代表 |
| 7 | normalizeTitle: NFC + trim + 空白圧縮 | `"  Hello  World  "` → `"Hello World"` |
| 8 | normalizeTitle: 大文字小文字区別 | `"ABC"` ≠ `"abc"` |
| 9 | bodyPreview: 200 code points 未満 | ellipsis なし |
| 10 | bodyPreview: 200 code points 以上 | `...` 付加 |
| 11 | bodyPreview: 改行置換 | `\n` → `↵` |
| 12 | applyConflictResolutions: keep-current / duplicate / skip の各分岐 | plan 除外 / plan 維持 + provenance / plan 除外 |

### 11.3 reducer テスト詳細

| # | テスト | 検証内容 |
|---|-------|---------|
| 1 | SET_CONFLICT_RESOLUTION | 指定 lid の resolution が更新される |
| 2 | BULK_SET_CONFLICT_RESOLUTION（keep-current） | C2-multi は skip される（I-MergeUI7） |
| 3 | BULK_SET_CONFLICT_RESOLUTION（duplicate） | 全 conflict に適用される |
| 4 | CANCEL_IMPORT で reset | mergeConflictResolutions が undefined になる |
| 5 | CONFIRM_MERGE_IMPORT で reset | mergeConflictResolutions が undefined になる |
| 6 | re-preview（SYS_IMPORT_PREVIEW）で reset | mergeConflictResolutions が {} になる |

### 11.4 UI/DOM テスト詳細

| # | テスト | 検証内容 |
|---|-------|---------|
| 1 | conflict UI mount | `[data-pkc-region="merge-conflicts"]` が存在する |
| 2 | C1 バッジ表示 | `[data-pkc-conflict-kind="C1"]` が表示される |
| 3 | C2 バッジ表示 | `[data-pkc-conflict-kind="C2"]` が表示される |
| 4 | radio interaction | radio click → SET_CONFLICT_RESOLUTION dispatch |
| 5 | bulk button | bulk click → BULK_SET_CONFLICT_RESOLUTION dispatch |
| 6 | gate disable/enable | C2 未 resolve → Confirm disabled、全 resolve → enabled |
| 7 | unmount on cancel | CANCEL_IMPORT → conflict UI が消える |

---

## 12. Non-goal / v1.x 余地

### 12.1 v1 で意図的に実装しないもの

| 機能 | 理由 |
|------|------|
| accept-incoming（host 上書き） | I-MergeUI1 違反。append-only 契約を維持する |
| semantic merge（field 単位 cherry-pick） | archetype 別仕様が必要、組み合わせ爆発 |
| 3-way merge（common ancestor） | ancestor identity の記録機構が PKC2 に存在しない |
| archetype-aware diff | archetype × diff 手法の組み合わせが大きい |
| revision 持ち込み / 比較 | canonical §8.3 の非対象を維持 |
| policy UI（永続ルール登録） | 設定 UI + persistence が merge 単体テーマを超える |
| staging container | 独立テーマ |
| bulk orchestration（archetype 別 / 条件付き） | v1 は 2 bulk のみ（I-MergeUI6） |
| Skip all bulk | merge する意味がなくなるため |
| conflict 並び替え UI | v2+ |
| conflict expand/collapse animation | UX polish、v1 不要 |
| conflict 検出 progress indicator | pure helper の 1 回走査で終わるため不要 |
| merge 後 result summary toast | 既存 CONTAINER_MERGED event で十分 |
| 大文字小文字区別 toggle | v1 は固定（区別あり） |
| title-only match disable toggle | v1.x で additive 追加可能 |

### 12.2 v1.x で additive 追加可能なもの

以下は v1 contract を破壊せずに追加できる：

- `title-only match` 判定の disable toggle（preview UI に checkbox 1 個）
- `normalizeTitle` の strictness 2 段階（v1 = 空白正規化のみ、strict = 大文字小文字非区別）
- conflict list の pagination（v1 は全件表示、v1.x で 20 件/page に cap）

### 12.3 canonical spec §8 との関係

本書は canonical spec §8 の決定を以下のように refine する（緩めず・破壊せず）：

| canonical §8 項目 | 本書 v1 での扱い |
|------------------|-----------------|
| §8.1 Per-entry 選択 UI（非対象） | **本書で解禁**（最小 3 操作、host 破壊は許さない） |
| §8.2 Title / body hash 同一性判定（非対象） | **本書で解禁**（C1 = content-equal で活用） |
| §8.3 Revision 持ち込み（非対象） | 維持（非対象） |
| §8.4 Policy UI（非対象） | 維持（非対象） |
| §8.5 Staging container（非対象） | 維持（非対象） |
| §8.6〜§8.9 | 維持（非対象） |

解禁する項目は §8.1 と §8.2 の 2 項目のみ。core 不変条件（append-only / host 破壊禁止 / schema mismatch reject）は一切触らない。

---

**Contract drafted 2026-04-17.**
