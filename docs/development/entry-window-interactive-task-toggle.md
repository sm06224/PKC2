# Entry Window Interactive Task Toggle

Status: COMPLETED
Created: 2026-04-11

---

## 1. Summary

entry window 内で表示される markdown task list checkbox（`- [ ]` / `- [x]`）を
click で toggle 可能にする。

現状、entry window は `renderMarkdown()` を共有しているため checkbox は
描画されるが、click handler が存在しない。親 window 側に toggle request を
送る protocol を追加し、親で source of truth を更新、再描画で反映する。

---

## 2. 現状棚卸し

### Main window の interactive task toggle

| Component | File | Lines |
|-----------|------|-------|
| Click handler | `action-binder.ts` | `handleTaskCheckboxClick()` 840-885 |
| TEXT path | 同上 | `toggleTaskItem(entry.body, taskIndex)` → `QUICK_UPDATE_ENTRY` 874-884 |
| TEXTLOG path | 同上 | `parseTextlogBody` → find log entry by `data-pkc-log-id` → `toggleTaskItem(logEntry.text, taskIndex)` → `serializeTextlogBody` → `QUICK_UPDATE_ENTRY` 848-872 |
| Task toggle helper | `markdown-task-list.ts` | `toggleTaskItem(body, taskIndex)` 89-106 |
| Task detection | `markdown-task-list.ts` | `findTaskItems(body)` 36-78 |
| Checkbox injection | `markdown-render.ts` | `pkc-task-list` core rule 84-119 |
| Tests | `action-binder.test.ts` | 2548-2744 |

### Entry window 構造

| Component | File | Details |
|-----------|------|---------|
| Window open | `entry-window.ts` | `openEntryWindow()` 359-440 |
| HTML 生成 | `entry-window.ts` | `buildWindowHtml()` 696-1509 |
| View body render | `entry-window.ts` | `renderViewBody()` 494-515 |
| Message listener (parent) | `entry-window.ts` | `handleMessage()` 414-428 |
| Message listener (child) | `entry-window.ts` (inline script) | 1411-1505 |
| View body push | `entry-window.ts` | `pushViewBodyUpdate()` 295-309 |
| View body refresh wiring | `entry-window-view-body-refresh.ts` | assets 変更時のみ発火 |

### 既存 protocol (6 types)

| Direction | Type | Purpose |
|-----------|------|---------|
| Child → Parent | `pkc-entry-save` | Save entry (title + body) |
| Parent → Child | `pkc-entry-saved` | Save confirmation |
| Parent → Child | `pkc-entry-conflict` | Concurrent modification warning |
| Child → Parent | `pkc-entry-download-asset` | Asset download request |
| Parent → Child | `pkc-entry-update-preview-ctx` | Live refresh Preview resolver |
| Parent → Child | `pkc-entry-update-view-body` | Rerender view-pane body HTML |

### なぜ entry window で checkbox が非 interactive なのか

1. `renderMarkdown()` は checkbox を `<input type="checkbox" data-pkc-task-index="N">` として描画する
2. `disabled` 属性はないため、DOM 上は click 可能
3. しかし entry window の inline script には `input[data-pkc-task-index]` の click handler が存在しない
4. main window の `handleTaskCheckboxClick()` は main window の `action-binder.ts` 内にあり、entry window の DOM からは到達しない
5. 結果: checkbox は見えるが、click しても何も起きない

---

## 3. Source of Truth

**明確に固定する:**

- source of truth は **親 window 側の `entry.body`**
- entry window 側の checkbox state は **派生物**
- entry window で DOM だけ先に変えない（optimistic update 禁止）
- 親更新 → `pushViewBodyUpdate()` による再描画で反映する

理由:
- 親 window の dispatcher が唯一の state 管理者
- entry window は snapshot + postMessage 経由のみ
- DOM 先行更新は conflict detection と矛盾する

---

## 4. 最小スコープ

### やること

- entry window の checkbox click を親へ通知する message type を追加
- 親 window で `QUICK_UPDATE_ENTRY` を dispatch
- `pushViewBodyUpdate()` で entry window に再描画を push

