# System Settings as Hidden Entry v1 — Minimum Scope

Status: DRAFT 2026-04-18
Pipeline position: minimum scope
Scope: docs-only (no implementation in this FI)
Relates to:
- `docs/spec/ui-theme-customizable-accent-scanline-v1-minimum-scope.md`
- `docs/spec/ui-theme-customizable-accent-scanline-v1-behavior-contract.md`
- `docs/development/ui-theme-customizable-accent-scanline-v1-audit.md`

---

## 0. Why

FI-12 follow-up で `showScanline` と `accentColor` を runtime state に入れたが、
セッション限りで毎回リセットされる。永続化が必要になる。

選択肢:

| 案 | 評価 |
|----|------|
| localStorage | 単一 HTML 哲学に反する。配布・同期困難 |
| IndexedDB (別キー) | 永続化はできるが PKC の Container と分離した二重管理 |
| **Container 内の hidden system entry** | **採用候補** |

本文書は **PKC 自身の hidden system entry に設定を保存する方式** の minimum scope を定義する。実装はこの FI の範囲外（後続 FI で実施）。

---

## 1. Goal / Non-goal

### 1-1. v1 Goal

- 設定値を Container の 1 件の hidden entry (`archetype: 'system'`) として保持する
- JSON 形式で body に保存
- 最初の対象設定は 2 つだけ:
  - `theme.scanline: boolean`
  - `theme.accentColor: string | null`
- runtime state と同期する load / save の contract を定義する
- UI でこの hidden entry が一覧に出ないこと（既存 filter / sort / Kanban / Calendar で非表示）

### 1-2. v1 Non-goal

- 他の設定項目の追加（sort 永続化、view mode 永続化 等）
- user-level editor での直接編集 UI
- 複数 settings entry 同時存在のサポート
- migration（schema v2 への移行）
- 別 single-HTML ツールとの connect UI
- 外部同期（同一設定を複数ブラウザで共有）
- TEXT archetype の subtype（csv / yaml / xml / json / ini 等）の正式導入

### 1-3. Non-goal の一部は v1.x 以降で検討

| 項目 | フェーズ |
|------|---------|
| 直接編集 UI | v1.x |
| migration 機構 | schema バージョン変更時 |
| 別ツール連携（PKC-Message 経由） | 別 FI |
| TEXT subtype 形式 | 別 FI（config-like text の正式化）|

---

## 2. Data model

### 2-1. Archetype

新規 archetype を**追加しない**。既存の `system` archetype を再利用する。
（※ 既存コードに `system` archetype が未定義の場合は behavior contract 段階で追加の要否を判断する。単一 hidden entry に閉じる運用なので `generic` / `opaque` での代替も選択肢）

### 2-2. Lid convention

固定 lid を使う（lookup を単純化するため）:

```
__settings__
```

（先頭末尾の `__` は既存 entry と衝突しない unique prefix。実運用で collision check を reducer / persistence で行う。）

### 2-3. Body schema (JSON)

```jsonc
{
  "format": "pkc2-system-settings",
  "version": 1,
  "theme": {
    "scanline": false,
    "accentColor": null
  }
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `format` | `"pkc2-system-settings"` 固定 | ○ | 誤読 guard |
| `version` | `number` 整数 | ○ | schema version（v1 = 1） |
| `theme.scanline` | `boolean` | ○ | scanline overlay の ON/OFF |
| `theme.accentColor` | `string \| null` | ○ | hex (`#rrggbb`) または null (= default) |

将来の `theme.*` 追加は version bump なしで backward-compatible に行える。未知フィールドは無視する。

### 2-4. Default

hidden entry が不在 or parse 失敗時は下記 default を使う:

```
{ theme: { scanline: false, accentColor: null } }
```

---

## 3. Load / save contract (pseudocode)

### 3-1. Load

```
SYS_INIT_COMPLETE のあと:
  entry = container.entries.find(e => e.lid === '__settings__')
  if (!entry) → use defaults
  if (entry.archetype !== 'system') → use defaults
  parsed = tryParseJSON(entry.body)
  if (!parsed) → use defaults
  if (parsed.format !== 'pkc2-system-settings') → use defaults
  if (parsed.version !== 1) → log warning, use defaults
  apply:
    AppState.showScanline = parsed.theme?.scanline ?? false
    AppState.accentColor  = parsed.theme?.accentColor ?? undefined
```

### 3-2. Save

以下のアクションは永続化対象:

- `SET_SCANLINE` / `TOGGLE_SCANLINE`
- `SET_ACCENT_COLOR` / `RESET_ACCENT_COLOR`

