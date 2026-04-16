# HTML Paste — Link → Markdown Normalization

Status: COMPLETED 2026-04-16
Related: `src/adapter/ui/html-paste-to-markdown.ts`, `src/adapter/ui/action-binder.ts` (handlePaste), `tests/adapter/html-paste-to-markdown.test.ts`, `tests/adapter/action-binder-html-paste.test.ts`

---

## 目的

Web ブラウザ等からリンク付きテキストを copy して PKC2 の TEXT body に paste すると、
ブラウザのデフォルトでは **text/plain が優先** されて `<a href>` の URL が落ちる。
Web から見出しを引っ張ってきて PKC2 に貼ると、URL が失われて本文が残るだけになる。

本変更は、text/html payload が clipboard に存在する場合に限り、
`<a href="url">label</a>` を `[label](url)` Markdown リンクへ正規化して挿入する。

## Scope (v1)

### 対象

- TEXT body textarea（`data-pkc-field="body"`）への paste のみ
- clipboard に `text/html` payload がある場合のみ
- `<a href>` が 1 個以上含まれる場合のみ

### 非対象（意図的に v1 外）

- TEXTLOG append / entry textarea（`textlog-append-text` / `textlog-entry-text`）
- entry-window 配下の textarea
- 画像 paste の markdown 化（既存の screenshot → attachment 経路を維持）
- 見出し・リスト・強調・テーブル等の一般的な HTML → Markdown 変換
- rich paste 全体の高度整形

## v1 behavior

### 判定

```
clipboard に image item あり? → 既存の screenshot → attachment 経路
          ↓ なし
clipboard に text/html あり?   → 次へ
          ↓ なし
ブラウザのデフォルト text/plain paste（何もしない）
```

text/html があった場合：

```
htmlPasteToMarkdown(html)
  - HTML を DOMParser で解析
  - <a href> が 0 個 → null を返す
    → 呼び出し側はブラウザのデフォルトに委ねる
  - <a href> が 1 個以上 → ウォーカで転写
```

### 変換ルール

| 入力 | 出力 |
|-----|------|
| `<a href="https://example.com">Example</a>` | `[Example](https://example.com)` |
| `<a href="https://example.com"></a>` | `https://example.com`（ラベル空 → URL をラベル扱い） |
| `<a href="javascript:alert(1)">x</a>` | `x`（href 破棄、ラベルのみ保持） |
| `<a href="data:...">x</a>` | `x`（同上） |
| `<a href="https://example.com">[brackets]</a>` | `[\[brackets\]](https://example.com)`（`[` `]` を escape） |
| `<a href="https://example.com/foo (bar)">x</a>` | `[x](https://example.com/foo%20%28bar%29)`（URL 内の `( )` space を percent-encode） |
| 非 anchor 要素 | textContent へ平坦化 |
| `<br>` / block tags (`<p>` `<div>` `<h1>` 等) | 周囲に `\n` |
| `<script>` / `<style>` / `<head>` 等 | 完全スキップ |

### 挿入方法

1. `document.execCommand('insertText', false, text)` を優先
   - 成功すれば native な undo stack が保たれる
   - `input` event も発火し、既存の preview debounce が働く
2. 失敗時は textarea.value を手動スプライス + 合成 `input` event dispatch
   - happy-dom / 古いブラウザなど execCommand が無効な環境向けフォールバック

## Safety

- `javascript:` / `vbscript:` / `data:` は Markdown リンク化しない（ラベルのみ plain text として残す）
- ラベル内の `\` `[` `]` は escape
- URL 内の `(` `)` space は percent-encode
- `readonly` state では paste 全体が block されている（既存 handlePaste の早期 return）
- `pasteInProgress` ガードは既存のまま（並行 FileReader との競合回避）

## 既存挙動への影響

- image paste（screenshot → attachment）: **影響なし**（image item が見つかった時点で分岐）
- text/plain のみの paste: **影響なし**（text/html が空なら早期 return）
- anchor を含まない text/html の paste: **影響なし**（`htmlPasteToMarkdown` が null を返す → ブラウザデフォルト）

## テスト

### `tests/adapter/html-paste-to-markdown.test.ts`（20 件）

pure helper の動作を網羅：

- `isSafeHref`: http/https/relative/mailto/ftp/tel 受理、javascript/vbscript/data/空 拒否（4 件）
- `htmlPasteToMarkdown`: no-anchor → null / 単一 anchor / 周囲テキスト中の anchor / 複数 anchor / 空 label → URL / 危険 href / markdown escape / URL percent-encode / 相対パス / ラベル内空白折り畳み / block-level 改行 / `<br>` / `<script>` `<style>` スキップ / Gmail 風ラッパ（16 件）

### `tests/adapter/action-binder-html-paste.test.ts`（5 件）

action-binder への結線確認：

- 単一 anchor → Markdown リンク挿入
- 複数 anchor → どちらも保存
- anchor のない HTML → `preventDefault` が呼ばれない / textarea 不変
- plain-only paste → `preventDefault` が呼ばれない / textarea 不変
- `javascript:` href → ラベルのみ挿入、危険スキーマ排除

## 意図的に対象外

- 正規表現・置換機能（次テーマで別途）
- TEXTLOG での同挙動（要求が出れば拡張）
- entry-window 配下の textarea 対応
- 画像 drag & drop の Markdown 化
- rich-text formatting の全面的な Markdown 変換
- 複数段階の HTML 整形（見出しレベルの維持、リスト化等）
