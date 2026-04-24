# About / Build Info Hidden Entry v1 — Minimum Scope

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は minimum-scope / historical design record として保持。実装の現物は `src/core/model/about-payload.ts` / `build/about-entry-builder.ts` / `tests/adapter/about-entry.test.ts` / `tests/runtime/release-meta.test.ts`。
Pipeline position: minimum scope
Scope: docs-only(runtime 実装は次段の behavior contract 以降)
Relates to:
- `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md`(hidden entry 設計の同系統)
- `docs/planning/13_基盤方針追補_release契約.md`(single-HTML 成果物方針)
- `docs/planning/17_保存再水和可搬モデル.md`(Container 構造)

---

## 0. 問題の定義

PKC2 は単一 HTML ファイル (`dist/pkc2.html`) として配布される。ユーザーに届いた成果物 1 枚だけを見たとき、現状以下の情報が**視認不能**:

| 不明瞭な項目 | 利用者側の影響 |
|-----------|-------------|
| バージョン番号 | 手元の成果物が最新か、公開版と一致するか分からない |
| ビルド時刻 / commit SHA | 再現性・サポート対応が困難 |
| ライセンス | OSS として使用可否の判断がつかない |
| 外部依存の有無 | オフラインで安全に使えるか判断できない |
| バンドル済みモジュールの一覧 | 第三者コードの監査・セキュリティ審査ができない |
| 作者・配布元情報 | 正規配布物かフォークかが判断できない |

これは PKC2 の **single-HTML / local-first / bundled-everything** という思想と強く衝突する: 「配布物そのものが自己を完全に記述できる」べきなのに、現状は記述していない。

本 FI は **PKC が自分自身を語れる状態** を作ることで、信頼性・透明性・OSS 配布品質を底上げする。

---

## 1. Scope / 非対象

### 1-1. v1 対象

| 項目 | 扱い |
|------|------|
| `archetype: 'system-about'` の新規定義 | ○ |
| 固定 lid `about` の hidden entry を 1 件 | ○ |
| build 時に entry 内容を静的生成して container に埋め込む仕組みの**設計定義** | ○ |
| body の JSON スキーマ定義 | ○ |
| 初期表示 (container 空 or 該当 view 時) の center pane About 画面の**設計定義** | ○ |
| 読み取り専用レンダリング契約 | ○ |

### 1-2. v1 非対象

| 項目 | 理由 |
|------|------|
| ランタイム実装 | 本 FI は minimum scope のみ。実装は behavior contract 以降 |
| 編集 UI | About は immutable |
| 設定の永続化 | hidden settings entry (別 FI) の責務 |
| 外部 fetch(OGP / CDN 版情報取得) | single-HTML / offline 原則を侵す |
| PKC-Message 経由の更新 | v1 では外部書き込み不可 |
| module auto-detection(実行時) | 実装重すぎ、v1 scope 外 |
| Live updating version | build-time generated のみ |
| Menu からの About 画面起動 | v2 以降(v1 は container 空時の初期表示のみ) |

---

## 2. Data model

### 2-1. Archetype

**新規 archetype**: `system-about`

既存 `system` archetype は hidden system settings entry (別 FI) 用として予約。About は immutable で性質が異なるため、独立した archetype として分離する。

| archetype | 用途 | mutable | lid |
|-----------|------|---------|-----|
| `system-about` | ビルド情報 | **false**(immutable) | `about` (固定) |
| `system` (予定) | ユーザー設定 | true | `__settings__` (固定) |

### 2-2. Lid convention

固定 lid: `about`

先頭末尾の `__` プレフィクスを**使わない**(hidden settings の `__settings__` と区別するため)。 identifier 衝突は runtime が reserved-lid として扱う(behavior contract で確定)。

### 2-3. Body schema (JSON)

```jsonc
{
  "type": "pkc2-about",
  "version": "2.0.0",
  "build": {
    "timestamp": "2026-04-18T06:00:00Z",
    "commit": "a926dd5",
    "builder": "vite+release-builder"
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
    { "name": "vite", "version": "5.x", "license": "MIT" },
    { "name": "marked", "version": "...", "license": "MIT" }
  ]
}
```

