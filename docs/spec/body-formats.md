# PKC2 Archetype 別 Body 形式仕様書

**Status**: 正本（canonical）
**Last updated**: 2026-04-13（Slice 6 完了時点）
**Related**: `docs/spec/data-model.md`（Container 全体スキーマ）

---

## 0. この文書の位置づけ

PKC2 の `Entry.body` は**常に string** である（`docs/spec/data-model.md` §3.2 I-E3）。
しかしその string が何を表すかは `archetype` によって異なる。

本文書は **archetype ごとの body 契約の正本** である。

- **guaranteed contract**: どのバージョンでも守られる
- **current implementation**: 現在そう動くだけ
- **raw storage form** と **rendered surface** を明確に分離する

---

## 1. 共通原則

### 1.1 body は常に string

- JSON parse される archetype でも、**格納値は JSON.stringify 後の string**
- 空文字列 `""` は valid（archetype 側で「空 body」として解釈）

### 1.2 parse 関数は決して throw しない

各 archetype の `parse<Archetype>Body(body: string)` は:

- invalid JSON → safe default を返す
- 型不一致のフィールド → safe default を採用
- plain string (legacy) → 可能なら legacy 解釈、無理なら safe default

これにより Container を破損させる入力は存在しない。

### 1.3 Rendered surface と raw storage の分離

markdown / transclusion / asset 解決は **rendered surface の責務**。
raw storage（`entry.body` に格納される文字列）には rendering 結果を**含めない**。

---

## 2. `text` — Markdown ドキュメント

### 2.1 Raw storage form

```
body = "<raw markdown string>"
```

- **JSON wrapping なし**。entry.body が直接 markdown ソースである
- CommonMark + GFM 互換の markdown-it で解釈される（`src/features/markdown/markdown-render.ts`）
- 空文字列 `""` は「空の TEXT」として valid

### 2.2 対応する markdown 拡張

| 機能 | 記法 | 実装 |
|------|-----|-----|
| 標準 markdown | CommonMark + GFM | markdown-it |
| Asset 画像 | `![alt](asset:<key>)` | `asset-resolver.ts` |
| Asset リンク | `[label](asset:<key>)` | `asset-resolver.ts` |
| Entry 参照（bare） | `entry:<lid>` | `entry-ref.ts` |
| Entry 参照（link） | `[label](entry:<lid>)` | `entry-ref.ts` |
| Entry 埋込（image 形式） | `![](entry:<lid>)` | `transclusion.ts` |
| Code highlight | ` ```<lang> ` | `code-highlight.ts`（9 言語） |
| Task list | `- [ ]` / `- [x]` | `markdown-task-list.ts` |
| TOC | 見出しから自動生成 | `markdown-toc.ts` |

### 2.3 セキュリティ契約

- **raw HTML は無効化**（markdown-it `html: false`）
- URL スキーム allowlist（`SAFE_URL_RE` in `markdown-render.ts:70`）
- HTML attribute は `escapeHtmlAttr` で quote + ampersand escape

### 2.4 TEXT → TEXTLOG 変換（P1 Slice 5）

実装: `src/features/text/text-to-textlog.ts`

- 分割方式: **heading 単位** または **hr (`---`) 単位**
- 各セグメント → `TextlogEntry` に変換（id 新規採番、createdAt = 生成時刻）
- headline cap: 80 chars（**current implementation**: UTF-16 code unit slice。grapheme 安全性は未保証）
- 空セグメントは skip

### 2.5 TEXT の複製性

- **body は plain string** なので clone 時の deep copy 不要
- export / import で **バイト損失なし**（ただし改行コードの正規化は行われない）

### 2.6 既知の曖昧点

- CRLF / LF 混在 markdown の TEXT → TEXTLOG 変換での segment 境界（未検証）
- 巨大 markdown（MB 級）の rendering パフォーマンス（未計測）
- 絵文字・サロゲートペアを含む headline の grapheme 安全性

---

## 3. `textlog` — 時系列ログ

### 3.1 Raw storage form

```
body = JSON.stringify({
  entries: [
    {
      id: "<ULID or legacy>",
      text: "<markdown source>",
      createdAt: "<ISO 8601>",
      flags: [ "important" ]
    },
    ...
  ]
})
```

実装: `src/features/textlog/textlog-body.ts:22-24`

### 3.2 TextlogEntry フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `id` | string | ✓ | ULID (26 char Crockford Base32) または legacy 形式。**作成後 immutable**、`parseTextlogBody` が自動生成して埋める |
| `text` | string | ✓ | markdown ソース。asset/entry 参照は TEXT と同じ記法を使う |
| `createdAt` | ISO 8601 | ✓ | log entry 作成時刻。unparse 可能な場合 `new Date().toISOString()` が補填される |
| `flags` | `TextlogFlag[]` | ✓ | 現状 `'important'` のみ。unknown flag は filter される |

### 3.3 順序の source of truth

- **storage 順（`entries` array の index）が chronological 順序の正本**
- ID sort / createdAt sort から順序を**導出しない**
- 表示時に day グルーピングを行う場合は `createdAt` のローカルタイム日付で bucketing（`textlog-doc.ts:toLocalDateKey`）

### 3.4 Rendered surface（TextlogDoc）

実装: `src/features/textlog/textlog-doc.ts`

renderer は raw body から `TextlogDoc` を導出して描画:

```typescript
interface TextlogDoc {
  sourceLid: string;
  order: 'asc' | 'desc';
  sections: DaySection[];    // 日付でグルーピング
}

