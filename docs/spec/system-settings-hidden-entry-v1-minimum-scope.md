# System Settings as Hidden Entry v1 — Minimum Scope

Status: DRAFT 2026-04-18 (rev.2 — expanded from scanline+accent to full settings)
Pipeline position: minimum scope
Scope: docs-only (no implementation in this FI)
Relates to:
- `docs/spec/ui-theme-customizable-accent-scanline-v1-minimum-scope.md`
- `docs/spec/ui-theme-customizable-accent-scanline-v1-behavior-contract.md`
- `docs/spec/about-build-info-hidden-entry-v1-minimum-scope.md` (hidden entry pattern)

---

## 0. 問題の再定義

### 0-1. runtime-only の限界

FI-12 で `showScanline` と `accentColor` を AppState に入れたが、セッション限りで毎回リセットされる。ユーザーが毎回再設定する必要がある。

### 0-2. 永続化先の選定

| 案 | 評価 |
|----|------|
| localStorage | 単一 HTML 哲学に反する。配布・移動時に設定が失われる |
| IndexedDB (別キー) | Container と分離した二重管理。export に含まれない |
| **Container 内の hidden entry** | **採用** — export/import で持ち運べる。self-describing container 哲学と合致 |

### 0-3. 方向性

PKC2 は single-HTML / self-describing / self-configuring container を志向する。設定もまた Container 内に保持し、成果物 1 枚で完結する。

---

## 1. Goal / Non-goal

### 1-1. v1 Goal

- 設定値を Container 内の hidden entry (`__settings__`) として永続化する
- JSON body で保存、format discriminator + version field 付き
- v1 対象設定（8 項目）:

| カテゴリ | 設定 | 型 | デフォルト |
|---------|------|-----|-----------|
| theme | `mode` | `'dark' \| 'light' \| 'auto'` | `'auto'` |
| theme | `scanline` | `boolean` | `false` |
| theme | `accentColor` | `string \| null` | `null` (= CSS default `#33ff66`) |
| theme | `borderColor` | `string \| null` | `null` (= CSS default) |
| theme | `textColor` | `string \| null` | `null` (= CSS default) |
| display | `preferredFont` | `string \| null` | `null` (= `'BIZ UDGothic'`) |
| locale | `language` | `string \| null` | `null` (= system) |
| locale | `timezone` | `string \| null` | `null` (= system locale) |

- null = system/CSS default にフォールバック
- load / save の contract を定義
- hidden entry が各ビューで非表示

### 1-2. v1 Non-goal

| 項目 | 理由 |
|------|------|
| テーマプリセット保存 / 共有 | 設定基盤が先 |
| カラーピッカー UI | v1 は直接入力 or プリセット切替 |
| フォント一覧 auto-detection | ブラウザ API 制約、v1 scope 外 |
| 多言語リソースバンドル | language 設定は将来の i18n hook 点のみ |
| schema v2 への migration 機構 | version field で将来検出可能 |
| PKC-Message 経由の設定変更 | 別 FI |
| TEXT subtype (json/yaml/ini) の正式導入 | 別 FI |
| 複数 settings entry 同時存在 | 1 container = 1 settings |

---

## 2. Data model

### 2-1. Archetype

新規 archetype `system-settings` を追加する。

| archetype | 用途 | mutable | lid |
|-----------|------|---------|-----|
| `system-about` | ビルド情報 | false (immutable) | `__about__` |
| `system-settings` | ユーザー設定 | **true** | `__settings__` |

About と Settings は性質が異なる（immutable vs mutable）ため独立 archetype とする。

### 2-2. Lid convention

固定 lid: `__settings__`

`isReservedLid()` (先頭末尾 `__`) に合致する。reducer が reserved lid への不正操作を拒否する（About と同パターン）。

### 2-3. Body schema (JSON, v1)

