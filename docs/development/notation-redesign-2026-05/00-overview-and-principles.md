# 00. Vision と設計原則

## 0.1 Vision

PKC2 は「**modern emacs / org-mode** + **AI 第一級市民** + **single HTML offline**」を 3 軸とする知識コンテナ。本記法整理は、この vision を支える「**人間と AI が同じ source を読み書きできる、ブルーオーシャンな markdown 方言**」を確立することを目的とする。

### 0.1.1 PKC Markdown と PKC2 の関係

本 doc set は **PKC Markdown(notation / spec)** を定義する。**PKC2** は PKC Markdown の reference implementation で、単一 HTML offline 形態を提供する。

将来的には:

- **`@pkc/markdown` 独立 npm パッケージ**(parser / renderer のみ、PKC2 内部依存なし)
- **PKC ecosystem 横展開**(mobile / CLI / server stack 等)
- **3rd party tooling**(Pandoc filter、Obsidian / VS Code plugin 等)
- **AI tools の native PKC Markdown 対応**

これらが他 repo で実装される可能性があり、本 spec は **portable な形** で書く(implementation 詳細を spec に混入させない)。

具体的には:

- **人間**は普段の文書作成(議事録 / 計画 / 思考 logging / 学術 note / 設計 doc)で短くて読みやすい記法で書ける
- **AI**(LLM)は同じ意味を厳密で曖昧性のない記法でも書ける(emit 用に最適)
- 両者は **可換**(simple ↔ formal が同じ IR ノードに正規化される)
- **HTML pass-through を一切受け付けず**、injection 攻撃面 / parser DoS を構造的に閉じる
- IR は将来 **format 横断**(HTML / Word / PPT / PDF / LaTeX / Org / etc.)の起点になる

PKC2 は **「Knowledge Block ecosystem の旗艦」** として、code block を含む全記法を整理し、追加 / 拡張容易な architecture を持つ。

## 0.2 4 つの設計原則

### 原則 1:simple-first(formal は機械 emit 用 serializer)

**simple 記法が一級市民、formal は機械が出力する serializable な等価形式**。可換性が成立すれば formal が "正典" である必要はない。

過去のドラフト(`notation-redesign-formal-simple-2026-05.md`)では「formal が canonical、simple は sugar」と framing したが、user 議論で逆転を確定:

- **simple 形が表現力としてファーストでなければならない** ── 人間が日常使う形が最も使いやすく、最も影響少なく書けること
- **formal は AI / 機械が emit する時の serialization** ── 厳密で曖昧性なく、属性 / metadata を完全に書き下すための形式
- **可換性**(commutativity)── simple ↔ IR ↔ formal の round-trip が必要だが、どちらかが優位というわけではない

### 原則 2:入力階層に従う(prefix/suffix > wrapping > indent block > wrapping block)

simple 記法の選定は、以下の順で **より低負荷な形を優先**:

| 階層 | 例 | 入力負荷 | 読みやすさ(plain text として) |
|------|-----|---------|----------------------------|
| 1. prefix/suffix | `# heading` / `> quote` / `- list` / `+++` | ★ 最低 | ★★ 高(行頭マーカーは読み流せる) |
| 2. wrapping(inline) | `**bold**` / `==hl==` / `[label](url)` | ★★ | ★★ 中(囲み記号は文中に visible) |
| 3. indent block | (該当例少)| ★★ | ★ 中(行頭 indent で群を表す) |
| 4. wrapping block(fence) | `` ```code``` `` / `:::name` | ★★★ 最高 | ★ 低(フェンス記号で本文が分断) |

**頻度との対応**:

- 頻度高 + 自然な prefix がある → 階層 1 で(`# heading` `> quote` 等)
- 頻度高 + prefix なし → 階層 2(`**bold**` `==hl==` 等)
- 頻度中 + multi-line 必要 → 階層 4 wrapping block(`` ```code``` ``)
- 頻度低 + 属性多い → 階層 4 のみ(`:::if{format=html}` 等)