### やらないこと

| 項目 | 理由 |
|------|------|
| entry window 単独編集モード | 既存 edit モードで十分 |
| entry window 内での直接 state 保持 | source of truth 違反 |
| multi-select task toggle | main window でも未対応 |
| task completion badge | UX 拡張は別 issue |
| transport の全面再設計 | 既存 protocol に 1 type 追加で十分 |
| optimistic update | dirty state 管理との衝突を避ける |

---

## 5. Protocol 設計

### 新規 message: Child → Parent

```typescript
{
  type: 'pkc-entry-task-toggle';
  lid: string;          // entry lid
  taskIndex: number;    // data-pkc-task-index value
  logId: string | null; // TEXTLOG: log entry ID, TEXT: null
}
```

### なぜ `logId` が必要か

TEXTLOG archetype では body 全体が JSON (`TextlogBody`) であり、
task list は各 log entry の `text` フィールド内にある。

main window の `handleTaskCheckboxClick()` は `data-pkc-log-id` 属性から
対象の log entry を特定している。entry window でも同じ識別が必要。

### entry window renderer の現状

`renderViewBody()` が TEXTLOG を描画する際:
- `entry.body` を `renderMarkdown()` に直接渡す（line 511）
- log entry 単位の分解はしていない（main window の renderer.ts とは異なる）

**これは重要な問題**: entry window の TEXTLOG 描画が log entry 単位でないため、
`data-pkc-log-id` を checkbox の親要素に付与できない。

### TEXTLOG 対応方針

**2 つの選択肢:**

**A. entry window の TEXTLOG 描画を log entry 単位に変更（推奨）**
- `renderViewBody()` で TEXTLOG の場合、`parseTextlogBody()` → log entry ごとに
  `renderMarkdown()` → 各ブロックに `data-pkc-log-id` を付与
- entry window 側で checkbox click 時に最寄りの `data-pkc-log-id` を取得
- main window と同じ識別方式

**B. taskIndex をグローバルにして logId を不要にする**
- entry window では body 全体を 1 本の markdown として描画しているため、
  taskIndex は body 全体の通し番号
- 親側で body 全体の通し番号から逆算して該当 log entry を特定する
- 逆算ロジックが複雑で脆い

**推奨: 方式 A**
理由: main window と同じデータフロー、`logId` による明確な識別、将来の保守性。

### 親側の処理フロー

```
1. child → parent: { type: 'pkc-entry-task-toggle', lid, taskIndex, logId }
2. parent handleMessage:
   a. state = dispatcher.getState()
   b. entry = state.container.entries.find(e => e.lid === lid)
   c. if (!entry) return  // stale
   d. if (state.readonly) return  // readonly guard
   e. if TEXT:
        newBody = toggleTaskItem(entry.body, taskIndex)
        if (!newBody) return
   f. if TEXTLOG:
        log = parseTextlogBody(entry.body)
        logEntry = log.entries.find(e => e.id === logId)
        if (!logEntry) return
        newText = toggleTaskItem(logEntry.text, taskIndex)
        if (!newText) return
        logEntry.text = newText
        newBody = serializeTextlogBody(log)
   g. dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: newBody })
   h. pushViewBodyUpdate(lid, resolvedBody)  // explicit push
```

### 再描画の仕組み

既存の `wireEntryWindowViewBodyRefresh` は `assets` identity 変更時にのみ発火する。
task toggle は body のみ変更するため、**明示的に `pushViewBodyUpdate()` を呼ぶ必要がある**。

step (h) で、toggle 処理後に asset resolution を行い、push する。
`buildEntryPreviewCtx()` で resolver context を取得 →
`resolveAssetReferences()` で body を解決 → `pushViewBodyUpdate(lid, resolvedBody)`.

body に asset reference がない場合は `entry.body` をそのまま渡す。

---

## 6. Archetype ごとの扱い

### TEXT

- body は plain markdown text
- `toggleTaskItem(entry.body, taskIndex)` で直接 toggle
- `data-pkc-log-id` 不要（payload の `logId: null`）

