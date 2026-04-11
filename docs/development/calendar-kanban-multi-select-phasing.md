# Calendar/Kanban Multi-Select — Phase Split Design

Status: CANDIDATE (design only — 実装未着手)
Created: 2026-04-11

---

## §1 目的

`multi-select-design.md` の設計はサイドバーリストのみ対応。Calendar/Kanban ビューに multi-select を展開するにあたり、スコープを Phase 1 / Phase 2 に分割して段階的に安全に実装する。

---

## §2 現状棚卸し

### 2.1 既存インフラ（実装済み）

| 層 | ファイル | 内容 | 状態 |
|----|---------|------|------|
| State | `app-state.ts:85` | `multiSelectedLids: string[]` | ✅ 全ビュー共通 |
| Reducer | `app-state.ts:729-758` | `TOGGLE_MULTI_SELECT`, `SELECT_RANGE`, `CLEAR_MULTI_SELECT` | ✅ ビュー非依存 |
| Reducer | `app-state.ts:760-809` | `BULK_DELETE`, `BULK_MOVE_TO_FOLDER`, `BULK_MOVE_TO_ROOT` | ✅ ビュー非依存 |
| Helper | `app-state.ts:134` | `getAllSelected()` | ✅ 共通 |
| Click routing | `action-binder.ts:160-176` | `select-entry` の Ctrl/Shift 分岐 | ✅ **全ビュー共通** |
| CSS | `base.css:481-484` | `[data-pkc-multi-selected="true"]` スタイル | ✅ セレクタはグローバル |

### 2.2 サイドバー（動作中）

| 項目 | 実装場所 | 状態 |
|------|---------|------|
| `data-pkc-multi-selected` 属性 | `renderer.ts:1075-1076` | ✅ |
| Multi-action bar | `renderer.ts:909-957` | ✅ |
| Ctrl+click ヒントテキスト | `renderer.ts:903` | ✅ |

### 2.3 Calendar ビュー（ギャップ）

| 項目 | 実装場所 | 状態 |
|------|---------|------|
| `data-pkc-action="select-entry"` | `renderer.ts:1295` | ✅ 既存 → Ctrl/Shift ルーティング動作する |
| `data-pkc-multi-selected` 属性 | — | ❌ **未実装** |
| Multi-action bar 表示 | — | ❌ サイドバーのみ |
| DnD drop → `SELECT_ENTRY` | `action-binder.ts:1355` | ⚠️ multi-select をクリアする |

### 2.4 Kanban ビュー（ギャップ）

| 項目 | 実装場所 | 状態 |
|------|---------|------|
| `data-pkc-action="select-entry"` | `renderer.ts:1374` | ✅ 既存 → Ctrl/Shift ルーティング動作する |
| `data-pkc-multi-selected` 属性 | — | ❌ **未実装** |
| Multi-action bar 表示 | — | ❌ サイドバーのみ |
| DnD drop → `SELECT_ENTRY` | `action-binder.ts:1275` | ⚠️ multi-select をクリアする |

### 2.5 View Switch 動作

| アクション | multiSelectedLids への影響 |
|-----------|--------------------------|
| `SET_VIEW_MODE` | **クリアしない** (`app-state.ts:654-656`) |
| `SELECT_ENTRY` | クリアする (`app-state.ts:220`) |

→ サイドバーで multi-select → Calendar に切り替え → state 上は選択が残っているが、Calendar には視覚表示がない。**幽霊選択**状態。

---

## §3 Phase Split

### Phase 1: Selection State + Visual Feedback

**目標**: Calendar/Kanban ビューで multi-select の状態が正しく「見える」ようにする。

