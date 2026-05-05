# Filer view + explorer subset — Phase 1 spec(2026-05-05)

**Status**: SPEC(Phase 1 / 領域 10-6 ζ'' wave)
**Phase**: 1 of 5(filer view skeleton + explorer subset)
**Predecessor**: [`filer-view-and-folder-display-profile-audit-2026-05.md`](./filer-view-and-folder-display-profile-audit-2026-05.md)(audit、ζ'' 確定 by user 2026-05-05、PR #258 で landing)
**Wave roadmap**: §領域 10-6 — filer skeleton → frontmatter+graph → subset+auto-fill → ZIP export → inventory query

## 0. このドキュメントの位置付け

audit doc(ζ'' 確定形)で wave 全体の方向が固まった。本 spec は **Phase 1(filer view 第 4 view-mode の skeleton + explorer subset)を実装する単位** に絞った仕様書。`pr-review-checklist.md` §2.11 順序性テストと `visual-state-parity-testing.md` §6 描画と状態の一致 doctrine に整合する形で書く。

本 spec は **2-3 PR で着地** することを想定:
- **PR-1**: state mutation + reducer + view-mode tab UI(filer 切替が動く)
- **PR-2**: explorer subset rendering + folder.display_profile 編集 UI + parity test
- **PR-3**(必要なら): mobile fallback + iPhone 検証

---

## 1. スコープ

### In scope(本 Phase 1)

- AppState に `viewMode: 'filer'` 追加(`detail | calendar | kanban | filer`)
- `SET_VIEW_MODE` reducer で `filer` を accept
- shell view-mode toggle UI に「ファイラ」tab 追加(既存 calendar / kanban 隣)
- center pane に `data-pkc-region="filer-view"` を mount(`viewMode === 'filer'` 時)
- **explorer subset**(default subset)= folder 内 entry を **table** で表示
- `folder.display_profile?: FilerProfile`(additive optional schema)
- `display_profile` 編集 UI(meta pane の attribute editor、Phase 1 は `explorer` のみ選択肢)
- table column: name / archetype / updated_at / tags
- table row click → `SELECT_ENTRY`(既存挙動準拠)
- table row dblclick → `EDIT_BEGUN`(既存準拠)
- mobile / iPhone fallback(column 縮退)
- `?pkc-debug=filer-view` URL flag debug overlay
- visual-state-parity test(reform-2026-05 §6)
- 順序性 parity test(state mutation → consumer behavior、Phase 8 doctrine)

### Out of scope(後続 Phase へ)

- frontmatter parser + 表示(Phase 2a)
- graph view subset(Phase 2b)
- contact-sheet / book-base / youtube-base subset(Phase 3a)
- 入力負担減(Phase 3b)
- folder ZIP export 拡張(Phase 4)
- inventory query UI(Phase 5)
- folder の display_profile を `'explorer'` 以外にする UI(Phase 3a で追加)

---

## 2. データ schema

### 2.1 `AppState.viewMode` 拡張

`src/adapter/state/app-state.ts:322`:

```ts
- viewMode: 'detail' | 'calendar' | 'kanban';
+ viewMode: 'detail' | 'calendar' | 'kanban' | 'filer';
```

### 2.2 `UserAction.SET_VIEW_MODE` 拡張

`src/core/action/user-action.ts:469`:

```ts
- | { type: 'SET_VIEW_MODE'; mode: 'detail' | 'calendar' | 'kanban' }
+ | { type: 'SET_VIEW_MODE'; mode: 'detail' | 'calendar' | 'kanban' | 'filer' }
```

### 2.3 `Entry.display_profile`(additive optional)

`src/core/model/record.ts` Entry interface に additive field:

```ts
export interface Entry {
  // ... existing fields

  /**
   * Filer view subset profile. Only meaningful when archetype === 'folder'.
   * Determines how the folder's children are rendered in filer view.
   *
   * Phase 1 supports: 'explorer'(default if undefined).
   * Phase 2b adds: 'graph'.
   * Phase 3a adds: 'contact-sheet' | 'book-base' | 'youtube-base'.
   *
   * Backward compat: undefined treated as 'explorer'. Old reader ignores
   * the field; old writer never sets it. additive optional, no schema
   * version bump.
   */
  display_profile?: FilerProfile;
}

export type FilerProfile =
  | { kind: 'explorer'; columns?: FilerColumnId[] };
  // Phase 2b: | { kind: 'graph'; ... }
  // Phase 3a: | { kind: 'contact-sheet'; ... } | { kind: 'book-base'; ... } | { kind: 'youtube-base'; ... }

export type FilerColumnId = 'name' | 'archetype' | 'updated_at' | 'tags';
```

`columns` は Phase 1 では未使用、`undefined` 時に default column set(`['name', 'archetype', 'updated_at', 'tags']`)。Phase 5 inventory query で活用。

### 2.4 永続化

`viewMode` は **runtime only**(既存 `app-state.ts:322` コメント準拠、persist しない)。`display_profile` は **container.entries[].display_profile** に乗るので **export 同伴**(content として content side に書く、R7 確定)。

---

## 3. UI 仕様

### 3.1 view-mode tab

shell の view-mode toggle 群(既存 detail / calendar / kanban tab)隣に **ファイラ** tab 追加:

```html
<button data-pkc-action="set-view-mode" data-pkc-mode="filer">
  ファイラ
</button>
```

icon は textual ラベル「ファイラ」(既存 calendar / kanban も textual)。Phase 5 で aria-label / icon font 検討。

### 3.2 filer-view region(center pane)

`viewMode === 'filer'` 時、center pane に:

```html
<div data-pkc-region="filer-view" data-pkc-subset="explorer">
  <!-- folder breadcrumb / scope indicator -->
  <header data-pkc-region="filer-header">
    <span data-pkc-filer-folder-name>{folder.title}</span>
    <span data-pkc-filer-subset-label>Explorer</span>
  </header>

  <!-- table -->
  <table data-pkc-region="filer-table">
    <thead>
      <tr>
        <th data-pkc-filer-column="name">名前</th>
        <th data-pkc-filer-column="archetype">種類</th>
        <th data-pkc-filer-column="updated_at">更新日時</th>
        <th data-pkc-filer-column="tags">タグ</th>
      </tr>
    </thead>
    <tbody>
      <tr data-pkc-action="select-entry"
          data-pkc-lid="{lid}"
          data-pkc-archetype="{archetype}">
        <td>{title or icon + title}</td>
        <td>{archetype label}</td>
        <td>{updated_at formatted}</td>
        <td>{tag chips}</td>
      </tr>
      <!-- … -->
    </tbody>
  </table>
</div>
```

**folder scope** の決定:
- selectedLid が `folder` archetype → その folder 内の entry を表示
- selectedLid が他 archetype → その entry の structural parent folder を解決して表示
- 該当 folder なし(root) → root level の全 entry を表示(folder 自身も含む)

### 3.3 row interaction

- **click**: `SELECT_ENTRY`(既存 dispatch、selectedLid 更新)
- **dblclick**: `EDIT_BEGUN`(既存 dispatch、phase → editing)
- **folder row click**: `SELECT_ENTRY` + filer view が新 folder scope に切替(再 render)
- iPhone tap = click と同等(既存 fallback)

### 3.4 meta pane attribute editor(folder 選択時)

folder entry が選択されている meta pane で、新 section「Filer 表示」追加:

```html
<section data-pkc-region="filer-display-profile-editor">
  <label>Filer 表示</label>
  <select data-pkc-action="set-display-profile">
    <option value="explorer">Explorer(table)</option>
    <!-- Phase 2b: <option value="graph">Graph</option> -->
    <!-- Phase 3a: ... -->
  </select>
</section>
```

`SET_DISPLAY_PROFILE` action 新設:

```ts
| { type: 'SET_DISPLAY_PROFILE'; lid: string; profile: FilerProfile | undefined }
```

reducer は対象 entry の `display_profile` を update、`undefined` で削除(default に戻す)。

### 3.5 mobile / iPhone fallback

`@media (pointer: coarse) and (max-width: 640px)`:
- column 縮退: `name` + `updated_at` のみ
- archetype は icon 付き name に inline
- tags は popup or expand row(tap で開く)
- table padding 縮小

---

## 4. 動作仕様

### 4.1 boot 時 default

- 既存 user data の folder entry はすべて `display_profile === undefined`
- filer view は `undefined` を `'explorer'` として扱う
- viewMode default は `'detail'`(既存)、`'filer'` への自動切替なし

### 4.2 view-mode 切替

- detail → filer:OK(selectedLid 維持、folder scope 解決)
- calendar → filer:OK
- kanban → filer:OK
- filer → detail:OK(既存挙動準拠、selectedLid 維持)
- editing phase 中の view-mode 切替:既存 `app-state.ts:945` の gate と同じ挙動(filer も同様に gate)

### 4.3 selectedLid と filer scope の関係

filer view 内で row click → `SELECT_ENTRY` → selectedLid 更新。folder row click → folder 内に scope 切替(filer view 内で再 render)。

scope 切替の breadcrumb:
- header の `data-pkc-filer-folder-name` を更新
- 必要なら「親へ戻る」リンク表示(`data-pkc-action="select-entry"` + 親 folder lid)

### 4.4 空 folder

folder 内 entry が 0 件:

```html
<div data-pkc-region="filer-table-empty">
  <p>このフォルダには項目がありません。</p>
</div>
```

(既存 calendar empty / kanban empty pattern 準拠)

### 4.5 root scope(folder 未選択)

selectedLid が null or root parent なし → container.entries 全件を **structural relation を持たない** filter で表示(top-level entry list)。

---

## 5. action / reducer / event

### 5.1 新 action

```ts
// user-action.ts
| { type: 'SET_DISPLAY_PROFILE'; lid: string; profile: FilerProfile | undefined }
```

### 5.2 既存 action 拡張

```ts
// SET_VIEW_MODE: mode union 拡張(§2.2)
```

### 5.3 reducer 挙動

`SET_VIEW_MODE` with `mode: 'filer'`:
- editing phase 中は既存 gate(`app-state.ts:945`)で filter
- viewMode を `'filer'` に変更
- selectedLid は unchanged

`SET_DISPLAY_PROFILE`:
- 対象 entry を見つけ、`display_profile` を update or 削除
- target entry が `archetype === 'folder'` でなければ no-op + warn(invariant 違反)
- `updated_at` を bump(既存 update entry pattern 準拠)

### 5.4 emit event

- `VIEW_MODE_CHANGED { from, to }`(既存準拠)
- `DISPLAY_PROFILE_CHANGED { lid, before, after }`(新規、領域 10-3 IR / 10-5 PKC-extension で利用想定)

---

## 6. テスト戦略

reform-2026-05 §6 visual-state-parity + Phase 8 順序性 doctrine に準拠。

### 6.1 unit test(`tests/adapter/state/app-state.test.ts` 等)

- `SET_VIEW_MODE { mode: 'filer' }` → state.viewMode === 'filer'
- editing phase 中 `SET_VIEW_MODE` → state unchanged + warn
- `SET_DISPLAY_PROFILE` → entry.display_profile 更新
- folder 以外 entry に `SET_DISPLAY_PROFILE` → no-op

### 6.2 renderer DOM test(`tests/adapter/renderer.test.ts` 等)

- `viewMode === 'filer'` で `[data-pkc-region="filer-view"]` 出現
- folder scope で children を table row として出力
- column header / row click target / archetype attribute 等の DOM contract

### 6.3 smoke parity test(`tests/smoke/filer-view-parity.spec.ts` 新設)

reform-2026-05 §6 必須事項:

- view-mode tab を **`page.mouse.click(x, y)` で実 OS event** で発火
- `elementFromPoint` で実際に table row が viewport 上に painted されているか確認
- row click → selectedLid 変化(既存 SELECT_ENTRY parity test pattern 準拠)
- folder row click → filer scope 切替(`data-pkc-filer-folder-name` の textContent 変化)
- empty folder → empty state 表示
- mobile viewport(`pointer: coarse`)で column 縮退確認

### 6.4 順序性 parity test(`tests/smoke/filer-view-display-profile.spec.ts` 新設)

Phase 8 doctrine:state mutation → consumer behavior change の end-to-end:

- folder 選択 → meta pane editor で profile 変更 → dispatch SET_DISPLAY_PROFILE → DOM `data-pkc-subset` 属性更新 → user-visible 観測点(table 列構成、subset label)変化

### 6.5 debug overlay test

- `?pkc-debug=filer-view` URL で boot → overlay 出現
- folder scope / current subset / row count を表示
- privacy by default(reform-2026-05 §debug-privacy-philosophy)準拠

---

## 7. debug-via-url-flag

`?pkc-debug=filer-view` で右上に live state panel:

```
viewMode: filer
folder scope: <lid> (<title>)
subset: explorer
column visible: name, archetype, updated_at, tags
row count: 12
selectedLid: <lid>
last action: SET_VIEW_MODE { mode: 'filer' }
```

Report dump の format は既存 `debug-via-url-flag-protocol.md` 準拠。

---

## 8. PR 構成案

### PR-1: state + reducer + view-mode tab UI

**touch**:
- `src/core/action/user-action.ts`(SET_VIEW_MODE union 拡張、SET_DISPLAY_PROFILE 追加)
- `src/core/model/record.ts`(Entry.display_profile + FilerProfile type)
- `src/adapter/state/app-state.ts`(viewMode union 拡張、SET_VIEW_MODE / SET_DISPLAY_PROFILE reducer)
- `src/adapter/ui/renderer.ts`(view-mode tab に「ファイラ」追加、filer-view region は空 placeholder)
- `src/adapter/ui/action-binder.ts`(set-view-mode / set-display-profile dispatch)
- unit test(state mutation)
- 簡易 smoke(view-mode 切替で region 出現)

**サイズ目安**: ~150 LOC + test ~80 LOC、bundle.js +~1 KB

### PR-2: explorer subset rendering + folder display_profile editor + parity

**touch**:
- `src/adapter/ui/renderer.ts`(filer-view region の table render、folder scope 解決、empty state、breadcrumb)
- `src/adapter/ui/renderer.ts`(meta pane に display_profile editor section)
- `src/styles/base.css`(filer table styling、mobile column 縮退)
- `tests/smoke/filer-view-parity.spec.ts`(parity test)
- `tests/smoke/filer-view-display-profile.spec.ts`(順序性 test)
- `?pkc-debug=filer-view` overlay

**サイズ目安**: ~300 LOC + test ~250 LOC、bundle.js +~3 KB、bundle.css +~1.5 KB

### PR-3(必要なら): mobile fallback hardening + iPhone parity

実機で mobile fallback の column 縮退 / tap target / 横 scroll を検証、追加調整。

---

## 9. 既存 invariants との照合

| 不変条件 | 整合性 |
|---|---|
| 5-layer 構造 | ◎(core 影響:Entry.display_profile + FilerProfile type / features 影響なし / adapter で UI と reducer) |
| core に NO browser API | ◎ |
| Single HTML | ◎(dep 0、bundle 影響極小) |
| Container is source of truth | ◎(display_profile は entry 属性、export 同伴) |
| Backward compatibility | ◎(viewMode union additive、Entry.display_profile additive optional、旧 reader 無視) |
| No premature abstraction | ◎(FilerProfile は discriminated union、Phase 1 は `'explorer'` のみ) |

---

## 10. 関連 doc

- audit(本 spec の前提): [`filer-view-and-folder-display-profile-audit-2026-05.md`](./filer-view-and-folder-display-profile-audit-2026-05.md)
- roadmap §10-6: [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md)
- 既存 view-mode 実装: `src/adapter/state/app-state.ts:322`、`src/adapter/ui/renderer.ts:3698`(calendar)/ 3861(kanban)
- W1 Tag(本 spec で参照、tag chip rendering): `docs/spec/tag-data-model-v1-minimum-scope.md`
- visual-state-parity-testing(parity test 規約): `visual-state-parity-testing.md`
- debug-via-url-flag-protocol(debug overlay 規約): `debug-via-url-flag-protocol.md`
- pr-review-checklist §2.11(順序性テスト): `pr-review-checklist.md`

## 11. 未確定事項(Phase 内で確定、本 spec の更新候補)

| ID | 内容 | 確定 trigger |
|---|---|---|
| OQ-1 | view-mode tab の icon / aria-label | PR-1 review、可能なら textual のみで MVP 着地 |
| OQ-2 | folder breadcrumb の戻り先(parent folder vs root) | PR-2 実装中、UX 試して決定 |
| OQ-3 | mobile column 縮退の具体閾値(640 px or 480 px)| PR-3 iPhone 実機検証 |
| OQ-4 | empty folder で「新規作成」ボタン表示するか | PR-2、UX feedback で決定 |

これらは PR review で確定し、本 spec を update。
