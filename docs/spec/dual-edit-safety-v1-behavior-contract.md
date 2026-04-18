# Dual-Edit Safety v1 — Behavior Contract

Status: DRAFT
Created: 2026-04-17
Category: FI-01（File-based Issue P0）
Predecessor: `docs/spec/dual-edit-safety-v1-minimum-scope.md`（同日、minimum scope）
Purpose: FI-01「別ウィンドウ / センターペイン 並行編集の安全性」の振る舞い契約を 1 本に固定し、pure → state → UI → audit → manual の実装 pipeline の入口を確定する。

---

## 0. 位置づけ

本書は FI-01 テーマの **behavior contract** である。minimum scope が「何を守るか」を決めたのに対し、本書は「**どう動くか**」を operation / data / pure / invariance / outcome / provenance / gate / UI / non-goal / future で 1 本に固定する。

- 本書の役割: pure / state / UI 実装が参照する**唯一の契約**
- 本書承認後に pure slice → state slice → UI (reject overlay) slice → post-impl audit → manual sync の順で進める

### 0.1 supervisor 固定事項（本 contract で pin する 6 点）

minimum scope 受理時に supervisor が明示指示した以下 6 点を固定する:

1. **save-time optimistic version guard を採用**（他戦略は v1 非対象）
2. **silent overwrite は絶対禁止**（I-Dual1）
3. **v1 では CRDT / 3-way merge / realtime sync / hard lock は非対象**
4. **reject 時の default safe action = Save as branch**
5. **競合判定 key = `updated_at` 主、`content_hash` 補助**
6. **advisory banner は optional のまま**（mandatory に昇格しない）

### 0.2 関連 doc

| doc | 関係 |
|-----|-----|
| `docs/spec/dual-edit-safety-v1-minimum-scope.md` | 前段 minimum scope。scope / 不変条件 / 採用戦略の根拠 |
| `docs/spec/data-model.md §3` | Entry schema（`updated_at` の常在保証） |
| `docs/spec/data-model.md §6.2.1` | Revision `content_hash`（FNV-1a-64、16-char lowercase hex、H-6） |
| `docs/spec/data-model.md §5` | Relation schema（`kind='provenance'` の additive 追加は H-8） |
| `docs/spec/provenance-relation-profile.md §3.1` | provenance canonical direction（source → derived） |
| `docs/spec/provenance-relation-profile.md §2.2` | metadata profile（required / recommended / optional） |
| `docs/spec/revision-branch-restore-v1-behavior-contract.md` | C-1 branch restore（本書の branch 操作と**別 conversion_kind**、実装共有のみ） |
| `docs/spec/merge-conflict-ui-v1-behavior-contract/` | H-10 conflict overlay の DOM 流儀参考 |
| `src/core/operations/container-ops.ts` | `addEntry` / `updateEntry` / `addRelation` — branch 側で再利用 |
| `src/adapter/state/app-state.ts` | 既存 save 経路（`COMMIT_ENTRY_EDIT` 付近）— gate を差し込む場所 |

---

## 1. Scope

### 1.1 対象 surface

本 contract が守るのは **entry の title / body を commit する save 経路**（= 編集モード終了時の確定 save）である。以下が surface:

- センターペイン（main window）の編集モード → 確定 save
- 別ウィンドウ（Entry Window、`src/adapter/ui/entry-window.ts`）の編集モード → 確定 save

両 surface が同一 LID の entry を編集し、並行に save を commit する経路を gate する。

### 1.2 対象 save operation

- `COMMIT_ENTRY_EDIT`（既存）— 編集モードから ready phase への遷移時、title / body / updated_at を entry に反映する
- 本 contract は既存 action の名前を変えない。**reducer 内に version guard を挿入する**（§5）

### 1.3 非対象 save operation

- `QUICK_UPDATE_ENTRY`（body-only の inline 更新、todo 状態 toggle 等）— v1 では gate しない
- `RESTORE_ENTRY` / `BRANCH_RESTORE_REVISION`（C-1 経路）— 自身が forward-mutation で版を進めるため、独自 gate 不要
- `MOVE_ENTRY`（C-2）/ merge-import 確定 / folder 操作 — entry body を触らないため非対象

### 1.4 粒度

**entry 単位**（I-Dual6）。Container 全体 diff / Relation 集合 / Revision chain などは比較対象にしない。

---

## 2. Data contract

### 2.1 EditBaseSnapshot（新規型）

