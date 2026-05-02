# FI-08 アドレスバー URL+タイトル貼付の補強 v1 Behavior Contract

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は behavior contract / historical design record として保持。実装の現物は `tests/adapter/addressbar-paste-fi08.test.ts` と paste-handler 経路。  
Pipeline position: behavior contract  
Predecessor: `docs/spec/addressbar-url-title-paste-v1-minimum-scope.md`

---

## 0. 位置づけ

本文書は FI-08 v1 の実装者が迷わず進めるための確定仕様書。  
minimum scope で「何を変えるか」を定義したのに対し、本文書は「変換規則・フィールド gate・不変条件・テスト境界」を逐条で固定する。

---

## 1. Scope

### 1-1. 対象

| 対象 | 変更内容 |
|------|---------|
| `html-paste-to-markdown.ts` — `walkNode` | anchor 処理に label === URL 判定を追加（G-1）|
| `action-binder.ts` — `maybeHandleHtmlLinkPaste` | field gate を 3 値許可リストに拡張（G-3）|

### 1-2. 非対象

- `text/plain` のみの URL 自動 Markdown リンク化（G-2）
- ネットワークアクセス（OGP / favicon / metadata fetch）
- rich HTML の全面 Markdown 変換
- `data-pkc-field="title"` / `"source_url"` / form 系 field
- entry-window 内の textarea
- `isSafeHref` の変更（dangerous scheme 排除は現行維持）
- `sanitizeHref` / `escapeMarkdownLabel` / whitespace collapse の変更

---

## 2. G-1: label === URL 正規化 contract

### 2-1. 比較規則

`walkNode` の anchor 分岐で以下の条件判定を追加する:

```
label  = collapseTextWhitespace(el.textContent ?? '').trim()
href   = el.getAttribute('href') ?? ''
hrefTrimmed = href.trim()

label === hrefTrimmed → ベア URL 出力（sanitizeHref(href) のみ）
label ≠  hrefTrimmed → 既存の [label](url) 出力（変更なし）
```

**比較前の正規化**: label は既存の `collapseTextWhitespace + trim` のみ。href は `trim()` のみ。**`sanitizeHref`（percent-encode）後の値と比較しない**。

理由: percent-encode 前の raw URL が label に一致しているかを見るのが目的。`https://example.com` というラベルと `https://example.com` という href が一致すれば冗長。encode 後（`https://example.com`）と比較しても結果は同じだが、encode 後の比較は `( )` を含む URL で誤マッチの余地がある。

### 2-2. 処理フロー（anchor 分岐の全条件）

```
href が dangerous / empty  →  label のみ（既存）
label が empty              →  sanitizeHref(href)（既存）
label === href.trim()       →  sanitizeHref(href)（NEW: 冗長リンク回避）
それ以外                     →  [escapeLabel(label)](sanitizeHref(href))（既存）
```

### 2-3. 変換例

| anchor HTML | label | href.trim() | 出力 |
|-------------|-------|-------------|------|
| `<a href="https://example.com">https://example.com</a>` | `https://example.com` | `https://example.com` | `https://example.com` |
| `<a href="https://example.com">Example Page</a>` | `Example Page` | `https://example.com` | `[Example Page](https://example.com)` |
| `<a href="https://example.com"></a>` | `""` | `https://example.com` | `https://example.com`（既存: empty label → URL）|
| `<a href="https://x.com/foo (bar)">https://x.com/foo (bar)</a>` | `https://x.com/foo (bar)` | `https://x.com/foo (bar)` | `https://x.com/foo%20%28bar%29`（sanitize 適用）|
| `<a href="javascript:alert(1)">https://example.com</a>` | `https://example.com` | `javascript:alert(1)` | `https://example.com`（既存: dangerous href）|
| `<a href="https://example.com">  https://example.com  </a>` | `https://example.com`（trim 済み）| `https://example.com` | `https://example.com` |

### 2-4. whitespace ケース

label は `collapseTextWhitespace + trim` 済みで比較する。  
`href.trim()` は `trim()` のみで `collapseTextWhitespace` は適用しない（URL 内に複数空白はまずないが、万一あれば label が異なる値として扱われ `[label](url)` 出力になる — これは正しい挙動）。

