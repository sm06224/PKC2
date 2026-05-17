---
notation: pkc-markdown-1.0
title: PKC2 Reform Phase 1 総合ストレステスト
author: AI-Test-Generator
vars:
  project_name: "PKC2"
  milestone: "2026-05 Reform"
  status: "Testing"
---

# 1. 基本装飾と新構文の混在

__この段落は字下げ（L-9）から始まります。{{vars.project_name}} のテストです。
__次は圏点（L-2-c）のテスト：^^ここが重要^^ です。
__ハイライト（L-2-a）の色指定テスト：==[red]赤==、==[#00ff00]緑==、==[rgb(0,0,255)]青==。

_2

|| この段落は中央寄せ（R-C: center）です。
|> この段落は右寄せ（R-C: end）です。
<| これも end に正規化されるはずです。
|< これも end。
>| これも end。

_

# 2. 引用（R-D）と図表（L-7）の連携

:::quote{author="System Architect" year=2026 source="internal-doc"}
PKC2の独自拡張は、LLMによる生成と人間による編集の双方を最適化するために設計されている。
特に :::if ブロックによる条件付きレンダリングは強力である。
:::

:::figure{#fig-test}
![test-image](pkc://asset/test-diag.png)
^^^ 図1: フィクスチャの構成図
:::

__詳細は [@fig-test] を参照。この参照が正しく「図 1」と展開されるか確認してください。

_

# 3. インラインロール（R-E）と Simple Inline（L-6）

__数式テスト：E = mc:sup:[2]、H:sub:[2]O。
__汎用スパン：:span:[警告テキスト]{class=warn #err-01 data-type=critical}。
__Simple Inline（L-6）との共存テスト：
- :太字赤大:bold,red,lg:
- :背景黄色:bg-yellow,black:
- :150%サイズ:150%:

_

# 4. 条件付きブロック（R-F）

:::if{format=html}
> **Note**: このセクションは HTML レンダリング時のみ表示されます。
:::

:::if{format=docx}
このテキストは Word エクスポート時のみ表示され、HTML では完全に消去（空行置換）される必要があります。
:::

:::if
format 指定なしの if ブロック。常に表示されます。
:::

_

# 5. エッジケース・ストレステスト

## 5.1 ネスト構造
:::if{format=html}
:::quote{author="Nested Author"}
if ブロックの中にある引用ブロックです。
:::
:::

## 5.2 閉じ忘れ・タイポへの耐性
:::quote{author="No Close"
閉じ括弧や閉じ ::: がない場合、EOF までを内容として取り込むパーサーの寛容性をテストします。

## 5.3 コメント（L-4）
%% このインラインコメントは消えるべき %%
%%%
このブロックコメントも
レンダリング後の HTML には
一切残らないはずです。
%%%

## 5.4 未定義変数
{{vars.undefined_key_test}} 
（↑ 赤点線で警告が出るのが正解）

_3

|> テストデータ生成：Gemini (2026-05-10)