編集開始時に捕獲し、save まで edit-session に紐付けて保持するバージョンタグ。

```ts
type EditBaseSnapshot = {
  lid: string;               // 編集対象の LID
  archetype: Archetype;      // 開始時点の archetype（archetype 変化防止用）
  updated_at: string;        // 主判定キー（ISO 8601 文字列、常在保証）
  content_hash?: string;     // 補助判定キー（H-6、欠ける可能性あり）
};
```

- `updated_at` は Entry に**常在**する前提（`data-model.md §3`）
- `content_hash` は H-6 の additive optional。**欠けていても判定は成立する**（固定事項 5）
- `archetype` は「編集中に別経路で archetype が変わった」異常検知専用（I-Dual8）

### 2.2 判定ルール（semantic contract）

`EditBaseSnapshot` と `Container` 現状から以下を計算する:

| 状況 | 判定 |
|------|------|
| `container.entries` に `base.lid` が無い | `entry-missing`（= conflict。reject） |
| 現 entry の `archetype !== base.archetype` | `archetype-changed`（reject） |
| 現 entry の `updated_at !== base.updated_at` | `version-mismatch`（reject、§5 主経路） |
| 上記すべて通過し、両者に `content_hash` が存在して一致しない | `version-mismatch`（reject、content_hash 補助判定） |
| 上記すべて通過 | `safe`（save を進める） |

### 2.3 action payload schema

contract レベルの action shape。実装で既存 action 名を流用して拡張する場合も shape を満たす。

```ts
// 編集 commit（既存 COMMIT_ENTRY_EDIT を拡張する想定）
type CommitEntryEditPayload = {
  type: 'COMMIT_ENTRY_EDIT';
  lid: string;
  base: EditBaseSnapshot;           // 編集開始時に capture
  draft: { title: string; body: string };
};

// dual-edit conflict の解決 dispatch
type ResolveDualEditConflictAction = {
  type: 'RESOLVE_DUAL_EDIT_CONFLICT';
  lid: string;
  base: EditBaseSnapshot;
  draft: { title: string; body: string };
  resolution: 'save-as-branch' | 'discard-my-edits';
  // 'copy-to-clipboard' は UI-only（dispatch しない、§8.1）
};
```

- `base` は action が発火するたびに渡す（reducer は state に持たなくてよい、§5.1）
- 解決 action は overlay ボタン click から **1 件だけ** 発火する
- 採番される新 lid / 新 relation id / 時刻は reducer 内で `generateLid()` / `now()` を呼ぶ（I-Dual10）

### 2.4 時刻・lid の採番

| 値 | 採番者 | pure helper への渡し方 |
|----|-------|------------------------|
| 新 branch entry の lid | reducer が `generateLid()` | `branchFromDualEditConflict` の `newLid` 引数 |
| provenance relation の id | reducer が `generateLid()` | 同 `relationId` 引数 |
| `now` タイムスタンプ | reducer が `now()` | 同 `now` 引数 |

pure helper は外部注入された id / 時刻のみを使い、自前で乱数 / 時計を読まない（I-Dual10）。

---

## 3. Pure contract

### 3.1 capture helper

```ts
function captureEditBase(
  container: Container,
  lid: string,
): EditBaseSnapshot | null;
```

- `container.entries` から `lid` 一致の entry を探す。無ければ `null`
- 一致 entry の `lid / archetype / updated_at` を返し、`content_hash` は H-6 の最新 revision から採用可能なら入れる（= 最後に保存された状態の hash）
- 本 helper は side effect を持たない。時計 / 乱数に触れない

### 3.2 primary judgement

```ts
function isSaveSafe(
  base: EditBaseSnapshot,
  container: Container,
): boolean;
```

- `true` なら save を進めてよい。`false` なら reject
- 判定規則は §2.2 の決定表そのもの
- 出力は単純 boolean。詳細分類は次の helper で取る

### 3.3 richer check helper

```ts
type SaveConflictCheck =
  | { kind: 'safe' }
  | { kind: 'entry-missing' }
  | { kind: 'archetype-changed'; currentArchetype: Archetype }
  | { kind: 'version-mismatch'; currentUpdatedAt: string; currentContentHash?: string };

function checkSaveConflict(
  base: EditBaseSnapshot,
  container: Container,
): SaveConflictCheck;
```

- UI に渡すための richer 分類。ただし UI は第 1 版では kind を区別表示しなくてよい（§8.1）
- `isSaveSafe` は `checkSaveConflict(...).kind === 'safe'` と等価