```jsonc
{
  "format": "pkc2-system-settings",
  "version": 1,
  "theme": {
    "mode": "auto",
    "scanline": false,
    "accentColor": null,
    "borderColor": null,
    "textColor": null
  },
  "display": {
    "preferredFont": null
  },
  "locale": {
    "language": null,
    "timezone": null
  }
}
```

### 2-4. フィールド定義

| field | 型 | 必須 | 説明 |
|-------|-----|------|------|
| `format` | `"pkc2-system-settings"` 固定 | ○ | 誤読 guard |
| `version` | `number` (整数) | ○ | schema version (v1 = 1) |
| `theme.mode` | `'dark' \| 'light' \| 'auto'` | ○ | テーマモード |
| `theme.scanline` | `boolean` | ○ | スキャンライン ON/OFF |
| `theme.accentColor` | `string \| null` | ○ | hex (`#rrggbb`) or null |
| `theme.borderColor` | `string \| null` | ○ | hex or null |
| `theme.textColor` | `string \| null` | ○ | hex or null |
| `display.preferredFont` | `string \| null` | ○ | CSS font-family 値 or null |
| `locale.language` | `string \| null` | ○ | BCP 47 tag or null |
| `locale.timezone` | `string \| null` | ○ | IANA timezone or null |

**未知キー許容方針**: パーサーは未知のトップレベル・ネストキーを無視する (forward-compatible)。version bump なしで backward-compatible に新キーを追加可能。

### 2-5. Default

hidden entry 不在 / parse 失敗 / format 不一致 / version 不一致時は全 default を使用:

```typescript
const SETTINGS_DEFAULTS = {
  theme: { mode: 'auto', scanline: false, accentColor: null, borderColor: null, textColor: null },
  display: { preferredFont: null },
  locale: { language: null, timezone: null },
};
```

null = 各 CSS 変数 / system API のデフォルトにフォールバック。

---

## 3. Load / save contract

### 3-1. Load (起動時)

```
SYS_INIT_COMPLETE のあと:
  entry = container.entries.find(e => e.lid === '__settings__')
  if (!entry) → use SETTINGS_DEFAULTS
  if (entry.archetype !== 'system-settings') → use SETTINGS_DEFAULTS
  parsed = tryParseJSON(entry.body)
  if (!parsed || parsed.format !== 'pkc2-system-settings') → use SETTINGS_DEFAULTS
  if (parsed.version !== 1) → log warning, use SETTINGS_DEFAULTS
  apply (with per-field fallback):
    theme.mode       = parsed.theme?.mode       ?? 'auto'
    theme.scanline   = parsed.theme?.scanline   ?? false
    theme.accentColor= parsed.theme?.accentColor?? null
    theme.borderColor= parsed.theme?.borderColor?? null
    theme.textColor  = parsed.theme?.textColor  ?? null
    display.preferredFont = parsed.display?.preferredFont ?? null
    locale.language  = parsed.locale?.language   ?? null
    locale.timezone  = parsed.locale?.timezone   ?? null
```

### 3-2. Apply (DOM への反映)

| 設定 | 反映先 |
|------|--------|
| `theme.mode` | `data-pkc-theme` 属性 (既存機構) |
| `theme.scanline` | `data-pkc-scanline` 属性 (既存) |
| `theme.accentColor` | `--c-accent` CSS 変数 (既存) |
| `theme.borderColor` | `--c-border` CSS 変数 (新規) |
| `theme.textColor` | `--c-text` CSS 変数 (新規) |
| `display.preferredFont` | `--font-main` CSS 変数 (新規) |
| `locale.language` | `html[lang]` 属性 |
| `locale.timezone` | 日付フォーマット関数への引数 |

### 3-3. Save (変更時)

設定変更アクション → reducer が state 更新 → `SETTINGS_CHANGED` domain event 発行 → persistence 層が `__settings__` entry を upsert。