### TEXTLOG

- body は JSON (`TextlogBody`) with `entries[].text` fields
- 各 log entry の `text` 内に task list が存在し得る
- `data-pkc-log-id` で対象 log entry を特定
- `toggleTaskItem(logEntry.text, taskIndex)` で toggle
- `serializeTextlogBody(log)` で再シリアライズ

### entry window での TEXTLOG 描画変更（方式 A）

現状:
```typescript
// renderViewBody() line 511
return renderMarkdown(ctx?.resolvedBody ?? entry.body);
```

変更後（TEXTLOG の場合のみ）:
```typescript
if (entry.archetype === 'textlog') {
  const log = parseTextlogBody(entry.body);
  return log.entries.map(e =>
    `<div data-pkc-log-id="${e.id}">${renderMarkdown(e.text)}</div>`
  ).join('');
}
```

これにより entry window 側で checkbox の祖先から `data-pkc-log-id` を取得可能になる。

### 他の archetype

| Archetype | 対応 |
|-----------|------|
| todo | task list なし（body は JSON）→ 非対象 |
| form | task list なし → 非対象 |
| attachment | task list なし → 非対象 |
| folder | body 通常空 → 非対象 |
| generic / opaque | markdown render するため task list が存在し得る → TEXT と同じ扱い |

---

## 7. Failure / Sync

### readonly

- 親が `state.readonly` の場合、toggle request を無視
- entry window 側: checkbox は CSS で non-interactive にすべきか？
  - **推奨**: entry window が readonly で開かれた場合、checkbox に `pointer-events: none` を適用（buildWindowHtml で readonly flag に応じて CSS を出力）
  - これは UX guard。protocol レベルでも親側で readonly guard を入れる（二重防御）

### entry が見つからない

- 親が `entries.find(e => e.lid === lid)` で null → 無視（stale window）
- log entry が見つからない（TEXTLOG） → 無視

### message が古い（race condition）

- entry window の checkbox click と、main window での concurrent 編集が重なる場合
- `QUICK_UPDATE_ENTRY` は `entry.body` 全体を上書きするため、concurrent な body 変更は失われる
- **ただし**: task toggle は body 内の 1 行のみ変更するため、
  concurrent に別の task を toggle した場合は競合が起きる
- **Phase 1 では許容**: 同時編集の頻度は低い。conflict detection は既存の `pkc-entry-conflict` で部分対応済み
- **将来**: operation-based patch（行番号ベース）を検討

### 親更新後の再同期

- 親で `QUICK_UPDATE_ENTRY` dispatch 後、明示的に `pushViewBodyUpdate()` を呼ぶ
- `pushViewBodyUpdate()` は `renderMarkdown()` を経由して HTML を生成し、
  child の `#body-view` に postMessage で送信
- child 側の message listener が `pkc-entry-update-view-body` を受信し、
  view pane の innerHTML を更新
- **dirty state policy**: child が edit mode で dirty な場合は `pendingViewBody` に stash される（既存の仕組みそのまま）

### 親が更新を拒否した場合

- readonly、entry not found、toggleTaskItem が null を返した場合
- 親は何もしない（dispatch も push もしない）
- child の checkbox は DOM 上 checked/unchecked が変わるが、
  次の pushViewBodyUpdate で正しい state に戻る
- **問題**: push が来ない場合、checkbox が「反転したまま」になる
- **対策**: child 側で checkbox の default action を `preventDefault()` で阻止し、
  親からの push でのみ state を変更する

---

## 8. 実装変更箇所（見積もり）

| File | Change | Lines |
|------|--------|-------|
| `entry-window.ts` | `handleMessage` に `pkc-entry-task-toggle` 分岐追加 | ~30 |
| `entry-window.ts` | `buildWindowHtml` inline script に checkbox click handler 追加 | ~20 |
| `entry-window.ts` | `renderViewBody` TEXTLOG 分岐で log entry 単位描画 | ~15 |
| `entry-window.ts` | readonly 時の checkbox CSS guard | ~5 |
| `action-binder.ts` | 変更なし（handler は entry-window.ts 内で完結） | 0 |
| `markdown-task-list.ts` | 変更なし（既存 `toggleTaskItem` 再利用） | 0 |
| `markdown-render.ts` | 変更なし | 0 |
| reducer / app-state | 変更なし（`QUICK_UPDATE_ENTRY` 既存） | 0 |