### 3.4 branch builder

```ts
function branchFromDualEditConflict(
  container: Container,
  base: EditBaseSnapshot,
  draft: { title: string; body: string },
  newLid: string,
  relationId: string,
  now: string,
): Container;
```

- `container` をコピーし、`draft` 内容で新 entry を `newLid` で追加
- provenance relation を 1 件追加（from = `base.lid`、to = `newLid`、§6）
- archetype は `base.archetype` を継承（この時点で現 entry が別 archetype でも、branch 側は編集者の想定 archetype を採用）
- pure、deterministic、side effect なし

### 3.5 deterministic rules

- すべての pure helper は同一入力に対して同一出力（decision / hash / 採番注入）
- 時計 / 乱数 / IDB 等の非決定入力に**触れない**
- テストは id / 時刻を fix して `deepEqual` で決定的に検証できる

---

## 4. Invariance — I-Dual1〜I-Dual10

minimum scope §4 の 6 項目を踏襲し、contract 段階で 4 項目（I-Dual7〜10）を追加。以後の pure / state / UI slice はこの番号で参照する。

### I-Dual1 — Silent overwrite 不可

save はいかなる経路でも **accept または reject の二値**。base と current の version tag が不一致の場合、entry body は reducer で上書きされない。

### I-Dual2 — Edit buffer 即時破棄不可

reject 時、ユーザーの編集 buffer は reducer / UI 側で即破棄しない。明示操作（`RESOLVE_DUAL_EDIT_CONFLICT` の dispatch）で初めて消費される。

### I-Dual3 — Pure 判定

競合判定は pure 関数（§3.2 / §3.3）で下せる。外部通信 / 非決定入力に依存しない。

### I-Dual4 — 既存 reducer 非破壊

accept 経路は既存 `COMMIT_ENTRY_EDIT` reducer と同一。二重差し込みしない。gate は既存 reducer の**先頭に追加**する 1 分岐のみ。

### I-Dual5 — Revision chain 不変

reject した save は `container.revisions` に何も追加しない。accept した save は既存 revision 作成ルールに従う。失敗 save は revision に現れない。

### I-Dual6 — Entry 単位判定

reject 判定は entry **単位**。Container 全体差分 / Relations / 他 entry の版には依存しない。

### I-Dual7 — `updated_at` 主、`content_hash` 補助

版の同一性判定は `updated_at` を主キーに、`content_hash` を補助キーに用いる（supervisor 固定事項 5）:

- `updated_at` が不一致 → 即 reject
- `updated_at` が一致し、両者に `content_hash` が揃って一致しない → reject（防波堤）
- `content_hash` が片方または両方欠けている場合は `updated_at` 一致のみで safe と判定

pre-H-6 データ（`content_hash` 欠落）でも動作する保証。

### I-Dual8 — Save as branch は C-1 と別 operation

本 contract の「Save as branch」は C-1 revision-branch-restore とは**別 operation**。以下で区別する:

| 属性 | C-1 branch restore | dual-edit branch |
|-----|--------------------|------------------|
| trigger | 任意 revision の picker click | dual-edit conflict の reject 解決 |
| source | 過去の Revision の snapshot | 編集中 draft |
| `metadata.conversion_kind` | `'revision-branch'` | `'concurrent-edit'` |
| `metadata.source_revision_id` | 指定 revision の id | **持たせない**（revision ではない） |
| provenance 向き | source entry → derived（I-Rbr9） | 既存 entry → derived（§6.2） |
| 実装共有 | — | `addEntry` / `updateEntry` / `addRelation` は共有可 |

contract 層では別 theme の操作として扱う。pure helper 名も別（`branchFromDualEditConflict` vs `branchRestoreRevision`）。

### I-Dual9 — Gate は既存 blocker 経路の再利用

readonly / viewOnlySource / importPreview / batchImportPreview / phase !== 'ready' / entry-missing 等の gate は、既存 `blocked(state, action)` 経路を再利用する（I-Rbr7 の流儀と対称）。新 blocker 経路を増やさない。

### I-Dual10 — 採番決定性

pure helper は新 lid / relation id / 時刻を**外部から注入**で受け取り、内部で乱数 / 時計に依存しない。reducer が `generateLid()` / `now()` を呼び、pure helper に渡す。

---

## 5. Conflict outcome contract

### 5.1 4 outcome matrix

