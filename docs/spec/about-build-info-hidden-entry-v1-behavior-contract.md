# About / Build Info Hidden Entry v1 — Behavior Contract

Status: DRAFT 2026-04-18
Pipeline position: behavior contract
Predecessor: `docs/spec/about-build-info-hidden-entry-v1-minimum-scope.md`

---

## 1. Scope

### 1-1. 対象

| 項目 | 扱い |
|------|------|
| `archetype: 'system-about'` の定義とコア型への追加 | 本 contract で固定 |
| reserved lid `__about__` の採番規則 | 本 contract で固定(minimum scope の `about` から変更) |
| body JSON schema (v1) | 本 contract で固定 |
| build-time static payload の生成経路 | 本 contract で固定 |
| initial center-pane rendering のトリガー条件 | 本 contract で固定 |
| 破損時の safe fallback 挙動 | 本 contract で固定 |
| hidden settings entry との衝突回避 | 本 contract で固定 |

### 1-2. 非対象(v1)

- 編集 UI / 削除 UI の実装
- runtime 生成(About は build-time only)
- PKC-Message 経由の About 書き換え
- 外部 fetch(OGP / 最新版問い合わせ)
- plugin/module registry との結合
- 多言語化
- About entry の schema migration(v1 は version field 無し。将来 `type` 値の別名で互換切替)

---

## 2. Data contract

### 2-1. Archetype

```typescript
type ArchetypeId = ... | 'system-about' | ...;
```

`src/core/model/record.ts` の `ArchetypeId` union に追加する。既存の `system` archetype(将来の settings 用)とは**別物**として並置する。

### 2-2. Reserved lid

**固定 lid: `__about__`**(先頭末尾の `__` プレフィクスで reserved identifier であることを明示)。

minimum scope の `about` から変更。理由: settings の `__settings__` と同じ reserved-lid 規約を使うことで、「この名前は system 系 hidden entry 専用」というルールを一貫させる。

### 2-3. Reserved lid の規約

- PKC の UI / PKC-Message / import からの書き込みが `__*__` 形式の lid を作ろうとした場合、**reducer が reject** する(I-ABOUT-8 参照)
- About entry は build 時以外では生成されない
- 既存 container に `__about__` が不在なら runtime が §4-4 の fallback を使う

### 2-4. Body JSON schema (v1)

```jsonc
{
  "type": "pkc2-about",          // required, 固定値
  "version": "2.0.0",            // required, SemVer 文字列
  "build": {                     // required, object
    "timestamp": "2026-04-18T06:00:00Z",  // required, ISO-8601 UTC
    "commit": "a926dd5",                   // required, short git SHA
    "builder": "vite+release-builder"      // required, string
  },
  "license": {                   // required, object
    "name": "MIT",               // required, string
    "url": "https://..."         // optional, string (空文字許容)
  },
  "author": {                    // required, object
    "name": "sm06224",           // required, string
    "url": "https://..."         // optional, string (空文字許容)
  },
  "runtime": {                   // required, object
    "offline": true,             // required, boolean
    "bundled": true,             // required, boolean
    "externalDependencies": false // required, boolean
  },
  "modules": [                   // required, array (空配列可)
    { "name": "vite", "version": "5.x", "license": "MIT" }
  ]
}
```

### 2-5. Required / Optional

| field | Required | 空値許容 | 備考 |
|-------|----------|--------|------|
| `type` | ✓ | × | 固定値 `"pkc2-about"` 以外は invalid |
| `version` | ✓ | × | 空文字は invalid |
| `build.timestamp` | ✓ | × | ISO-8601 以外は invalid |
| `build.commit` | ✓ | `"unknown"` 許容 | short SHA or `"unknown"` |
| `build.builder` | ✓ | × | 空文字は invalid |
| `license.name` | ✓ | × | 空文字は invalid |
| `license.url` | ✓ | `""` 許容 | 空なら link 非表示 |
| `author.name` | ✓ | × | |
| `author.url` | ✓ | `""` 許容 | 空なら link 非表示 |
| `runtime.*` | ✓ | × | boolean 以外は invalid |
| `modules` | ✓ | `[]` 許容 | array でないと invalid |
| `modules[].*` | ✓ | × | 各要素の 3 フィールドすべて必須 |

### 2-6. Invalid payload fallback

§6 で詳述。要点:

- 任意フィールドの parse / validation 失敗 → 全体 fallback(default stub)に差し替え
- 部分更新(=「version だけ valid で他は default」)は**行わない**(I-ABOUT-5 の確実性優先)
- console.warn でエラーを残す(UI には赤エラーを出さない)

---

## 3. Builder contract

### 3-1. 注入 step

About entry は **`build:release` step** で container template に静的注入する(= `dist/pkc2.html` 生成の最終段)。`build:bundle` (vite) 段階ではまだ注入しない — bundle には **注入用コード**のみ含まれ、**値**は release-builder が埋める。

### 3-2. Source of truth

| field | source |
|-------|--------|
| `version` | `package.json` の `"version"` |
| `build.timestamp` | builder 実行時刻(UTC ISO-8601) |
| `build.commit` | `git rev-parse --short HEAD`、dirty フラグ付きの場合は `"{sha}+dirty"` |
| `build.builder` | 固定文字列 + builder version(例: `"vite+release-builder@1.0.0"`) |
| `license.*` | `package.json` の `"license"` + `"homepage"` 由来の固定 URL |
| `author.*` | `package.json` の `"author"` 由来 |
| `runtime.*` | **固定値**(PKC2 は常に offline / bundled / no-external-deps) |
| `modules` | `package.json` の `"dependencies"` から **allowlist フィルタ** して抽出 |

### 3-3. Modules 抽出ポリシー

- `dependencies` のみ対象(`devDependencies` は含めない)
- 主要依存(bundle に寄与するもの)のみ列挙
- allowlist 方式: builder スクリプトに `MODULES_TO_REPORT` 配列で明示列挙
- allowlist 外の依存は無視(transitive 依存は本 FI では扱わない)

### 3-4. 注入先

Container template の `entries[]` 先頭 or 末尾に固定挿入。既存 entries との順序衝突を避けるため:

- About entry の `lid` は `__about__` 固定
- 既存 template に `__about__` がある場合は**上書き**(古い About を置換)
- I-ABOUT-6 で sidebar 非表示なのでどの位置でも UX 影響なし

### 3-5. ランタイム生成禁止

- runtime(ブラウザ実行中)では About entry を**書き換えない** / **新規作成しない**
- reducer / action-binder / main.ts からは About entry を touch しない経路のみ存在する
- 万一 dispatch されても reducer gate で block(I-ABOUT-2)

---

## 4. Runtime contract

### 4-1. Hidden from normal listing

以下の UI 経路から About entry を**一律除外**する:

| 経路 | 除外方法 |
|------|--------|
| Sidebar tree | `archetype === 'system-about'` を filter |
| Search / filter 結果 | 同上 |
| Archetype filter tabs | `system-about` を tab として出さない |
| Multi-select | 選択対象外 |
| Relations(作成元 / 作成先候補) | 候補に含めない |
| Kanban / Calendar | 対象外(archetype 非対応) |
| Export HTML / ZIP | **含める**(I-ABOUT-7) |

### 4-2. Center-pane 初期表示トリガー

以下の条件のいずれかで About 画面を center pane にレンダリング:

1. **container が empty(user entries 0 件)** — About entry 以外に entry がないとき
2. **selectedLid が `__about__`** — 明示選択時(menu 等から)

条件 1 は「初回起動 or workspace reset 直後」に相当。ユーザーが何もしなくても PKC2 が自己紹介する体験を提供。

### 4-3. Read-only rendering

About 専用 presenter を定義(`about-presenter`):

- `renderBody(entry, ctx)`: body JSON を parse → §2-4 schema で render(§8 examples の UI 形式)
- `renderEditorBody`: **実装しない**(I-ABOUT-2 により edit 経路自体を作らない)
- `collectBody`: **実装しない**(同上)
- edit / delete アクションボタンを画面に出さない
- link(license.url / author.url)は `target="_blank"` + `rel="noopener noreferrer"` で外部化
- ただし **fetch はしない**(I-ABOUT-4)

### 4-4. Fallback(破損時 / 不在時)

```typescript
function resolveAboutPayload(entry?: Entry): AboutPayload {
  if (!entry) return DEFAULT_ABOUT_STUB;
  try {
    const parsed = JSON.parse(entry.body);
    if (!isValidAboutPayload(parsed)) {
      console.warn('[PKC2] About entry payload invalid, using fallback');
      return DEFAULT_ABOUT_STUB;
    }
    return parsed;
  } catch (e) {
    console.warn('[PKC2] About entry parse failed:', e);
    return DEFAULT_ABOUT_STUB;
  }
}
```

