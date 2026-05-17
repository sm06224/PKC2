# PKC2 ユーザーマニュアル

PKC2 は「単一 HTML で動作するローカル完結型の知識コンテナ」です。このマニュアルは、PKC2 を日常的に使うための手引きです。

## このマニュアルの読み方

このマニュアルには 2 つの形があります。どちらも内容は同じです。

- **Markdown 版**: `docs/manual/*.md` — GitHub やエディタで直接読みたい方向け
- **PKC2 HTML 版**: `PKC2-Extensions/pkc2-manual.html` — PKC2 自身で開いて読みたい方向け（readonly。Rehydrate でご自身のワークスペースに取り込むこともできます）

## 対象読者

- PKC2 を個人の知識管理ツールとして使いたい方
- 開発者ではなく、ブラウザで HTML ファイルを開いて使う一般の利用者

PKC2 の内部設計や実装について知りたい開発者の方は、`docs/planning/00_index.md` を参照してください。

## 読む順序

### はじめて使う方

1. [01 はじめに](01_はじめに.md)
2. [02 クイックスタート](02_クイックスタート.md)
3. [04 エントリの種類](04_エントリの種類.md)
4. [05 日常操作](05_日常操作.md)

### 持ち出し・共有をしたい方

1. [07 保存と持ち出し](07_保存と持ち出し.md)
2. [08 運用ガイド — Export / Import / Rehydrate](08_運用ガイド_export_import_rehydrate.md)

### 困っている方

- [09 トラブルシューティングと用語集](09_トラブルシューティングと用語集.md)

### 操作を素早く知りたい方

- [06 キーボードショートカット](06_キーボードショートカット.md)

### 文章を書く方(Phase 1 Markdown 拡張記法)

- [12 マークダウン拡張記法](12_マークダウン拡張記法.md) — 行頭アライン / 段落字下げ / 空行マーカー / 圏点 / ルビ / 図表自動採番 / Rich コピー / AI 規約活用

### 自作 HTML ツールを PKC2 から起動 / AI に AST で渡す方

- [13 アプリランチャーと出力機能](13_アプリランチャーと出力機能.md) — HTML attachment をアプリ登録して新規ウィンドウ起動 / Data… メニュー(AST / Canonical / Pandoc / HTML / PDF / Word / PPT)/ 編集中のフォーマットツールバー / TEXTLOG のログ単位 Data…

### レイアウト template を使いたい方

- [14 テンプレートコマンド集](14_テンプレートコマンド集.md) — `/tmpXX` slash command による template 挿入 / default 14 件(memo / 公式 capture / **レイアウト系 8 件**= 報告書・プレゼン骨子・表中心・議事録・講義ノート・比較対照・2 段組・日報)/ コード + docx/pptx 実機レンダリング例 / 自前 template の追加方法

### PKC2 が「気づいた」事象の hint 機構が気になる方

- [15 PKC Hint 機構](15_pkc_hint_機構.md) — 未定義変数 / blank-line cap / orphan footnote / malformed `:::role{` / dangling `[@id]` の 5 種 hint(✅ 既に動いている)+ 統一 schema / opt-out 4 階層 / code block render-available 誘導(🚧 設計のみ、wave Z 後の候補)

## 全体目次