| outcome | trigger | reducer 振る舞い | entry body 変化 | selectedLid 変化 |
|---------|---------|------------------|-----------------|-------------------|
| **safe save** | `COMMIT_ENTRY_EDIT` で `isSaveSafe = true` | 既存経路で draft を適用、`updated_at` 更新 | あり（正規の更新） | 変わらない |
| **conflict reject** | `COMMIT_ENTRY_EDIT` で `isSaveSafe = false` | `state.dualEditConflict` に base / draft / kind を格納、entry body は touch しない | なし | 変わらない |
| **Save as branch** | `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'save-as-branch' }` | `branchFromDualEditConflict` で新 entry + provenance relation を追加、`dualEditConflict` を clear | なし（元 entry 不変） | 新 branch lid に移す |
| **Discard my edits** | `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'discard-my-edits' }` | buffer を破棄（state から clear）、`dualEditConflict` を clear | なし | 変わらない |

- **Copy to clipboard** は UI-only 動作。dispatch しない（§8.1）

### 5.2 safe save

既存 `COMMIT_ENTRY_EDIT` 経路と同一。version guard が先頭で `checkSaveConflict(base, container).kind === 'safe'` を確認し、通れば以降は無変更。

### 5.3 conflict reject

- reducer は `state.container` / `state.editingLid` / `state.entries` を touch しない
- `state.dualEditConflict` に `{ lid, base, draft, kind }` を格納
- UI は `state.dualEditConflict` が populated の時点で reject overlay を描画する（§8）
- event として `DUAL_EDIT_SAVE_REJECTED { lid, baseUpdatedAt, currentUpdatedAt, kind }` を 1 件発火

### 5.4 Save as branch（default CTA）

- `branchFromDualEditConflict(container, base, draft, newLid, relationId, now)` で Container を更新
- provenance relation を 1 件 append（§6）
- `selectedLid = newLid` に移す
- `state.dualEditConflict` を `null` に戻す
- event: `ENTRY_BRANCHED_FROM_DUAL_EDIT { sourceLid: base.lid, newLid, resolvedAt: now }`

### 5.5 Discard my edits

- edit buffer を破棄、`state.dualEditConflict` を `null` に戻す
- entry / container は変化なし
- event: `DUAL_EDIT_DISCARDED { lid: base.lid }`

### 5.6 Copy to clipboard

- UI が `navigator.clipboard.writeText(draft.body)` を実行
- reducer は何もしない。`dualEditConflict` は維持したまま overlay も閉じない
- これは escape hatch。データ破棄前の逃げ道として常時利用可能

---

## 6. Provenance / branch semantics

### 6.1 conversion_kind

Save as branch で追加する provenance relation の `metadata.conversion_kind = 'concurrent-edit'` を固定する（supervisor 固定事項 3）。

- `provenance-relation-profile.md §2.2.1` の required key 列挙に additive に追加
- 既存値（`'text-to-textlog'` / `'textlog-to-text'` / `'revision-branch'` / `'import-derived'`）の意味は変わらない
- C-1 の `'revision-branch'` とは**別値**（I-Dual8）

### 6.2 direction

```
from = base.lid（source、= 勝った側の entry）
  ─[provenance]─►
to = newLid（derived、= 負けた側の draft を保持する新 entry）
```

`provenance-relation-profile.md §3.1` の canonical direction（source → derived）に厳密に従う。

### 6.3 metadata profile

```ts
{
  conversion_kind: 'concurrent-edit',        // required、§6.1
  converted_at: now,                          // required、profile §2.2.1
  source_updated_at: base.updated_at,         // optional（本 contract で新規）
  source_content_hash?: base.content_hash,    // recommended、欠けていれば key を含めない
}
```

- `source_updated_at` は本 contract で additive に追加する optional key
  - profile §2.2.3 の context-specific（`conversion_kind='concurrent-edit'` 専用）
  - 「どの updated_at を base にして reject されたか」を後追い可能に
- `source_content_hash` は既存 recommended key を流用（profile §2.2.2）
- `source_revision_id` は**持たせない**（本 operation の source は revision ではない、I-Dual8）

### 6.4 profile への additive 追加

| 追加要素 | 種別 | profile 内の位置 |
|---------|-----|------------------|
| `conversion_kind = 'concurrent-edit'` | 新規**値** | §2.2.1 required の列挙に additive |
| `source_updated_at: string` | 新規 optional key | §2.2.3 context-specific |

既存 key / 値の意味は変わらない。

### 6.5 provenance の読み取り経路（v1 では追加しない）

