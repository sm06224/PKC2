# 15 PKC Hint 機構(設計 + 既存実装の一覧)

PKC2 が parse / render の途中で「気づいたこと」を user に伝える仕組みです。本章では:

- ✅ **既に実装されている** hint 5 種(`{{vars.X}}` 未定義、`_N` cap、orphan footnote、malformed `:::role{`、dangling `[@id]`)
- 🚧 **未実装の統一設計**(`AstHint` schema、4 階層 opt-out、code block render-available 誘導 等)

を一望できます。

---

## 15.1 motivation

PKC2 は **「user が書いたものを失敗させない」** 寛容 parse + **「未定義 / 不整合に気づいたら見える形で警告」** doctrine です。例えば:

|> _「{{vars.undefined_key}}」と書いたら → `[未定義: vars.undefined_key]` と赤 italic で警告表示。silent fail はしません。_

このように「**PKC が気づいた事象を user に伝える**」case が複数あり、現状は **各機能が独立に実装** しています。本章では:

- どの hint が **既に動いている** か
- 統合計画(未実装、設計のみ)

を整理します。

## 15.2 ✅ 実装済 hint 5 種(2026-05-16 時点)

### 15.2.1 未定義変数

```markdown
本文中で {{vars.unknown_key}} を参照。
```

→ render 結果は `[未定義: vars.unknown_key]`(docx で赤 italic + 警告色 `#DC2626`)。

frontmatter `vars` に key を追加すれば展開:

```yaml
---
vars:
  unknown_key: "値"
---
```

### 15.2.2 `_N` blank-line cap

```markdown
_100
```

→ N>50 は cap される + visible note `[blank-line cap: 100 → 50]` を docx に注入。50 行ぶんの blank paragraph + 警告 note。

### 15.2.3 orphan footnote(定義なし参照)

```markdown
参照 [^x] のみで定義がない。
```

→ literal `[^x]` superscript text として残置(docx FootnoteReferenceRun に変換されない)。spec L-tolerant fallback。

### 15.2.4 malformed `:::role{...`(`}` 閉じ忘れ)

```markdown
:::quote{author="No Close"
本文 ...
```

→ role-only opener として採用、attrs は drop。content は EOF まで or 次の `:::` closer まで吸収(`docs/development/parser-recovery-spec.md` 寛容 parse doctrine)。

### 15.2.5 dangling auto-ref(`[@id]` で id が存在しない)

```markdown
存在しない figure を [@fig-undefined] で参照。
```

→ `@fig-undefined` literal text として render。図 / 表に対応する id が見つからないことを暗示。

## 15.3 🚧 統一機構 `AstHint`(未実装、設計のみ)

### 15.3.1 schema

:::section{role=info}
本節以降は **設計提案**(`docs/development/pkc-hint-mechanism-2026-05-16.md`)です。実装は wave Z 後の候補。
:::

```typescript
interface AstHint {
  id: string;                          // 'undefined-var' / 'render-available' / 'orphan-footnote' 等
  severity: 'info' | 'suggestion' | 'warning' | 'error';
  message: string;                     // 日本語 short message
  anchor: { line?: number; nodeId?: string; parentKind?: string };
  actions?: HintAction[];              // 'apply-attr' / 'navigate' / 'dismiss' 等
}
```

各機能(現在は 5 種ごとに別経路)を全部この `AstHint` で emit、`AstDocument.hints[]` に集約。

### 15.3.2 統一 UI

severity 別の visual:

- `info` ℹ️(blue italic、`#3B82F6`)
- `suggestion` 💡(green dashed underline、`#10B981`)
- `warning` ⚠️(orange dotted underline、`#FB923C`)
- `error` 🛑(red dotted underline、`#DC2626`)

block-level hint(code block 等)は **overlay button**:

```
┌─[csv]──────────[💡 表として render ▶]─[✕]─┐
│ name,age,role                              │
│ Alice,30,admin                             │
└────────────────────────────────────────────┘
```

クリックで `{render}` attrs を MD source に挿入 → persistent に rendered 状態に。

### 15.3.3 opt-out 4 階層(default ON)

| Tier | 場所 | 効果範囲 | 永続性 |
|---|---|---|---|
| 1. Per-instance dismiss-once | hint の `[✕]` button | その 1 件のみ | session(reload で復活)|
| 2. Per-instance dismiss-forever | `[✕]` 長押し | 同 entry 内の同 id hint 全件 | entry 永続化 |
| 3. Per-doc opt-out | frontmatter `pkc-hints: off` または `pkc-hints: { disable: [render-available] }` | doc 全 hint or 特定 id | frontmatter persist |
| 4. Global opt-out | settings UI「PKC hint 表示」toggle | user 全体 | `system.pkc.hints.*` flag |

優先順位 **1 > 2 > 3 > 4**。default は全 hint ON(機能発見性最大化)。

### 15.3.4 code block ブルーオーシャン戦略(render-available 誘導)

GFM 互換性を保ちつつ、PKC2 独自 renderer(`tree` / `dbschema` / `query` / `cards` / `mermaid` 等)を **暴発させずに誘導**:

|> _user が GFM の ` ```tree ``` ` (tree コマンド出力)を貼っても、auto-render しない。「render しますか?」と hint で誘導する形。_

動線:

1. `` ```csv `` / `` ```tree `` 等、認識可能 lang を検出
2. code block chrome に **小さな button「💡 表として render」** を表示
3. クリック → MD source に `{render}` attrs を挿入(persistent)+ render に切替
4. dismiss(once / forever)で button を非表示にする option

これにより:

- GFM `` ```tree ``` ` 貼り付け → 暴発しない(default plain)
- 試したい時 → ワンクリックで render
- 別 entry に貼付 → `{render}` attrs が同伴して同じ render(intent が AST に保持)

### 15.3.5 完了済 record と未実装 record

| record | status |
|---|---|
| `undefined-var` hint(`[未定義: X]`)| ✅ docx 実装(PR-W24) |
| `blank-line-cap` hint(`[blank-line cap: N → 50]`)| ✅ docx 実装(PR-W24) |
| `orphan-footnote` literal fallback | ✅ docx 実装(PR-W18) |
| `malformed-block-attrs` 寛容 parse | ✅ AST 実装(PR-W24) |
| `dangling-ref` literal fallback | ✅(自然な fallback) |
| 統一 `AstHint` schema | 🚧 設計のみ |
| 4 階層 opt-out | 🚧 設計のみ |
| Code block render-available 誘導 | 🚧 設計のみ |
| Tier 3-5 各種 renderer(`tree` / `dbschema` / 等)| 🚧 spec のみ([`docs/development/notation-redesign-2026-05/06-code-block-ecosystem.md`](../development/notation-redesign-2026-05/06-code-block-ecosystem.md)) |

詳細は [`docs/development/pkc-hint-mechanism-2026-05-16.md`](../development/pkc-hint-mechanism-2026-05-16.md) を参照。

---

## 15.4 関連章

- [12 マークダウン拡張記法](./12_マークダウン拡張記法.md) — 既存 hint が active になる context
- [13 アプリランチャーと出力機能](./13_アプリランチャーと出力機能.md) — docx / pptx 出力で hint がどう visible か
- [14 テンプレートコマンド集](./14_テンプレートコマンド集.md) — テンプレート使用時の hint(該当少)
