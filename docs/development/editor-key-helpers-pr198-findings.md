# PR #198 — Editor textarea key helpers (Enter list / bracket pair / skip-out)

**Status**: implemented
**Date**: 2026-04-29
**Roadmap**: 領域 4(編集支援)— 順 4

User direction:
> 編集支援機能として字下げ維持、囲み文字補完、リスト改行時の自動字下げと
> リスト記号挿入が欲しい

## 1. 実装

### 新規 `src/adapter/ui/editor-key-helpers.ts`

3 つの直交する補助:

#### a. `handleEditorEnter`: 字下げ維持 + リスト継続 + escape

- **Selection range** → `false`(default で置換させる)
- **Empty list line** → marker + 字下げを丸ごと消去(自然な離脱)
- **Plain non-indented line** → `false`(下流ハンドラ:inline calc /
  quote continuation / textlog Ctrl+Enter に譲る)
- **Indented or list line** → 次行に同じ字下げ + marker を挿入
  - `- foo\n` → `- foo\n- |`
  - `* foo` → `* foo\n* |`
  - `1. foo` → `1. foo\n2. |`(連番自動増加)
  - `- [x] foo` → `- [x] foo\n- [ ] |`(checkbox 引き継ぎ、空 checkbox)
  - `  text` → `  text\n  |`(plain indent 維持)

#### b. `handleEditorBracketOpen`: ペア括弧補完

`(`, `[`, `{`, `"`, `` ` `` を入力 → 対応 closer を後ろに自動挿入し
カーソルを間に置く。

- `'`(apostrophe)は **意図的に除外** — 英語の "don't" "won't" 等で
  word 内に出現するので auto-pair が摩擦になる
- 次文字が word 文字の場合は pair しない(ユーザーが word 中に literal
  括弧を打ちたいケース)
- selection 範囲ありは pair しない(将来 wrap-selection に拡張可)

#### c. `handleEditorSkipOut`: skip-out