| # | 作業 | ファイル | 変更規模 |
|---|------|---------|---------|
| P1-1 | Calendar todo item に `data-pkc-multi-selected` 属性追加 | `renderer.ts` | +3 行 |
| P1-2 | Kanban card に `data-pkc-multi-selected` 属性追加 | `renderer.ts` | +3 行 |
| P1-3 | Multi-action bar を Calendar/Kanban ビューでも表示 | `renderer.ts` | 移動 or 複製 (要設計) |
| P1-4 | テスト: Calendar/Kanban で multi-selected 属性が DOM に反映 | `renderer.test.ts` | +10-15 件 |
| P1-5 | テスト: Ctrl+click → TOGGLE_MULTI_SELECT が Calendar/Kanban で動作 | `action-binder.test.ts` | +4-6 件 |

**Phase 1 で意図的にやらないこと**:
- Shift+click の表示順問題の修正（→ Phase 2）
- DnD と multi-select の統合（→ Phase 2）
- 一括 status/date 変更の新アクション（→ Phase 2）

### Phase 2: Bulk Actions + DnD Integration

**目標**: multi-select された複数エントリに対する一括操作を Calendar/Kanban ビュー固有の文脈で実現する。

| # | 作業 | 変更規模 |
|---|------|---------|
| P2-1 | `BULK_SET_STATUS` アクション追加（Kanban 一括 status 変更） | reducer + action type |
| P2-2 | `BULK_SET_DATE` アクション追加（Calendar 一括 date 変更） | reducer + action type |
| P2-3 | DnD drop で multi-select を考慮（選択中の全エントリを移動） | action-binder DnD handlers |
| P2-4 | Shift+click 範囲選択の表示順対応 | reducer or helper |
| P2-5 | Multi-action bar に Kanban/Calendar 固有アクション追加 | renderer |
| P2-6 | テスト: bulk actions + DnD multi-move | +15-20 件 |

---

## §4 Conflict Analysis

### 4.1 dblclick vs Ctrl+click

**現状**: `me.detail >= 2` は Ctrl/Shift チェックより**先に**評価される (`action-binder.ts:167-175`)。

```
if (me.detail >= 2) → handleDblClickAction
else if (ctrlKey)   → TOGGLE_MULTI_SELECT
else if (shiftKey)  → SELECT_RANGE
else                → SELECT_ENTRY
```

**影響**: Ctrl+double-click は `handleDblClickAction` に入り、multi-select ではなく entry window を開く。これはサイドバーでも同一動作。

**判定**: ✅ 一貫性あり。修正不要。

### 4.2 DnD dragstart vs click

**現状**: Calendar/Kanban の todo item/card は `draggable="true"` 属性あり。

**潜在的問題**: ブラウザの DnD 実装では、`mousedown` → 数px 移動で `dragstart` が発火し、`click` イベントが抑制される。Ctrl+click で drag 意図なく微小な移動が発生すると、TOGGLE_MULTI_SELECT ではなく drag が開始される。

**Phase 1 での対応**: 未対応（既存の単一選択でも同一問題が存在する。Phase 1 で新たに悪化しない）。

**Phase 2 での対応候補**: drag 開始に pixel threshold を設定するか、`dragstart` で `multiSelectedLids.length > 0` 時に multi-drag モードへ遷移。

### 4.3 SELECT_RANGE の表示順 vs 格納順

**現状**: `SELECT_RANGE` reducer (`app-state.ts:744-754`) は `container.entries` 配列インデックスで範囲を計算。

| ビュー | 表示順 | 格納順との一致 |
|--------|--------|---------------|
| Sidebar (フィルタなし) | 格納順 | ✅ 一致 |
| Calendar | 日付でグルーピング | ❌ 不一致 |
| Kanban | status でグルーピング | ❌ 不一致 |

**影響**: Calendar で 4/1 のエントリ A を anchor、4/5 のエントリ C を Shift+click すると、格納順上 A-C 間にある 4/3 のエントリ B だけでなく、格納順でたまたま間にある別日のエントリ D も選択される可能性がある。

**Phase 1 での対応**: **Shift+click は Phase 1 では Calendar/Kanban で現行動作のまま許容する**。表示順と異なる選択が発生しうるが、Ctrl+click（個別トグル）は正確に動作する。ユーザは Ctrl+click で代替可能。