interface DaySection {
  dateKey: string;           // 'yyyy-mm-dd' local time、unparse 時は ''
  logs: LogArticle[];
}
```

- Live viewer: `order: 'desc'`（最新が上）
- Rendered viewer / print / export: `order: 'asc'`（チロノロジカル）
- 単一の builder で全 surface が駆動される（旧 `serializeTextlogAsMarkdown` は削除済み）

### 3.5 TEXTLOG → TEXT 変換（P1 Slice 4）

実装: `src/features/textlog/textlog-to-text.ts`

- 選択された log entries を日付でグループ化
- 新 TEXT entry に `## <日付>` heading + markdown body として書き出す
- **log id は破棄**（新 TEXT は plain markdown）

### 3.6 CSV Export

実装: `src/features/textlog/textlog-csv.ts`

- `timestamp`（ISO 機械可読） / `timestamp_display`（人間可読） / `id` / `text` / `important`（boolean 列） 列
- CSV export / Copy Reference は **生 ISO timestamp** を emit（ミリ秒精度）
- UI 表示用の `formatLogTimestampWithSeconds` は display 専用

### 3.6.1 textlog-bundle (CSV) は lossy format である

**Canonical decision 2026-04-13 (F3 / P0-2b → P0-5)**. textlog-bundle (`.textlog.zip`) は **意図的に lossy な交換形式** である。

- CSV schema は固定 5 列（上記）。`flags` は `important` boolean 1 種のみを列として持つ
- `TextlogFlag` に**将来新しい値**（`'important'` 以外）が追加された場合、それらは CSV round-trip で**失われる**
- JSON route（HTML Full / ZIP）は `flags: string[]` をそのまま保持するため、**同じ Entry が配布経路によって flags 構成が異なりうる**
- lossless な交換が必要な場合は HTML Full または ZIP を使うこと。textlog-bundle は日常的な CSV 互換ツール向けの配布形式として位置付ける
- 非対称性は `docs/spec/data-model.md` §13 の Sister Bundle と整合。CSV 列拡張は将来の検討事項（P2）

### 3.7 既知の曖昧点

- 同一 `createdAt` の log entries の副順序（storage 順が唯一の決定打）
- legacy log id の形式多様性（`log-<ts>-<n>` 以外の過去形式の有無）
- ~~`flags` に unknown 値が混入した時の forward compatibility~~ → **§3.6.1 で方針確定（JSON 経路で保持、CSV 経路で drop）**

---

## 4. `todo` — ToDo 項目

### 4.1 Raw storage form

```
body = JSON.stringify({
  status: "open" | "done",
  description: "<markdown source>",
  date: "YYYY-MM-DD",          // optional
  archived: true                // optional（false または absent = active）
})
```

実装: `src/features/todo/todo-body.ts:20-25`

### 4.2 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `status` | `'open'` \| `'done'` | ✓ | `'done'` 以外はすべて `'open'` にフォールバック |
| `description` | string | ✓ | **markdown ソース**（Slice 3 で markdown 化）。空文字列許可 |
| `date` | `YYYY-MM-DD` | optional | 期限日。空文字列は undefined として扱う |
| `archived` | `true` | optional | `true` のみ格納。`false` / absent は active |

