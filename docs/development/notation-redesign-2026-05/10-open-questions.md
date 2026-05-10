# 10. Open Questions(未決定事項リスト + レビューチェックリスト)

## 10.1 章別の未決定事項集約

各章に散らばっている open question を一覧化、レビュー / 議論 / 決定の起点とする。

### 00. Overview

- 4 設計原則(simple-first / hierarchy / security / IR)の優先順位は等しいか?conflict 時の判断基準は?
- PKC2 vision の「modern emacs」「AI 第一級」「single HTML offline」3 軸のうち、本記法整理が最も強化するのはどれか?

### 01. Notation Catalog

- catalog で漏れている記法 / 機能はあるか?(書籍・出版系、学術・引用系、編集系、国際化系、モバイル特化系、アクセシビリティ系)
- IR ノード定義(各 markup の `kind`)に追加すべきフィールド / attribute は?
- 50+ 記法という規模は PKC philosophy(simplicity)と整合しているか?もっと削るべき記法は?

### 02. Frontmatter

- `direction` を初期 spec 化する判断は十分か?未対応で起きうる将来コストとどう trade-off するか?
- `writing` × `align` 直交設計 vs 単一 enum、別 design pattern(CSS の 3 軸独立)は適切に映されているか?
- logical vs physical align、`|>` simple = logical end は user 直感に合うか?
- `vars` limits、他システム(Obsidian / Hugo)の frontmatter 限度との比較
- forbidden keys に追加すべき key は?(`toString` / `valueOf` / `hasOwnProperty` 等)
- backmatter / property drawer / shadow_references を実装すべき優先順位

### 03. Link/Embed/Card

- default seamless の判断、本当に頻度高は seamless か?引用 chrome がほしい用途 default 化反論はあるか?
- `{quote}` attribute syntax、Pandoc / Quarto と整合か?他 syntax(`>!` prefix 等)の判断基準
- `:::quote` block group の attribute、追加すべきもの(e.g. `cite-style="apa"` `quote-type="block|inline"`)
- archetype 別動作:TODO embed を chrome 維持 vs seamless 化、他 archetype 漏れ
- migration:既存 entry に対する自動変換 / warning 運用 mode、user 影響 minimize 戦略
- 4 段階 spectrum で表現しきれない 5 段階目はあるか(side-by-side 比較、tab 切替 等)?

### 04. Comment/Footnote

- comment と footnote の unified 化判断、user 構造的洞察が技術的にも妥当か?分離していた方がよい場合の判断基準
- `%%[fn]%%` syntax の学習しやすさ、他 form(`%%fn:text%%` colon-separator)を考えるべきか
- `^[` と `^^` の非衝突、edge case parser ambiguity は?
- Pandoc 互換 `[^id]:` definition、同 entry 内 どこに書ける / 本文末限定?
- footnote の中で markdown 使えるか(`%%[fn] **bold** や [link](url) %%` 解釈)
- 複数行 footnote、継続行の indent 揃え?それとも `%%[fn] line1\nline 2 %%`?
- 既存 `%%hidden%%` user 影響、attribute syntax 導入の意図ズレリスク

### 05. Math/Bundle

- KaTeX 採用判断、他選択肢(MathJax / native MathML / typst)優位性はないか?
- font subset 5 family、漏れ用途(物理 / 化学 / 工学)、完全 font 提供 flag を初期から?
- bundle.css budget bump 512 → 1024 KB の妥当性
- `$10` disambiguation、GitHub rule edge case 漏れ
- superscript / subscript 削除判断、user 想定が学術系に偏った時の破綻
- system asset bundle architecture、将来 font / binary 追加時の拡張容易性
- 6 surface 全部で同 KaTeX 経路、build asserter での verify 機構

### 06. Code Block Ecosystem

- Renderer Registry pattern、新 renderer 追加時の scalability
- bundle 累計(Phase A-F で +800-900 KB)の deploy / user 体感影響
- PKC2 killer feature(query / cards)の戦略判断、Notion / Roam 対抗の差別化要素
- Phase 順序、A → B → C(math) → D(killer) は最適 vs D 先行
- 未収録 renderer:catalog から漏れた戦略性高いもの
- 共通 chrome の機能 set、追加すべきもの(fullscreen / re-render / export to image)
- security cap の厳格性、攻撃 vector の見落とし

### 07. Security