`DEFAULT_ABOUT_STUB` は minimum scope §2-5 と同じ default payload。UI には赤エラーを出さず、console.warn のみ。

### 4-5. Entry schema との整合

About entry は通常の `Entry` 型に従う:

```typescript
{
  lid: '__about__',
  title: 'About PKC2',          // 固定 or version を含む
  body: '<JSON string>',          // §2-4 の schema を JSON.stringify したもの
  archetype: 'system-about',
  created_at: build.timestamp,
  updated_at: build.timestamp,
}
```

---

## 5. Invariants

### I-ABOUT-1 — 常時存在(配布物視点)

`dist/pkc2.html` は必ず `__about__` entry を 1 件含む。builder が注入に失敗した場合は build 自体が失敗する(silent な空は許さない)。

### I-ABOUT-2 — User edit / delete 不可

- UI は About entry に対して edit / delete / rename / move の action を**発行しない**
- reducer は `lid === '__about__'` の対象行為を gate で block(defense in depth)
- keyboard shortcut / context menu / bulk action のいずれからも対象外

### I-ABOUT-3 — Build-time generated

About の値は build step が静的生成する。runtime は値を書き換えない。

### I-ABOUT-4 — Network access 不要

About 画面のレンダリングは完全ローカル完結。`license.url` / `author.url` は表示するだけで fetch しない。

### I-ABOUT-5 — 破損でも app 生存

parse / validation 失敗でも app 起動は継続。§4-4 の fallback を使用、console.warn のみ、UI エラー表示なし。

### I-ABOUT-6 — Hidden from normal listing

§4-1 の全経路で除外。ただし **問い合わせ可能**(`selectedLid = '__about__'` での表示は可能、export にも含まれる)。

### I-ABOUT-7 — Export に含める

HTML export / ZIP export / subset export のいずれも About entry を含める。配布物の自己記述性を保つ。

### I-ABOUT-8 — Settings entry と衝突しない

- archetype 別(`system-about` vs `system`)
- lid 別(`__about__` vs `__settings__`)
- 両者とも reserved-lid 規約下で管理、相互の書き込み経路は分離

### I-ABOUT-9 — Reserved lid 保護

reducer は `__*__` 形式の lid を持つ entry の**新規作成 / 変更 / 削除**を user action からは block する(system command による build-time 注入のみ許可)。

---

## 6. Gate / Error paths

| 状況 | 検知層 | 挙動 |
|------|--------|------|
| body が JSON として parse 不可 | runtime (about-presenter) | §4-4 fallback。console.warn |
| `type !== "pkc2-about"` | runtime | 同上(別 schema の誤読防止) |
| 必須 field 欠落 | runtime | 同上(§2-5 の required が欠ければ fallback) |
| `modules` が array でない | runtime | 同上 |
| `modules[].*` に欠落がある | runtime | 該当要素を**個別に skip**(全体 fallback ではない)。他要素は通常表示 |
| `version` が空文字 | runtime | 全体 fallback |
| `runtime.*` が boolean でない | runtime | 全体 fallback |
| `__about__` entry が container に存在しない | runtime | 空 fallback entry を仮想生成して About 画面表示 |
| build で About 注入失敗 | builder | **build 自体を失敗**(silent に fallback しない)|
| user action が `__about__` を対象に発火 | reducer gate | block + `console.warn` |
| PKC-Message で `__about__` 書き込み要求 | bridge gate | reject、error response 返却 |
| import/merge で外部 About が流入 | import reducer | host 側 About を保持、流入 About を棄却(警告 log) |

---

## 7. Future relation

### 7-1. Settings hidden entry との分担

| 項目 | About | Settings |
|------|-------|----------|
| archetype | `system-about` | `system`(予定) |
| lid | `__about__` | `__settings__` |
| Mutability | immutable | mutable |
| 生成タイミング | build-time | runtime(user action) |
| Import/merge 時の扱い | host 優先(流入棄却) | host 優先(流入棄却) |
| Responsibility | PKC2 自身の出自 | user の設定値 |

両者は独立した reducer / presenter / state slice で扱う。互いに依存しない。

### 7-2. Plugin / module registry とはまだ別

