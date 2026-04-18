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

---

## 4. Load contract

### 4-1. Load timing

`SYS_INIT_COMPLETE` 後、main.ts のブートストラップが以下を実行:

```
1. container.entries から lid === '__settings__' を find
2. resolveSettingsPayload(entry) で SystemSettingsPayload を得る
3. dispatch({ type: 'RESTORE_SETTINGS', settings })
4. renderer の最初の render で apply される (§5)
```

`RESTORE_SETTINGS` は `phase === 'initializing'` でも受理される唯一の例外。

### 4-2. resolveSettingsPayload (擬似コード)

```typescript
function resolveSettingsPayload(entry?: Entry): SystemSettingsPayload {
  if (!entry) return SETTINGS_DEFAULTS;
  if (entry.archetype !== 'system-settings') {
    console.warn('[PKC2] settings entry has wrong archetype, using defaults');
    return SETTINGS_DEFAULTS;
  }
  let parsed;
  try {
    parsed = JSON.parse(entry.body);
  } catch (e) {
    console.warn('[PKC2] settings entry parse failed:', e);
    return SETTINGS_DEFAULTS;
  }
  if (parsed?.format !== 'pkc2-system-settings') {
    console.warn('[PKC2] settings format mismatch, using defaults');
    return SETTINGS_DEFAULTS;
  }
  if (parsed.version !== 1) {
    console.warn('[PKC2] settings version mismatch, using defaults');
    return SETTINGS_DEFAULTS;
  }
  // ここから per-field fallback (§4-3)
  return mergeWithDefaults(parsed);
}
```

### 4-3. Per-field fallback merge

```typescript
function mergeWithDefaults(parsed: any): SystemSettingsPayload {
  return {
    theme: {
      mode:        validMode(parsed.theme?.mode)        ?? 'auto',
      scanline:    typeof parsed.theme?.scanline === 'boolean' ? parsed.theme.scanline : false,
      accentColor: validHex(parsed.theme?.accentColor) ?? null,
      borderColor: validHex(parsed.theme?.borderColor) ?? null,
      textColor:   validHex(parsed.theme?.textColor)   ?? null,
    },
    display: {
      preferredFont: validFont(parsed.display?.preferredFont) ?? null,
    },
    locale: {
      language: validLang(parsed.locale?.language) ?? null,
      timezone: validTimezone(parsed.locale?.timezone) ?? null,
    },
  };
}
```

各 valid* 関数は §2-5/§2-6/§2-7 のルールに従う。1 field の不正は他 field に影響しない。

### 4-4. Defaults

```typescript
const SETTINGS_DEFAULTS: SystemSettingsPayload = {
  theme: { mode: 'auto', scanline: false, accentColor: null, borderColor: null, textColor: null },
  display: { preferredFont: null },
  locale: { language: null, timezone: null },
};
```

null = system / CSS default にフォールバック (I-SETTINGS-5)。

---

## 5. Apply contract

### 5-1. Apply timing

renderer の `render(state, root)` 内で、毎 render に **idempotent に** 反映する。差分検出はしない (DOM 操作は冪等で、性能影響なし)。

### 5-2. 各 field の反映先

| field | 反映先 | null 時の挙動 |
|-------|--------|--------------|
| `theme.mode` | `#pkc-root[data-pkc-theme="dark\|light\|auto"]` | (null 不可) auto = system 追従 |
| `theme.scanline` | `#pkc-root[data-pkc-scanline="on"]` 属性付け外し | false なら属性削除 |
| `theme.accentColor` | `#pkc-root.style.setProperty('--c-accent', value)` | `removeProperty('--c-accent')` |
| `theme.borderColor` | `#pkc-root.style.setProperty('--c-border', value)` | `removeProperty('--c-border')` |
| `theme.textColor` | `#pkc-root.style.setProperty('--c-text', value)` | `removeProperty('--c-text')` |
| `display.preferredFont` | `#pkc-root.style.setProperty('--font-main', value)` | `removeProperty('--font-main')` |
| `locale.language` | `document.documentElement.lang = value` | `'auto'` 互換: navigator.language を反映 or 何もしない |
| `locale.timezone` | runtime の `formatDate*` 関数群が `Intl.DateTimeFormat` 第二引数に引き渡す | system locale (引数省略) |

### 5-3. CSS 変数の新規追加

`src/styles/base.css` の `:root` に以下を追加 (実装時)。本 contract では宣言のみ:

```css
:root {
  --c-border: <既存 border 色のデフォルト>;
  --c-text:   <既存 text 色のデフォルト>;
  --font-main: 'BIZ UDGothic', 'BIZ UDPGothic', sans-serif;
}
```

既存 `--c-accent` (FI-12 で導入) と同パターン。

### 5-4. Font fallback chain

`display.preferredFont` の値はユーザー入力の CSS font-family 文字列。runtime は値の妥当性を judge せず、ブラウザの font fallback に委ねる:

```css
font-family: var(--font-main);
/* デフォルト宣言で 'BIZ UDGothic', 'BIZ UDPGothic', sans-serif を最終 fallback とする */
```

invalid なフォント名でも sans-serif が必ず効くため、UI 崩壊なし。

### 5-5. Locale apply の v1 制約

- `locale.language` は `<html lang>` への反映のみ。i18n リソース切替は v1 では実装しない (将来の hook 点)
- `locale.timezone` は `formatTodoDate` / Calendar の日付描画関数で `Intl.DateTimeFormat` の `timeZone` オプションに渡す
- 既存の date format 関数群は引数追加が必要 (実装時の作業範囲)

### 5-6. Idempotent / no-flicker

renderer は毎回同じ値を set する。差分検出をしない代わりに、ブラウザは値が同じなら repaint しない。flicker / FOUC を防ぐため、初回 render は **`SYS_INIT_COMPLETE` 直後の同期 dispatch chain 内** に収まる必要がある (`RESTORE_SETTINGS` → render が同 microtask)。

---

## 6. Invariants

### I-SETTINGS-1 — 破損耐性 (app 起動保証)

settings entry の不在 / parse 失敗 / format 不一致 / version 不一致のいずれでも **app は正常起動** する。`SETTINGS_DEFAULTS` で安全起動。UI には赤エラーを出さず、`console.warn` のみ。

### I-SETTINGS-2 — About entry との完全分離

| 軸 | About | Settings |
|----|-------|----------|
| archetype | `system-about` | `system-settings` |
| lid | `__about__` | `__settings__` |
| Mutability | immutable | mutable |
| 生成タイミング | build-time | runtime (user action) |
| Fallback 粒度 | 全体 | per-field |

両者は独立した reducer / presenter / state slice で扱う。相互依存・相互参照なし。

### I-SETTINGS-3 — Export/import に含まれる

- HTML export / ZIP export / subset export は `__settings__` entry を**含める**
- import / merge 時は **host 側を保持** し流入棄却 (warning log のみ)
- 設定は配布物の一部として持ち運べるが、受け取り側で上書きされない

### I-SETTINGS-4 — Reserved lid 保護 (defense in depth)

reducer は `__settings__` 対象の以下 user actions を block:
- `BEGIN_EDIT`
- `DELETE_ENTRY`
- `QUICK_UPDATE_ENTRY`
- `COMMIT_EDIT` (lid match 時)
- `CREATE_ENTRY` (同 lid 衝突時)

block 時は state 不変、event 発行なし、`console.warn` 出力のみ。変更の唯一の経路は `SET_*` / `TOGGLE_*` / `RESET_*` / `RESTORE_SETTINGS` 系。

### I-SETTINGS-5 — null = system default

全 nullable field について `null` は「システムデフォルトに従う」を意味する:
- color: CSS 変数の `:root` 既定値
- font: `--font-main` の既定 fallback chain
- language: `navigator.language`
- timezone: system locale (Intl 引数省略)

null 以外の値が入ったときのみ override する。`undefined` は受け取らない (parse 段階で null に正規化)。

### I-SETTINGS-6 — Single source of truth

Container 内の `__settings__` entry が唯一の永続層。AppState.settings は **rehydrate された runtime mirror**。両者の差は `SETTINGS_CHANGED` event → persistence の autosave 経路でのみ吸収される (双方向同期は禁止 = 反対方向は流れない)。

### I-SETTINGS-7 — Forward-compatible (unknown key)

unknown キーは parse 時に読み飛ばし、**save 時には書き出さない** (sanitize)。将来の v2 schema 追加時に v1 runtime が壊れない / v1 runtime の save で v2 値を上書き消失しない、両方を担保。

### I-SETTINGS-8 — Phase gate

全 SET_* / TOGGLE_* / RESET_* は `phase === 'ready'` のみ受理。`RESTORE_SETTINGS` のみ `'initializing'` でも受理。
