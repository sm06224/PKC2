# Entry Window Task Completion Badge

Status: CANDIDATE
Created: 2026-04-12

---

## 1. Summary

entry window の view title row に task completion badge（`done/total`）を表示する。
main window（sidebar + detail pane）と同一形式。
TEXT / TEXTLOG 両対応。child 側で DOM から badge を導出し、protocol 変更不要。

---

## 2. 現状棚卸し

### main window の task completion badge

| 場所 | 実装 | 属性 |
|------|------|------|
| sidebar | `renderer.ts:1136-1144` — `countTaskProgress(entry)` → `<span class="pkc-task-badge">` を `<li>` に append | `data-pkc-task-complete="true"` on `<li>` |
| detail pane | `renderer.ts:1665-1673` — `countTaskProgress(entry)` → `.pkc-task-badge` を `.pkc-view-title-row` に append | `data-pkc-task-complete="true"` on badge 自体 |

`countTaskProgress()` (`markdown-task-list.ts:98-136`):
- TEXT: `findTaskItems(body)` で直接カウント
- TEXTLOG: inline JSON parse → 全 log entry の task 合算
- todo/form/attachment: `null` 返却（badge 非表示）
- 返却型: `TaskProgress { done: number; total: number } | null`

### entry window の render/update 経路

| パス | トリガー | body-view 更新方法 |
|------|---------|-------------------|
| 初回表示 | `buildWindowHtml()` → `document.write()` | `renderedBody` を HTML テンプレートに埋め込み |
| task toggle | `pkc-entry-task-toggle` → parent dispatch → `pushViewBodyUpdate()` / `pushTextlogViewBodyUpdate()` | `pkc-entry-update-view-body` → `#body-view.innerHTML` |
| save | `pkc-entry-save` → parent dispatch → `pkc-entry-saved` | child 側 `renderMd(originalBody)` → `#body-view.innerHTML` |
| cancel edit (pending) | `cancelEdit()` → `flushPendingViewBody()` | `pendingViewBody` → `#body-view.innerHTML` |

### 現在 badge が entry window にない理由

`buildWindowHtml()` は `entry` を受け取るが、`countTaskProgress()` を import していない。
title row は `<h2>` + `<span class="pkc-archetype-label">` のみ。
badge CSS (`.pkc-task-badge`) は entry window の inline style にない。

### badge 表示候補位置

entry window の view title row:
```html
<div class="pkc-view-title-row">
  <h2 class="pkc-view-title" id="title-display">${escapedTitle}</h2>
  <span class="pkc-archetype-label">${entry.archetype}</span>
  <!-- ★ ここに badge を挿入 -->
</div>
```

detail pane と同じ `.pkc-view-title-row` 配置。
archetype label の後ろ = 自然な位置で既存レイアウトを壊さない。

---

## 3. 最小スコープ

### やること

- entry window view title row に `<span class="pkc-task-badge" id="task-badge">` を追加
- TEXT / TEXTLOG 両対応
- task toggle 後に badge 同期
- save 後に badge 同期
- cancel edit (pending flush) 後に badge 同期
- 全完了時は success 色
- task 0 件時は非表示

### やらないこと

| 項目 | 理由 |
|------|------|
| entry window 内の独自 state | badge は DOM から導出。state 不要 |
| progress bar / graph | main window にもない |
| per-log-entry badge | main window は全 log entry 合算 |
| protocol の全面再設計 | protocol 変更自体が不要 |
| sidebar / detail badge の再設計 | 既存実装に触らない |
| edit mode title row への badge | 編集中に badge は不要 |
| percentage 表示 | main window にもない |

---

## 4. Badge Semantics

| 項目 | 仕様 | 根拠 |
|------|------|------|
| 表示形式 | `done/total`（例: `2/5`） | main window と同一 |
| task 0 件時 | 非表示（`display:none`） | main window と同一 |
| 全完了時 | `color: var(--c-success)` | main window と同一 |
| TEXTLOG | 全 log entry 合算 | main window と同一 |
| todo / form / attachment | 非表示 | main window と同一 |
| フォントサイズ | `0.7rem` | detail pane title row と同一 |

---

## 5. 表示位置

**view title row の archetype label の後ろ（1 箇所）。**

```html
<div class="pkc-view-title-row">
  <h2 class="pkc-view-title" id="title-display">...</h2>
  <span class="pkc-archetype-label">text</span>
  <span class="pkc-task-badge" id="task-badge" style="display:none"></span>
</div>
```