**「普段使わないものは simple 記法を定めない」も許容**(formal-only で OK)。

### 原則 3:HTML pass-through 完全 off + 全記法 hard cap

**security は spec-level commitment**:

- markdown-it `html: false` を build-time asserter で固定、deviation 不可
- `<` `>` は literal 文字、tag 化なし。`<script>` 書いても `&lt;script&gt;` に escape
- 全記法に **size / depth / iteration cap** を spec 固定値で設定、超過は parse 中止 + 可視 warning(silent fail 禁止)
- `__proto__` / `constructor` / `prototype` を key に持つ frontmatter を reject(prototype pollution 防御)

詳細は `07-security-stance.md`。

### 原則 4:IR 互換(format 横断の前提)

PKC2 IR は将来の `intermediate-representation-audit.md` (10-3 wave) で確定予定。本記法整理は **IR への lossless 変換が成立する** ことを設計条件とする:

- simple 形と formal 形は **同じ IR ノードに正規化** される(可換)
- IR から各 format(HTML / Word / PPT / PDF / LaTeX / Org / Pandoc MD / Anki / etc.)への射影が定義される
- IR 上には node kind / attrs / 階層 / cap の **不変条件**(invariant)が固定

詳細は `08-ir-mapping.md`。

### 原則 5:Diff friendliness(reform-2026-05 Phase 2 追加、ChatGPT 提案 #9 受容)

PKC2 の formal canonicalization / attrs normalization / stable block structure は **Git semantic diff が安定する** 性質を持つ。これを設計目標として明示:

- canonical formal representation は token 順序 / attrs 順序 / whitespace を厳密化 → 同 entry を re-canonicalize しても diff = 0
- attrs は alphabetical order(`{author="X" id="Y" year=2020}` で一定)、normalize 不能なら warning
- block structure は意味単位ごとに行を分離(merge 結果が意味的に明示できる diff になる)
- AI 編集時の partial update / merge / repair が **意味単位で正しく解決される**

これは **AI 編集前提の知識構造フォーマット** としての PKC2 の重要な強み。Phase 2 以降の記法追加 / canonicalize 処理 / IR persist は、この原則を設計判断基準として参照する。

詳細は `11-canonicalization-spec.md`(Phase 2 PR-2I で起こす予定の章)。

## 0.3 PKC2 哲学との整合

| 哲学 | 本記法整理での具体化 |
|------|------------------|
| **Local-first / Single HTML offline** | KaTeX font 含む全 asset を base64 inline で単一 HTML 内包(原則 3、§05) |
| **Simplicity** | simple-first frame、最少 primitive 数(comment + footnote 統合 etc.)、不要記法削除可(`<\|` simple 廃止 etc.)|
| **AI 第一級** | formal 記法 + 標準 syntax 互換(Pandoc footnote、KaTeX math 等)で AI emit 友好 |
| **Tool 中立** | format 横断 export を前提に IR-native 設計、Word / PPT 出力も視野 |
| **破壊的変更を厭わない** | simplicity / 整合性のためなら既存記法廃止可(user 議論済) |

## 0.4 文書の position

本 doc set は:

- `docs/development/markdown-dialect-extensions-spec-2026-05.md`(wave-10-2 markdown spec、~1450 行)を **再構築 / supersede** する
- `docs/spec/markdown-dialect-for-ai-authors-v1.md`(AI 規約書 v1)を v2 に発展させる起点となる
- `docs/development/intermediate-representation-audit.md`(IR audit)と表裏一体、双方向参照
- 本 doc 確定後、wave-10-2 / wave-10-3 / wave-10-X(本記法整理 wave)の実装計画立案に進む

## 0.5 文書 set の章編成

