# FI-08 addressbar URL+title paste v1 post-implementation audit

Date: 2026-04-18  
Commit: b5ecac2  
Auditor: Claude (claude-sonnet-4-6)  
Outcome: **A — 問題なし（実装受理）**

---

## 1. 読んだファイル

| ファイル | 目的 |
|---------|------|
| `docs/spec/addressbar-url-title-paste-v1-behavior-contract.md` | contract 全文 |
| `src/adapter/ui/html-paste-to-markdown.ts` l.86-105 | G-1: label===URL 判定の実装 |
| `src/adapter/ui/action-binder.ts` l.3262-3344 | G-3: field gate + paste pipeline |
| `tests/adapter/addressbar-paste-fi08.test.ts` | FI-08 専用テスト 11 件 |

---

## 2. 監査観点

- G-1: `label.trim() === href.trim()` 比較の正しさ（sanitize 後比較になっていないか）
- G-1: bare URL 化が `[url](url)` のみを潰し、`[title](url)` を壊していないか
- G-3: field gate が `body` / `textlog-append-text` / `textlog-entry-text` のみか
- G-3: 非対象 field（`title` / `source_url` / `null`）が正しく除外されるか
- S-25 非破壊: dangerous href 排除・image paste 非干渉・plain text 非干渉
- G-2（text/plain only URL 自動リンク化）が混入していないか
- Type hygiene: FI-08 起因の新規型エラー有無

---

## 3. 監査結果サマリ

全チェック項目を通過。実装は behavior contract と整合している。  
F-1 軽微所見（JSDoc / inline コメントの更新漏れ）が 1 件あるが、機能に影響なく修正不要。

---

## 4. 発見した問題

### F-1（コスメティック・修正不要）

**場所**: `src/adapter/ui/action-binder.ts` l.3270-3272 / l.3339-3341

**内容**: G-3 で field gate を `body` → 3 値許可リスト（`body` / `textlog-append-text` / `textlog-entry-text`）に拡張したが、2 箇所のコメントが旧記述のまま。

1. l.3270-3272（JSDoc）:
   ```
   Scope: `data-pkc-field="body"` textareas only. Textlog append /
   entry textareas are deliberately excluded in this slice
   ```
2. l.3339-3341（handlePaste 内コメント）:
   ```
   Scope: TEXT body textareas only (`data-pkc-field="body"`).
   Textlog fields are out of scope for this slice
   ```

**実態**: `PASTE_LINK_ALLOWED_FIELDS` Set が 3 値を含んでおり、textlog textarea は正しく対象になっている。gate の実装は正しいが、コメントが古い。

**影響**: 機能上の問題なし。コメントは非機能的。**v1 範囲では受容する。修正は不要。**

---

## 5. 作成/変更ファイル一覧

今回の audit は docs-only:

| ファイル | 操作 |
|---------|------|
| `docs/development/addressbar-url-title-paste-v1-audit.md` | 新規作成（本文書）|

実装ファイルへの変更: **なし**（問題なし）

---

## 6. contract / 実装との整合点

### G-1: label === URL 正規化（§2）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| 比較規則 | `label.trim() === href.trim()` | l.101: `label.trim() === href.trim()` | ✅ |
| sanitize 後比較ではない | raw trim で比較 | `sanitizeHref` 呼び出しは比較の後（l.103） | ✅ |
| 一致時出力 | `sanitizeHref(href)` のみ | l.103: `return sanitizeHref(href)` | ✅ |
| 不一致時出力 | `[label](url)` | l.105: `return [...]` | ✅ |
| dangerous href | label のみ（既存） | l.92-95: `isSafeHref` guard（変更なし） | ✅ |
| empty label | `sanitizeHref(href)`（既存） | l.97-99（変更なし） | ✅ |
| 判定順序 | dangerous → empty → label===URL → `[label](url)` | l.92 → l.97 → l.101 → l.105 | ✅ |

### G-3: field gate 拡張（§3）

| 確認事項 | contract | 実装 | 判定 |
|---------|---------|------|------|
| 許可リスト方式 | `Set` で明示列挙 | l.3274: `new Set([...])` | ✅ |
| `body` | 含む | ✅ |
| `textlog-append-text` | 含む | ✅ |
| `textlog-entry-text` | 含む | ✅ |
| `null` field 除外 | `!field` guard | l.3284: `if (!field \|\| ...)` | ✅ |
| 非許可 field 除外 | `!Set.has(field)` | l.3284 | ✅ |

### S-25 非破壊（§4）

| 確認事項 | 判定 |
|---------|------|
| image paste path 非干渉（`handlePaste` の image 分岐は変更なし）| ✅ |
| `text/html` なし → early return（l.3286-3287 変更なし）| ✅ |
| anchor 0 個 → `null` → early return（`htmlPasteToMarkdown` l.135 変更なし）| ✅ |
| `e.preventDefault()` の条件（transform 後のみ、l.3291 変更なし）| ✅ |
| `execCommand` → fallback splice（l.3294-3311 変更なし）| ✅ |
| `readonly` state で paste block（`handlePaste` l.3315 変更なし）| ✅ |
| `pasteInProgress` ガード（l.3317 変更なし）| ✅ |
| S-25 既存テスト 25 件全通過 | ✅ |

### Invariants（§5）

| # | 確認事項 | 判定 |
|---|---------|------|
| I-FI08-1 | anchor なし paste → ブラウザ default に委ねる | ✅ |
| I-FI08-2 | text/html なし → ブラウザ default に委ねる | ✅ |
| I-FI08-3 | image item → screenshot → attachment 経路優先 | ✅ |
| I-FI08-4 | dangerous href は Markdown リンク化しない | ✅ |
| I-FI08-5 | 許可リスト外 field → 変換しない | ✅ |
| I-FI08-6 | label !== URL かつ非空 → `[label](url)` 維持 | ✅ |
| I-FI08-7 | label === URL → `sanitizeHref(href)` のみ | ✅ |
| I-FI08-8 | paste pipeline（preventDefault / execCommand / splice）非変更 | ✅ |

### G-2 混入確認

`text/plain` のみの URL 自動リンク化コードは追加されていない。`htmlPasteToMarkdown` は `text/html` 入力のみを処理し、`text/plain` は一切触らない。✅

### テスト網羅性

| テスト種別 | contract §7 要件 | 実装 | 判定 |
|-----------|-----------------|------|------|
| G-1 pure | 4 件 | 5 件（label===URL / label≠URL / trim / parens / 混在）| ✅ |
| G-3 integration | 4 件 | 6 件（append / entry / body 回帰 / title 除外 / null 除外 / G-1+G-3 複合）| ✅ |
| S-25 regression | 既存 25 件不変 | 25 件全通過 | ✅ |

---

## 7. 品質チェック結果

実装変更なしのため品質ゲート再実行は不要。  
実装コミット時の結果を参照:

- `npm test` — 4226 tests passed（FI-08 専用 11 件含む、S-25 既存 25 件含む）
- `npm run build:bundle` — ✓ bundle.js 562KB / bundle.css 75KB
- `npm run typecheck` — FI-08 起因の新規型エラー: **0 件**  
  （pre-existing error は `action-binder-attach-while-editing.test.ts` ×7 件 + `fi09-multi-select-filter.test.ts` ×1 件のみ、FI-08 以前から存在）

---

## 8. コミット有無

本 audit document のみコミット:

```
docs(fi08): post-implementation audit — Outcome A
```

実装コミット: `b5ecac2`（変更なし）