カーソル直後が同じ closer の場合、複製せずカーソルだけ進める。
`)`, `]`, `}`, `"`, `'`, `` ` `` 全てに対応(symmetric quotes を含む)。

### 統合(`src/adapter/ui/action-binder.ts`)

global keydown ハンドラに分岐を追加:

```ts
if (
  e.target instanceof HTMLTextAreaElement
  && !e.isComposing
  && !e.ctrlKey && !e.metaKey && !e.altKey
) {
  const ta = e.target;
  const field = ta.getAttribute('data-pkc-field');
  if (field === 'body' || field === 'textlog-entry-text'
      || field === 'textlog-append-text' || field === 'todo-description') {
    if (tryHandleEditorKey(ta, e)) {
      e.preventDefault();
      return;
    }
  }
}
```

IME 中は `e.isComposing` で必ず除外。Ctrl/Meta/Alt 修飾キーつきは
既存 shortcut(Ctrl+S 等)優先で除外。

### 既存ハンドラとの共存

PR #198 v1 で `handleEditorEnter` が **plain Enter も常に consume**
していたため、既存の inline-calc(`2+3=` Enter で計算)+ quote
continuation(`> foo` Enter で `\n> ` 挿入)が壊れた。

v2 で plain non-indented + non-list 行は **`false` を返して譲る** よう
変更。実行順は:
1. inline calc(specific)
2. quote continuation(specific)
3. PR #198 helpers(generic catch-all、indent / list がある行のみ)
4. 既定 default

## 2. テスト

新規 `tests/adapter/editor-key-helpers-pr198.test.ts`(28 件):

**Enter / list 継続**:
- plain indent 維持
- `-` / `*` / `+` unordered list 継続
- 番号付きリスト連番増加(`1. → 2.`)
- 空 list 行で marker drop(escape pattern)
- 中段の空 list 行 escape
- ネスト indent + list 継続
- checkbox carryover(`- [x]` → `- [ ]`)
- selection range は default に譲る
- plain non-indented line は default に譲る(inline calc compat)
- `2+3=` plain は譲る(inline calc 動作)

**ペア括弧**:
- `(`, `[`, `{`, `"`, `` ` `` 全て auto-pair + cursor 中
- 次文字が word 文字なら pair しない
- selection 範囲は pair しない
- 非 pair 文字は false

**Skip-out**:
- `)` `"` 等 cursor 直後一致で skip
- 不一致時は false
- selection 時は false

**Master dispatch**:
- Enter → handleEditorEnter
- `(` → bracket pair
- 対称 quote(`""` 中央)で skip-out 優先
- Shift+Enter は consume しない
- 非対象キーは false

合計 6007 / 6007 unit pass + 11 / 11 smoke pass。

## 3. ユーザー追加質問への回答(2026-04-28)

> いまのマークダウンレンダラーは下線、イタリック、ボールドを
> どのように解釈しますか?

| 入力 | 出力 | 状態 |
|---|---|---|
| `**bold**` | `<strong>bold</strong>` | ✓ 対応 |
| `*italic*` / `_italic_` | `<em>italic</em>` | ✓ 対応 |
| `__double__` | `<strong>double</strong>` | CommonMark 規定で strong |
| `~~strike~~` | `<s>strike</s>` | ✓ 対応 |
| underline | (なし) | **未対応** |

下線は CommonMark 標準に存在しないため未対応。**Word / PPT export
ビジョン** + **strip-dialect** を踏まえ、roadmap 領域 6 を改訂し:

- 構文候補は **`++text++`(Pandoc 互換)** を有力候補として記載
- 全方言拡張に **3 つの設計原則** を適用:
  1. Word/PPT primitive への 1:1 写像可能
  2. CommonMark に strip 可能(マーカー削除で中身保持)
  3. forward-compat(無効 reader でも中身読める)
- 構文候補表(下線 / align / page break / 折りたたみ / image size /
  caption / 罫線 / 表 align)を Word/PPT 写像 + strip 後の見え方と
  併記
- export 経路(docx / pptx 生成)を将来 PR として明記
- strip-dialect 経路(`stripDialect(md): string`)を中規模 PR として
  明記

詳細は `docs/development/feature-requests-2026-04-28-roadmap.md` 領域 6。

## 4. 後方互換性

- 既存の Tab handler(textarea で `\t` 挿入)は不変
- 既存の inline-calc / quote continuation は plain Enter で動作続行
  (PR #198 helper は明示的に譲る)
- 既存の paste / drop / Ctrl+Enter は不変
- bundle.js +1.6 KB / bundle.css 不変

## 5. v3 追加(2026-04-29、ユーザー追加要望)

ユーザー追加要望:
> 継続補完中の改行後、タブキーもしくは半角空白で字下げ補完して
> あと、複数行選択してタブキーでまとめて字下げしたい

### `handleEditorTab(ta, shiftKey): boolean`

優先順:
1. **Multi-line selection** → 各行に `INDENT_UNIT`("  ")prepend(Tab)/
   除去(Shift+Tab)。selection 維持で反復押下対応
2. **Empty list slot**(`- ` / `1. ` / `- [ ] ` の末尾)→ marker ごと
   indent。Shift+Tab で outdent
3. **その他** → false で既存 `\t` insert に譲る

### `handleEditorSpaceIndent(ta): boolean`

Empty list slot のみで発火。それ以外は通常 Space 入力。iPhone/iPad で
hardware Tab が出にくい環境向け。

### `tryHandleEditorKey` 順序

Tab / Space を Enter / 括弧より優先 → 既存ハンドラとの干渉なし。

### action-binder 順序入れ替え

markdown 分岐を **既存 Tab `\t` insert より前** に移動。markdown field
で list / multi-line に該当しないとき false 返却で既存 `\t` insert
継続、非 markdown field は markdown 分岐自体を skip。

### 追加テスト(48 件、+20)

- `handleEditorTab` 11 件:empty list slot / ordered / checkbox /
  plain で false / content ありで false / Shift+Tab outdent / root で
  false / multi-line indent / outdent / 部分 outdent / single-line
  selection で false
- `handleEditorSpaceIndent` 4 件:empty list / content ありで false /
  plain で false / selection で false
- `tryHandleEditorKey` 追加 5 件:Tab list / Tab multi-line / plain
  Tab false / Space empty list / plain Space false

## 6. 未対応(roadmap 領域 4 続編)

- **コードブロック(fence)補完**:`` ``` `` 入力 / Enter で fence 全体
  scaffold 補完(`` ```\n|\n``` ``)。**未実装**(ユーザー確認済)。
  iPhone/iPad snippet toolbar と同じ PR で対応予定
- **iPhone / iPad スニペットツールバー**:バッククォート / fence /
  ペア括弧 等のボタンを編集中 textarea に表示。別 PR
- **下線 / その他 markdown 方言**:roadmap 領域 6 で別 PR シリーズ
- **Word / PPT export 経路**:roadmap 領域 6 後半、docx / pptxgenjs 経由
- **strip-dialect 関数**:領域 6 と並走可

## 7. Files touched

- 新規: `src/adapter/ui/editor-key-helpers.ts`(~190 行)
- 修正: `src/adapter/ui/action-binder.ts`(import + keydown 内分岐、
  ~25 行)
- 修正: `docs/development/feature-requests-2026-04-28-roadmap.md`
  (領域 6 改訂、Word/PPT export ビジョン + strip-dialect + 構文候補表)
- 新規: `tests/adapter/editor-key-helpers-pr198.test.ts`(28 件)
- 新規: `docs/development/editor-key-helpers-pr198-findings.md` (this doc)
