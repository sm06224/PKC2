# 06. Code Block Ecosystem(Renderer Registry)

## 6.1 motivation:ブルーオーシャンとしての code block

user 提示「code block 内はブルーオーシャン、規模感のある拡張ができる(あとから追加しやすい)」── PKC2 の戦略的拡張余地として、code block を **Knowledge Block** plugin-like architecture で開放する。

key design:

- 既存 markdown code fence(`` ```lang ``` ``)構造を維持しつつ、`lang` ごとに **専用 renderer** を plugin-like に attach
- Pandoc-style attribute syntax `{key=v}` で per-block options を渡す
- 各 renderer は input source + attrs + context を受けて DOM を返す純関数
- core layer が **全 renderer 共通の chrome / cap / security** を提供
- builtin renderer set は spec で確定、PR 1 つで新 renderer 追加可能

## 6.2 Renderer Registry architecture

### 6.2.1 interface

```typescript
interface CodeRenderer {
  /** unique id for this renderer */
  name: string;

  /** info-string langs that trigger this renderer */
  langs: string[];

  /** valid attribute keys + types(whitelist) */
  attrSchema?: AttrSchema;

  /** hard cap, applied uniformly */
  cap: {
    sourceBytes: number;          // 入力 source の byte 数 上限
    outputNodes: number;          // render 後 DOM node 数 上限
    parseSteps?: number;          // optional、parser 反復 step 上限
  };

  /** render function — pure, side-effect free */
  render: (
    source: string,               // raw fenced content
    attrs: Attrs,                 // parsed `{key=v}` attrs
    ctx: RenderContext            // PKC2 context(container / lid / lang options)
  ) => HTMLElement;
}

interface RenderContext {
  container: Container | null;    // 全 entry を含むコンテナ
  currentLid: string;             // 自 entry の LID
  hostMode: 'live' | 'preview' | 'viewer' | 'rich-copy';
  vars: Record<string, string>;   // entry の vars(`{{vars.x}}` 展開用)
}

type AttrSchema = Record<string, { type: 'string' | 'number' | 'boolean' | 'enum'; values?: string[]; default?: any }>;
type Attrs = Record<string, string | number | boolean>;
```

### 6.2.2 builtin registry

```typescript
const BUILTIN_RENDERERS: CodeRenderer[] = [
  csvRenderer,         // 既存 — CSV → table
  // Phase A
  treeRenderer,        // tree
  dbschemaRenderer,    // dbschema
  // Phase B
  jsonViewerRenderer,  // json{view}
  yamlViewerRenderer,  // yaml{view}
  tomlViewerRenderer,  // toml{view}
  xmlViewerRenderer,   // xml{view}
  // Phase C(math は別 markdown-it plugin として実装、registry 経由しない)
  // Phase D
  queryRenderer,       // query — PKC2 killer
  cardsRenderer,       // cards
  // Phase E
  mindmapRenderer,     // mindmap
  flowRenderer,        // flow
  seqRenderer,         // seq
  stateRenderer,       // state
  // Phase F
  binaryRenderer,      // binary
  hexdumpRenderer,     // hexdump
  diffRenderer,        // diff
  // Phase G(optional)
  paletteRenderer,     // palette
  quizRenderer,        // quiz
  // …
];
```

### 6.2.3 共通 chrome / behavior

全 renderer に共通提供:

| 機能 | 実装場所 | 意味 |
|------|--------|------|
| copy source button | `CodeBlockChrome` | 既存 markdown code block と同じ |
| toggle "view source / view rendered" | NEW | user が raw source を確認できる |
| expand/collapse for tall outputs | NEW | output 大きい時の折りたたみ |
| search box | opt-in `{search}` | 全 renderer で共通 search input |
| error display | NEW | parse 失敗時 `pkc-codeblock-error` banner、`pkc-frontmatter-warning` 同 pattern |
| cap enforcement | core layer | source / output node 数を超えたら abort + warning |
| lang badge | core layer | 上端に `lang` 表示 |

`CodeBlockChrome` を共通 component として実装、各 renderer は inner DOM を生成するのみ。

### 6.2.4 attribute syntax

Pandoc-style info-string 拡張:

```markdown
```lang{key=v key2=v2 flag1 flag2}
```
```

例:

```markdown
```json{view search}
```yaml{view collapsed depth=2}
```query{kind=book limit=10}
```cards{layout=grid columns=4}
```

attrs は `{...}` の中で whitespace 区切り、`key=v` または `flag` のみ。値は引用符で囲んでも OK(`{title="A B"}`)。

## 6.3 Phase A renderer:tree + dbschema

### 6.3.1 `tree` — file path list を tree 構造表示

#### 入力

````markdown
```tree
src/
src/index.ts
src/utils/helper.ts
src/utils/format.ts
src/components/Button.tsx
src/components/Input.tsx
docs/spec.md
docs/api/v1.md
```
````

#### 出力(default = static unicode box)

```
src/
├── index.ts
├── utils/
│   ├── helper.ts
│   └── format.ts
└── components/
    ├── Button.tsx
    └── Input.tsx
docs/
├── spec.md
└── api/
    └── v1.md
```

#### attribute

| attr | values | default | 意味 |
|------|--------|---------|------|
| `style` | `unicode\|ascii` | `unicode` | box-drawing 文字種 |
| `collapsible` | flag | false | 折り畳み可能 `<details>` 化 |
| `links` | flag | false | 各行を `[](path)` link に(自動 detect)|

#### implementation

- path 列を sort → 共通 prefix でグルーピング → tree 構造構築
- pure DOM 構築(library 不要)
- ~80 LOC

### 6.3.2 `dbschema` — record schema notation

#### 入力

````markdown
```dbschema
table User {
  id         int       @primary @autoincrement
  name       string    @notnull
  email      string    @unique
  created_at datetime  @default(now)
  status     enum(active, suspended, deleted) @default(active)
}

table Post {
  id       int    @primary
  user_id  int    @ref(User.id)
  title    string @notnull
  body     text
}
```
````

#### 出力(styled table per record)

table User として、列 = name / type / constraints の HTML table:

| name | type | constraints |
|------|------|------------|
| id | int | @primary @autoincrement |
| name | string | @notnull |
| email | string | @unique |
| ... | ... | ... |

加えて、relation 矢印(User.id ← Post.user_id)を visual で表示(SVG or border style)。

#### attribute

| attr | values | default | 意味 |
|------|--------|---------|------|
| `style` | `table\|cards\|er-diagram` | `table` | render style |
| `relations` | flag | true | foreign key の visual 表示 |

#### implementation

- DSL parser(`@notnull`、`@ref(...)`、`enum(...)` 等)~100 LOC
- render(table 構造 + relation 矢印)~50 LOC
- 計 ~150 LOC

## 6.4 Phase B renderer:object viewer 系

### 6.4.1 `json{view}` / `yaml{view}` / `toml{view}` / `xml{view}`

#### 入力

````markdown
```json{view}
{ "name": "PKC2", "version": "2.2.0", "deps": { "markdown-it": "14.x" } }
```

```yaml{view search}
title: メモ
tags: [memo, draft]
nested:
  level1:
    level2: value
```
````

#### 出力(折りたたみ可能 object tree)

```
▼ name: "PKC2"
▼ version: "2.2.0"
▼ deps: object {
    ▼ markdown-it: "14.x"
  }
```

各 node:

- type badge(string / number / boolean / null / array / object)
- 値表示(primitive)or expand 矢印(複合)
- `{search}` 付きの場合、上に search box(key + value 部分一致)
- click で一個ずつ open / close、Alt+Click で recursive

#### attribute

| attr | values | default | 意味 |
|------|--------|---------|------|
| `view` | flag | (lang 既定の syntax highlight) | 折りたたみ tree モード起動 |
| `search` | flag | false | search box 追加 |
| `collapsed` | flag | false | 全 node 初期 collapsed |
| `depth` | number | unlimited | depth N まで自動展開 |

#### implementation

- JSON: `JSON.parse`(native) + DIY viewer
- YAML: 既存 PKC2 frontmatter parser reuse(YAML reform で landed)
- TOML: 軽量 parser bundle(@iarna/toml ~30 KB)
- XML: native `DOMParser` + XXE 防御(下記)
- viewer DOM(共通): ~150 LOC
- 計 ~70 KB bundle 増、~400 LOC

