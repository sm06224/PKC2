# FI-08 アドレスバー URL+タイトル貼付の補強 v1 — Minimum Scope

Status: DRAFT 2026-04-18  
Pipeline position: minimum scope  
Predecessor: `docs/planning/file-issues/08_editor-address-bar-link-paste-markdown.md`

---

## 0. 問題の再定義

### 0-1. ブラウザのアドレスバーコピー時の clipboard 構成

主要ブラウザ（Chrome / Edge / Safari / Firefox 最新版）でアドレスバーから URL をコピーすると、clipboard に以下が入る:

| フォーマット | 内容 |
|------------|------|
| `text/plain` | URL 文字列（`https://example.com/page`） |
| `text/html` | `<a href="URL">ページタイトル</a>`（HTML anchor） |

Firefox はバージョンにより `text/html` を含まない場合がある（`text/plain` のみ）。

### 0-2. S-25 で既にカバーされている範囲

S-25（HTML paste → Markdown link 正規化、2026-04-16 完了）は以下を既に処理する:

```
clipboard に text/html あり → DOMParser で解析
  → <a href> が 1 個以上 → [label](url) に変換して挿入
  → <a href> が 0 個 → null → ブラウザの text/plain paste に委ねる
clipboard に text/html なし → ブラウザの text/plain paste に委ねる
```

**つまり、`text/html` に `<a href>` が含まれるアドレスバーコピー（Chrome / Edge / Safari）は S-25 で既に `[ページタイトル](URL)` に正規化される。**

### 0-3. 残る UX 上のギャップ

| ギャップ | 状況 | 現行の結果 |
|---------|------|-----------|
| G-1: label === URL の冗長リンク | `<a href="URL">URL</a>` 形式（ブラウザがタイトルなしで anchor を出力する場合、またはユーザーが URL テキストをリンクとしてコピーした場合） | `[https://example.com](https://example.com)` — 冗長だが壊れてはいない |
| G-2: `text/plain` のみの URL paste | Firefox 旧版や特殊環境で `text/html` がない場合 | `https://example.com` がそのまま挿入 — 多くの Markdown renderer がベア URL をリンクとして扱うため実害は軽微 |
| G-3: TEXTLOG textarea の非対応 | S-25 は `data-pkc-field="body"`（TEXT body）のみ対象 | TEXTLOG append / entry textarea に貼り付けたとき URL が落ちる |

---

## 1. Scope / 非対象

### v1 対象

| 変更 | 種別 | ギャップ |
|------|------|---------|
| label === URL の場合にベア URL へ正規化 | `html-paste-to-markdown.ts` 修正 | G-1 |
| TEXTLOG textarea への S-25 適用拡張 | `action-binder.ts` 修正 | G-3 |

### 非対象

| 項目 | 理由 |
|------|------|
| `text/plain` のみの URL 自動リンク化（G-2） | ベア URL は Markdown renderer がリンクとして描画する。`text/plain` の内容を勝手に書き換えると、URL ではない文字列への誤変換リスクが生じる。v1 では扱わない |
| OGP / favicon / メタデータの外部取得 | ネットワークアクセスは single HTML 哲学と合わない |
| 複数 URL の一括貼付 | S-25 が複数 anchor を既に処理する。特別扱い不要 |
| 一般的な HTML → Markdown 変換（見出し・リスト・テーブル等） | S-25 の設計判断を維持（anchor のみ）|
| form / folder description textarea | 用途が限定的で要求なし |
| entry-window 内の textarea | 既存の対応済み / 別経路の問題であり FI-08 の責務外 |
| rich paste 全般 | 別テーマ |

---

## 2. G-1: label === URL の冗長リンク回避

### 2-1. 現状の問題

S-25 の `walkNode` は label が空でない限り `[label](url)` を出力する。Chrome のアドレスバーコピーでタイトルがない場合やユーザーが URL テキスト部分をリンクとしてコピーした場合、`<a href="https://example.com">https://example.com</a>` という HTML が clipboard に入り、結果は:

```markdown
[https://example.com](https://example.com)
```

これは冗長だが機能上は壊れていない。ただし UX として、同じ情報を 2 回書くのは望ましくない。

### 2-2. v1 変更方針

`walkNode` の anchor 処理で **label を trim した結果が href と一致する場合**、`[label](url)` ではなくベア URL を出力する:

```
label.trim() === href.trim() の場合 → sanitizeHref(href) のみ出力
それ以外 → [escapeLabel(label)](sanitizeHref(href))
```

### 2-3. 例

| clipboard の HTML | 変更前 | 変更後 |
|------------------|--------|--------|
| `<a href="https://x.com">https://x.com</a>` | `[https://x.com](https://x.com)` | `https://x.com` |
| `<a href="https://x.com">Example Page</a>` | `[Example Page](https://x.com)` | `[Example Page](https://x.com)`（変化なし）|
| `<a href="https://x.com"></a>` | `https://x.com` | `https://x.com`（変化なし）|
| `<a href="javascript:alert(1)">x</a>` | `x` | `x`（変化なし）|

---

## 3. G-3: TEXTLOG textarea への拡張

### 3-1. 現状の問題

`maybeHandleHtmlLinkPaste` は `data-pkc-field="body"` のみを対象としている。TEXTLOG の append textarea（`data-pkc-field="textlog-append-text"`）や entry textarea（`data-pkc-field="textlog-entry-text"`）に URL 入りの HTML を貼り付けても、S-25 の変換が適用されず URL が落ちる。

### 3-2. v1 変更方針

`maybeHandleHtmlLinkPaste` の field gate を緩和し、以下の 3 つの `data-pkc-field` 値を対象にする:

| field 値 | archetype | 用途 |
|----------|-----------|------|
| `body` | TEXT / FOLDER | 本文 textarea |
| `textlog-append-text` | TEXTLOG | 追記欄 |
| `textlog-entry-text` | TEXTLOG | 既存ログ行の編集 textarea |

### 3-3. 非対象 textarea

| 除外 | 理由 |
|------|------|
| `title` | タイトル欄への Markdown リンク挿入は UX として不適切 |
| `source_url` | URL 専用欄。Markdown 形式にする意味がない |
| form 系 field | 構造化データであり Markdown link を挿入する文脈ではない |

---

## 4. 既存設計との整合

### 4-1. S-25 非破壊

| S-25 既存動作 | FI-08 v1 での扱い |
|-------------|-----------------|
| image item がある → screenshot → attachment 経路 | 変更なし |
| text/html なし → ブラウザ default paste | 変更なし |
| anchor 0 個 → null → ブラウザ default | 変更なし |
| anchor あり → `[label](url)` 変換 | label === URL の場合のみベア URL に変更。それ以外は変更なし |
| 危険 scheme → ラベルのみ plain text | 変更なし |
| Markdown escape（`[` `]` `\`） | 変更なし |
| URL percent-encode（`(` `)` space） | 変更なし |
| `execCommand` 優先 → fallback splice | 変更なし |
| readonly state で paste 全体 block | 変更なし |

### 4-2. textarea 対象の一意性

現行の gate は `data-pkc-field="body"` 1 値のみ。FI-08 で 3 値に拡張するが、**許可リスト方式**（明示列挙）のため、意図しない textarea への適用は起きない。

### 4-3. dangerous href 排除

`isSafeHref` 関数は変更しない。`javascript:` / `vbscript:` / `data:` / 空 href の排除は G-1 / G-3 の両方に適用される。

---

## 5. 不変条件

| # | 不変条件 |
|---|---------|
| I-FI08-1 | S-25 の既存動作を壊さない（image paste / plain-text paste / anchor なし paste は全て従来通り）|
| I-FI08-2 | 危険 scheme（`javascript:` / `vbscript:` / `data:`）は Markdown リンク化しない |
| I-FI08-3 | `data-pkc-field` の許可リスト外の textarea には適用しない |
| I-FI08-4 | label !== URL の場合の `[label](url)` 出力を変更しない |
| I-FI08-5 | readonly state での paste block を維持する |

---

## 6. 例

### 6-1. Chrome アドレスバーコピー（タイトルあり）

```
text/plain: https://docs.example.com/guide
text/html:  <a href="https://docs.example.com/guide">Getting Started Guide</a>
```

**結果**: `[Getting Started Guide](https://docs.example.com/guide)` — S-25 で既に動作。FI-08 変更なし。

### 6-2. Chrome アドレスバーコピー（タイトル = URL）

```
text/plain: https://example.com
text/html:  <a href="https://example.com">https://example.com</a>
```

**変更前**: `[https://example.com](https://example.com)`  
**変更後**: `https://example.com`（G-1 修正）

### 6-3. Firefox アドレスバーコピー（text/plain のみ）

```
text/plain: https://example.com
text/html:  （なし）
```

**結果**: `https://example.com`（ブラウザ default paste）— FI-08 変更なし。

### 6-4. 危険 scheme

```
text/html: <a href="javascript:alert(1)">Click me</a>
```

**結果**: `Click me`（ラベルのみ、リンク化しない）— FI-08 変更なし。

### 6-5. TEXTLOG 追記欄への貼付（G-3 修正後）

```
text/html: <a href="https://example.com">Example</a>
```

**変更前**: `Example`（URL が落ちる — S-25 が body 以外を対象としないため）  
**変更後**: `[Example](https://example.com)`（G-3 修正で対象拡張）

---

## 7. 推奨 pipeline

| フェーズ | 内容 |
|---------|------|
| minimum scope（本文書）| 問題の切り分けと v1 対象の確定 |
| behavior contract | G-1 / G-3 の変更仕様、テスト一覧、非破壊境界の逐条固定 |
| implementation | `html-paste-to-markdown.ts` の label === URL 判定、`action-binder.ts` の field gate 拡張、テスト追加 |
| audit | S-25 regression テスト 25 件 + FI-08 新規テストの全通過確認 |
| manual sync | 05 日常操作 / 09 トラブルシューティングの既存記述との整合確認 |

---

## 8. 非対象の明確化

| 項目 | 理由 |
|------|------|
| `text/plain` のみの URL 自動 Markdown リンク化 | ベア URL はそのままでも Markdown renderer がリンクとして描画する。誤判定のリスクが高い |
| ページタイトルの外部取得（OGP / fetch） | ネットワークアクセスは single HTML 哲学に反する |
| ブックマークインポーター | 別テーマ |
| favicon 取得 | 別テーマ |
| rich HTML の全面 Markdown 化 | S-25 の設計判断（anchor のみ）を維持 |
| entry-window 内の textarea | S-25 と同じく v1 外 |

---

## References

- `docs/planning/file-issues/08_editor-address-bar-link-paste-markdown.md`
- `docs/development/html-paste-link-markdown.md`（S-25 完了文書）
- `src/adapter/ui/html-paste-to-markdown.ts` — `htmlPasteToMarkdown` / `isSafeHref` / `walkNode`
- `src/adapter/ui/action-binder.ts` — `maybeHandleHtmlLinkPaste` / `handlePaste`
- `tests/adapter/html-paste-to-markdown.test.ts`（20 件）
- `tests/adapter/action-binder-html-paste.test.ts`（5 件）