reducer が state を更新したあと、Container の `__settings__` entry を upsert する追加 domain event を発行する:

```
event: { type: 'SETTINGS_CHANGED', settings: { scanline, accentColor } }
```

persistence 層がこのイベントを listen して IndexedDB / autosave に反映する。Container への実書き込みは persistence 層の既存 autosave 経路に同期する（別経路は作らない）。

### 3-3. Upsert semantics

entry が存在しなければ新規作成、存在すれば body のみ更新:

```
{
  lid: '__settings__',
  title: 'System Settings',   // UI には出ないが export ファイルでは可読
  archetype: 'system',
  body: JSON.stringify(nextSettings, null, 2),
  created_at: existing?.created_at ?? now(),
  updated_at: now(),
}
```

---

## 4. UI invisibility contract

以下の全ビューで hidden entry を表示しない:

| View | 方針 |
|------|------|
| Sidebar tree | `archetype === 'system'` を除外 |
| Search / filter 結果 | 同上 |
| Archetype filter tabs | `system` を tab として出さない |
| Kanban | 対象外（todo 専用） |
| Calendar | 対象外（日付持つ entry 専用） |
| Relations | 作成元 / 作成先として候補に出さない |
| Export HTML / ZIP | Container に含めたまま（設定も含めて共有できる）|

既存の「folder のみ除外」等の filter と同パターンで追加する。

---

## 5. Action / event contract (sketch)

```typescript
// 新規 domain event
{ type: 'SETTINGS_CHANGED'; settings: { scanline: boolean; accentColor: string | null } }

// 既存 actions に副作用追加:
// SET_SCANLINE / TOGGLE_SCANLINE / SET_ACCENT_COLOR / RESET_ACCENT_COLOR
// reducer が SETTINGS_CHANGED event を返す
```

reducer は Container を直接更新しない。Container 更新は persistence 層（既存 autosave）が `SETTINGS_CHANGED` event を受けて行う（分離維持）。

---

## 6. 将来性 — TEXT subtype との関係

`__settings__` は今回は archetype `system` 固定の JSON body として扱う。
しかし将来、PKC2 が「TEXT entry の subtype」（csv, xml, yaml, json, ini 等）を正式サポートする場合、本設定エントリを以下のように再解釈できるようにしておく:

- `archetype: 'text'` + `subtype: 'json'` + 同じ lid / body
- または `archetype: 'system'` を `archetype: 'text'` に変更 + `metaType` attribute

どちらに進んでも schema version の bump で対応できるよう、v1 では:

- body の先頭フィールドを `"format": "pkc2-system-settings"` で固定
- `version: 1` を明示
- `__settings__` 以外の system entry を作らない

このルールで「後方互換な subtype 再解釈」が可能になる。

---

## 7. 将来性 — PKC-Message 連携

詳細 UI（色パレット、フォント選択、プリセット保存等）はコア HTML に入れず、
別の single-HTML ツール（Settings Editor）が **PKC-Message 経由** で:

1. 現在の `__settings__` entry を読む
2. UI で編集
3. 変更を PKC に送り返して entry を upsert

これによりコアバンドルの肥大化を避けられる。v1 ではこの連携は対象外だが、
**hidden entry に JSON で持つ** 本設計がこの拡張の前提条件になる。

---

## 8. Risk / open questions

| 項目 | 方針 |
|------|------|
| `system` archetype が存在しない場合 | behavior contract 段階で追加 or `generic` 流用を決定 |
| 既存 export HTML に hidden entry が載るか | 載せる（配布物で設定も引き継げる / プライバシー懸念は v1 scope 外）|
| import/merge 時の `__settings__` 衝突 | import 側の値を棄却、host 側を優先（ユーザー設定は手元で上書きされたくない）|
| reducer と persistence の分離を崩さないか | `SETTINGS_CHANGED` event 経由で既存 autosave に乗せるので OK |
| schema v2 への migration | v1 では実装しない。version field で将来検出可能 |

---

## 9. Testability (future FI のための参考)

- pure: load parser（default fallback / malformed / format mismatch / version mismatch）
- reducer: SET_* → SETTINGS_CHANGED event emit 確認
- persistence: upsert / autosave で entry が永続化される
- UI: hidden entry が各 view で非表示

---

## 10. References

- `docs/spec/ui-theme-customizable-accent-scanline-v1-minimum-scope.md`
- `docs/spec/ui-theme-customizable-accent-scanline-v1-behavior-contract.md`
- `docs/development/ui-theme-customizable-accent-scanline-v1-audit.md`
- `src/core/model/container.ts`（entry schema）
- `src/adapter/state/app-state.ts`（showScanline / accentColor fields）
