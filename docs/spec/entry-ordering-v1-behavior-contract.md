# Entry Ordering — v1 Behavior Contract

Status: 実装済み(C-2 entry-ordering v1、v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は behavior contract / historical design record として保持。実装の現物は `src/features/entry-order/entry-order.ts` / `tests/features/entry-order/entry-order.test.ts`。
Created: 2026-04-17
Category: C. Data Model Extensions（運用 UX 寄り）
Predecessor: `docs/spec/entry-ordering-v1-minimum-scope.md`（feasibility、2026-04-17）
Purpose: C-2 entry-ordering v1 の **behavior contract**（data + operation + invariants + gate の完全固定）。本書承認以降は pure / state / UI slice の実装と audit はこの契約のみを参照する。

---

## 0. 位置づけ

### 0.1 前段との関係

本書は `entry-ordering-v1-minimum-scope.md` の feasibility と minimum scope を昇格させた **behavior contract** であり、以下の 4 決定は supervisor により **固定済み** として扱う（再議論しない）:

| # | 固定事項 | 根拠 |
|---|---------|------|
| D1 | data model は **Option A** (`Container.meta.entry_order?: string[]`) | v1 の軽さ、additive、SCHEMA_VERSION 据置 |
| D2 | manual order は **manual mode でのみ有効**（`sortKey='manual'` 相当の明示モード） | 自動 sort と混ざると UX が曖昧 |
| D3 | v1 scope は **sidebar detail mode only** | calendar / kanban / textlog 非干渉 |
| D4 | v1 操作は **Move up / Move down only** | 最小操作集合、到達可能性は保証 |

### 0.2 docs-first パイプライン上の位置

```
minimum-scope (feasibility) ← 完了（2026-04-17）
  ↓ 本書（behavior contract） ← 本ドキュメント
  ↓ pure slice（sort / normalize / place helper）
  ↓ state slice（reducer + action schema）
  ↓ UI slice（↑/↓ ボタン + manual mode toggle）
  ↓ audit
  ↓ manual（end-user doc）
```

本書は **implementation doc ではない**。reducer の内部データ構造変換 / DOM 詳細 / test 本数配分の決定は各 slice doc で行う。本書は「何が contract されているか（invariance / data / operation / gate）」を固定することに集中する。

### 0.3 関連 doc

| doc | 関係 |
|-----|-----|
| `docs/spec/entry-ordering-v1-minimum-scope.md` | 前段 feasibility、本書の I-Order1〜10 原型 |
| `docs/spec/data-model.md` §4（Container）| `meta` additive 追加先 |
| `docs/spec/schema-migration-policy.md` | additive のみ → SCHEMA_VERSION 据置 |
| `src/features/search/sort.ts` | 既存 `sortEntries` は fallback として温存 |
| `src/adapter/state/app-state.ts` | `sortKey` 型が `'manual'` 追加で拡張される |
| `src/features/relation/tree.ts` | sidebar tree の所属集合判定 |

---

## 1. Scope

### 1.1 対象 view / mode

v1 の contract が **適用される**:

- `viewMode === 'detail'`（sidebar 表示）
- `sortKey === 'manual'`（manual mode が on の時のみ、I-Order2 の fallback に従う）

v1 の contract が **適用されない**（契約外、現行挙動が温存される）:

- `viewMode === 'calendar'`
- `viewMode === 'kanban'`
- `sortKey ∈ {'title', 'created_at', 'updated_at'}`（従来 3 種、どれでも自動 sort が優先）
- TEXTLOG 内部 log 行並び（textlog 固有契約）
- archive セクション内部の並び（一時隠蔽領域）
- search sub-location（S-18）の結果内並び

### 1.2 対象となる「所属集合」

manual mode 時、各 entry は **唯一の所属集合** を持つ。Move up/down は所属集合の内部でしか動かない。集合判定は以下の decision tree:

```
IF searchQuery OR archetypeFilter OR tagFilter が active:
  → flat 集合（filter 結果全体）
ELSE IF 対象 entry の structural parent == null:
  → root 集合
ELSE:
  → その folder の子集合
```

**folder tree ネスト**: 対象 entry の structural parent（直接の folder）のみを見る。孫・曾孫集合はそれぞれの folder で独立に ordering される。

### 1.3 Scope 境界の明示

本 contract は:

- **「何を並べるか」の側は一切変更しない**（filter / selection / view mode は既存契約どおり）
- **「どう並べるか」の最後の軸として manual mode を追加する**
- drag-drop / bulk / cross-view reorder は v1 非対象（§7）

---

## 2. Data contract

### 2.1 Container.meta.entry_order

```ts
interface ContainerMeta {
  // ... 既存 fields
  entry_order?: string[];  // 追加、additive
}
```

**semantics**:

- `entry_order` は **lid の配列**。lid は `Entry.lid` と同じ string 型（一致検証は reducer の責務）
- `undefined` または **空配列** のとき: manual order なし（全 entry が sort fallback で並ぶ）
- 要素順は **グローバル順位**。ある所属集合 S 内の order は「`entry_order` 配列から S.contains(lid) でフィルタした配列の順序」で決まる

### 2.2 manual mode 参照規則

`sortKey === 'manual'` のときの **render pipeline**:

```
allEntries（container.entries）
  → filter（archetype / tag / search / archive）  // §1.2 集合判定はこの filter 結果に対して行われる
  → group by 所属集合（root / folder / flat）
  → 各 group 内で:
      A. entry_order に含まれる entry: entry_order の配列順で並ぶ
      B. entry_order に含まれない entry（new entry / 新規 import 等）:
         sortKey='manual' 時のフォールバック軸（updated_at desc）で並び、A の末尾に append
  → sidebar render
```

`sortKey ∈ {'title' | 'created_at' | 'updated_at'}` のときは `entry_order` は **一切参照しない**（従来挙動）。ただし `container.meta.entry_order` 自体は書き換わらず保持され、user が `sortKey='manual'` に戻せば即座に復元される（I-Order2）。

### 2.3 entry_order に存在しない entry の扱い

- **new entry**（`CREATE_ENTRY`）: `entry_order` に追加されない。所属集合末尾に automatic append 表示（§2.2 B ルール）。user が初めて Move up/down を実行したとき、または §2.5 の明示的 snapshot 操作で `entry_order` に取り込まれる
- **imported entry**（merge import / replace import）: I-Order8 / I-Order9 参照
- **restored entry**（trash から復帰 / revision restore）: new entry と同じ扱い（末尾 append、`entry_order` 未取込）

### 2.4 archived / filtered / hidden entry の扱い

archived / filtered / hidden の非表示は **entry_order から除去しない**。再表示時には `entry_order` 上の位置に戻る（I-Order6）。

- archived todo が `showArchived=false` で非表示 → `entry_order` 上の位置は保持
- `archetypeFilter=text` で非 text が非表示 → 同
- `searchQuery` で hit しない entry が非表示 → 同
- delete（trash 移送）された entry → `entry_order` から除去される（§3.1 I-Order7b）

### 2.5 初回 snapshot

user が「manual mode に切り替えた最初の瞬間」または「Move up/down を最初に押した瞬間」に、`entry_order` が `undefined` なら以下の規則で生成される:

- 現在表示されている所属集合の順序を **container 全体の順序** として snapshot（簡潔さ優先: 全 entry × updated_at desc で一括生成）
- 新規 entry は §2.2 B のとおり未取込のまま末尾 append される
- この初回 snapshot 以降、`entry_order` は reducer 経由でしか変更されない

---

## 3. Invariance

本書は minimum-scope §5 の I-Order1〜10 を **正式契約** として引き継ぎ、contract 固定事項（D1〜D4）に沿って差分を追記する。

### I-Order1: selection 不変

Move up/down 後も `selectedLid` は同じ lid を指す。画面上の相対位置は変わるが identity は変わらない。
`multiSelectedLids` も変化しない（I-Order-MS）。

### I-Order2: sort fallback 温存

- `sortKey ∈ {'title', 'created_at', 'updated_at'}`: 従来挙動、`entry_order` は読まない。
- `sortKey === 'manual'`: `entry_order` を参照、§2.2 のルールで適用。`entry_order === undefined` の時は §2.5 の snapshot ルールで初回だけ補完。
- sort key を manual ⇄ 自動で切り替えても `entry_order` は**破壊されない**（meta に残る）。

### I-Order3: filter / search 独立

`archetypeFilter` / `tagFilter` / `searchQuery` の状態変化では `entry_order` の配列内容は変わらない。filter 解除で元の相対順に戻る。

- filter 中に Move up/down すると、対象集合は「filter 結果」（§1.2）。reducer は filter 集合内の相対位置だけを動かすが、**`entry_order` 全体の配列上でも同じ 2 entry の順序が swap される**（filter を外しても整合）。
- つまり「filter 中の reorder 結果」と「filter 解除後の reorder 結果」が必ず一致する（minimum-scope §8.2 の例に対応）。

### I-Order4: view mode 独立

`viewMode` が `calendar` / `kanban` に切り替わっても `entry_order` は触らない（read も write もしない）。sidebar 以外の view は独自軸を温存（I-Order-View）。

### I-Order5: relation / revision / provenance 非破壊

- `Relation` の kind / schema は touch しない
- `Revision` schema は touch しない
- `Entry` schema は touch しない
- SCHEMA_VERSION は **変更しない**（D1 の前提）

### I-Order6: archive / archetype / tag / search hide での順序保持

非表示は `entry_order` に影響しない。再表示時に元の位置に戻る。

### I-Order7: 既存 bulk 操作との合成

- **I-Order7a: CREATE_ENTRY**: 新 entry は `entry_order` に追加されない（§2.3）。所属集合末尾に append 表示（`entry_order` 末尾に挿入ではない、未取込のまま）。
- **I-Order7b: DELETE / BULK_DELETE / MOVE_TO_TRASH**: 削除された entry は `entry_order` から除去、残余の相対順は保持。
- **I-Order7c: BULK_MOVE_TO_FOLDER**: 移動後、移動元 entry は移動先集合での「未取込」扱い（所属集合末尾表示）。`entry_order` 配列からは削除しない（move 前の global 位置は残る）。移動先集合で Move up/down されると §2.5 のルールで取り込まれる。
- **I-Order7d: BULK_ARCHIVE / BULK_RESTORE**: `entry_order` を変更しない（I-Order6）。

### I-Order8: Merge import（H-10）との独立

- imported 側の `meta.entry_order` は **読み捨てる**（v1 非対応）
- host 側の `entry_order` は不可侵。新規 merged entry は §2.3 の「new entry」扱いで未取込 append
- provenance relation は H-10 契約どおり付与されるが ordering に関与しない

### I-Order9: Export / Import round-trip

- **Export**: `container.meta.entry_order` はそのまま export される（HTML Full / ZIP / HTML Light いずれも meta を転送）
- **Replace Import**: 新 container の `entry_order` に完全置換（既存契約どおり）
- **Merge Import**: host の `entry_order` が保持される（I-Order8）

### I-Order10: No dangling / No duplicate lids

load 時（container 復元時）に reducer は `entry_order` を **正規化**:

- `container.entries[]` に存在しない lid（dangling）は除去
- 重複 lid は最初の出現を残して除去
- 検証失敗（破損等）時は `entry_order` を `undefined` にリセット（§2.5 の snapshot で再初期化される）

### I-Order-MS: multiSelectedLids 非干渉

manual mode / 非 manual mode を問わず、Move up/down 操作は `multiSelectedLids` を一切変更しない。bulk reorder は v1 非対象（§7）。

### I-Order-View: sidebar 以外 view 非干渉

calendar / kanban / search sub-location は `entry_order` を読まない。これらの view から manual mode に戻った時は、戻る直前の `entry_order` がそのまま復元される。

---

## 4. Operation contract

### 4.1 公開 operation（2 種）

| action type（予定） | 対象 | 意味 |
|--------------------|------|------|
| `MOVE_ENTRY_UP` | 1 lid（target, 省略時 selectedLid） | 所属集合内で 1 つ前へ移動 |
| `MOVE_ENTRY_DOWN` | 同上 | 所属集合内で 1 つ後ろへ移動 |

action payload schema（最小）:

```ts
interface MoveEntryUpAction {
  type: 'MOVE_ENTRY_UP';
  lid?: string;  // 省略時は state.selectedLid が使われる
}
interface MoveEntryDownAction {
  type: 'MOVE_ENTRY_DOWN';
  lid?: string;
}
```

state slice doc で最終決定（本書では action type 名と payload shape の範囲のみ固定）。

### 4.2 semantics

```
Input: state, action{ type: MOVE_ENTRY_UP|DOWN, lid: L }
Pre:  state.sortKey === 'manual'
      state.viewMode === 'detail'
      L !== null && container.entries[L] exists
      current AppPhase is 'ready' or 'editing'

Step:
  1. 所属集合 S を §1.2 の decision tree で決定
  2. visible 集合 V = S に filter（archetype/tag/search/archive）適用したもの
  3. entry_order が undefined なら §2.5 snapshot で生成
  4. V 内で L の現位置 i を求める
  5. MOVE_ENTRY_UP: i === 0 → no-op
     MOVE_ENTRY_DOWN: i === V.length - 1 → no-op
  6. V[i] と V[i±1] を entry_order 配列上で swap
     （V の位置 i と i±1 に対応する entry_order 内 index i' と i±1' を swap）
  7. 新 container.meta.entry_order を反映した state を返す
  8. ENTRY_ORDER_CHANGED event を emit（要否は state slice で最終決定）

Post: selectedLid 不変（I-Order1）
      sortKey='manual' 維持
      multiSelectedLids 不変（I-Order-MS）
      container の他 field（entries, relations, revisions, assets）不変
```

### 4.3 no-op 条件

| 条件 | 挙動 |
|------|------|
| `sortKey !== 'manual'` | action 無視（reducer が state を変えない、event も emit しない） |
| `viewMode !== 'detail'` | 同上 |
| `lid` が container に存在しない | 同上 |
| 所属集合内で既に端（Up が i=0 / Down が i=末尾） | 同上（silent、error ではない） |
| AppPhase が `initializing` / `exporting` / `error` | 同上（phase gate、§6.1） |
| `container.entries` が空 | 同上 |

### 4.4 所属集合の作用範囲（§1.2 の補足）

- **flat 集合（filter active）**: `entry_order` 上の順序を基準に swap。filter で hidden の entry を跨いで swap することはない（visible な i-1 と swap する）。ただし **`entry_order` 全体としての絶対位置も更新される**（I-Order3）
- **root 集合**: structural parent が null の entry を `entry_order` 上で順番に並べた列を仮想 visible 列と見なし swap
- **folder 子集合**: structural parent が特定 folder の entry を同様に仮想列化して swap

---

## 5. State interaction

### 5.1 AppState 上の必要な変更

| field | 変更 | 備考 |
|-------|------|------|
| `sortKey: SortKey` | 型 union に `'manual'` を追加 | `'title' \| 'created_at' \| 'updated_at' \| 'manual'` |
| その他 | 変更なし | `selectedLid` / `multiSelectedLids` / `viewMode` / filter 系は既存そのまま |

`SortKey` 型は `src/features/search/sort.ts` の公開 type。`sortEntries()` 自体は `'manual'` を受け取らず、reducer 側で manual mode 分岐を行う（pure slice の責務配分）。

`AppState.sortDirection` は manual mode で **意味を持たない**（`entry_order` 配列自体が方向を表現）。state slice は以下どちらかを選ぶ（契約では固定しない）:

- (a) `sortKey='manual'` のとき `sortDirection` は無視される（値は保持）
- (b) manual への切替時に sortDirection を 'asc' に正規化する

どちらも I-Order1〜10 を破らない。state slice doc で最終決定。

### 5.2 sortKey / sortDirection との関係

- 自動 sort（title / created_at / updated_at）と manual は **排他的**（同時 active にはならない、D2）
- 自動 sort → manual 切替: §2.5 の snapshot で `entry_order` が初期化される（既に存在すれば再利用）
- manual → 自動 sort 切替: `entry_order` は破壊されない、単に read されない（I-Order2）
- user による sortKey 切替は 1 action（例 `SET_SORT_KEY`、既存）で行われ、`entry_order` への書き込みは起こらない

### 5.3 selectedLid との関係

- Move up/down の default target は `state.selectedLid`
- `selectedLid === null` の場合は no-op（§4.3）
- 操作後 `selectedLid` は変化しない（I-Order1）
- selection の更新（click 等）は既存契約どおり、ordering と独立

### 5.4 multiSelectedLids 非対象

bulk reorder は v1 非対象（§7）。`multiSelectedLids` が空でない状態で `MOVE_ENTRY_UP/DOWN` を受けても挙動は同じ（single target = `selectedLid` or `action.lid`）、`multiSelectedLids` は不変（I-Order-MS）。

### 5.5 新 event（任意）

`ENTRY_ORDER_CHANGED { lid: string; direction: 'up'|'down'; container: Container }` を emit するかは state slice で決定。**本 contract は emit を必須化しない**（v1 UI で subscriber が無ければ不要）。

---

## 6. Gate / error paths

### 6.1 Gate（操作可否マトリクス）

| 条件 | `MOVE_ENTRY_UP/DOWN` | 備考 |
|------|---------------------|------|
| `phase === 'ready'` / `'editing'` | 許可（他 pre 条件を満たせば） | |
| `phase === 'initializing'` | 拒否（no-op） | container 未ロード |
| `phase === 'exporting'` | 拒否（no-op） | export 中は container freeze |
| `phase === 'error'` | 拒否（no-op） | |
| `sortKey !== 'manual'` | 拒否（no-op） | D2 の帰結 |
| `viewMode !== 'detail'` | 拒否（no-op） | D3 の帰結 |
| `importPreview !== null` | 拒否（no-op） | import preview 中は container freeze |
| `batchImportPreview !== null` | 拒否（no-op） | 同上 |
| `readonly === true` | 拒否（no-op） | readonly artifact は全 write を禁じる |
| `lightSource === true` | 許可 | Light source も編集可（IDB 保存だけ抑制） |
| `viewOnlySource === true` | 許可 | 同上（boot-container-source-policy 契約） |

UI surface は同じ gate で Move up/down ボタンを **disable 表示**（UI slice の責務）。action 自体も reducer で再度 gate される（二重防御）。

### 6.2 Filter / search 中の危険ケース

minimum-scope §2.3 の「filter 中 reorder」問題は以下で閉じる:

- filter 中の Move up/down は **visible な 2 entry の相対位置を `entry_order` 全体上でも swap**（I-Order3）
- これにより filter 解除後も同じ相対順が保たれる
- filter で hidden な entry が間に挟まっていても、Move up/down はそれを跨いで visible な隣と swap する（hidden entry の位置は `entry_order` 上そのまま保存される）
- この挙動は「flat 集合 / folder 子集合 / root 集合」いずれでも同一

### 6.3 archived / hidden entry の操作

archived / hidden entry を target とした Move は:

- そもそも sidebar に表示されていないため selectedLid にならない → 通常ルートでは発生しない
- `action.lid` で明示指定された場合: 所属集合（archived は除外された）上に target がいないため no-op

### 6.4 Missing / dangling lid

- `entry_order` 内に `container.entries[]` に無い lid → load 時に正規化（I-Order10）で除去
- `action.lid` が存在しない lid → no-op（§4.3）

### 6.5 空集合 / 単一要素集合

- 所属集合が空: no-op
- 所属集合が 1 要素のみ: Move up/down 共に no-op（端）

---

## 7. Non-goal（v1 非対象）

以下は **v1 では扱わない**（v1.x / v2 で別契約）:

- **Drag & Drop reorder**（folder 移動 DnD と衝突、UX 判断が必要）
- **Bulk reorder**（`multiSelectedLids` 合成、複数 entry を一括移動）
- **Move to top / bottom shortcut**
- **Numeric insert-at-position N**
- **Cross-view ordering**（calendar の日付順に manual を反映する等）
- **Collaborative ordering**（P2P / WebRTC、D-3 領域）
- **Auto-ordering policy**（tag / 関連度 / ML）
- **Archive 内部の ordering**
- **TEXTLOG の log 行 reorder**（textlog 固有契約）
- **Calendar 上の manual 位置反映**
- **Revision restore で順序を遡る**（C-1 合流時に再議論）
- **folder tree のネスト構造そのものの reorder**（structural relation 自体の並び替え、folder tree 構造改変）
- **keyboard shortcut の正式登録**（UI slice での任意実装は可、contract では非必須）

---

## 8. Future extension boundary（v1.x / v2 候補）

v1 の契約境界の外に置き、将来拡張の余地として記録:

### 8.1 Drag & Drop reorder

- 既存 DnD（folder 移動）との衝突判定が contract 段階でしか決められない
- drop target が「folder 内」か「sibling 位置」かの判定 UI が必要
- v1 の Move up/down で到達不能な順序は存在しないため、v1 では優先度低

### 8.2 Bulk reorder

- `multiSelectedLids` 内の複数 entry を 1 操作で動かす
- 「選択順」「連続塊」「散在」の 3 解釈があり UX 決定が要る
- 挿入位置の決定規則（末尾 append vs 先頭 insert vs 特定位置）も決めが要る

### 8.3 Folder tree reorder 拡張

- folder 自体の並びは本 v1 でも root / 親集合内で reorder 可能だが、folder のネスト構造（tree shape）の reorder は対象外
- folder tree のネスト構造改変（子 folder の親移動等）は既存 BULK_MOVE_TO_FOLDER で行う

### 8.4 Merge / import 時の ordering 合流

- 現状 host の `entry_order` のみ保持、imported 側の ordering は捨てる（I-Order8）
- v1.x で「imported 側の ordering を末尾に append」「user に選ばせる」等の拡張余地

### 8.5 Revision restore との合流（C-1）

- revision restore で「順序も当時に戻す」オプションが要るかは C-1 と合流時に決める
- `entry_order` は Revision schema に含まれないので、現状の revision restore は **ordering を変更しない**

### 8.6 Numeric insert / Move to top-bottom

- pro user 向け shortcut。v1 の 2 操作で全順序に到達可能なので v1 では不要
- v1.x で UX 検証後に追加判断

### 8.7 View 別 ordering scheme

- sidebar の manual order を calendar / kanban にも反映するか、別契約で持つかは将来判断
- v1 では calendar / kanban は独自軸（I-Order4）

---

## 9. Examples

### 9.1 単純 reorder（root 集合 / manual mode）

前提:
- `sortKey='manual'`、`viewMode='detail'`、filter なし
- `container.meta.entry_order = ['L_report', 'L_meeting', 'L_plan']`

初期画面:
```
- Report 2026        (L_report)
- Meeting notes      (L_meeting)
- Plan draft         (L_plan)  ← selectedLid
```

action: `MOVE_ENTRY_UP { lid: 'L_plan' }` を 2 回。

結果 meta:
```json
{ "entry_order": ["L_plan", "L_report", "L_meeting"] }
```

画面:
```
- Plan draft         (L_plan)  ← selectedLid（I-Order1）
- Report 2026
- Meeting notes
```

sort 切替 `SET_SORT_KEY title asc` → title 順に再表示、`entry_order` は保持（I-Order2）。
`SET_SORT_KEY manual` に戻す → 上の画面に復元。

### 9.2 filter 中 の reorder（I-Order3）

前提:
- 5 件: `[L1 "Plan 2025", L2 "Plan 2026", L3 "Meeting", L4 "Report 2026", L5 "Memo"]`
- `entry_order = ['L1','L2','L3','L4','L5']`
- `searchQuery = '2026'` → visible は `[L2, L4]`

action: `MOVE_ENTRY_UP { lid: 'L4' }`

Step:
- visible 内 i = 1（L4）、i-1 の visible = L2（`entry_order` 上 index 1）
- `entry_order` 上 L4 は index 3、L2 は index 1
- L4 と L2 を swap

結果 meta:
```json
{ "entry_order": ["L1", "L4", "L3", "L2", "L5"] }
```

filter 中の画面: `[Report 2026, Plan 2026]`
`searchQuery` クリア後の画面: `[Plan 2025, Report 2026, Meeting, Plan 2026, Memo]`
→ visible 側の「L4 が L2 より上」が filter 解除後も保たれる（I-Order3）。

### 9.3 manual mode off では reorder 不可

前提:
- `sortKey = 'updated_at'`、`viewMode = 'detail'`

action: `MOVE_ENTRY_UP { lid: 'L_plan' }`

結果:
- reducer は no-op（§4.3）、state 不変、event なし
- UI slice では ↑/↓ ボタンが disable 表示

（同様に `viewMode='calendar'` でも manual mode でも、`viewMode !== 'detail'` なので no-op。）

---

## 10. 完了条件（本書の checklist）

- [x] 0 位置づけ: minimum-scope からの昇格文脈、4 固定決定（D1〜D4）
- [x] 1 Scope: 対象 view / mode、所属集合 decision tree、境界明示
- [x] 2 Data contract: `Container.meta.entry_order` 型・semantics、manual mode 参照規則、未取込 entry 扱い、archived / hidden 扱い、初回 snapshot
- [x] 3 Invariance: I-Order1〜10 + I-Order-MS + I-Order-View（12 件）
- [x] 4 Operation contract: 2 action の semantics、no-op 条件、所属集合作用範囲
- [x] 5 State interaction: AppState 差分（`SortKey` に `'manual'` 追加）、sortDirection 扱い、selectedLid / multiSelectedLids 関係、event 要否
- [x] 6 Gate / error paths: phase / mode / view / preview / readonly gate 表、filter 中危険ケース、archived / dangling / 空集合
- [x] 7 Non-goal: 12 項目列挙
- [x] 8 Future extension: DnD / bulk / folder tree / merge 合流 / revision / numeric / view 別（7 項目）
- [x] 9 Examples: simple / filter 中 / manual-off

次段で決定すべき implementation 詳細は pure / state / UI slice doc に委ねる（DOM selector / keyboard binding / reducer ファイル分割 / test 本数配分 など）。