### 新規テストファイル

| File | Tests |
|------|-------|
| `tests/adapter/entry-window-task-toggle.test.ts` | ~20 |

---

## 9. テスト計画

### Integration

| # | Test | Expect |
|---|------|--------|
| 1 | TEXT entry: checkbox click → parent receives task-toggle message | message payload 正確 |
| 2 | TEXT entry: parent processes toggle → body updated | `- [ ]` → `- [x]` |
| 3 | TEXT entry: pushViewBodyUpdate called after toggle | child re-rendered |
| 4 | TEXTLOG entry: checkbox click with logId → parent receives | message payload に logId 含む |
| 5 | TEXTLOG entry: parent processes toggle → correct log entry updated | 対象 row のみ変更 |
| 6 | Multiple tasks on same entry: correct taskIndex targeting | index 0, 1, 2 独立 |

### Guard

| # | Test | Expect |
|---|------|--------|
| 7 | readonly mode → toggle request ignored | body 不変 |
| 8 | entry not found (stale lid) → no-op | no dispatch |
| 9 | TEXTLOG: logId not found → no-op | no dispatch |
| 10 | toggleTaskItem returns null → no-op | no dispatch |

### Sync

| # | Test | Expect |
|---|------|--------|
| 11 | child checkbox preventDefault → DOM state 不変 | push 待ち |
| 12 | pushViewBodyUpdate after toggle → child DOM 更新 | 正しい checked 状態 |
| 13 | dirty state: toggle push stashed as pending | pendingViewBody に格納 |

### Regression

| # | Test | Expect |
|---|------|--------|
| 14 | main window task toggle 不変 | handleTaskCheckboxClick 動作 |
| 15 | entry-window save flow 不変 | pkc-entry-save/saved 動作 |
| 16 | entry-window asset download 不変 | pkc-entry-download-asset 動作 |
| 17 | view-body refresh wiring 不変 | assets 変更で push |

---

## 10. Non-goals

| 項目 | 理由 |
|------|------|
| entry window 単独編集モード | 既存 edit モードで十分 |
| multi-select task toggle | main window でも未対応 |
| task completion percentage | UX 拡張は別 issue |
| edit-mode Preview 内の checkbox toggle | CSS で `pointer-events: none` が既存 |
| transport 全面再設計 | 1 type 追加で十分 |
| operation-based patch | concurrent edit は Phase 1 許容 |

---

## 11. Child-side Implementation Detail

### Inline script に追加する click handler

```javascript
// Task checkbox toggle → notify parent
document.addEventListener('click', function(e) {
  var checkbox = e.target;
  if (!checkbox || checkbox.tagName !== 'INPUT' || !checkbox.hasAttribute('data-pkc-task-index')) return;

  e.preventDefault(); // DOM state を親の push まで変えない

  var taskIndex = parseInt(checkbox.getAttribute('data-pkc-task-index'), 10);
  if (isNaN(taskIndex)) return;

  // TEXTLOG: find logId from ancestor
  var logRow = checkbox.closest ? checkbox.closest('[data-pkc-log-id]') : null;
  var logId = logRow ? logRow.getAttribute('data-pkc-log-id') : null;

  if (window.opener) {
    try {
      window.opener.postMessage({
        type: 'pkc-entry-task-toggle',
        lid: lid, // captured from buildWindowHtml scope
        taskIndex: taskIndex,
        logId: logId
      }, '*');
    } catch (_e) { /* parent closed */ }
  }
});
```

### readonly guard (CSS)

```javascript
// buildWindowHtml 内、readonly === true の場合:
'.pkc-task-checkbox { pointer-events: none; cursor: default; opacity: 0.6; }'
```
