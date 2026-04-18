# System Settings Hidden Entry v1 — Behavior Contract

Status: DRAFT 2026-04-18
Pipeline position: behavior contract
Predecessor: `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md`
Sibling pattern: `docs/spec/about-build-info-hidden-entry-v1-behavior-contract.md`

---

## 1. Scope

### 1-1. 対象

| 項目 | 扱い |
|------|------|
| `archetype: 'system-settings'` の定義とコア型への追加 | 本 contract で固定 |
| reserved lid `__settings__` の採番規則 | 本 contract で固定 |
| body JSON schema (v1, 8 項目) | 本 contract で固定 |
| Load / Apply / Save の各フロー contract | 本 contract で固定 |
| Per-field fallback の粒度規則 | 本 contract で固定 |
| `SETTINGS_CHANGED` domain event の発行・購読契約 | 本 contract で固定 |
| Persistence (autosave) との接続経路 | 本 contract で固定 |
| About entry との分離 / 衝突回避 | 本 contract で固定 |

### 1-2. 非対象 (v1)

- 設定編集 UI の詳細実装（layout / picker / preview）
- カラーピッカー / フォントピッカーの UI 部品
- 多言語化リソースバンドル（`locale.language` は hook 点のみ）
- timezone-aware な日付演算機構の改修
- テーマプリセット保存 / 共有
- PKC-Message bridge 経由の設定書き換え
- schema v2 への migration 機構（version field で将来検出可能）
- TEXT subtype として再解釈する経路
- 複数 settings entry 同時存在のサポート

---

## 2. Data contract

### 2-1. Archetype

```typescript
type ArchetypeId = ... | 'system-about' | 'system-settings' | ...;
```

`src/core/model/record.ts` の `ArchetypeId` union に `'system-settings'` を追加する。`'system-about'` (immutable) と並置する別物として扱う。

### 2-2. Reserved lid

**固定 lid: `__settings__`**

`isReservedLid()` の `__*__` 形式に合致。container 内に高々 1 件のみ存在。

### 2-3. Reserved lid の規約

- `__settings__` の新規作成 / body 変更 / 削除は **`SETTINGS_CHANGED` event 経路のみ** 許可
- user action (`BEGIN_EDIT` / `DELETE_ENTRY` / `QUICK_UPDATE_ENTRY` / `COMMIT_EDIT` / `CREATE_ENTRY`) は reducer gate で block (I-SETTINGS-4)
- import/merge で外部 `__settings__` が流入した場合は **host 側を保持** し流入を棄却 (warning log)

### 2-4. Body JSON schema (v1)

```jsonc
{
  "format": "pkc2-system-settings",  // required, 固定値
  "version": 1,                       // required, 整数
  "theme": {                          // required, object
    "mode": "auto",                   // required, 'dark' | 'light' | 'auto'
    "scanline": false,                // required, boolean
    "accentColor": null,              // required, '#rrggbb' or null
    "borderColor": null,              // required, '#rrggbb' or null
    "textColor": null                 // required, '#rrggbb' or null
  },
  "display": {                        // required, object
    "preferredFont": null             // required, CSS font-family string or null
  },
  "locale": {                         // required, object
    "language": null,                 // required, BCP 47 tag or null
    "timezone": null                  // required, IANA timezone or null
  }
}
```

### 2-5. Required / Nullable / Unknown

| field | Required | null 許容 | invalid 時の挙動 |
|-------|----------|---------|---------------|
| `format` | ✓ | × | 全体 fallback (誤読防止) |
| `version` | ✓ | × | 全体 fallback (`!== 1` も同) |
| `theme.mode` | ✓ | × | **field 単位 fallback** (= `'auto'`) |
| `theme.scanline` | ✓ | × | field 単位 fallback (= `false`) |
| `theme.accentColor` | ✓ | ✓ | hex 不正なら field 単位 fallback (= `null`) |
| `theme.borderColor` | ✓ | ✓ | 同上 |
| `theme.textColor` | ✓ | ✓ | 同上 |
| `display.preferredFont` | ✓ | ✓ | string でなければ field 単位 fallback (= `null`) |
| `locale.language` | ✓ | ✓ | string でなければ field 単位 fallback (= `null`) |
| `locale.timezone` | ✓ | ✓ | Intl API で invalid なら field 単位 fallback (= `null`) |
| 未知トップレベルキー | — | — | **無視して保持** (forward-compatible) |
| 未知ネストキー | — | — | 同上 |

**重要な設計判断**: About と異なり、Settings は **field 単位 fallback** を採用。理由: ユーザーが手動編集 / 部分書き込みしたケースでも、valid な設定だけは生かしたい。`format` / `version` 不一致のみ全体 fallback。

