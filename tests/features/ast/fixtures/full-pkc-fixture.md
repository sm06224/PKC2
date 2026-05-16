---
title: PKC2 全拡張記法 4 surface 可換性 fixture
author: Claude (PR-W14)
date: 2026-05-16
layout: a4-1col
notation: pkc-markdown-1.0
vars:
  product_name: PKC2
  version: v2.3.0
  release_date: 2026-05-15
---

# 序章 fixture の目的

本文書は **PKC2 markdown の AST 対応済記法** を 1 つの entry に詰めて、各 export surface(HTML / DOCX / PPTX / PDF)で **可換性** がどこまで担保されているかを視覚的に検証する fixture です。

各記法は AST kind に対応し、export 側は **AST から解釈** することで native rendering を実現します。string regex 等の symptom 緩和は使いません。

## 基本 inline 強調

通常段落に **bold** / _italic_ / ~~strike~~ / `inline code` を混在させます。

PKC 拡張 inline:==marked text== / ..em-dot.. / [[ruby:漢字|かんじ]] / %%hidden text%% / {{vars.product_name}} {{vars.version}} ({{vars.release_date}} release)。

外部 link は [GitHub](https://github.com) のように、内部 link は [本書冒頭](entry:self) のように。

### 章節項階層 H3 + auto-numbering

#### H4(箇条書き化)

##### H5(カタカナ)

###### H6(英字)

# 第二章 ブロック構造

## リスト

順序リスト:

1. 第一項目
2. 第二項目
3. 第三項目

箇条書き:

- 項目 A
- 項目 B

task list(空 + 本文付き):

- [ ]
- [ ] 担当者:期日:
- [x] 完了済タスク

## 表

| 観点 | A 案 | B 案 |
| --- | --- | --- |
| **コスト** | _安_ | _高_ |
| 期間 | `90 日` | ~~120 日~~ |
| 結論 | ==採用== | 見送 |

CSV fence:

```csv
品目,数量,単価
りんご,3,150
みかん,5,100
ぶどう,2,400
```

## 引用 + author attribution

:::quote{author="Donald Knuth"}
Premature optimization is the root of all evil.
:::

## section role(callout box)

:::section{role=warning}
警告:この操作は不可逆です。実行前にバックアップを取ってください。
:::

:::section{role=note}
注記:章番号は自動採番、手書き prefix も認識します。
:::

:::section{role=info}
情報:本 fixture は AST kind 対応済記法を網羅する目的で作成されました。
:::

:::section{role=tip}
ヒント:`/tmpXX` で template を slash menu から挿入できます。
:::

## conditional content(format 判定)

:::if{format=html}
本ブロックは **HTML render でのみ** 表示されます(center pane + Viewer popup)。
:::

:::if{format=docx}
本ブロックは **DOCX export でのみ** 表示されます(Word / LibreOffice)。
:::

:::if{format=pptx}
本ブロックは **PPTX export でのみ** 表示されます(PowerPoint)。
:::

# 第三章 高度な構造

## figure + caption + cross-ref

:::figure{id=fig-arch}
本図は PKC2 アーキテクチャ全体図(後続段で `[@fig-arch]` で参照されます)
:::

本図の詳細は [@fig-arch] を参照。

## footnote

PKC2 は AST commutative IR を導入[^ast-ir] + 各 format で AST 経由 render[^native]。

[^ast-ir]: `docs/spec/ast-commutative-ir.md` 参照、PR-2JJ v2 で確立。
[^native]: ruby / footnote / section role は AST 経由 native 実装、symptom 緩和なし。

# 第四章 break

通常段落の前。

---

通常段落の後(`---` で水平線、`AstBreak(kind=rule)`)。

# 第五章 終端

最終段落です。本 fixture は **AST 対応済 PKC 拡張** を網羅しています。

各 export surface(HTML / DOCX / PPTX / PDF)で、上記すべての記法が **AST から解釈されて** visible / native render されることが期待されます。

未対応の記法一覧は `docs/development/full-pkc-fixture-audit-2026-05-16.md` を参照。本 fixture には未対応記法を混入させない方針(literal 残り 0 件を目指す)、後続 PR で順次 native 化。