### 4.3 description の markdown 扱い

- Slice 3 以降、TODO description は **markdown-rendered**（`hasMarkdownSyntax` で判定）
- asset ref / entry ref / transclusion を含められる
- 見た目: rendered surface では markdown-render、editor では plain textarea

### 4.4 Legacy 形式の互換

plain string（JSON でない）を parse した場合:

```javascript
parseTodoBody("買い物に行く")
// → { status: 'open', description: '買い物に行く' }
```

これは `todo-body.ts:37-39` の catch 節によるフォールバック。legacy plain-text TODO を無害に読み込める。

### 4.5 date 関連ヘルパー

- `formatTodoDate(date)`: ロケール短日付フォーマット
- `isTodoPastDue(todo)`: open かつ date < 今日 なら true

### 4.6 Archived と Kanban / Calendar

- **Kanban**: 常に archived を除外
- **Calendar**: `showArchived` フラグに従う
- **Detail**: 全 TODO を対象

### 4.7 Todo embed（P1 Slice 2）

他 Entry から `![](entry:<todo-lid>)` で embed 可能。
rendered surface では status / description / date が preview として展開される（実装: `transclusion.ts:renderTodoEmbed`）。

### 4.8 既知の曖昧点

- `status` に `'open'` / `'done'` 以外の値（例: `'cancelled'` / `'waiting'`）を追加する拡張の互換性（未設計）
- `date` のタイムゾーン扱い（現状は暦日として解釈、timezone なし）
- `archived` の `false` 明示格納 vs absent の区別（現状は `true` のみ格納）

---

## 5. `form` — 固定 3 フィールドフォーム

### 5.1 Raw storage form

```
body = JSON.stringify({
  name: "<string>",
  note: "<string>",
  checked: true | false
})
```

実装: `src/adapter/ui/form-presenter.ts:9-14, 28-30`

### 5.2 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `name` | string | ✓ | 自由記述。空文字列許可 |
| `note` | string | ✓ | 自由記述。plain text（markdown 解釈**しない**、current implementation） |
| `checked` | boolean | ✓ | 厳格に `=== true` で判定（`form-presenter.ts:22`） |

### 5.3 スコープと設計方針

- **固定 3 フィールドの minimum validation archetype**
- **動的 schema エンジンではない**（`form-presenter.ts:6-7` 明記）
- 将来「任意フィールドのフォーム」が必要になった場合、新 archetype として追加する（例: `complex` / `document-set`）

### 5.4 Legacy フォールバック

parse 失敗時は `{ name: '', note: '', checked: false }` を返す。

### 5.5 既知の曖昧点

- `note` を markdown-render するか plain に留めるかの判断基準（現状は plain）
- `name` の一意性制約の必要性（現状なし）

---

## 6. `attachment` — ファイル添付

### 6.1 Raw storage form（new format）

```
body = JSON.stringify({
  name: "<filename>",
  mime: "<MIME type>",
  size: <byte count>,           // optional
  asset_key: "<asset key>",     // optional, points to container.assets
  sandbox_allow: [ "allow-scripts", ... ]  // optional
})

container.assets["<asset_key>"] = "<base64-encoded binary>"
```

実装: `src/adapter/ui/attachment-presenter.ts:19-58`

### 6.2 Raw storage form（legacy format、自動移行対象）

```
body = JSON.stringify({
  name: "<filename>",
  mime: "<MIME type>",
  data: "<base64>"              // 旧: body 内に直格納
})
```

### 6.3 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `name` | string | ✓ | ファイル名（拡張子込み） |
| `mime` | string | ✓ | MIME type。不明時は `'application/octet-stream'` |
| `size` | number | optional | バイト数。absent の場合 `data` / asset から推定 |
| `asset_key` | string | optional | `container.assets[asset_key]` への参照（new format） |
| `data` | string | optional | base64 データ（legacy format）。new format では absent |
| `sandbox_allow` | `string[]` | optional | HTML/SVG preview の per-entry sandbox override |

### 6.4 New format と legacy format の判定

- `asset_key` が存在 → new format
- `data` が存在 → legacy format
- 両方存在する場合の挙動: **current implementation では data を優先**（legacy round-trip support）

### 6.5 Lazy migration