---

## 3. G-3: field gate contract

### 3-1. 許可フィールド

`maybeHandleHtmlLinkPaste` は以下の `data-pkc-field` 値を持つ `HTMLTextAreaElement` のみを対象とする:

| `data-pkc-field` 値 | 用途 | archetype |
|--------------------|------|-----------|
| `body` | TEXT / FOLDER 本文 | text, folder |
| `textlog-append-text` | TEXTLOG 追記欄 | textlog |
| `textlog-entry-text` | TEXTLOG 既存ログ行編集 | textlog |

### 3-2. 実装（gate の変更）

**現行**:
```typescript
if (target.getAttribute('data-pkc-field') !== 'body') return;
```

**変更後**:
```typescript
const PASTE_LINK_ALLOWED_FIELDS = new Set([
  'body',
  'textlog-append-text',
  'textlog-entry-text',
]);
const field = target.getAttribute('data-pkc-field');
if (!field || !PASTE_LINK_ALLOWED_FIELDS.has(field)) return;
```

- `PASTE_LINK_ALLOWED_FIELDS` は定数（`Set<string>`）として `maybeHandleHtmlLinkPaste` の直外（モジュールスコープ）に宣言する
- `field` が `null`（属性なし）の場合は既存どおり return
- 許可リスト外の値（`"title"` / `"source_url"` / form 系等）はすべて return

### 3-3. 明示的に除外するフィールド

| フィールド | 理由 |
|-----------|------|
| `title` | タイトル欄に Markdown リンクを挿入する UX として不適切 |
| `source_url` | URL 専用欄。Markdown 構文にする意味がない |
| form 系 | 構造化データ。Markdown link を埋め込む文脈ではない |
| `null`（属性なし）| 対象外 textarea として扱う |

---

## 4. Operation contract（変更しない部分）

以下の処理は FI-08 で変更しない。現行実装を維持する。

| 処理 | 実装箇所 | FI-08 での扱い |
|------|---------|--------------|
| image item 検出 → screenshot → attachment 経路 | `handlePaste` | 変更なし |
| `text/html` が空 → early return | `maybeHandleHtmlLinkPaste` | 変更なし |
| `htmlPasteToMarkdown` が `null` / `""` → early return | `maybeHandleHtmlLinkPaste` | 変更なし |
| `e.preventDefault()` のタイミング（transform 後のみ）| `maybeHandleHtmlLinkPaste` | 変更なし |
| `execCommand('insertText')` 優先 → fallback splice | `maybeHandleHtmlLinkPaste` | 変更なし |
| `readonly` state で paste 全体 block | `handlePaste` | 変更なし |
| `pasteInProgress` ガード | `handlePaste` | 変更なし |
| anchor 0 個 → `null` 返却 | `htmlPasteToMarkdown` | 変更なし |
| whitespace collapse / blank line cap | `htmlPasteToMarkdown` | 変更なし |

---

## 5. Invariants

| # | 不変条件 |
|---|---------|
| I-FI08-1 | anchor を含まない `text/html` paste はブラウザ default text/plain paste に委ねる（`htmlPasteToMarkdown` が null を返す） |
| I-FI08-2 | `text/html` が clipboard にない場合はブラウザ default paste に委ねる（`maybeHandleHtmlLinkPaste` が early return）|
| I-FI08-3 | image item がある場合は screenshot → attachment 経路が優先される（`handlePaste` の分岐順序）|
| I-FI08-4 | `javascript:` / `vbscript:` / `data:` / 空 href は Markdown リンク化しない（`isSafeHref` 維持）|
| I-FI08-5 | `data-pkc-field` が `PASTE_LINK_ALLOWED_FIELDS` に含まれない textarea には変換を適用しない |
| I-FI08-6 | label !== href.trim() かつ label が非空 の場合は `[label](url)` 出力を維持する |
| I-FI08-7 | label === href.trim() の場合の出力は `sanitizeHref(href)` であり、Markdown リンク形式にしない |
| I-FI08-8 | G-1 の変更は `htmlPasteToMarkdown` の返値の形にのみ影響する。`e.preventDefault()` の発火タイミング・挿入メカニズムは変わらない |

---

## 6. Gate / error paths

