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

---

## 7. Persistence contract

### 7-1. Autosave 接続

既存 `src/adapter/platform/persistence.ts` の `SAVE_TRIGGERS` に `'SETTINGS_CHANGED'` を追加する:

```typescript
const SAVE_TRIGGERS = new Set([
  ...既存のトリガー,
  'SETTINGS_CHANGED',
]);
```

debounce / flush タイミングは既存 autosave と共有 (300ms)。settings 専用の別経路は作らない。

### 7-2. Upsert flow

persistence layer の autosave flush 時、以下を実行:

```
1. const entry = container.entries.find(e => e.lid === '__settings__')
2. const body = JSON.stringify(state.settings, null, 2)  // sanitize 済み (§2-8)
3. if (entry):
     dispatch({ type: 'SYS_UPDATE_ENTRY', lid: '__settings__', patch: { body, updated_at: now() } })
   else:
     dispatch({ type: 'SYS_CREATE_ENTRY', entry: {
       lid: '__settings__',
       title: 'System Settings',
       body,
       archetype: 'system-settings',
       created_at: now(),
       updated_at: now(),
     }})
```

`SYS_*` (system command) は reducer の reserved-lid gate を bypass する唯一の経路。user action は I-SETTINGS-4 で block される。

### 7-3. Container への書き込みは reducer 経由

persistence layer は **直接 container を mutate しない**。必ず dispatcher 経由で `SYS_UPDATE_ENTRY` / `SYS_CREATE_ENTRY` を発行し、reducer が container を更新する。これにより:

- 単一 source of truth (reducer) を維持
- 変更履歴 (revisions) が一貫した経路で生成される
- テストで mock しやすい

### 7-4. Import / merge での扱い

| 経路 | 動作 |
|------|------|
| HTML import (full container 置換) | host の `__settings__` を **保持**。流入 container の `__settings__` を **棄却** (warning log) |
| ZIP import (subset merge) | 同上。流入の `__settings__` は merge 対象外 |
| Subset export | `__settings__` を **含める** (export 側) |
| Container clone (workspace duplication) | settings も clone される |

設定はユーザー固有のため、import で他人の設定に上書きされない。host 側を絶対優先 (I-SETTINGS-3)。

### 7-5. Export での扱い

| Export 形式 | 含む |
|------------|------|
| HTML export | ✓ |
| ZIP export | ✓ |
| Subset export | ✓ (entries 全体に含まれる場合) |
| Plain text export | 対象外 (entries しか出さない) |

---

## 8. Gate / Error paths

| 状況 | 検知層 | 挙動 |
|------|--------|------|
| body が JSON として parse 不可 | runtime (resolveSettingsPayload) | 全体 fallback (SETTINGS_DEFAULTS), console.warn |
| `format !== 'pkc2-system-settings'` | runtime | 全体 fallback (誤読防止) |
| `version !== 1` | runtime | 全体 fallback, console.warn (将来 migration の hook 点) |
| 必須 nested object 欠落 (`theme` 自体が無い等) | runtime | 該当 nested は丸ごと defaults を merge |
| `theme.mode` が 'dark'/'light'/'auto' 以外 | runtime | field 単位 fallback (= 'auto') |
| `theme.scanline` が boolean でない | runtime | field 単位 fallback (= false) |
| color hex が形式不一致 | runtime | field 単位 fallback (= null) |
| `display.preferredFont` が string でない | runtime | field 単位 fallback (= null) |
| `locale.timezone` が Intl で invalid | runtime | field 単位 fallback (= null) |
| 未知 top-level / nested key | runtime | 無視して保持 (sanitize は save 時のみ) |
| user action が `__settings__` を edit/delete 対象 | reducer gate | block + console.warn (I-SETTINGS-4) |
| import で外部 `__settings__` 流入 | import reducer | host 側を保持、流入棄却 (warning log) |
| `SET_ACCENT_COLOR` 等で invalid hex | reducer | state 不変、event 発行なし、console.warn |
| `SET_TIMEZONE` で invalid timezone | reducer | 同上 |
| `SETTINGS_CHANGED` 発行中に container update が衝突 | persistence (reducer 経由なので) | reducer の serialize 性により衝突なし |
| autosave 失敗 (IDB error) | persistence | 既存 autosave error path に従う (settings 固有処理なし) |

---

## 9. Future relation

### 9-1. About entry との分担 (再掲)

§I-SETTINGS-2 で定義済み。両者は独立 reducer / presenter / state slice。

### 9-2. PKC-Message bridge (将来)

外部 Settings Editor (single-HTML tool) が message bridge 経由で:

1. `__settings__` の body を read
2. UI で編集
3. 変更を PKC2 に送り返して upsert

この経路は v1 では **接続を開かない**。理由:
- まずコア内 UI で設定変更が完結する状態を作る
- bridge 統合時の permission model を別 FI で設計
- About と異なり Settings は mutable なので write API が必要、慎重に設計する

### 9-3. Theme preset

`theme.*` を一括切替するプリセット機能は本 contract では非対象。将来的には:

- preset を別 hidden entry (`__theme_presets__`) で管理
- ユーザーが選択 → 該当 preset の値を `__settings__` に展開

settings 基盤の上に **薄く乗せる** 設計とする。settings 自体は preset を知らない。

### 9-4. TEXT subtype 化

将来 PKC2 が TEXT subtype (json/yaml/ini 等) を正式サポートした場合、`__settings__` を以下のように再解釈できる:

- `archetype: 'system-settings'` → `archetype: 'text' + subtype: 'json'`
- format / version field により下位互換維持

v1 contract が `format` + `version` を固定しているため、後方互換な subtype 再解釈が可能。

### 9-5. Plugin / module registry

別概念。Plugin が独自の設定を持つ場合は、本 `__settings__` 内ではなく **plugin 専用 hidden entry** で管理する (将来設計)。

---

## 10. Examples

### 10-1. Minimal example (初回起動 / fresh container)

container に `__settings__` が**存在しない**状態。

**runtime の挙動**:
1. `resolveSettingsPayload(undefined)` → `SETTINGS_DEFAULTS`
2. `dispatch({ type: 'RESTORE_SETTINGS', settings: SETTINGS_DEFAULTS })`
3. renderer が default 値で apply (theme.mode='auto', scanline=false, 全 color/font/locale が null = system default)
4. 初回 `SET_*` action で `SETTINGS_CHANGED` event 発行
5. persistence が `__settings__` entry を新規 upsert

### 10-2. Full example (永続化済みユーザー)

```json
{
  "format": "pkc2-system-settings",
  "version": 1,
  "theme": {
    "mode": "dark",
    "scanline": true,
    "accentColor": "#33ff66",
    "borderColor": "#1a4d1a",
    "textColor": null
  },
  "display": {
    "preferredFont": "'BIZ UDGothic', sans-serif"
  },
  "locale": {
    "language": "ja",
    "timezone": "Asia/Tokyo"
  }
}
```

**runtime の挙動**:
1. `resolveSettingsPayload(entry)` で全 field を merge
2. apply: `data-pkc-theme="dark"`, `data-pkc-scanline="on"`, `--c-accent: #33ff66`, `--c-border: #1a4d1a`, `--font-main: 'BIZ UDGothic', sans-serif`, `<html lang="ja">`
3. `textColor` は null なので `--c-text` 削除 (CSS root default が効く)
4. 日付描画は `Intl.DateTimeFormat` に `timeZone: 'Asia/Tokyo'` を渡す

### 10-3. Malformed example (全体 fallback)

```jsonc
{
  "format": "wrong-format",
  "version": 1,
  "theme": { "mode": "dark" }
}
```

**runtime の挙動**:
1. `parsed.format !== 'pkc2-system-settings'` → 全体 fallback
2. `console.warn('[PKC2] settings format mismatch, using defaults')`
3. `SETTINGS_DEFAULTS` を apply
4. UI には赤エラーを出さない

### 10-4. Partially malformed example (per-field fallback)

```jsonc
{
  "format": "pkc2-system-settings",
  "version": 1,
  "theme": {
    "mode": "purple",          // ← invalid (auto/dark/light のみ)
    "scanline": "yes",          // ← invalid (boolean のみ)
    "accentColor": "rgb(0,0,0)", // ← invalid (hex のみ)
    "borderColor": "#abc"       // ← invalid (#rrggbb のみ)
  },
  "display": { "preferredFont": 12345 },  // ← invalid (string のみ)
  "locale": {
    "language": "ja",          // ← valid
    "timezone": "Mars/Phobos"  // ← invalid (Intl 不可)
  }
}
```

**runtime の挙動 (per-field fallback)**:
- `theme.mode` → `'auto'`
- `theme.scanline` → `false`
- `theme.accentColor` → `null`
- `theme.borderColor` → `null`
- `theme.textColor` → `null` (元から無い)
- `display.preferredFont` → `null`
- `locale.language` → `'ja'` (生きる)
- `locale.timezone` → `null`

→ language だけが反映され、他は全部 system default。format/version が valid なので全体 fallback ではない。