- parse 時は両形式を透過的にサポート
- save 時（COMMIT_EDIT 経由）に new format で書き出される
- migration は **non-breaking**（再読み込みで変化なし）

### 6.6 Sandbox の優先順位

添付プレビュー（HTML / SVG）の iframe sandbox 属性は以下の優先順で決まる:

1. **per-entry `sandbox_allow`**: Entry の body に格納された array
2. **container-wide `sandbox_policy`**: `'strict'`（`allow-same-origin` のみ）または `'relaxed'`（+ `allow-scripts`, `allow-forms`）
3. **absent 時の default**: `'strict'` 扱い

### 6.7 sandbox_allow に格納できる値

`SANDBOX_ATTRIBUTES` in `attachment-presenter.ts:61-72`:

- `allow-scripts`
- `allow-forms`
- `allow-popups`
- `allow-modals`
- `allow-same-origin`
- `allow-top-navigation`
- `allow-top-navigation-by-user-activation`
- `allow-top-navigation-to-custom-protocols`
- `allow-pointer-lock`
- `allow-presentation`

### 6.8 既知の曖昧点

- `size` が格納値と実 base64 decoded size で食い違った場合の扱い
- 複数 Entry が同一 `asset_key` を参照する設計（現状は 1-to-1 を暗黙の前提）
- legacy `data` と新 `asset_key` が両方存在する Entry を import した場合の正確な挙動

---

## 7. `folder` — 構造コンテナ

### 7.1 Raw storage form

```
body = "<raw markdown description string>"
```

- **JSON wrapping なし**（TEXT と同様）
- 空文字列 `""` は「description なし」として valid

実装: `src/adapter/ui/folder-presenter.ts`

### 7.2 Folder の責務

Folder は主として「構造コンテナ」であり、body の内容よりも `Relation.kind = 'structural'` による親子構造が本質。

- 子 Entry との関係: `Relation { from: folder_lid, to: child_lid, kind: 'structural' }`
- 階層: `structural` relation のチェーンで木構造を形成

### 7.3 description の markdown 扱い（Slice 3）

- `hasMarkdownSyntax(body)` が true → markdown-rendered（見出し・リスト・asset/entry ref を使える）
- そうでなければ `<pre class="pkc-view-body">` で plain text 扱い
- Editor は plain textarea（raw markdown を直接編集）

### 7.4 transclusion の適用

- folder description に `![](entry:<lid>)` を書くと embed が展開される
- depth / cycle guard は `transclusion.ts` 共通ロジックに従う

### 7.5 空 folder の表示

`entry.body === ''` の場合:

```html
<div class="pkc-folder-empty">Folder (no description)</div>
```

（`folder-presenter.ts:36-41`）

### 7.6 Folder を含む subset export

`build-subset.ts` が folder description の markdown を scan し、entry refs / asset refs を closure に含める（Slice 6 で closure 対応）。

### 7.7 既知の曖昧点

- folder description の markdown 解釈（Slice 3 導入前の plain text 前提だった folder との挙動差）
- 空 folder description を持つ folder が subset export 時に「空でもエントリとして含まれる」かどうかの境界

---

## 8. `generic` / `opaque` — フォールバック / 予約

### 8.1 `generic`

```
body = "<any string>"
```

- 未知 archetype の default fallback
- `getArchetype(id)` が未登録 id に対して返す（`archetype.ts:22`）
- current implementation: **plain text 表示**（markdown 解釈しない）

### 8.2 `opaque`

```
body = "<any string>"
```

- 予約型。明示的に「解釈しない」ことを示す
- 将来の外部データ取込（例: JSON API 結果の生格納、バイナリメタデータ）のための placeholder
- current implementation: **generic と同等の plain text 表示**

### 8.3 なぜ両方ある?

- `generic`: 「archetype が不明 / 解釈できない」状態
- `opaque`: 「意図的に解釈しない」状態（設計的に区別）

同じ表示であっても、後日 presenter を差別化する可能性を残すため別 archetype として予約している。

### 8.4 既知の曖昧点

- 実運用で `opaque` archetype を持つ Entry が現れる経路は未整備
- `generic` archetype を Entry に明示的に持たせる UI 経路は現状なし（内部フォールバック専用）

---

## 9. 共通: Asset 参照記法

markdown を body に持つ archetype（TEXT / TEXTLOG の text / TODO description / FOLDER description）で統一的に使える記法。