### 2-4. フィールド定義

| field | 型 | 必須 | 説明 |
|-------|---|------|------|
| `type` | `"pkc2-about"` 固定 | ○ | 誤読防止 |
| `version` | string(SemVer) | ○ | PKC2 本体のバージョン |
| `build.timestamp` | ISO-8601 UTC | ○ | ビルド時刻 |
| `build.commit` | 短縮 git SHA | ○ | 再現性のため |
| `build.builder` | string | ○ | ビルドツール識別子 |
| `license.name` | string | ○ | 例: `MIT` |
| `license.url` | URL | ○ | ライセンス全文へのリンク |
| `author.name` | string | ○ | 作者名 |
| `author.url` | URL | △ | 作者ページ(optional) |
| `runtime.offline` | boolean | ○ | オフライン動作可否 |
| `runtime.bundled` | boolean | ○ | 全依存が bundle 内に同梱されているか |
| `runtime.externalDependencies` | boolean | ○ | 起動時に外部取得があるか |
| `modules` | array | ○ | バンドル済み第三者モジュール一覧 |
| `modules[].name` | string | ○ | モジュール名 |
| `modules[].version` | string | ○ | モジュールバージョン |
| `modules[].license` | string | ○ | モジュールライセンス |

`modules` は空配列可。ただし `bundled: true` と宣言する以上、主要な依存は列挙すべき。

### 2-5. Default / fallback

About entry が**不在**または parse 失敗時、runtime は以下の default を使用する:

```json
{
  "type": "pkc2-about",
  "version": "unknown",
  "build": { "timestamp": "unknown", "commit": "unknown", "builder": "unknown" },
  "license": { "name": "unknown", "url": "" },
  "author": { "name": "unknown", "url": "" },
  "runtime": { "offline": true, "bundled": true, "externalDependencies": false },
  "modules": []
}
```

I-ABOUT-5(§5)により、parse 失敗で app が壊れてはならない。

---

## 3. UI Behavior (Concept Only)

v1 ではランタイム実装しないが、実装時に満たすべき振る舞いを定義する。

### 3-1. 表示トリガー

- **container が空(entries 0 件)の場合**: center pane に About 画面を表示
- **About entry を通常の select で開いた場合**: About 画面を表示(ただし hidden 扱いなので sidebar には出ない)
- **v2 以降**: メニュー `☰ Menu` から起動

### 3-2. レンダリング内容

以下を順に表示:

1. タイトル: `PKC2` (+ 任意のロゴ)
2. バージョン: `v{version}`
3. 説明: `オフライン動作 / 完全バンドル / 外部依存なし` (runtime flags から生成)
4. ビルド情報: `Built at {timestamp} from commit {commit}`
5. モジュール一覧: 表形式(name / version / license)
6. ライセンス: `{license.name}` + リンク
7. 作者: `{author.name}` + リンク

### 3-3. 操作制約

- **Read-only**: 編集ボタンは表示しない
- **Delete 不可**: コンテキストメニューの Delete は hide
- **Link は external**: license.url / author.url は新タブで開く
- **Text は選択可能 / コピー可能**: 透明性のため

---

## 4. Invariants

### I-ABOUT-1 — 常時存在

Container は必ず lid `about` / archetype `system-about` の entry を 1 件持つ。build 時に自動挿入される。

### I-ABOUT-2 — ユーザー変更不可

UI は About entry に対して edit / delete / rename アクションを**発行しない**。reducer gate で万一の dispatch も block する。

### I-ABOUT-3 — Build-time generated

About entry の body は **build プロセスが静的生成**する。runtime が後から書き換えない。

### I-ABOUT-4 — Network dependency なし

About 画面のレンダリングに**外部通信が発生してはならない**。`license.url` / `author.url` は表示するだけで fetch しない。

### I-ABOUT-5 — 壊れても app を壊さない