| 章 | タイトル | 内容 |
|---|---------|------|
| 00 | 索引 | このページ |
| 01 | はじめに | PKC2 とは何か、設計思想、できること・できないこと |
| 02 | クイックスタート | 入手からはじめてのエントリ作成まで |
| 03 | 画面とビュー | サイドバー・詳細ペイン・Detail / Calendar / Kanban ビュー・複数選択・DnD・toast |
| 04 | エントリの種類 | text / textlog / todo / form / attachment / folder（TODO 埋め込み含む） |
| 05 | 日常操作 | 作成・編集・削除・復元・タグ・関連付け・リビジョン・複数選択・DnD・コンテキストメニュー・別ウィンドウ・TEXT↔TEXTLOG 変換・一括読み込み |
| 06 | キーボードショートカット | 基本・編集・ペイン切替・サイドバー矢印移動・Calendar/Kanban 内移動 |
| 07 | 保存と持ち出し | IndexedDB と Export の概要・ZIP import 警告 |
| 08 | 運用ガイド | Export / Import / Rehydrate の詳細と典型シナリオ |
| 09 | トラブルシューティングと用語集 | 困ったときの対処と用語辞書 |
| 10 | ファイラ / グラフ / インベントリ | filer view 5 subset(explorer / contact-sheet / book-base / video-base / novel-base / inventory)+ 独立 graph view 4 mode + frontmatter Properties + 画像 PiP プレビュー + bookmarklet 取込 + サイドバー filer モード |
| 11 | Bookmarklet サンプル & アセット統合 | PKC-Message v1.1 capture profile の公式 sample(envelope / handshake / user-consent gate)+ 5 公式 site 実例(YouTube / niconico / なろう / カクヨム / Amazon)+ ローカルアセット(PDF / mp3 / mp4 / epub)を Bases UX で統合する設計 + epub reader 将来計画 |
| 12 | マークダウン拡張記法 | Phase 1 拡張 9 種(L-1 セクション / L-2 ハイライト・ルビ・圏点 / L-4 コメント / L-5 行頭アライン / L-6 簡易インライン / L-7 図表自動採番 / L-8 空行マーカー / L-9 段落字下げ)+ M-7 Variables(`{{vars.x}}`)+ **reform-2026-05 Phase 1+2**(`:::section{role=…}` / `:::comment` / `:::break` / `:::paragraph{align}` / formal inline 4 形 / `:caption:` / `:autoref:` / 寛容 parse + canonical hint log + admonition alias / `layout: a4-2col` 段組組版 / `` ```html-render `` iframe sandbox / em-dot nested inline)+ AI 規約書 v2 + Phase 3 以降の予告 |
| 13 | アプリランチャーと出力機能 | HTML attachment をアプリとして登録して新規ウィンドウ起動できる Launcher view + Data… メニュー(🧬 AST / Canonical / Pandoc / HTML を JSONL or Pretty で copy、📄 PDF / 📝 Word / 🎞 PPT の出力)+ 編集中の選択部に追従する PKC MD フォーマットパネル + TEXTLOG の各ログ行を右クリックして Data… 同等の操作(PR-2JJ v2、2026-05-13) |
| 14 | テンプレートコマンド集 | `/tmpXX` slash command による template 挿入 + default 14 件(memo / 公式 capture / **レイアウト系 8 件**= 報告書・プレゼン骨子・表中心・議事録・講義ノート・比較対照・2 段組・日報)+ 各 layout の markdown コード + docx/pptx 実機レンダリング PNG + 自前 template の追加手順(PR-W10、2026-05-16) |
| 15 | PKC Hint 機構 | PKC2 が parse / render 中に気づいた事象を user に伝える機構の完全カタログ。実装済 5 種(`{{vars.X}}` 未定義 / `_N` cap / orphan footnote / malformed `:::role{` / dangling `[@id]`)+ 統一 `AstHint` schema 設計(opt-out 4 階層、code block render-available 誘導の「ブルーオーシャン戦略」)|

## v2.3.0 の最近の改善(2026-05-16 時点、Wave Z 完了で確定)

v2.3.0 の Wave Z(W11〜W24 = 14 PR 連鎖)で、特に **文書出力(Word / PowerPoint)品位** と **PKC-Markdown 寛容 parse** が大きく前進しました。

### 文書出力(Word / PowerPoint)を業務文書品位に([13 章](13_アプリランチャーと出力機能.md))

- **dense web layout doctrine** — line-height 1.0(11pt 固定)+ font 10.5pt + margin 2cm 統一、業務文書らしく密度を上げて Word default の隙間を排除
- **段組組版**(frontmatter `layout: a4-2col` 等 9 種)— A4 / B5 / Letter / Legal × 1-3 段組を docx / pptx 両方で自動構築
- **bullet サイズ縮小** — 巨大 `•` を中点 `·` に置換、ぶら下げ(hanging)も詰める
- **表 cell padding 詰め + autofit** — content-driven 列幅、固定均等幅を撤廃
- **footnote が Word の真の脚注に** — `[^id]` が `FootnoteReferenceRun` + `Document.footnotes` API で page 下部 native footnote 領域に
- **figure caption / quote author / section role の native 表現** — `:::figure{#id} ... ^^^ caption :::` で「図 N: caption」auto-numbering、`:::quote{author="X"}` で末尾 attribution 段落、`:::section{role=warning}` で 8 role 別 callout box
- **数式 `$X$` / `$$X$$`** — docx で MATH_FONT(Cambria Math)+ italic で視覚区別、math-block は center align で displayed equation
- **ふりがな `[[ruby:漢字|かんじ]]`** — Word / PPT 両方で base + superscript rt の furigana 効果

### PKC-Markdown の寛容 parse + supreme invariant 確立([12 章](12_マークダウン拡張記法.md))

- **PKC MD = Rendered HTML 不変式** — 📋 PKC MD ボタンで copy したテキストを別 entry に貼っても、render 結果は元と完全同一(HTML deep-equal、AST も同一)
- **行頭 whitespace 寛容** — 全 marker(`__` indent / `||` align / `_N` blank / `+++` / `^^^` / `:::role`)は行頭の半角 sp / TAB / 全角 U+3000 を吸収して認識
- **AI hallucination tolerance** — AI が hallucinate しがちな形(`:::note` / `:::callout{type=warning}` 等)を canonical 形へハンドオフ寛容、console.info で hint
- **malformed 寛容** — `:::quote{author="No Close"`(`}` 閉じ忘れ)でも role-only + EOF まで content として取り込む
- **色ハイライト 3 形** — `==[red]X==` / `==[#0f0]X==` / `==[rgb(0,0,255)]X==`
- **L-6 Simple inline** — `:太字赤:bold,red:` 等で CSS class 風指定
- **PKC Hint 機構の設計**([15 章](15_pkc_hint_機構.md)、実装済 5 種 + 統一機構 design)

### 左ペイン / Filer 改善

- **多階層 sort 実装** — 各階層内で folder 優先 + primary key sort + 再帰、章エントリと埋め込み画像が混在しない
- **ASSETS folder 自動 grouping**(manual 内蔵 sample)— 埋め込み画像が左ペインに散在せず ASSETS folder にまとまる

> 開発側の詳細は `docs/release/CHANGELOG_v2.3.0.md` の Wave Z final / Wave Z.4 / Wave Z.3 / Wave Z.1 各 section を参照。本マニュアル §12.8(Wave Z 完了内容)で記法レベルの達成状況、§15(PKC Hint 機構)で未実装設計を確認できます。

## 見本エントリについて

このマニュアルの HTML 版には、PKC2 の各 archetype（エントリの種類）の「見本エントリ」が同梱されています。左サイドバーの **見本** フォルダから確認できます。

- 期日付き / 期日なしの Todo
- タイムスタンプ付きの TextLog
- Form の入力サンプル
- 子エントリを持つ Folder
- 画像とテキストの Attachment

Calendar ビューや Kanban ビューに切り替えると、Todo 見本がそれぞれの表示形式でどう見えるかを確認できます。