**Phase 2 での対応**: `SELECT_RANGE` をビュー依存の表示順で計算するように拡張。Calendar: 日付順 → 同一日は格納順。Kanban: status グループ内格納順。

### 4.4 DnD drop → SELECT_ENTRY によるクリア

**現状**: Kanban drop (`action-binder.ts:1275`) と Calendar drop (`action-binder.ts:1355`) の両方が、drop 完了後に `SELECT_ENTRY` を dispatch する。`SELECT_ENTRY` reducer は `multiSelectedLids: []` にクリアする。

**Phase 1 での影響**: DnD で単一エントリを移動すると multi-select がクリアされる。Phase 1 は visual feedback のみなので、これは許容。ユーザは DnD と multi-select を同時には使わない。

**Phase 2 での対応**: DnD drop handler を multi-select 対応に変更。`multiSelectedLids.length > 0` 時は全選択エントリに対して batch 操作を適用し、multi-select を保持するかクリアするかを選択。

### 4.5 SET_VIEW_MODE と幽霊選択

**現状**: `SET_VIEW_MODE` は `multiSelectedLids` をクリアしない。

**Phase 1 での対応**: Phase 1 で Calendar/Kanban にも `data-pkc-multi-selected` を付与するため、ビュー切り替え後も選択が視覚的に反映される。**幽霊選択が解消される**。

**Phase 1 での注意**: ビュー切り替え後に multi-action bar が表示されるが、bar 内のアクション（DELETE, MOVE）はビュー非依存なので問題なし。

### 4.6 readonly モードとの整合

**現状**: multi-action bar は `!state.readonly` 条件で表示。Ctrl+click は readonly でも `TOGGLE_MULTI_SELECT` を dispatch する（reducer は readonly ガードなし）。

**Phase 1 での対応**: 視覚フィードバック（`data-pkc-multi-selected`）は readonly でも表示してよい。multi-action bar は readonly で非表示なので安全。Ctrl+click で選択状態の可視化は有用（例: コピー対象の確認）。

**判定**: ✅ 修正不要。

---

## §5 Phase 1 完了条件

Phase 1 を COMPLETED とするための必須条件:

| # | 条件 | 検証方法 |
|---|------|---------|
| C1 | Calendar todo item に `data-pkc-multi-selected="true"` が `multiSelectedLids` に応じて付与される | renderer test |
| C2 | Kanban card に `data-pkc-multi-selected="true"` が `multiSelectedLids` に応じて付与される | renderer test |
| C3 | CSS `[data-pkc-multi-selected="true"]` スタイルが Calendar/Kanban item にも適用される | 既存 CSS がグローバルセレクタなので自動適用。manual verification |
| C4 | Ctrl+click で Calendar/Kanban item をトグル選択できる | action-binder test |
| C5 | Multi-action bar が Calendar/Kanban ビューでも `multiSelectedLids.length > 0` 時に表示される | renderer test |
| C6 | Multi-action bar の DELETE / MOVE が Calendar/Kanban ビューでも動作する | action-binder test |
| C7 | サイドバーで multi-select → Calendar/Kanban に切り替え → 選択が可視化される（幽霊選択解消） | renderer test |
| C8 | dblclick は multi-select ではなく entry window を開く（既存動作維持） | 既存テスト + manual |
| C9 | DnD は単一エントリ移動のまま（multi-select をクリアする既存動作維持） | 既存テスト |
| C10 | 全既存テスト (2297+) が pass | `npm test` |
| C11 | `npm run build:bundle` 成功 | CI |

---

## §6 Recommended First Slice（Phase 1 の着手順序）

### Slice A: Renderer — visual feedback（P1-1, P1-2）

**理由**: 最小変更で最大効果。3 行 × 2 箇所。テストも書きやすい。

**変更内容**:

`renderer.ts` Calendar todo item (line ~1303):
```typescript
// 既存: if (state.selectedLid === t.entry.lid) { ... }
// 追加:
if (state.multiSelectedLids.includes(t.entry.lid)) {
  item.setAttribute('data-pkc-multi-selected', 'true');
}
```

`renderer.ts` Kanban card (line ~1379):
```typescript
// 既存: if (state.selectedLid === item.entry.lid) { ... }
// 追加:
if (state.multiSelectedLids.includes(item.entry.lid)) {
  card.setAttribute('data-pkc-multi-selected', 'true');
}
```

CSS 変更: 不要（`[data-pkc-multi-selected="true"]` セレクタはグローバル）。

### Slice B: Multi-action bar 配置（P1-3）

**選択肢**:

| 案 | 方法 | 利点 | 欠点 |
|----|------|------|------|
| B-1 | サイドバーの multi-action bar をそのまま使う | 変更なし | Calendar/Kanban のセンターペインに bar がない。サイドバーが閉じていると操作不可 |
| B-2 | センターペインのヘッダ領域に bar を複製 | Calendar/Kanban でも自然な位置に表示 | 2箇所のレンダリングコード |
| B-3 | bar を共通関数に抽出し、サイドバー + センターペインの両方で呼ぶ | DRY | helper 追加 |

**推奨**: **B-1**（Phase 1 は bar をサイドバーに据え置き）。PKC2 は常にサイドバーが表示されるレイアウトであり、multi-action bar はサイドバーに表示されれば十分。Phase 2 で必要に応じて B-3 に昇格。

### Slice C: テスト（P1-4, P1-5）

Slice A/B の実装後にテスト追加。

---

## §7 Phase 2 スコープ

Phase 2 は以下のサブフェーズに分割:

| Sub-phase | 内容 | 状態 | 設計ドキュメント |
|-----------|------|------|---------------|
| Phase 2-A | Bulk Status Change | **COMPLETED** | `calendar-kanban-multi-select-bulk-status.md` |
| Phase 2-B | Bulk Date Change (設定 + 解除) | 設計完了、実装待ち | `calendar-kanban-multi-select-bulk-date.md` |
| Phase 2-C | Multi-DnD (Kanban/Calendar drop で一括操作) | CANDIDATE | — |
| Phase 2-D | SELECT_RANGE 表示順対応 | CANDIDATE | — |
| Phase 2-E | Escape キーで CLEAR_MULTI_SELECT | CANDIDATE | — |

---

## §8 リスク評価

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| Ctrl+click と DnD dragstart の競合 | Ctrl+click で意図しない drag 開始 | Phase 1 は既存動作と同一リスク。Phase 2 で pixel threshold 検討 |
| Shift+click の格納順 vs 表示順 | 非直感的な範囲選択 | Phase 1 は Ctrl+click を推奨。Phase 2 で表示順対応 |
| multi-select 中に DnD → 選択クリア | 操作中の選択消失 | Phase 1 は単一 DnD 維持。Phase 2 で multi-DnD 対応 |
| パフォーマンス: `includes()` on large arrays | O(n) per item | multiSelectedLids は通常数十件以下。Set 化は Phase 2 で検討 |

---

## §9 設計判断の根拠

1. **Phase 1 は renderer 変更のみ**: click routing は既に全ビュー共通 (`action-binder.ts:160-176`)。reducer も既に動作する。追加が必要なのは DOM 属性の付与と multi-action bar の表示条件のみ。
2. **Shift+click は Phase 1 で制限しない**: reducer は動作する。表示順との不一致は UX 上の問題だが、crash や data corruption は起きない。Phase 2 で修正。
3. **DnD は Phase 1 で触らない**: multi-DnD は新しい操作パラダイムであり、Phase 1 の scope に含めると複雑性が爆発する。
4. **Multi-action bar は B-1（サイドバー据え置き）**: PKC2 のレイアウトでサイドバーは常時表示。最小変更の原則。