本 FI の `modules[]` は **build 時に確定する第三者ライブラリ一覧**。実行時に plugin を登録・拡張する registry とは**別概念**。混ぜない。

将来 plugin registry を導入する場合も、About の `modules` は「build-time frozen list」の性質を保つ。Registry は別 hidden entry として設計する。

### 7-3. PKC-Message tool ecosystem とはまだ接続しない

外部 tool から About を読むユースケース(version 取得等)は有用だが、v1 では **接続経路を開かない**。

理由:
- About は read-only だが、message bridge 経由の read API を開くと permission model の複雑化を招く
- まずは表示のみで価値を確認してから拡張
- Settings が先に message bridge 統合される予定(mutability があるため書き込み requirement が先に発生する)

---

## 8. Examples

### 8-1. Minimal example(開発ビルド)

```json
{
  "type": "pkc2-about",
  "version": "2.0.0-dev+20260418",
  "build": {
    "timestamp": "2026-04-18T06:00:00Z",
    "commit": "a926dd5",
    "builder": "vite+release-builder"
  },
  "license": { "name": "MIT", "url": "" },
  "author": { "name": "sm06224", "url": "" },
  "runtime": { "offline": true, "bundled": true, "externalDependencies": false },
  "modules": []
}
```

`modules: []` は builder が allowlist を提供しない dev ビルドの形。`license.url` / `author.url` が空なので UI は link を出さずテキストのみ。

### 8-2. Full example(リリースビルド)

```json
{
  "type": "pkc2-about",
  "version": "2.0.0",
  "build": {
    "timestamp": "2026-05-01T12:00:00Z",
    "commit": "abc1234",
    "builder": "vite+release-builder@1.0.0"
  },
  "license": {
    "name": "MIT",
    "url": "https://github.com/sm06224/PKC2/blob/main/LICENSE"
  },
  "author": {
    "name": "sm06224",
    "url": "https://github.com/sm06224/PKC2"
  },
  "runtime": {
    "offline": true,
    "bundled": true,
    "externalDependencies": false
  },
  "modules": [
    { "name": "vite", "version": "5.4.0", "license": "MIT" },
    { "name": "marked", "version": "12.0.0", "license": "MIT" },
    { "name": "highlight.js", "version": "11.9.0", "license": "BSD-3-Clause" },
    { "name": "fflate", "version": "0.8.2", "license": "MIT" }
  ]
}
```

### 8-3. Malformed example + fallback behavior

```jsonc
{
  "type": "wrong-type",
  "version": "",
  "modules": "not-an-array"
}
```

この payload は:
- `type` が `"pkc2-about"` でない → 全体 fallback
- `version` が空文字 → 全体 fallback(`type` チェックで既に fail するので到達しない)
- `modules` が array でない → 全体 fallback

**runtime の挙動**:
1. `about-presenter` が payload を受け取る
2. `isValidAboutPayload` が false を返す
3. `console.warn('[PKC2] About entry payload invalid, using fallback')`
4. §4-4 の `DEFAULT_ABOUT_STUB` を使用して About 画面をレンダリング
5. UI には赤エラーを出さない(I-ABOUT-5)
6. app の他の機能は影響なく動作する

### 8-4. Partially malformed modules

```jsonc
{
  "type": "pkc2-about",
  "version": "2.0.0",
  "build": { "timestamp": "...", "commit": "...", "builder": "..." },
  "license": { "name": "MIT", "url": "" },
  "author": { "name": "sm06224", "url": "" },
  "runtime": { "offline": true, "bundled": true, "externalDependencies": false },
  "modules": [
    { "name": "vite", "version": "5.x", "license": "MIT" },
    { "name": "marked" },                           // ← version / license 欠落
    { "version": "1.0.0", "license": "MIT" }         // ← name 欠落
  ]
}
```

**runtime の挙動**(§6 の modules[] 個別 skip):
- 最初の要素は通常表示
- 2 番目 / 3 番目は必須フィールド欠落として**個別 skip**
- 全体 fallback にはしない(version / build / license / author / runtime は valid なので)
- `console.warn('[PKC2] About modules: 2 invalid entries skipped')`

---

## References

- `docs/spec/about-build-info-hidden-entry-v1-minimum-scope.md`
- `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md`
- `src/core/model/container.ts`
- `src/core/model/record.ts`
- `build/release-builder.ts`