```typescript
// 新規 domain event
{ type: 'SETTINGS_CHANGED'; settings: SystemSettingsPayload }

// upsert semantics
{
  lid: '__settings__',
  title: 'System Settings',
  archetype: 'system-settings',
  body: JSON.stringify(nextSettings, null, 2),
  created_at: existing?.created_at ?? now(),
  updated_at: now(),
}
```

Container 更新は persistence 層の既存 autosave 経路に同期する（別経路は作らない）。

---

## 4. UI invisibility contract

| View | 方針 |
|------|------|
| Sidebar tree | `isUserEntry()` で除外 (About と同パターン) |
| Search / filter | 同上 |
| Archetype filter tabs | `system-settings` を tab に出さない |
| Kanban / Calendar | 対象外 |
| Relations | 候補に出さない |
| Export HTML / ZIP | Container に含める (設定も持ち運べる) |

---

## 5. 不変条件

### I-SETTINGS-1 — 破損耐性

settings entry が不在 / parse 失敗 / schema 不一致でも **app は正常起動** する。全項目を SETTINGS_DEFAULTS で安全起動。

### I-SETTINGS-2 — About entry との役割分離

About = immutable build info / Settings = mutable user preferences。archetype・lid・生成タイミング全て独立。相互依存なし。

### I-SETTINGS-3 — Export/import に含まれる

設定は Container の一部として export される。import 時は host 側の settings を優先（上書きしない）。

### I-SETTINGS-4 — Reserved lid 保護

reducer が `__settings__` に対する `BEGIN_EDIT` / `DELETE_ENTRY` / 通常 `CREATE_ENTRY` を拒否する。変更は `SETTINGS_CHANGED` 経由のみ。

### I-SETTINGS-5 — null = system default

全設定項目で null は「システムデフォルトに従う」を意味する。null 以外の値のみ CSS 変数 / DOM 属性をオーバーライドする。

---

## 6. 将来接続

| 項目 | 関係 |
|------|------|
| config-like text (TEXT subtype) | 将来 `archetype: 'text' + subtype: 'json'` に再解釈可能。format + version で互換維持 |
| PKC-Message | 外部 Settings Editor が read → edit → upsert する経路。v1 非対象 |
| Theme preset | `theme.*` をまとめて切替。settings 基盤の上に載る |
| Richer editor / preview | JSON body の structured edit UI。v1 は不要 |

---

## 7. Risk / open questions

| 項目 | 方針 |
|------|------|
| `system-settings` archetype 追加の影響 | ArchetypeId union + `isUserEntry()` filter で閉じる |
| import 時の `__settings__` 衝突 | host 側を優先。import 側の settings は棄却 |
| font validation | CSS font-family として invalid でも app は壊れない (ブラウザ fallback) |
| timezone validation | Intl API が unknown timezone を throw → catch して system default |
| language 設定の実効性 | v1 では i18n 未実装。将来の hook 点として保持するのみ |
| schema v2 migration | v1 では不要。version field で将来検出可能 |

---

## 8. Testability (将来 impl 向け参考)

- **pure (8 件)**: load parser — default fallback / malformed JSON / format mismatch / version mismatch / 部分欠損 / null 値 / unknown key 無視 / hex validation
- **reducer (6 件)**: 各設定変更 action → SETTINGS_CHANGED event emit / reserved lid guard
- **persistence (3 件)**: upsert 新規作成 / upsert 既存更新 / autosave 連携
- **UI (4 件)**: hidden entry 各 view 非表示 / CSS 変数反映 / DOM 属性反映 / system default fallback

---

## References

- `docs/spec/about-build-info-hidden-entry-v1-minimum-scope.md` — hidden entry pattern
- `docs/spec/ui-theme-customizable-accent-scanline-v1-minimum-scope.md` — FI-12 theme state
- `src/core/model/record.ts` — ArchetypeId, isReservedLid()
- `src/adapter/state/app-state.ts` — showScanline / accentColor fields
- `src/adapter/platform/persistence.ts` — autosave / event listener pattern