### 9.1 基本形

```markdown
![alt text](asset:<key>)          # 画像埋込
[link label](asset:<key>)          # 非画像チップ（PDF / zip / generic）
```

### 9.2 許容される key

- `[A-Za-z0-9_-]+`（`SAFE_KEY_RE` in `asset-resolver.ts:84`）
- それ以外の key を参照するリファレンスは resolver が拾わない（missing として扱われる）

### 9.3 missing asset の rendering

- **standard mode**: `*[missing asset: <key>]*` を markdown の emphasis として出す（HTML inject 不可）
- **compact mode** (`compactMarkdownAgainst`): `![alt](asset:<missing>)` → `alt` に置換、`[label](asset:<missing>)` → `label` に置換

### 9.4 optional title の扱い

markdown の `(<url> "<title>")` 形式も parse される:

```markdown
![alt](asset:key "optional title")
[label](asset:key "optional title")
```

title は視覚的に保持（markdown-it 側で tooltip 化）、asset 解決自体は影響を受けない。

### 9.5 scan 順序

`collectMarkdownAssetKeys(markdown)` は **source position 順**で dedup した key list を返す（`text-markdown.ts:29-46`）。

manifest の asset index、ZIP への書き込み順序はこの scan 順に依存する（byte-deterministic output のため）。

---

## 10. 共通: Entry 参照 / Embed 記法

markdown を body に持つ archetype で他 Entry を参照または埋め込む記法。

### 10.1 Entry reference（non-embedding）

```markdown
entry:<lid>                        # bare reference（click で navigate）
[label](entry:<lid>)               # link reference
[label](entry:<lid>#<fragment>)    # fragment（log-id など）付き
```

- clickable link として rendered surface に現れる
- Entry 本体の内容は展開されない
- `entry-ref.ts:152-162` の `isRealDate` 等で parser が防御的

### 10.2 Entry embed（transclusion）

```markdown
![](entry:<lid>)                   # image 形式 → embed
![alt](entry:<lid>)                # alt を持つ embed
```

- rendered surface で対象 Entry の内容を展開表示
- 実装: `src/adapter/ui/transclusion.ts`

### 10.3 Embeddable archetype（Slice 2 以降）

`EMBEDDABLE_ARCHETYPES` by `transclusion.ts`:

- `text` — 本文 markdown が展開される
- `textlog` — TextlogDoc が展開される
- `todo` — status / description / date が preview として展開される（Slice 2）
- `attachment` — 画像・PDF・音声・動画等の inline preview
- `folder` — description が markdown として展開される（Slice 3）

### 10.4 Embed のガード（Slice 2）

| ガード | 条件 | 表示 |
|-------|------|-----|
| **depth limit** | embed チェーンが depth > 1 | "embed is limited to one level" placeholder |
| **cycle detection** | 既に embed chain に現れた lid を再度 embed | "cycle detected" placeholder |
| **self reference** | `entry:<host lid>` で自分自身を embed | "self-reference blocked" placeholder |
| **missing** | target Entry が存在しない | "missing entry: <lid>" placeholder |
| **invalid ref** | 不正な token 形式 | "(invalid entry ref: ...)" placeholder |

全 placeholder は `<div data-pkc-embed-blocked>` の統一マーカーで出力される（Slice 6 で統一）。

### 10.5 fragment 参照

TEXTLOG の log-id などに fragment で辿れる:

```markdown
[log](entry:<textlog-lid>#<log-id>)
```

fragment は「参照のみ」で、embed には使わない（current implementation）。

### 10.6 既知の曖昧点

- depth > 1 embed の将来拡張（depth 2 まで許容するか / 全面禁止か）
- embed 先 Entry が `generic` / `opaque` の場合の placeholder 仕様
- circular chain の「cycle detected」表示後、ユーザーに具体的な原因 lid を示すか

---

## 11. Parse / Serialize 契約総括

### 11.1 各 archetype の parse / serialize 関数