### なぜ最小か

- 1 要素追加のみ
- 既存 title row のフレックスレイアウトにそのまま収まる
- detail pane と同じ class（`.pkc-task-badge`）を使うため CSS 追加が最小
- `id="task-badge"` で child-side JS から直接アクセス可能

### なぜ既存レイアウトを壊しにくいか

- `.pkc-view-title-row` は `display:flex; align-items:baseline; gap:0.35rem`
- 追加要素は `flex-shrink:0` で archetype label と同等の振る舞い
- title が長い場合は `flex:1; word-break:break-word` の h2 が吸収する
- badge は小さいテキスト（最大 `999/999` 程度）でオーバーフローしない

### edit mode title row

edit mode の `.pkc-editor-title-row` には badge を配置しない。
理由: 編集中はユーザが body を書き換えており、badge が常に stale になる。
main window の detail pane も編集中は badge を再描画しない（view mode のみ）。

---

## 6. Source of Truth / Sync

### 基本方針

- source of truth: 親 window の `entry.body`
- badge は **child 側の `#body-view` DOM から導出**する
- child 側に badge state を持たない
- **追加 protocol 不要**

### DOM 導出アプローチ

`#body-view` が更新されるたびに、child 側で rendered HTML 内の
task checkbox をカウントして badge を更新する。

```javascript
function updateTaskBadge() {
  var bodyView = document.getElementById('body-view');
  var badge = document.getElementById('task-badge');
  if (!bodyView || !badge) return;
  var checkboxes = bodyView.querySelectorAll('.pkc-task-checkbox');
  if (checkboxes.length === 0) {
    badge.style.display = 'none';
    badge.removeAttribute('data-pkc-task-complete');
    return;
  }
  var done = 0;
  for (var i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) done++;
  }
  badge.textContent = done + '/' + checkboxes.length;
  badge.style.display = '';
  if (done === checkboxes.length) {
    badge.setAttribute('data-pkc-task-complete', 'true');
  } else {
    badge.removeAttribute('data-pkc-task-complete');
  }
}
```

### なぜ DOM 導出か

| 比較軸 | protocol 拡張 | DOM 導出 |
|--------|-------------|---------|
| protocol 変更 | `pkc-entry-update-view-body` + `pkc-entry-saved` に field 追加 | なし |
| parent push 関数変更 | `pushViewBodyUpdate` + `pushTextlogViewBodyUpdate` 引数追加 | なし |
| caller (action-binder) 変更 | badge 計算追加 | なし |
| child 側変更 | handler 拡張 | `updateTaskBadge()` 関数追加 |
| 正確性 | 親の計算結果を直接受信 | rendered HTML と常に同期 |
| desync リスク | push 漏れで badge stale | body-view と常に一致 |
| dirty state 整合 | dirty 時は badge も stash 必要 | body-view 未更新なら badge も不変 |

DOM 導出の方が:
1. protocol 変更ゼロで最小侵入
2. body-view の内容と badge が常に一致（desync 不可能）
3. dirty state policy と自然に整合（body-view が更新されないなら badge も変わらない）

### 呼び出しタイミング

| イベント | body-view 更新場所 | badge 更新 |
|---------|-------------------|-----------|
| 初回表示 | `buildWindowHtml()` HTML 埋め込み | init script 末尾で `updateTaskBadge()` |
| task toggle | `pkc-entry-update-view-body` handler | handler 内で `updateTaskBadge()` |
| save | `pkc-entry-saved` handler (`renderMd(originalBody)`) | handler 内で `updateTaskBadge()` |
| cancel edit (pending flush) | `flushPendingViewBody()` | 関数末尾で `updateTaskBadge()` |
| dirty stash (body-view 不変) | なし | 呼ばない（badge 維持） |

### `countTaskProgress` との差異

`countTaskProgress()` は raw body text を正規表現でスキャンする。
DOM 導出は rendered HTML 内の `.pkc-task-checkbox` 要素をカウントする。

両者は同一結果を返す:
- `renderMarkdown()` が `- [ ]` / `- [x]` を `.pkc-task-checkbox` input に変換
- fenced code block 内の task syntax は `renderMarkdown()` が除外済み
- todo/form/attachment archetype は body-view にチェックボックスを含まない

### 既存 push 関数への影響

**なし。** `pushViewBodyUpdate()` / `pushTextlogViewBodyUpdate()` は変更不要。
badge 情報を payload に含める必要がない。

---

## 7. TEXTLOG の扱い