| 章 | 概要 |
|----|------|
| **00 Overview**(本章) | vision、4 原則、用語、reading guide |
| **01 Notation Catalog** | 全 50+ 記法の一覧表(simple / formal / IR / 設計理由)|
| **02 Frontmatter** | document-level metadata、writing / align / direction / vars / limits |
| **03 Link/Embed/Card** | 4 段階 strength spectrum、seamless / quote 切替、scope 拡張 |
| **04 Comment/Footnote** | comment 系 unified、可視性属性、label、inline-attached |
| **05 Math/Bundle** | 数式記法、KaTeX 完全 bundle、system asset bundle architecture |
| **06 Code Block Ecosystem** | Renderer Registry、全 renderer spec(tree / dbschema / query / cards / mindmap 等) |
| **07 Security** | HTML 完全 off、全記法 cap、parser hardening |
| **08 IR Mapping** | IR AST 形、simple ↔ formal ↔ IR、format 別射影 matrix |
| **09 Migration Roadmap** | breaking changes、phase 計画、移行手順 |
| **10 Open Questions** | 未決定事項、決定基準、レビュー観点 |

各章は独立に読めるが、依存関係は:

```
00 (overview)
 ├─ 01 (catalog) ─ 全章の記法 reference
 ├─ 02 (frontmatter) ─ 03/04/05 が参照
 ├─ 03 (link/embed/card) ─ 06 が参照(query/cards renderer 等)
 ├─ 04 (comment/footnote) ─ standalone
 ├─ 05 (math/bundle) ─ 06 (math は Renderer Registry の住人)、07 (security)
 ├─ 06 (code block) ─ 03/04/05 全部を消費
 ├─ 07 (security) ─ 02/05/06 で参照
 ├─ 08 (IR) ─ 01/02/03/04/05/06 全部の出口
 ├─ 09 (migration) ─ 全章の breaking 確認
 └─ 10 (open questions) ─ 全章の未決定事項集約
```

## 0.6 設計判断の積み上げ過程

本 doc set は user との対話で段階的に構築された。主要な判断分岐点:

1. **二層化 framework**: formal-first ❌ → simple-first ✅(user 訂正、原則 1)
2. **階層優先**: prefix/suffix > wrapping > indent block > wrapping block(user 提示)
3. **inline / block 切替 3 ルール**: delimiter 倍化 / context-dependent / scope 拡張
4. **align prefix typo 寛容**: `|>` `<|` `|<` `>|` の 4 形を全部 end として正規化(user 提示)
5. **direction 初期 inclusive**: `direction: ltr` を default 値として最初から実装(user 提示「あとから追加は差別的」)
6. **superscript / subscript 削除**: KaTeX math `$x^2$` `$H_2O$` に集約(user 議論)
7. **KaTeX 完全 bundle**: CDN 不可(オフライン原則)、初の system asset bundle(user 提示)
8. **footnote = comment 統合**: 可視性属性で promote(user 提示)
9. **code block 拡張のブルーオーシャン位置付け**: Renderer Registry plugin-like architecture(user 提示)
10. **`__` indent 維持**: 視覚優先、`**` bold convention で `__` は実質空き(user 提示)
11. **ruby `[base|読み]` 短縮**: link `[](url)` と grammar 区別可(双方合意)
12. **em-dot `^^text^^`**: caret = 上方マーク、傍点 / 圏点を視覚一致で吸収(user 提示)
13. **comment 系の inline 直アタッチ `^[text]`**: Pandoc inline footnote 互換、`^^em-dot^^` と非衝突

レビュアーは各判断点で他の選択肢があれば提案歓迎。

## 0.7 next step(本 doc 確定後)

1. AI レビュー(本 doc set 全体)
2. User がレビュー結果を吸収、修正点を確定
3. `docs/development/markdown-dialect-extensions-spec-2026-05.md` を本 doc set 内容で書き直し / 削除
4. 実装 wave 計画書(本 doc set §09 を起点)を別 doc に展開
5. Phase 1 から段階的に実装開始(non-breaking 範囲から)
6. 既存 PR(#382 Split View / #383 YAML extension)は本 doc 確定後に **仕切り直し**(rebase / 内容更新 or 廃棄して新 PR)