| archetype | parse | serialize | 実装ファイル |
|-----------|------|-----------|------------|
| text | （不要。body がそのまま markdown） | （不要） | — |
| textlog | `parseTextlogBody(body)` | `serializeTextlogBody(tb)` | `features/textlog/textlog-body.ts` |
| todo | `parseTodoBody(body)` | `serializeTodoBody(tb)` | `features/todo/todo-body.ts` |
| form | `parseFormBody(body)` | `serializeFormBody(fb)` | `adapter/ui/form-presenter.ts` |
| attachment | `parseAttachmentBody(body)` | `serializeAttachmentBody(ab)` | `adapter/ui/attachment-presenter.ts` |
| folder | （不要。body がそのまま markdown） | （不要） | — |
| generic / opaque | （不要。body は opaque string） | （不要） | — |

### 11.2 parse の non-throw 契約

すべての `parse*Body` は **throw しない**:

- invalid JSON → catch して safe default を返す
- 型不一致 → フィールドごとに safe default
- missing required field → safe default

これにより Entry を**破損状態で保持することはない**。

### 11.3 Serialize の idempotence

`serialize` は以下を保証しない:

- 出力の**バイト完全一致**（optional field の有無、key 順序）
- 入力の preserve（extra field は落ちる）

例: `parseTodoBody('{"status":"done","description":"x","extra":1}')` → extra は捨てられる。再 serialize すると `{"status":"done","description":"x"}` になる。

### 11.4 なぜこの非対称性が許されるか

- PKC2 は「Container を source of truth」とするため、一度読み込んだ後は runtime 型（TodoBody 等）で扱う
- 他システムとの strict round-trip ではなく、**意味論的等価性**を保つのが目的
- extra field を保つ設計は P2 候補（subset export / template archetype 用）

---

## 12. 横断契約: title 派生と status

### 12.1 Archetype interface

```typescript
interface Archetype<TView = unknown> {
  id: ArchetypeId;
  parseBody(body: string): TView;
  serializeBody(view: TView): string;
  deriveTitle(entry: Entry): string;
  getStatus?(entry: Entry): string | null;
}
```

（`src/core/archetype/archetype.ts:7-13`）

### 12.2 deriveTitle の用途

- 空タイトルの Entry に自動タイトルを与える
- sidebar / list view での表示補完
- archetype ごとに「body のどこからタイトルを取り出すか」を決める

### 12.3 archetype 別 deriveTitle のパターン

| archetype | 派生元 |
|-----------|-------|
| text | 最初の heading、または最初の non-empty 行 |
| textlog | 最初の log entry の text 先頭 |
| todo | description |
| form | `name` フィールド |
| attachment | `name` フィールド（ファイル名） |
| folder | description の先頭行 |

（実装はプレゼンターによって異なる。上記は典型パターン）

### 12.4 getStatus (optional)

- sidebar のステータスバッジ表示に使う
- TODO の `status === 'done'` 等、ユーザーに即時可視化すべき情報を返す
- optional: 実装しない archetype は status を持たない

---

## 13. Import / Export 時の body 扱い

### 13.1 HTML Full export

