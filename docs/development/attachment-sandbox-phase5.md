# Attachment Sandbox Phase 5: Container Default Policy

## 1. 目的

既存の per-entry sandbox 設定 (`sandbox_allow`) の上位に、
**container レベルのデフォルト sandbox policy** を導入する。

### 課題

現在、HTML/SVG attachment の sandbox 権限は entry ごとに手動設定が必要。
container 内に同種の HTML アプリが多数ある場合、全 entry を個別に設定するのは
非効率であり、設定忘れのリスクがある。

### 解決

container meta に `sandbox_policy` フィールドを追加し、
entry ごとの設定がない attachment に対してデフォルトポリシーを自動適用する。

---

## 2. スコープ

### 対象

- `ContainerMeta` への `sandbox_policy` フィールド追加
- preview 表示時のデフォルト値適用 (fallback chain)
- `SET_SANDBOX_POLICY` reducer action
- meta pane 内の最小 UI (select 要素)
- 既存動作との後方互換

### 非対象

- per-entry policy 編集 UI の変更 (既存のチェックボックス群はそのまま)
- 高度なポリシー編集画面
- スキーマ migration (optional field のため不要)
- CSP 再設計
- non-image inline preview への影響

---

## 3. Source of Truth

**`container.meta.sandbox_policy`** (persistent)。

container JSON の `meta` オブジェクトに永続化される。
runtime-only state (AppState) には追加しない。
container の一部として persistence / export / import で自動的に保持される。

---

## 4. Policy Semantics

### 4.1 定義

| 値 | 意味 | 適用される sandbox attributes |
|----|------|-------------------------------|
| `'strict'` | 最小権限 (現行デフォルト) | `allow-same-origin` のみ (baseline) |
| `'relaxed'` | Web アプリ向け | `allow-same-origin` + `allow-scripts` + `allow-forms` |
| 不在 / undefined | strict と同義 | `allow-same-origin` のみ |

### 4.2 Fallback Chain

```
1. entry.body.sandbox_allow が存在する → そのまま使用 (per-entry override)
2. entry.body.sandbox_allow が不在   → container.meta.sandbox_policy を参照
3. container.meta.sandbox_policy が不在 → strict として扱う
```

### 4.3 per-entry override の優先

per-entry の `sandbox_allow` が設定されている場合 (`[]` 含む)、
container policy は無視される。

**重要**: `sandbox_allow: []` (空配列) は「明示的に何も許可しない」を意味し、
container default の fallback は発生しない。
`sandbox_allow: undefined` (field 不在) のみが fallback トリガとなる。

---

## 5. Backward Compatibility

| 条件 | 動作 |
|------|------|
| 既存 container に `sandbox_policy` フィールドなし | strict (現行動作と同一) |
| 既存 entry に `sandbox_allow` あり | per-entry 設定をそのまま使用 |
| 既存 entry に `sandbox_allow` なし | container default (or strict) にフォールバック |
| `sandbox_policy` に不正値が入っている | strict にフォールバック |

schema_version の変更は不要。optional field の追加のため、
古い PKC2 で読み込んでも `sandbox_policy` は無視される。

---

## 6. 操作シーケンス

### 6.1 Container を開く

```
SYS_INIT_COMPLETE → container.meta.sandbox_policy を読み込み
                     (不在なら strict として扱う)
```

### 6.2 HTML attachment の preview 表示

```
1. populateAttachmentPreviews() が preview 要素を走査
2. entry.body を parseAttachmentBody() で解析
3. sandbox_allow フィールドの存在を確認
4a. 存在する → そのまま populatePreviewElement に渡す
4b. 不在    → container.meta.sandbox_policy を参照
              → resolveContainerSandboxDefault() で attribute リストに変換
              → populatePreviewElement に渡す
5. populatePreviewElement は変更なし (受け取った attribute リストを適用)
```

### 6.3 Container default の変更

```
1. ユーザが meta pane の "Container Default" select を変更
2. SET_SANDBOX_POLICY action を dispatch
3. reducer が container.meta.sandbox_policy を更新
4. re-render → 全 HTML attachment の preview が新 policy で再構築
```

### 6.4 Entry 切替 / Preview 切替

```
entry 切替 → render cycle → populateAttachmentPreviews()
           → 新 entry に sandbox_allow があればそれを使用
           → なければ container default
```

一貫性は render cycle で保証される。

---

## 7. 実装方針

### 7.1 Core 層

- `ContainerMeta` に `sandbox_policy?: 'strict' | 'relaxed'` を追加
- `UserAction` に `SET_SANDBOX_POLICY` を追加

### 7.2 Adapter 層

- reducer: `SET_SANDBOX_POLICY` ハンドラ追加
- action-binder: `populateAttachmentPreviews` 内で fallback chain を実装
- action-binder: `set-sandbox-policy` action ハンドラ追加
- renderer: sandbox section の先頭に container default select を追加

### 7.3 Helper

```typescript
function resolveContainerSandboxDefault(
  policy: string | undefined
): string[] {
  if (policy === 'relaxed') return ['allow-scripts', 'allow-forms'];
  return []; // strict or unknown → baseline only
}
```

---

## 8. UI

meta pane の既存 sandbox section の先頭に、
"Container Default" ラベル + `<select>` 要素を追加。

```
┌─ Sandbox Policy ─────────────────────┐
│ Container Default: [strict ▼]        │
│ ─────────────────────────────────── │
│ ☐ allow-scripts                      │
│ ☐ allow-forms                        │
│ ☐ allow-popups                       │
│ ...                                  │
└──────────────────────────────────────┘
```

- select の選択肢: "strict", "relaxed"
- readonly 時は disabled
- 表示条件: HTML/SVG attachment 選択時 (既存 sandbox section と同一)

---

## 9. テスト戦略

| テスト | 方法 |
|--------|------|
| field 不在時は strict (現行既定動作) | container.meta に sandbox_policy なし → `allow-same-origin` のみ |
| strict → `allow-same-origin` のみ | sandbox_policy: 'strict' 設定時 |
| relaxed → `allow-same-origin` + `allow-scripts` + `allow-forms` | sandbox_policy: 'relaxed' 設定時 |
| per-entry override が container default より優先 | entry に sandbox_allow あり → container policy 無視 |
| 不正値は strict fallback | sandbox_policy: 'invalid' → strict |
| SET_SANDBOX_POLICY reducer | dispatch → container.meta.sandbox_policy が更新される |
| backward compatibility | 旧 container (field なし) → strict で正常動作 |

---

## 10. 5 層構造の適合

| 層 | 変更 |
|---|---|
| core/model | `ContainerMeta` に optional field 追加 |
| core/action | `SET_SANDBOX_POLICY` UserAction 追加 |
| features | 変更なし |
| adapter/state | reducer に SET_SANDBOX_POLICY ハンドラ追加 |
| adapter/ui | renderer: container default select 追加 |
| adapter/ui | action-binder: fallback chain + action handler |
| runtime | 変更なし |
| main.ts | 変更なし |

---

## 11. Intentionally not done

- per-entry policy のプリセット適用 UI (entry ごとに "use container default" ボタン等)
- 3 つ以上の policy preset (strict/relaxed の 2 つで十分)
- container meta の汎用 settings UI (sandbox 以外の設定画面)
- policy の export/import 時の特別処理 (container meta の一部として自動保持)
- 非 HTML/SVG attachment への sandbox 影響 (PDF/audio/video は sandbox 不要)