### 2-6. Hex color validation

```
/^#[0-9a-f]{6}$/i  に合致 → valid
それ以外           → field 単位 fallback (null)
```

ストレージは lowercase 正規化 (`#33FF66` → `#33ff66`)。既存 `SET_ACCENT_COLOR` reducer の validation を踏襲。

### 2-7. Timezone validation

```typescript
try {
  new Intl.DateTimeFormat('en-US', { timeZone: parsed.locale.timezone });
  // valid
} catch {
  // field 単位 fallback (null)
}
```

### 2-8. Unknown key 保持規則

unknown キーは parse 時には**読み飛ばし**、save 時には**保持しない** (sanitize)。理由: 将来の v2 schema で安全に追加できるよう、v1 は厳密な v1 schema のみを書き出す。

---

## 3. Reducer / Action contract

### 3-1. 設定変更 user actions (既存 + 新規)

| Action | 既存 / 新規 | 対象 field |
|--------|-----------|-----------|
| `SET_THEME_MODE { mode }` | 既存 (`set-theme`) を踏襲 | `theme.mode` |
| `TOGGLE_SCANLINE` / `SET_SCANLINE { on }` | 既存 | `theme.scanline` |
| `SET_ACCENT_COLOR { color }` / `RESET_ACCENT_COLOR` | 既存 | `theme.accentColor` |
| `SET_BORDER_COLOR { color }` / `RESET_BORDER_COLOR` | **新規** | `theme.borderColor` |
| `SET_TEXT_COLOR { color }` / `RESET_TEXT_COLOR` | **新規** | `theme.textColor` |
| `SET_PREFERRED_FONT { font }` / `RESET_PREFERRED_FONT` | **新規** | `display.preferredFont` |
| `SET_LANGUAGE { language }` / `RESET_LANGUAGE` | **新規** | `locale.language` |
| `SET_TIMEZONE { timezone }` / `RESET_TIMEZONE` | **新規** | `locale.timezone` |
| `RESTORE_SETTINGS { settings }` | **新規** | 全項目（init / import 用） |

各 SET_ アクションは validation 付き。invalid 値は state を変更しない (silent reject + console.warn)。

### 3-2. SETTINGS_CHANGED domain event

```typescript
{
  type: 'SETTINGS_CHANGED';
  settings: SystemSettingsPayload;  // §2-4 の完全 body
}
```

- 上記 SET_*/TOGGLE_*/RESET_* 系を reducer が処理した**直後**に発行
- `RESTORE_SETTINGS` は init / import 由来のため **発行しない** (循環防止)
- payload は変更後の **完全な settings** (差分ではない)。persistence 層が常に full upsert する

### 3-3. Reducer flow (擬似コード)

```
reducer(state, action):
  switch (action.type):
    case 'SET_ACCENT_COLOR':
      if (state.phase !== 'ready') return [state, []]
      validated = validateHex(action.color)
      if (!validated) {
        console.warn(...)
        return [state, []]
      }
      next = { ...state, settings: { ...state.settings, theme: { ...state.settings.theme, accentColor: validated } } }
      event = { type: 'SETTINGS_CHANGED', settings: next.settings }
      return [next, [event]]
    // ... 他の SET_* も同パターン
    case 'RESTORE_SETTINGS':
      next = { ...state, settings: action.settings }
      return [next, []]   // event 発行しない
```

### 3-4. Phase gate

全 SET_* / TOGGLE_* / RESET_* は `phase === 'ready'` のみ受理。`'initializing'` / `'editing'` / `'exporting'` / `'error'` では silent reject (既存パターン踏襲)。

### 3-5. AppState shape

```typescript
interface AppState {
  // ... 既存 fields ...
  settings: SystemSettingsPayload;  // 常に完全 payload。null/undefined 不可
}
```

- `showScanline?: boolean` / `accentColor?: string` の 2 個別フィールドは **`settings.theme.scanline` / `settings.theme.accentColor` に統合** する
- 後方互換: 旧 fixture が `showScanline` / `accentColor` を直接持つ場合は init 時に `settings.theme.*` に migrate (fixture 互換)

### 3-6. Reducer gate (reserved lid 保護)

```
case 'BEGIN_EDIT' / 'DELETE_ENTRY' / 'QUICK_UPDATE_ENTRY':
  if (action.lid === '__settings__') {
    console.warn('[PKC2] settings entry is not user-editable')
    return [state, []]
  }
  // ... 通常処理
```

About entry の reserved lid 保護と同パターン。