### 全 log entry 合算

main window と同一。TEXTLOG の body-view には全 log entry が
`<div data-pkc-log-id="...">` で wrap されて並ぶ。
DOM 導出は `#body-view` 全体の `.pkc-task-checkbox` をカウントするため、
自然に全 log entry 合算になる。

### entry window の現行 TEXTLOG 描画との整合

- 初回: `renderViewBody()` → `parseTextlogBody()` → per-log-entry `renderMarkdown()` → `data-pkc-log-id` wrap
- task toggle 後: `pushTextlogViewBodyUpdate()` → 同じ per-log-entry 構造
- save 後: child 側 `renderMd(originalBody)` → textlog JSON を丸ごと markdown render

**注意:** save 後の child 側 local render は textlog JSON を per-log-entry 分解しない。
ただし JSON 文字列を `renderMd()` しても `.pkc-task-checkbox` は生成されないため、
badge は `0/0` → 非表示になる。これは既存の body-view 表示品質の問題であり、
badge 実装が新たに引き起こすものではない。
task toggle 経由（push 更新）では per-log-entry 構造が正しく維持される。

### logId 単位 badge

不要。main window も全体合算のみ。

---

## 8. テスト計画

### badge 表示

| # | Test | Expect |
|---|------|--------|
| 1 | TEXT entry with tasks → badge visible | `done/total` テキスト表示 |
| 2 | TEXTLOG entry with tasks across log entries → badge visible | 全 log entry 合算 |
| 3 | TEXT entry with no tasks → badge hidden | `display:none` |
| 4 | TEXTLOG entry with no tasks → badge hidden | `display:none` |
| 5 | all tasks complete → success color | `data-pkc-task-complete="true"` |
| 6 | partial tasks → muted color | `data-pkc-task-complete` 属性なし |
| 7 | todo archetype → badge hidden | checkbox なし |

### badge 更新

| # | Test | Expect |
|---|------|--------|
| 8 | task toggle → badge count updates | `done` 値が +1/-1 |
| 9 | `pkc-entry-update-view-body` → badge re-derived | DOM から再カウント |
| 10 | `pkc-entry-saved` → badge re-derived | local re-render 後に再カウント |
| 11 | `flushPendingViewBody()` → badge re-derived | flush 後に再カウント |

### guard / regression

| # | Test | Expect |
|---|------|--------|
| 12 | readonly entry → badge still visible (display only) | 正常表示 |
| 13 | dirty state → badge unchanged until flush | stash 中は body-view 不変 → badge 不変 |
| 14 | main window sidebar badge 不変 | 既存テスト pass |
| 15 | main window detail pane badge 不変 | 既存テスト pass |

---

## 9. 変更ファイル一覧

### 変更あり

| File | Change | Lines (est.) |
|------|--------|-------------|
| `src/adapter/ui/entry-window.ts` | (1) `buildWindowHtml` title row に badge 要素追加 (2) inline CSS に `.pkc-task-badge` 追加 (3) child script に `updateTaskBadge()` 追加 (4) 4 箇所に `updateTaskBadge()` 呼び出し追加 | ~30 |
| `tests/adapter/entry-window.test.ts` | badge 表示/更新/guard テスト | ~60 |
| `docs/development/INDEX.md` | #61 追加 | ~3 |

### 変更なし

| File | 理由 |
|------|------|
| `src/adapter/ui/renderer.ts` | main window badge は既存実装のまま |
| `src/adapter/ui/action-binder.ts` | task toggle / push 経路は変更不要 |
| `src/features/markdown/markdown-task-list.ts` | `countTaskProgress` は entry window では使用しない |
| `src/styles/base.css` | entry window は inline style のため |
| reducer | protocol 追加なし。`QUICK_UPDATE_ENTRY` そのまま |
| `pushViewBodyUpdate` / `pushTextlogViewBodyUpdate` | 引数・payload 変更なし |

### import 追加

なし。child 側は plain JS（inline script）のため module import は使用しない。

---

## 10. Non-goals

| 項目 | 理由 |
|------|------|
| entry window edit mode badge | 編集中の badge は stale。main window も view mode のみ |
| `countTaskProgress` の entry-window 移植 | DOM 導出で十分。features 層の関数を child に移植する必要なし |
| protocol 新設 / 拡張 | DOM 導出により不要 |
| parent push 関数の signature 変更 | DOM 導出により不要 |
| TEXTLOG per-log-entry badge | main window にもない |
| progress bar / percentage | scope 外 |