- 各 Entry の body は **raw string のまま pkc-data JSON に埋込**
- JSON.stringify が body 内の特殊文字（`"`、`\`、制御文字）を escape する
- import 側で JSON.parse で元に戻る

### 13.2 HTML Light export

- body は維持される（Light mode が strip するのは **assets のみ**）
- asset 参照を含む body はそのまま export される
- import 後に asset が見つからない → missing asset rendering（§9.3）

### 13.3 ZIP export

- body は `container.json` 内の Entry に raw string として書かれる
- pretty-print（`JSON.stringify(container, null, 2)`）が適用される
- 改行コード: ソース次第（正規化されない、current implementation）

### 13.4 text-bundle / textlog-bundle

- 単一 Entry 用の可搬形式
- body は bundle 内 `container.json` に raw 格納
- 参照 asset は bundle 内 `assets/` ディレクトリに raw binary として同梱
- compact mode で broken asset ref は markdown リライト（§9.3）

#### 13.4.1 text-bundle import の title 正規化（canonical）

**Canonical decision 2026-04-13 (F2 / P0-2b → P0-5)**. text-bundle の import は **title を常に `trim()` する**:

- `manifest.source_title` が空文字列または空白のみ → `'Imported text'` にフォールバック
- それ以外 → **前後空白を除いた値**を `text.title` として返す（例: `' README '` → `'README'`）

実装: `src/adapter/platform/text-bundle.ts:483` (`(parsedManifest.source_title ?? '').trim() || 'Imported text'`)。

本挙動は UX 上の正規化として spec 化済み。raw 保持を期待しないこと。textlog-bundle にも同一のフォールバック（`'Imported textlog'`）があるが trim 挙動は別途確認が必要（P0-2c 候補）。

### 13.5 body の byte-level preservation の境界

| 経路 | preservation |
|-----|-------------|
| IDB save → load | byte-exact |
| HTML export → import | JSON escape / unescape で等価（バイト完全一致は保証されない: JSON pretty-print、改行コード） |
| ZIP export → import | 上記同様 |
| HTML Light export → import | asset 参照は残るが実 asset は失われる |

### 13.6 未規定 / 曖昧点

- 改行コード正規化（CRLF → LF）を行う契約はあるか → **未規定**
- BOM の扱い → **未規定**
- 巨大 body（数 MB）のメモリ使用 → **未計測**

---

## 14. Legacy 形式と migration

### 14.1 body-format レベルの legacy 対応一覧

| archetype | legacy 形式 | new 形式 | migration |
|-----------|-----------|---------|-----------|
| **todo** | plain string | JSON `{status, description, ...}` | parse が fallback（rewrite しない）。次回 save で new format |
| **attachment** | `{name, mime, data: <base64>}` | `{name, mime, size, asset_key}` + `assets[asset_key]` | lazy migration on next save |
| **textlog log id** | `log-<ts>-<n>` | ULID (26 char) | **never rewritten**（旧 ID 保持） |
| **revisions 欠落** | undefined | `[]` 必須 | import 時に `[]` 補填 |

### 14.2 migration の原則（再掲）

- **読込では legacy を許容**
- **保存では常に new format**
- **既存データの読み取り可能性を決して破壊しない**

### 14.3 将来の legacy 予測

- TODO に `status` 新値追加（例: `'cancelled'`）: 未知値 → `'open'` fallback により互換
- TEXTLOG `flags` に新 flag 追加: unknown flag は filter される
- attachment の MIME 細分化: mime string なのでそのまま保持

---

## 15. 未来の archetype（設計予約）

以下は `docs/development/data-model/` に先行仕様が存在する archetype。
現状は実装されていないが、本仕様書の scope に**互換性予約**として含める。

### 15.1 `complex`（docs/development/data-model/complex-entry-archetype.md）

- 動的フィールドを持つ複雑な Entry
- form の上位版として想定

### 15.2 `document-set`（docs/development/data-model/document-set-archetype.md）

- 複数 Entry を 1 単位として扱う集約
- template の基礎

### 15.3 `spreadsheet`（docs/development/data-model/spreadsheet-entry-archetype.md）

- 表形式の構造化データ
- CSV / tsv 的

### 15.4 実装前の予約事項

- **ArchetypeId への追加**: schema_version 据え置きで可能
- **body format**: 各 archetype の正本仕様書を `docs/development/data-model/` に作成し、本文書で link
- **deriveTitle / getStatus**: Archetype interface に従う
- **legacy 互換**: 既存 archetype への非破壊性

### 15.5 注意

これらは **P2 スコープ**。P0-P1 では触らない。本節は「ArchetypeId 列挙の将来拡張が後方互換である」ことの明示のみが目的。

---

## 16. Body レベル不変条件

### 16.1 共通

- **I-B1**: `Entry.body` は常に string
- **I-B2**: すべての `parse*Body` は throw しない
- **I-B3**: `serialize(parse(body))` は semantic equivalence を保証（byte-level equivalence は保証しない）

### 16.2 TEXT

- **I-BT1**: body は markdown ソース。JSON wrap しない
- **I-BT2**: raw HTML は rendering 時に無効化

### 16.3 TEXTLOG

- **I-BTL1**: body は `{entries: TextlogEntry[]}` の JSON.stringify
- **I-BTL2**: `entries` の storage 順が chronological 順の source of truth
- **I-BTL3**: log entry `id` は immutable。legacy IDs は rewrite しない

### 16.4 TODO

- **I-BTD1**: `status` は `'open'` または `'done'`。未知値は `'open'` fallback
- **I-BTD2**: `description` は markdown ソース
- **I-BTD3**: `date` が格納される場合は `YYYY-MM-DD` 形式

### 16.5 FORM

- **I-BF1**: `{name, note, checked}` の 3 フィールド固定
- **I-BF2**: dynamic schema ではない

### 16.6 ATTACHMENT

- **I-BA1**: body metadata と `container.assets` の実データは別管理
- **I-BA2**: `asset_key` で参照される asset は `container.assets` に存在すべき（orphan は UI で warn）
- **I-BA3**: legacy `data` 格納は parse で読めるが、save は常に new format

### 16.7 FOLDER

- **I-BF1**: body は markdown description。TEXT と同形式
- **I-BF2**: Folder の本質は `Relation.kind = 'structural'` による子 Entry。body は補助的

---

## 17. 既知の曖昧点（P0-2 round-trip で検証すべき）

### 17.1 TEXT
- [ ] 改行コード（CRLF / LF / mixed）が export → import で preserve されるか
- [ ] TEXT → TEXTLOG → TEXT の往復で内容が等価か（log id / title 情報は失われる）
- [ ] 絵文字 / サロゲートペアを含む heading の 80-char cap 安全性

### 17.2 TEXTLOG
- [ ] 同一 `createdAt` の log entries の storage 順が HTML/ZIP 経由で preserve されるか
- [ ] legacy log id (`log-<ts>-<n>`) と ULID が混在した body の round-trip
- [ ] 巨大 textlog body（数千 entries）の JSON parse / stringify 性能
- [ ] `flags: []` に unknown 文字列が混入した body の parse

### 17.3 TODO
- [ ] legacy plain string TODO を new JSON format に自動移行する経路の冪等性
- [ ] `archived: false` を明示格納した body と `archived` absent の body の parse 同一性
- [ ] `date` にタイムゾーン付きの ISO を誤格納した body の耐性

### 17.4 FORM
- [ ] `checked` に `"true"` 文字列（boolean でない）を渡した body の挙動
- [ ] 未知フィールドを追加した body が save/load で消えるかの明確化

### 17.5 ATTACHMENT
- [ ] legacy `data` と new `asset_key` 両方を持つ body の import / export
- [ ] 複数 Entry が同一 `asset_key` を共有する時の subset export closure
- [ ] `sandbox_allow` が空配列の時の rendering 挙動（sandbox_policy fallback が発動するか）

### 17.6 FOLDER
- [ ] `hasMarkdownSyntax` が false の plain body を Slice 3 以前の Container に戻した時の挙動
- [ ] 空 folder description の subset export での entry 含有判定

### 17.7 Asset / Entry reference
- [ ] `![](asset:key)` と `[](asset:key)` の title attribute 付き form の parse
- [ ] embed depth > 1 のケースでの placeholder 一貫性
- [ ] A → B → A の cycle が build-subset でどう扱われるか

---

## 18. 関連文書

### 18.1 正本 (canonical spec)

- `docs/spec/data-model.md` — Container 全体スキーマ
- 本文書 — archetype 別 body 契約

### 18.2 実装ガイド（development）

- `docs/development/textlog-foundation.md` — TEXTLOG archetype 導入
- `docs/development/textlog-viewer-and-linkability-redesign.md` — TextlogDoc + ULID log id
- `docs/development/markdown-interactive-task-lists.md` — task list interaction
- `docs/development/markdown-code-block-highlighting.md` — code highlight
- `docs/development/attachment-sandbox-phase5.md` — sandbox_policy
- `docs/development/text-textlog-editing-ux-consolidation.md` — TEXT/TEXTLOG 変換 UX
- `docs/development/entry-transformation-and-embedded-preview.md` — TEXT↔TEXTLOG + embed
- `docs/development/embedded-preview-and-cycle-guard.md` — cycle guard
- `docs/development/todo-view-consistency.md` — TODO 全 view 共通仕様

### 18.3 設計（planning）

- `docs/planning/17_保存再水和可搬モデル.md` — 4 系統モデル
- `docs/planning/HANDOVER_SLICE6.md` — 次段計画

### 18.4 未来拡張予約

- `docs/development/data-model/complex-entry-archetype.md`
- `docs/development/data-model/document-set-archetype.md`
- `docs/development/data-model/spreadsheet-entry-archetype.md`
- `docs/development/data-model/revision-branch-restore.md`
- `docs/development/data-model/entry-ordering-model.md`
- `docs/development/data-model/link-index-entry.md`
- `docs/development/data-model/office-preview-strategy.md`

---

## 19. 変更履歴

| 日付 | 変更 |
|------|-----|
| 2026-04-13 | 初版作成（P0-1、Slice 6 完了時点の実装を正本化） |