#### XML XXE 防御

`DOMParser` で XML parse する時、XML External Entity(XXE)injection を防ぐ:

```javascript
const parser = new DOMParser();
const doc = parser.parseFromString(src, 'text/xml');
// DOCTYPE 検出、reject
if (doc.doctype !== null) {
  return error('XML DOCTYPE not allowed (XXE prevention)');
}
// 全 ENTITY 検出 reject(parseError)
const errors = doc.querySelectorAll('parsererror');
if (errors.length > 0) {
  return error('XML parse error');
}
```

DOCTYPE / ENTITY 完全拒否、外部リソース fetch を構造的に阻止。

## 6.5 Phase C renderer:math(KaTeX 経由、別 plugin)

math は Renderer Registry を経由せず、markdown-it plugin として実装(§05 詳細)。理由:

- math 記法は code fence でなく `$...$` / `$$...$$` で trigger される(別経路)
- KaTeX bundle は math 専用、Registry の generic chrome 不要
- IR ノードは `Math{display, src}`、`CodeRender` と別

ただし block math `$$...$$` を `:::math` block directive として書く formal 経路もあり、この場合は Registry 経由 codepath で対応。

## 6.6 Phase D renderer:query + cards(PKC2 killer)

### 6.6.1 `query` — container 内 entry を query → 結果 inline render

PKC2 が「知識コンテナ」として Notion / Roam / Logseq に並ぶ killer feature。

#### 入力(SQL-like DSL、AI 友好)

````markdown
```query
SELECT title, year, author
FROM entries
WHERE kind = 'book' AND year > 2020
ORDER BY year DESC
LIMIT 10
```

```query
SELECT *
FROM entries
WHERE tags CONTAINS 'spec' AND created_at > '2026-01-01'
ORDER BY created_at DESC
```
````

#### 出力(table or card grid)

クエリ結果が table または card grid で展開:

| title | year | author |
|-------|------|--------|
| Book A | 2024 | Smith |
| Book B | 2023 | Tanaka |
| ... | ... | ... |

または `{view=cards}` で card grid に切替:

```
[card: Book A] [card: Book B] [card: Book C] [card: Book D]
[card: Book E] [card: Book F] ...
```

#### DSL 仕様(初期 spec、Phase D 開始時に確定)

- `SELECT` 句:column 列 or `*`(IR フィールド名 / frontmatter key)
- `FROM` 句:固定 `entries`(将来は `tags` `revisions` 等の view も可)
- `WHERE` 句:`kind = 'book'`、`tags CONTAINS 'x'`、`year > 2020`、`title MATCHES /regex/i`
- `ORDER BY` 句:`<col> ASC|DESC`
- `LIMIT` 句:数値
- 比較:`=`、`!=`、`>`、`<`、`>=`、`<=`、`CONTAINS`、`MATCHES`
- 論理:`AND`、`OR`、`NOT`、parens `( )`

#### attribute

| attr | values | default | 意味 |
|------|--------|---------|------|
| `view` | `table\|cards\|list\|grid` | `table` | render style |
| `live` | flag | true | container 変更時に自動 re-render(false なら snapshot)|
| `link-target` | `_self\|_blank` | `_self` | 結果行 click の navigate 先 |

#### implementation

- DSL parser(~200 LOC)
- query executor(container 走査、~150 LOC)
- multi-view renderer(table / cards / list / grid)~100 LOC
- 計 ~30 KB bundle 増

#### security

- 副作用なし(read-only、container を mutate しない)
- 結果 row 数 cap(default 1000、attr `LIMIT` で override 可能だが上限は固定)
- frontmatter key を expose する点、user が container を共有する時の意識が必要(spec で warning 推奨)

### 6.6.2 `cards` — entry LID 列 → card grid 一括表示

#### 入力

````markdown
```cards{layout=grid columns=4}
moxhfs3j-0001
moxhfs3j-0002
moxhfs3j-0003
moxhfs3j-0004
moxhfs3j-0005
moxhfs3j-0006
```
````

または(将来拡張):

````markdown
```cards{tags=spec layout=grid}
```

```cards{backlinks-of=this-entry}
```
````

#### 出力