| ケース | 挙動 |
|--------|------|
| `text/html` なし | `maybeHandleHtmlLinkPaste` が early return → ブラウザ default paste |
| anchor 0 個 | `htmlPasteToMarkdown` が null → early return → ブラウザ default paste |
| anchor あり・全て dangerous | `htmlPasteToMarkdown` が label のみのテキストを返す（非空なら挿入）|
| anchor あり・全て empty label | `htmlPasteToMarkdown` が `sanitizeHref(href)` のみを返す |
| anchor あり・label === URL | `htmlPasteToMarkdown` が `sanitizeHref(href)` のみを返す（G-1 新規）|
| 対象外 field | `maybeHandleHtmlLinkPaste` が early return → ブラウザ default paste |
| `null` field | `maybeHandleHtmlLinkPaste` が early return → ブラウザ default paste |
| target が textarea でない | `maybeHandleHtmlLinkPaste` が early return（既存 guard）|
| readonly state | `handlePaste` が early return（既存 guard）|
| `htmlPasteToMarkdown` が `""` を返す（稀） | `maybeHandleHtmlLinkPaste` が early return → ブラウザ default paste |

---

## 7. Testability

### 7-1. pure unit（`html-paste-to-markdown.ts`）— G-1 追加テスト 4 件

| # | テスト |
|---|--------|
| 1 | `<a href="https://x.com">https://x.com</a>` → `"https://x.com"` |
| 2 | `<a href="https://x.com/foo (bar)">https://x.com/foo (bar)</a>` → `"https://x.com/foo%20%28bar%29"` |
| 3 | `<a href="https://x.com">  https://x.com  </a>`（label に空白） → `"https://x.com"`（trim 後一致）|
| 4 | `<a href="https://x.com">https://x.com</a>` と `<a href="https://y.com">Label</a>` が混在 → `"https://x.com [Label](https://y.com)"` |

### 7-2. integration（`action-binder.ts`）— G-3 追加テスト 4 件

| # | テスト |
|---|--------|
| 5 | `textlog-append-text` の textarea に anchor HTML → Markdown リンクに変換される |
| 6 | `textlog-entry-text` の textarea に anchor HTML → Markdown リンクに変換される |
| 7 | `title` の textarea に anchor HTML → `preventDefault` 呼ばれない・textarea 不変 |
| 8 | `data-pkc-field` 属性なし の textarea に anchor HTML → `preventDefault` 呼ばれない・textarea 不変 |

### 7-3. regression（既存 S-25 テストの全通過）

| テストファイル | 件数 | FI-08 による変化 |
|--------------|------|----------------|
| `tests/adapter/html-paste-to-markdown.test.ts` | 20 件 | G-1 テスト 4 件追加のみ。既存 20 件は変更なし |
| `tests/adapter/action-binder-html-paste.test.ts` | 5 件 | G-3 テスト 4 件追加のみ。既存 5 件は変更なし |

---

## 8. Non-goal / v1.x 余地

| 項目 | フェーズ |
|------|---------|
| `text/plain` のみの URL 自動リンク化 | 非対象（誤変換リスク）|
| OGP / favicon / ページタイトル外部取得 | 非対象（ネットワークアクセス禁止）|
| rich HTML の全面 Markdown 変換 | 別テーマ |
| `folder` description textarea（`data-pkc-field="body"` だが archetype が folder）| 現行の field gate が `body` を許可しているため既存どおり対象 — 変更不要 |
| form / attachment / generic 系の body textarea | v1.x — 用途が出れば追加 |
| entry-window 内の textarea | v1.x — 別 surface として扱う |

---

## References

- Minimum scope: `docs/spec/addressbar-url-title-paste-v1-minimum-scope.md`
- S-25 完了文書: `docs/development/archived/singletons/html-paste-link-markdown.md`
- `src/adapter/ui/html-paste-to-markdown.ts` — `htmlPasteToMarkdown` / `isSafeHref` / `walkNode`
- `src/adapter/ui/action-binder.ts` — `maybeHandleHtmlLinkPaste` / `handlePaste`
- `tests/adapter/html-paste-to-markdown.test.ts`（20 件）
- `tests/adapter/action-binder-html-paste.test.ts`（5 件）