About entry が不在 / parse 失敗 / schema 不一致の場合でも app 起動は継続する。§2-5 の default fallback を使う。エラーは console 警告のみ(UI に赤エラー表示しない)。

### I-ABOUT-6 — Hidden from normal listing

sidebar tree / search / archetype filter tabs / multi-select からは**一律除外**する。`archetype === 'system-about'` を filter 条件とする(hidden settings entry と同じパターン)。

### I-ABOUT-7 — Export 時の扱い

HTML export / ZIP export は About entry を**含める**。配布物は自己記述を保つ。

---

## 5. Integration Points

### 5-1. Builder(build プロセス)

`build/release-builder.ts` 相当の build step が以下を行う:

1. `package.json` / `git describe` / ビルド環境から build info を取得
2. `modules` 一覧を package.json の `dependencies` から抽出(主要分のみ)
3. `system-about` archetype の entry を生成
4. Container のデフォルト template に挿入

### 5-2. Runtime の扱い

PKC2 の runtime は About entry を **通常の entry として container に持つ** が、以下の特殊化を加える:

- sidebar / filter / search に出さない(§I-ABOUT-6)
- 選択時の詳細 pane は About 専用プレゼンターを使用
- 編集 / 削除の action は UI で提供しない(§I-ABOUT-2)

### 5-3. Container template

空状態で PKC2 を起動したとき(初回 or workspace reset 後)、About entry が**必ず表示**されるようにする。これにより「ユーザーが受け取った直後に PKC2 が自己紹介する」体験を実現。

---

## 6. Future Features との関係

| Feature | Role | Mutability | Lid | Archetype |
|---------|------|-----------|-----|-----------|
| **About entry** (本 FI) | ビルド情報の自己記述 | immutable | `about` | `system-about` |
| Settings entry (別 FI) | ユーザー設定の永続化 | mutable | `__settings__` | `system` (予定) |
| Plugin registry (将来) | プラグイン一覧 | mutable | TBD | TBD |

両者は **役割と性質が異なる** ため、独立した archetype / lid で管理する。About は read-only、Settings は read-write、Plugin registry は read-write + dynamic。

---

## 7. Examples

### 7-1. 最小例(開発ビルド)

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

### 7-2. 完全例(リリースビルド)

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

---

## 8. Non-goals(再確認)

| 項目 | 理由 |
|------|------|
| About entry の編集 UI | immutable 原則(I-ABOUT-2) |
| Live updating version | build-time 静的生成のみ(I-ABOUT-3) |
| Runtime での module auto-detection | v1 scope 外、実装重い |
| 外部 fetch による OGP / 最新版情報取得 | offline 原則(I-ABOUT-4) |
| PKC-Message 経由の About 書き換え | immutable 原則(I-ABOUT-2) |
| Menu からの明示的 About 起動 | v2 以降 |
| 多言語化 | v1 は固定英数字フィールドのみ |
| Release notes / changelog 表示 | 別領域、v1 非対象 |

---

## 9. Risk / Open questions

| 項目 | 方針 |
|------|------|
| build プロセスが About entry を挿入する具体手順 | behavior contract で決定 |
| `modules` 一覧の生成方法(手動 / 自動 / 両方) | behavior contract で決定 |
| About 画面の視覚デザイン(ロゴ / 色) | behavior contract + 実装段階で確定 |
| schema version(将来の v2) | `type: "pkc2-about"` の別 type 値で互換切替。v1 では version field 無し |
| 既存 container に About が無い場合の migration | runtime が default fallback を返すだけ。強制 migration は不要(I-ABOUT-5) |

---

## References

- `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md` — hidden entry パターンの先行例
- `docs/planning/13_基盤方針追補_release契約.md` — single-HTML release 契約
- `docs/planning/17_保存再水和可搬モデル.md` — Container / entry モデル
- `build/release-builder.ts` — build step の既存実装(次段 integration point)
- `src/core/model/container.ts` — Container / Entry schema
- `src/core/model/record.ts` — ArchetypeId(新規 `system-about` の追加先)
