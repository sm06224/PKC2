# Project Priority Refresh

Status: INVENTORY (no implementation)
Created: 2026-04-12

---

## 1. 目的

直近のユーザ指摘 3 件（PDF/sandbox readability, editor sizing, markdown readability）を閉じ、
keyboard navigation / entry-window editing / task badge ラインも実装完了した時点で、
「次に本当にやるべきこと」が存在するかを棚卸しする。

本 doc は **実装 spec ではなく棚卸し結果**。新規 feature / refactor / UI 変更は
今回の scope 外。

---

## 2. 現状スナップショット

### 2-A. 実装完了ライン

| ライン | 状況 | 最終 Issue |
|--------|------|-----------|
| Markdown rendering / task list | COMPLETED | #43, #63 |
| Attachment preview（画像 / PDF / audio / video / HTML / 非画像 inline） | COMPLETED | #44, #45, #63 Slice B |
| TEXT / TEXTLOG 編集 UX | COMPLETED | #32, #37, #38, #58, #61, #62 |
| TEXTLOG 全般（archetype / CSV / ZIP / export） | COMPLETED | #33–#36 |
| Import / export（folder-scoped / container-wide / batch） | COMPLETED | #6–#9, #16–#19 |
| Asset 系（picker / autocomplete / reference resolution / inline preview） | COMPLETED | #2–#4, #25, #44 |
| Sandbox policy（container + per-entry override） | COMPLETED | #45 |
| Entry window（archetype display / preview / structured editor / task badge） | COMPLETED | #14, #15, #58, #61, #62 |
| Task completion badge（sidebar + detail + entry window） | COMPLETED | #59, #61 |
| Keyboard navigation — Sidebar Phase 1–6 | COMPLETED | #48, #50, #51, #52, #53, #54 |
| Keyboard navigation — Kanban Phase 1–3 | COMPLETED | #55, #57, #60 |
| Keyboard navigation — Calendar Phase 1 | COMPLETED | #56 |
| Multi-select（Phase 1 + 2-A/B/C/E + drag ghost） | COMPLETED | #46, #47 |
| Todo view consistency（detail / calendar / kanban） | COMPLETED | #41 |
| DnD cleanup robustness | COMPLETED | #11 |
| UI Readability & Editor Sizing Hardening（Slices A + B + C） | COMPLETED | #63 |

### 2-B. ソースコード状況

| ファイル | 行数 | 備考 |
|---------|------|------|
| `src/adapter/ui/action-binder.ts` | 3553 | 大きいが、dispatch 経路の責務に集中している。分割は今早い |
| `src/adapter/ui/renderer.ts` | 2985 | 大きいが、純粋 render 関数に集中している。分割は今早い |
| `src/adapter/ui/entry-window.ts` | 1894 | 構造化エディタ追加で更に肥大。責務肥大は認識済み（#62）だが、stabilization のみ。今やる妥当性は中 |
| `src/adapter/state/app-state.ts` | 1037 | reducer + pure logic。許容範囲 |

**`TODO` / `FIXME` / `XXX` / `HACK` コメント**: `src/` 配下に 0 件。

---

## 3. 棚卸し分類

### 3-A. Close / Done と見なせるライン

以下のラインは機能として完結しており、ユーザからの追加報告がない限り触る必要なし:

- Markdown rendering（interactive task list、readability まで）
- Attachment preview / inline preview / asset chips
- Import / export（全経路）
- Sandbox policy
- Entry window（双方向編集 + 構造化エディタ + badge 同期）
- Task badge（sidebar + detail + entry window の 3 面合流）
- Keyboard navigation（3 view 全て navigation 完成、Kanban は action 操作も完成）
- Multi-select（Phase 2-D 以外）
- Todo view consistency

### 3-B. まだ明確な価値がある候補

**該当なし**。

現時点で「これが無いと実用上困る」と明確に言えるものは、残った候補群の中には存在しない。

### 3-C. ブロックされている候補

| 候補 | ブロック要因 |
|------|-------------|
| Shift+Arrow range selection | Phase 2-D（SELECT_RANGE 表示順対応）未解決が前提。さらに「前提を解く価値」が薄い |
| TEXTLOG drag-to-reorder | oldest-first storage 不変条件と衝突。設計変更議論が先 |

### 3-D. 今やる妥当性が薄い候補