- backlinks グラフ描画 / ancestor chain traversal / provenance hover tooltip は v1 非対象
- link-index（C-3）は touch しない（I-LinkIdx 独立）
- concurrent-edit 関係の list 表示は v1 で提供しない（v1.x 余地、§10）

---

## 7. Gate / error paths

### 7.1 reducer 側 gate（block 条件）

`COMMIT_ENTRY_EDIT` は以下条件で `blocked(state, action)` に落とす（既存経路再利用、I-Dual9）:

| 条件 | 理由 |
|------|------|
| `!state.container` | Container 未ロード |
| `state.readonly` | readonly workspace |
| `state.viewOnlySource` | 埋め込み由来の view-only |
| `state.phase !== 'editing'` | 編集モードに入っていない |
| `state.editingLid !== action.lid` | lid mismatch |
| `state.importPreview !== null` | import preview 表示中 |
| `state.batchImportPreview !== null` | batch import preview 表示中 |

`RESOLVE_DUAL_EDIT_CONFLICT` は追加で以下を check:

| 条件 | 理由 |
|------|------|
| `state.dualEditConflict === null` | 解決対象が存在しない |
| `state.dualEditConflict.lid !== action.lid` | 解決対象の lid mismatch |

### 7.2 pure helper 側 error kinds

`checkSaveConflict` の `kind` 返り値で以下を区別（§3.3）:

| kind | 発生条件 | reject 後の UX |
|------|---------|----------------|
| `safe` | すべて一致 | reject しない |
| `entry-missing` | base.lid の entry が消えた（別経路で削除） | reject overlay + 「Save as branch で救済」を CTA |
| `archetype-changed` | archetype が変わった（別経路で変換） | 同上 |
| `version-mismatch` | `updated_at` / `content_hash` 不一致 | 同上 |

v1 UI は kind を区別表示しなくてよい（§8.1）。reducer は 4 種類いずれも `dualEditConflict` に格納して overlay を出す。

### 7.3 historical / editing phase の扱い

- **historical revision 閲覧中**: そもそも編集モードに入れない既存ガードがあるため、本 contract は新規 gate を加えない
- **phase === 'editing'** かつ `editingLid !== null`: 通常の save 経路。version guard が走る
- **phase === 'ready'**: 編集モード未満なので `COMMIT_ENTRY_EDIT` は reducer 側の既存 blocker が掴む（§7.1）

---

## 8. UI contract（最小）

### 8.1 reject overlay

reject が起きたとき、既存 overlay UI 流儀（boot-source-chooser.ts / merge-conflict section）を再利用して最小 modal を描画する。

- root: `[data-pkc-region="dual-edit-conflict"]`（singleton、`state.dualEditConflict` populated の時のみ mount）
- overlay を Escape キーでは閉じない（明示選択を要求）
- 背景 click でも閉じない
- テキスト要素は 1 行 + 箇条書き 3 行以内

ボタン 3 つ（DOM 順固定）:

| ボタン | `data-pkc-action` | default focus | dispatch |
|-------|------------------|---------------|----------|
| Save as branch | `resolve-dual-edit-save-as-branch` | **有**（default CTA、I-Dual7 のセーフ自動方向） | `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'save-as-branch' }` |
| Discard my edits | `resolve-dual-edit-discard` | 無 | `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'discard-my-edits' }` |
| Copy to clipboard | `resolve-dual-edit-copy-clipboard` | 無 | dispatch なし（UI-only、§5.6） |

- default focus は mount 時に Save as branch ボタンに当たる
- kind 区別表示は v1 では行わない（全 kind で同一 overlay、文言は「別のセッションでこのエントリが更新されました」で統一）

### 8.2 advisory banner（optional のまま）

編集開始時に「別窓で同 entry を編集中」を検知できた場合の banner は **optional**（supervisor 固定事項 6）:

- root: `[data-pkc-region="dual-edit-advisory"]`
- 本 v1 では **mandatory ではない**。検知機構（BroadcastChannel / localStorage + storage event）は v1 では**実装しない**でもよい
- 実装する場合でも hard block は不可（advisory only）
- advisory が無くても I-Dual1〜10 は維持される（version guard が最後の防波堤）

### 8.3 v1 非対象 UI

以下は v1 の UI に**追加しない**（§9 と対応）:

- diff viewer（自分の draft と現 entry の差分比較）
- merge editor（field 単位で選んで残す）
- concurrent edit indicator（リアルタイムの peer 状態表示）
- lock manager（hard lock の UI）
- conflict history / log（過去の reject を一覧表示）
- kind 別の差別化表示（entry-missing / archetype-changed / version-mismatch）

### 8.4 data-pkc-* 規約

全 functional selector は `data-pkc-*` 属性（class 名は使わない）。既存 CLAUDE.md 規約に従う。

| 役割 | selector |
|------|---------|
| overlay root | `[data-pkc-region="dual-edit-conflict"]` |
| advisory root（optional） | `[data-pkc-region="dual-edit-advisory"]` |
| Save as branch action | `[data-pkc-action="resolve-dual-edit-save-as-branch"]` |
| Discard action | `[data-pkc-action="resolve-dual-edit-discard"]` |
| Copy action | `[data-pkc-action="resolve-dual-edit-copy-clipboard"]` |
| lid carry | `[data-pkc-lid]` |

---

## 9. Non-goal（v1 で**やらない**）

以下は contract / pure / state / UI / tests / manual いずれでも触れない:

- **field 単位 merge / 3-way merge / auto-merge**
- **diff viewer**（reject 時も、通常編集時も）
- **concurrent live sync**（save 以外の瞬間に peer 状態を反映）
- **lock manager**（hard lock の仕組み・UI）
- **multi-entry conflict coordination**（複数 entry をまとめて resolve）
- **CRDT / OT**
- **別 container / 別デバイス / 別ブラウザ間の同期**
- **3 ウィンドウ以上の網羅保証**（動作はするが網羅 test しない）
- **Container meta / Relations / Revisions 直接編集時の guard 拡張**
- **form archetype の formSchema 変更衝突**
- **advisory banner の mandatory 化**（optional のまま、固定事項 6）
- **QUICK_UPDATE_ENTRY / RESTORE_ENTRY / BRANCH_RESTORE_REVISION への version guard 波及**

---

## 10. Future extension（余地のみ記述、v1 では着手しない）

| 余地 | 想定時期 | 備考 |
|------|---------|------|
| advisory banner の mandatory 化 | v1.x | BroadcastChannel 検知を必須に昇格 |
| richer diff viewer at reject | v1.x | 「自分と相手の差分を見てから選ぶ」UX |
| 自動 reconciliation | v1.x〜v2 | 同じ文字列に置換した等の trivial 衝突を自動 resolve |
| multi-window awareness 拡張 | v1.x | 3 以上のウィンドウ間で peer 状態の集約表示 |
| hard edit lock（設定で opt-in） | v1.x | 単独作業重視のユースケース向け |
| field 単位 merge | v2 | semantic merge。大工事 |
| real-time collaborative edit | v2〜 | D-3（WebRTC）と合流 |
| concurrent-edit history list | v1.x | 過去の reject / branch を検索可能に |
| QUICK_UPDATE_ENTRY への guard 拡張 | v1.x | todo toggle 等の inline 更新にも gate を |

---

## 11. References

- FI-01 issue: `docs/planning/file-issues/01_dual-window-concurrent-edit-safety.md`
- minimum scope: `docs/spec/dual-edit-safety-v1-minimum-scope.md`
- provenance profile: `docs/spec/provenance-relation-profile.md`（§2.2 / §3.1 を参照）
- data-model: `docs/spec/data-model.md`（§3 Entry / §5 Relation / §6 Revision）
- C-1 branch restore contract: `docs/spec/revision-branch-restore-v1-behavior-contract.md`（共有 helper の流儀）
- H-10 merge conflict overlay: `docs/spec/merge-conflict-ui-v1-behavior-contract/`（overlay 流儀）
- S-30 boot source chooser: `docs/development/boot-container-source-policy-revision.md`（overlay 実装の参考）

---

## 12. Pipeline 上の位置

1. minimum scope — 完了（commit `8d91086`）
2. **behavior contract**（本書）— 本コミットで完了予定
3. pure slice — `captureEditBase` / `isSaveSafe` / `checkSaveConflict` / `branchFromDualEditConflict`
4. state slice — `AppState.dualEditConflict` 追加、`COMMIT_ENTRY_EDIT` 先頭に gate、`RESOLVE_DUAL_EDIT_CONFLICT` reducer case
5. UI slice — reject overlay、`action-binder` の 3 action、default focus
6. audit — post-impl invariance（I-Dual1〜10 全網羅）
7. manual sync — 05 日常操作 / 09 トラブルシューティング