各 LID に対する `@[](entry:LID)` card を grid 配置(default 4 columns、attr で調整)。

#### attribute

| attr | values | default | 意味 |
|------|--------|---------|------|
| `layout` | `grid\|list\|inline` | `grid` | 配置 |
| `columns` | number | 4 | grid 列数 |
| `tags` | string | (LID list 直接指定) | tag query で entry 自動取得 |
| `backlinks-of` | LID | none | 指定 entry への backlink 一覧 |

#### implementation

- LID list 直接指定(Phase 1):~50 LOC
- tag query / backlinks-of(Phase 2):+ ~50 LOC
- card render は既存 `@[](entry:LID)` 経路 reuse、+ grid CSS

## 6.7 Phase E renderer:lightweight diagram

### 6.7.1 `mindmap`

#### 入力(indent → 階層)

````markdown
```mindmap
中心トピック
  - 枝1
    - 葉1a
    - 葉1b
  - 枝2
    - 葉2a
      - 子1
      - 子2
    - 葉2b
```
````

#### 出力

放射状 SVG mindmap、中心から枝が広がる図。

#### implementation

- indent parser(~50 LOC)
- SVG radial layout(~150 LOC、簡易 force layout)
- 計 ~15 KB bundle、~200 LOC

### 6.7.2 `flow` `seq` `state`(軽量 diagram trio)

Mermaid (~1.2 MB)を採用しない代わりに、3 種を独自軽量実装:

#### `flow`(flowchart)

````markdown
```flow
start: 開始
process: データ取得
decision: エラー?
  yes: error_handle
  no: success
error_handle: エラー処理
success: 完了
end: 終了

start -> process
process -> decision
decision -> end
```
````

→ SVG flowchart、box(start/process)+ diamond(decision)+ 矢印

#### `seq`(sequence diagram)

````markdown
```seq
participants: User, App, Server, DB

User -> App: クリック
App -> Server: GET /api/data
Server -> DB: SELECT
DB -> Server: result
Server -> App: JSON response
App -> User: 表示更新
```
````

→ SVG sequence diagram、participant lifeline + 矢印

#### `state`(state machine)

````markdown
```state
states: idle, loading, success, error
initial: idle

idle -> loading: load_clicked
loading -> success: load_success
loading -> error: load_failed
error -> idle: retry
success -> idle: reset
```
````

→ SVG state diagram、state circle + transition arrows

#### implementation

- 各 ~20 KB bundle、~150 LOC ずつ
- 計 ~60 KB / ~450 LOC for 3 種

## 6.8 Phase F renderer:binary + hexdump + diff

### 6.8.1 `binary` — struct schema notation

#### 入力

````markdown
```binary
struct Frame {
  type:    u8     @0
  flags:   u8     @1
  length:  u16 BE @2     // big-endian
  payload: bytes[length] @4
}

struct Header {
  magic:   bytes[4] @0   // "PKC2"
  version: u16 BE   @4
  flags:   u32 LE   @6
  ts:      u64 BE   @10
}
```
````

#### 出力

各 struct について:

- 上半分:offset / size / type / name の table
- 下半分:byte layout SVG diagram(各 byte の box + endian 表示 + 色分け)

### 6.8.2 `hexdump`

````markdown
```hexdump
50 4B 43 32 00 02 00 00 00 00 00 5D
68 65 6C 6C 6F 20 77 6F 72 6C 64 21
```
````

→ アドレス + 16 進数 + ASCII 列の hexdump 表(`xxd` style)。

### 6.8.3 `diff`

````markdown
```diff
- old line
+ new line
  context line
- another removed
+ another added
```
````

→ side-by-side or inline diff、色分け(削除 red / 追加 green)。

#### implementation

- binary: parser ~200 LOC + SVG render ~100 LOC
- hexdump: ~50 LOC
- diff: ~100 LOC

## 6.9 Phase G renderer(optional、需要次第)

未確定 / defer 候補:

- `palette`(color swatches、~50 LOC)
- `quiz` `flashcard` `cloze` `mc`(教材系、各 ~100-200 LOC)
- `regex`(regex visualization、~30 KB)
- `bnf` / `grammar`(EBNF railroad、~30 KB)
- `types`(TypeScript-like type viewer、~10 KB)
- `api`(OpenAPI subset、~20 KB)
- `bibliography`(citation list、~10 KB)
- `glossary`(term定義 list、~5 KB)
- `decision`(decision tree)
- `gantt`(gantt chart)
- `timeline`(縦型 timeline)
- `chart`(simple bar/line/pie SVG)
- `dot`(graphviz subset、軽量版 ~30KB or wasm 版 600 KB)

これらは個別 user 需要 + 戦略性で評価、`09-migration-roadmap.md` で Phase 順序確定。

## 6.10 PKC2 戦略 framing

これらの拡張で PKC2 は **「Knowledge Block ecosystem」の旗艦** として position できる:

| 既存 tool | 強み | PKC2 が勝てる差分 |
|-----------|------|----------------|
| Notion | block 種類豊富、多人数 | local-only、single HTML、AI native、free |
| Obsidian | plugin 豊富 | plugin install 不要、initial 体験で全機能、AI native |
| Roam | query 強力 | 無料、single HTML、AI native |
| Logseq | block reference 強力 | single HTML、format export 強力 |

PKC2 の niche:**「single HTML offline + AI 第一級 + 全機能 built-in」**。Renderer Registry はこれを支える architecture。

## 6.11 implementation 見積もり

| Phase | renderer | bundle 増 | LOC | PR 数 | 期間 |
|-------|---------|---------|-----|------|------|
| A | tree + dbschema + Registry 基盤 | ±0 | ~300 | 1 | 1 週 |
| B | json/yaml/toml/xml viewer + 共通 chrome | ~70 KB | ~500 | 2-3 | 2-3 週 |
| C | math(KaTeX、§05)+ footnote(§04) | ~480 KB | ~400 | 3-5 | 3-4 週 |
| D | **query + cards(PKC2 killer)** | ~50 KB | ~600 | 5-8 | 4-6 週 |
| E | mindmap + flow + seq + state(軽量 diagram)| ~80 KB | ~600 | 4-6 | 3-4 週 |
| F | binary + hexdump + diff | ~25 KB | ~450 | 2-3 | 2 週 |
| G | optional(palette / quiz / etc.) | ~30-50 KB | ~500 | 別 wave、需要次第 | — |

累計 bundle 想定:現 970 KB → +800〜900 KB → ~1.8 MB / 4608 KB(40%)、十分 healthy。

## 6.12 設計まとめ

### 確定

- **Renderer Registry** plugin-like architecture、builtin 集合 + 後追い拡張容易
- **Pandoc-style attribute syntax `{key=v}`** で per-block options
- **共通 chrome / cap / security** を core layer で提供
- **Phase A**(tree + dbschema)を本 reform wave の起点として採用、~80 LOC で着地可能

### 議論待ち(主要)

- **`query` DSL 詳細**:SQL-like vs Datalog vs PKC2 独自、初期支援機能の範囲
- **Phase D の bundle cost(~50 KB)** が「PKC2 killer」として妥当か?
- **Mermaid 採用却下**(~1.2 MB)の判断、独自軽量 3 種(flow / seq / state)で代替可能か
- **教材系(Phase G)** を採用すべきか?学習 tool として positioning するか?
- **`embed-iframe-sandbox`** は採用しないが、外部 site embed 需要への対応(card で代替十分か)

## 6.13 レビュー観点

1. **architecture 拡張性**:Renderer Registry pattern は新 renderer 追加時に十分 scalable か?
2. **bundle 累計**:Phase A〜F で +800-900 KB、5 MB budget 内だが、実 deploy ・user 体感の影響は?
3. **PKC2 killer feature(query / cards)** の戦略判断:本当に Notion / Roam に対抗できる差別化要素か?
4. **Phase 順序**:Phase A → B → C(math) → D(killer) の順は最適か?D を先行(killer の早期確立)も検討すべきか?
5. **未収録 renderer**:この catalog に漏れている戦略性高い renderer はないか?
6. **共通 chrome の機能 set**:copy / toggle / search / error 以外で必要なものは?(e.g. fullscreen / re-render trigger / export to image)
7. **security cap**:各 renderer の cap は十分厳格か?攻撃 vector の見落としはないか?