### 10-5. Forward-compatible example (unknown key)

```jsonc
{
  "format": "pkc2-system-settings",
  "version": 1,
  "theme": {
    "mode": "dark",
    "scanline": false,
    "accentColor": null,
    "borderColor": null,
    "textColor": null,
    "experimentalGradient": "linear-gradient(...)"  // ← v2 で追加されるかもしれない未知キー
  },
  "display": { "preferredFont": null },
  "locale": { "language": null, "timezone": null },
  "v2OnlySection": { "foo": "bar" }  // ← v2 の未知 section
}
```

**runtime の挙動**:
- v1 runtime は `experimentalGradient` / `v2OnlySection` を**無視**
- `theme.mode = 'dark'` 等は通常通り apply
- `SETTINGS_CHANGED` 発行時に persistence が save → `experimentalGradient` / `v2OnlySection` は **書き出されない** (sanitize)
- 将来 v2 runtime がこの container を読めば、書き出し直すまでは未知キーが残る (parse 時無視のみ)

→ v1 runtime が v2 値を**消失させる**可能性が残る (I-SETTINGS-7 の trade-off)。これは forward-compat と sanitize 安全性の trade-off で、後者を優先。

---

## 11. Testability

### 11-1. Pure (resolveSettingsPayload / mergeWithDefaults)

| ケース | 期待 |
|--------|------|
| undefined entry | SETTINGS_DEFAULTS |
| archetype 不一致 | SETTINGS_DEFAULTS |
| body が JSON 不正 | SETTINGS_DEFAULTS |
| format 不一致 | SETTINGS_DEFAULTS |
| version 不一致 | SETTINGS_DEFAULTS |
| 完全な valid payload | そのまま |
| 部分欠損 | per-field fallback |
| invalid mode | mode のみ 'auto' |
| invalid hex | 該当 color のみ null |
| invalid timezone | timezone のみ null |
| unknown key | 無視、他 field は通常 |

### 11-2. Reducer

| ケース | 期待 |
|--------|------|
| `SET_ACCENT_COLOR` valid | state.settings.theme.accentColor 更新 + SETTINGS_CHANGED 発行 |
| `SET_ACCENT_COLOR` invalid hex | state 不変、event なし、console.warn |
| `RESET_ACCENT_COLOR` | accentColor = null + SETTINGS_CHANGED |
| `SET_THEME_MODE` | mode 更新 + SETTINGS_CHANGED |
| `RESTORE_SETTINGS` | 全項目置換、SETTINGS_CHANGED **発行しない** |
| `BEGIN_EDIT` w/ `__settings__` | block, console.warn |
| `DELETE_ENTRY` w/ `__settings__` | block, console.warn |
| phase != 'ready' で SET_* | silent reject |

### 11-3. Persistence (integration scope)

| ケース | 期待 |
|--------|------|
| `SETTINGS_CHANGED` event → autosave flush で `__settings__` upsert |
| 既存 entry あり → body のみ更新、created_at 維持 |
| 既存 entry なし → 新規作成 |
| import で外部 `__settings__` 流入 → 棄却、host 保持 |
| export に `__settings__` 含まれる |

### 11-4. UI (renderer)

| ケース | 期待 |
|--------|------|
| sidebar に `__settings__` が出ない |
| search 結果に出ない |
| archetype filter tabs に `system-settings` が出ない |
| relation 候補に出ない |
| settings.theme.mode → `data-pkc-theme` 属性 |
| settings.theme.scanline → `data-pkc-scanline` 属性 |
| settings.theme.accentColor → `--c-accent` CSS 変数 |
| 全 color が null → CSS 変数削除 |

---

## 12. References

- `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md` — 先行スコープ定義
- `docs/spec/about-build-info-hidden-entry-v1-behavior-contract.md` — 同系統パターン (immutable 版)
- `docs/spec/about-build-info-hidden-entry-v1-minimum-scope.md`
- `src/core/model/record.ts` — ArchetypeId, isReservedLid()
- `src/core/action/user-action.ts` — 既存 SET_SCANLINE / SET_ACCENT_COLOR の actions
- `src/core/action/domain-event.ts` — DomainEventType (SETTINGS_CHANGED 追加先)
- `src/adapter/state/app-state.ts` — AppState (settings field 統合先)
- `src/adapter/platform/persistence.ts` — SAVE_TRIGGERS / autosave
- `src/adapter/ui/renderer.ts` — apply 経路 (data-pkc-* / CSS 変数)
- `src/styles/base.css` — :root の CSS 変数宣言追加先