| 候補 | 妥当性が薄い理由 |
|------|----------------|
| Calendar Phase 2（month wrap） | Phase 1 で主要操作は完了。空セル cursor の需要が具体的でない |
| Phase 2-D（SELECT_RANGE 表示順対応） | Ctrl+click で代替可能。設計負債だが実害小 |
| Sidebar multi-DnD | BULK_MOVE で代替可能。structural relation の cycle detection が複雑化する |

### 3-E. stale に近い候補

**該当なし**。保留候補は全て INDEX.md に明示されており、放置ではなく **明示的に保留**。

### 3-F. refactor 候補

| 候補 | 現状評価 |
|------|---------|
| `entry-window.ts` 責務分割 | 認識済み（#62）。structured editor 追加で更に肥大したが、今は stabilization 直後で触るのはリスク先行 |
| `action-binder.ts` 分割 | 3553 行。dispatch 責務への集中は保たれており、崩しに行く根拠が弱い |
| `renderer.ts` 分割 | 2985 行。pure render として機能分割せず済んでいる |

いずれも **今やる妥当性は低い**。リファクタ需要は将来の機能追加で再発した時に再検討する。

---

## 4. 候補比較（参考）

仮にここから 1 件選ぶなら、という観点で比較する（ただし推奨はしない）。

| 候補 | ユーザ価値 | 実装コスト | 技術リスク | project phase 相性 | 今やる妥当性 |
|------|-----------|-----------|-----------|-------------------|-------------|
| Calendar Phase 2 (month wrap) | 低 | 中 | 中 | 低 | △ |
| Shift+Arrow range selection | 中 | 高 | 高 | 低（2-D 未解決） | × |
| Phase 2-D（SELECT_RANGE 表示順） | 低 | 中 | 中 | 低（Ctrl+click 代替） | △ |
| Sidebar multi-DnD | 中 | 高 | 高 | 低（BULK_MOVE 代替） | × |
| `entry-window.ts` 分割 | 内部品質 | 高 | 高 | 低（直後 stabilization） | × |
| `action-binder.ts` 分割 | 内部品質 | 高 | 中 | 低（痛みが出ていない） | × |

**いずれも「今やるべき」と言える妥当性を持たない。**

---

## 5. 推奨判断

### 結論: B. 安定化フェーズに到達

現時点では **新規実装よりもユーザからの新たな痛み待ちが妥当**。

**根拠**:
1. 直近 3 件の UX 指摘は全て閉じた
2. 残った候補は全て
   - 低 value、または
   - ブロックされている、または
   - 代替手段が存在する、または
   - 直後の大きな変更を避けるべき
3. `src/` 配下に `TODO` / `FIXME` が 0 件 — 既知の未解決負債なし
4. 実装完了ラインは 20 本以上揃っている — 機能的 gap が具体的に見えない

**今やるべきこと（実装ではなく）**:
- 本 doc を INDEX に記録する（1 行追記のみ）
- ユーザ側で手動確認（Slice A の line-height 体感、Slice C のウィンドウ追従、Slice B の PDF 表示）
- 新規 UX 報告 / pain point 発生を待つ
- 新報告が来たら spec-first で最小実装する運用を継続する

**無理に候補を作らない**:
- 思いつき実装は品質の高い project ほど迷走を招く
- 現時点で「作るべきもの」は見えていない

---

## 6. 次に新規報告が来た場合の動き方（運用メモ）

1. 報告を具体的 UX 問題に還元する（症状 / 再現経路 / 影響範囲）
2. 既存 CANDIDATE / 保留候補との整合を確認する（重複や supersession がないか）
3. 最小 slice に分ける（今回の Slice A/B/C 方式を踏襲）
4. spec-first で doc を書く
5. 実装 → テスト → docs 固定 → INDEX 更新

---

## 7. 変更ファイル一覧

| File | Change |
|------|--------|
| `docs/development/project-priority-refresh.md` | 新規作成（本 doc） |
| `docs/development/INDEX.md` | 「Stabilization Phase」節を 1 つ追記、CANDIDATE 節の状態を更新 |

**変更なし**: `src/` / `tests/` / `dist/` — 本 issue は棚卸し専用。

---

## 8. Non-goals

| 項目 | 理由 |
|------|------|
| 新規 feature spec | 今は安定化判断が優先 |
| refactor spec（entry-window.ts / action-binder.ts 分割） | 今やる妥当性が薄い |
| typography 設定 UI | 禁止スコープ（Slice A で明記） |
| Calendar Phase 2 実装 | 需要不足 |
| Shift+Arrow 実装 | Phase 2-D 未解決 |
| architecture rewrite | 必要性なし |