- HTML 完全 off の判断、`<details>` `<summary>` 需要への formal `:::details` 代替
- URL allow-list、`magnet:` / `ipfs:` / `dat:` 等の許可
- cap default 値の妥当性(code fence 64 KB / table 1000 rows / list 1000 items 等)
- silent fail 禁止の実装、テスト test カバレッジ
- trust boundary、container import 時の cap 再適用 UI
- SRI 採用、user 利用 flow との整合
- build-time asserter、追加 check 項目

### 08. IR Mapping

- AST 形の表現力十分か、後で困るパターン
- 可換性保証、simple ↔ formal round-trip test
- format 別射影 matrix、各 format の lossless 目標 vs lossy 妥協
- 不変条件 / cap、超過時 fallback の user-friendly 度
- 編集 UX 連動、IR re-index コスト
- 10-3 wave(IR audit)との接続整合

### 09. Migration

- breaking change 優先順位、Phase 3(embed default seamless)の早期 vs 後段
- migration tool 設計、dry-run / apply 運用 UX
- deprecation period(暖機期間)
- bundle 累計、deploy / load 時間影響
- 既存 PR(#382 / #383)の扱い、reform-aligned 再 design vs close + 新 PR
- Phase 並列性、依存関係厳密化
- release strategy、v2 release timing(Phase 4 / 7 / etc.)

## 10.2 reform 議論で resolved な事項

Gemini / ChatGPT / Claude review + user 議論で確定した方針:

| # | 領域 | 結論 |
|---|------|------|
| R1 | profile system | **採用**(user 提案、`notation: pkc-markdown-1.0` 等を frontmatter で declare、Flags 上書き可)|
| R2 | profile default | **`pkc-markdown-1.0`**(普通 user は frontmatter 触らない前提、最新 spec が default)|
| R3 | hard cap | **2 層構造**(HARD_CEILINGS + SOFT_DEFAULTS、`src/runtime/caps.ts` で集中管理、Power user は source 書き換え可)|
| R4 | IR 早期実装 | **defer**、本 reform は source-based、IR は spec のみ、persist / consume 実装は post-reform 別 wave |
| R5 | cross-PKC 交換 | **profile metadata + warning + 再 parse**(IR-based lossless 交換は post-reform)|
| R6 | 廃止記法 | `[[ruby:..]]` `[[em:..]]` `<\|` `^x^` `~x~` 全廃止確定 |
| R7 | embed default | seamless 確定(major breaking、`{quote}` で chrome 取り戻し可)|
| R8 | superscript / subscript | native 削除、math `$x^2$` `$H_2O$` に集約確定 |
| R9 | comment + footnote | unified 確定(可視性 attribute で differentiate)|
| R10 | iframe sandbox | 不採用確定 |
| R11 | KaTeX bundle | 完全 bundle、CDN 不可、初の system asset bundle 確定 |
| R12 | naming | **PKC Markdown** = spec、**PKC2** = reference implementation、用語分離 |
| R13 | 他 repo implementation | 将来あり得る前提、spec を portable に書く |
| R14 | parser library 化 | post-reform 別 wave、`@pkc/markdown` 独立パッケージ候補 |

## 10.3 user 確認待ち事項(残)

最終確認を要する判断:

| # | 領域 | 質問 | 私の推奨 |
|---|------|------|---------|
| Q1 | KaTeX font subset | 5 family で十分か、完全 18 family を採用? | 5 family subset 推奨、完全版は flag |
| Q2 | code block Phase 順序 | A → B → C → D vs D 先行 | A → B → C → D(基盤先)|
| Q3 | 教材系(quiz / flashcard) | 採用 / 不採用 | defer、user 需要明示後 |
| Q4 | 既存 PR #382 / #383 | reform-aligned 再 design vs close + 新 PR | reform 確定後に判断 |
| Q5 | release timing | v2 release を Phase 4 / 7 / 9 のどこに? | Phase 7 完了時(killer feature 揃う)|

## 10.4 AI レビュアーへのチェックリスト

### 10.4.1 技術的妥当性

- [ ] 各記法の simple / formal 形が parser 衝突なく区別可能か?
- [ ] IR AST type で表現できない markup はないか?
- [ ] 可換性(simple ↔ formal ↔ IR の round-trip)が成立するか?
- [ ] cap / hard-limit の数値が現実的(狭すぎ / 広すぎでない)か?
- [ ] HTML pass-through 完全 off による機能制約は許容範囲か?
- [ ] KaTeX bundle のサイズが「single HTML」原則と矛盾しないか?
- [ ] Renderer Registry architecture が Pandoc / MyST 等の prior art より明確に良いか?
- [ ] format 別射影(HTML / Word / LaTeX / Org / Anki)の lossless / lossy が現実的か?

### 10.4.2 運用的妥当性

- [ ] migration tool で既存 entry を機械変換できるか(廃止記法系)?
- [ ] breaking change の影響範囲が user に伝わる UI(inspector warning 等)があるか?
- [ ] Phase 順序で user に「中途半端」な状態が長く続かないか?
- [ ] 各 Phase 完了時に独立 release 可能か?
- [ ] user 学習コスト(50+ 記法、formal layer 含む)が PKC philosophy と矛盾しないか?
- [ ] AI emit の experience が改善するか(現状 vs reform 後)?
- [ ] 廃止記法の deprecation period が短すぎ / 長すぎないか?

### 10.4.3 PKC2 哲学整合

- [ ] simplicity:50+ 記法は多すぎでないか?primitive 統合(comment + footnote 等)以外に削減余地は?
- [ ] single HTML offline:KaTeX bundle ~480 KB が完全 offline 維持に整合?
- [ ] AI 第一級:formal 記法 + Pandoc / KaTeX 互換で AI emit 友好性が向上?
- [ ] IR-native:全記法が IR への lossless mapping を持つか?
- [ ] 破壊的変更を厭わない:変更が simplicity / 整合性のために真に必要か?

### 10.4.4 代替案検討

各章の major 判断について「他案がないか」確認:

- 二層化 frame: simple-first vs formal-first vs 別 framing
- 階層優先: prefix > wrapping > indent > fence vs 別優先
- inline / block 切替 3 ルール: 別 pattern
- math: KaTeX vs MathJax vs typst vs native MathML
- code block ecosystem: Renderer Registry vs plugin system vs 別 architecture
- comment + footnote unified vs 分離

### 10.4.5 欠落 / 未議論

- 編集 UX(autocomplete / hover / lint)の実装方針
- mobile 特化(IME 連動、tap-friendly)の考慮
- アクセシビリティ(ARIA / screen reader / keyboard nav)の網羅
- collaborative editing(同時編集、CRDT 等)の前提
- 大規模 entry(1 entry = 100,000 chars)の体感性能
- 多言語(中文 / 韓国語 / 印欧諸語の typography 細部)対応の網羅
- バックエンド連携(extension protocol、AI provider 連携)の影響

## 10.5 レビュー終了条件

レビュアーが以下を満たした報告を user に返したら、本 doc set 確定 → 実装 wave 開始:

1. 全 10 章を読了
2. §10.1 〜 §10.3 のチェックリストを通過(または合理的な指摘 / 修正提案を提示)
3. §10.2 の Q1〜Q10 全部に対する明示的判断 / 推奨
4. PKC2 哲学整合の総合評価(◯/△/× の 3 段階 + 理由)
5. 重大な欠落 / 未議論 領域の指摘(§10.3.5 補完)
6. Phase 計画の現実性評価

## 10.6 レビュー後 action

レビュー結果に応じて:

- **major issue 発覚** → 該当章を revise、再レビュー
- **minor issue** → user 判断で修正 or note 追記
- **issue なし、合意** → 既存 doc supersession + 実装 wave 開始
- 既存 PR(#382 / #383)の扱い決定(close + 新 PR or reform-aligned 再 design)
- `docs/spec/markdown-dialect-for-ai-authors-v2.md` 起こし(AI 向け規約書 v2)
- Phase 1 着手(formal 記法導入 + 共通基盤)

## 10.7 レビュアーへの最終 note

本 doc set は PKC2 全 markup の **設計仕様(spec)** であり、user 議論で段階的に確定した結果を反映しています。各判断点には複数の代替案があり、別の AI(reviewer)による独立評価で:

- 私(Claude、PKC2 implementer + auditor)の盲点
- user(知識管理 tool 利用者視点)とは異なる layer の視点
- prior art(Pandoc / MyST / Obsidian / Notion / etc.)への照合における精度
- 技術的 risk(parser ambiguity、security 抜け穴、performance)
- 運用的 risk(migration coverage、deprecation period、user 学習)

を identify してもらうことが目的です。

「reform 全体 OK で実装着手 OK」「特定章 revise が必要」「全体 frame の見直し必要」のいずれかを明示的判断付きで返してください。

レビュー、ありがとうございます。
