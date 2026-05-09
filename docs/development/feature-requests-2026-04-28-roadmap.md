# Feature requests roadmap — 2026-04-28

User direction(原文):
> 戻る進むボタンとマウスの同名ボタン、キーボードでalt+←、alt+→で
>   内部的なパンくずリストを移動したい。
> iPhoneでテキストエリア選択時などに拡大縮小されて、俯瞰性が崩れる。
>   なんとかならないか?
> マークダウン添付に対して、テキストエントリやテキストログエントリ
>   への解決提案をして欲しい。同様に扱うものとして、.md,.txtファイル
>   を指定したい
> 編集支援機能として字下げ維持、囲み文字補完、リスト改行時の自動
>   字下げとリスト記号挿入が欲しい
> 編集支援コマンドの拡充とコマンドリストをキーボード入力のみで
>   リストスクロールできない件の修正
> マークダウン方言の拡充、罫線、テキストアライン、均等割付け、
>   改ページ、図表タイトル、折りたたみ見出し、画像などのサイズと
>   位置調整
> レンダリング要望、表とコードブロックのコピーボタンの追加、
>   リッチタイプテキストとプレーンテキスト両方、合わせてショトカは
>   あるが、画面操作系ボタンがないものをiPhone,iPadユーザー向けに
>   ボタンを増やす

本 doc は受信した要望を 7 領域に分類し、サイズ / 依存 / 提案順を整理。
各項目は将来 PR を切るときの起点にする。

## 領域 1: 履歴ナビゲーション(back/forward + Alt+←/→)

### 要望
- ブラウザの戻る / 進むボタンで PKC 内部のパンくずリスト(navigation
  history)を遷移
- マウスの「戻る進む」ボタン(button4 / button5)も同様に動く
- キーボードショートカット `Alt+←` / `Alt+→`

### 現状
- `selectedLid` の変遷は state 機能として持つが、history stack は無し
- 既存 `pendingNav` は location-nav 用で履歴ではない
- ブラウザ戻る進むは現状 PKC を抜ける

### 設計骨子
1. **Navigation history stack** を AppState に追加(`navHistory`,
   `navIndex`)。SELECT_ENTRY / NAVIGATE_TO_LOCATION で push、
   GO_BACK / GO_FORWARD で index 移動
2. **History 統合**: `history.pushState(..., '', '?nav=lid')` で
   ブラウザ history と同期、`popstate` で内部 dispatch
3. **マウスボタン**: `auxclick` event の `button === 3 || 4` で hook
4. **キーボード**: `keydown` で `Alt+ArrowLeft/Right`(既存の global
   key handler に追加)

### 依存 / 注意
- iPhone push-pop(PR #173 の history-back 統合)と整合させる
- multi-select / editing phase 中の nav は blocked にすべきか要議論
  (現状の SELECT_ENTRY と同じ)
- breadcrumb UI(meta pane)から発生する nav も history に乗るか

### サイズ: 中(reducer + main.ts hook + UI)

---

## 領域 2: iPhone textarea zoom 抑制

### 要望
- iPhone でテキストエリアにタップフォーカスすると Safari が拡大、
  俯瞰性が崩れる

### 現状
- viewport meta は `width=device-width, initial-scale=1.0`
- フォントサイズ < 16px の input/textarea で iOS Safari は auto-zoom
- 既存編集 UI のフォントサイズが 14-15px 程度

### 設計骨子
1. **編集系入力(textarea, body editor, search input)のフォントサイズを
   16px 以上に**(iOS Safari の zoom トリガー回避)
2. もしくは viewport meta に `maximum-scale=1, user-scalable=no` を
   追加(ただし accessibility で zoom 拒否は良くない)
3. iPhone shell でのみ font-size 16px を強制(`pointer:coarse and
   max-width:640px` メディアクエリ)

### 推奨
- mobile media query で input/textarea のみ 16px に上書き(PR-簡易)
- それでも気になる箇所は個別調整

### サイズ: 小(CSS のみ)

---

## 領域 3: .md / .txt ファイル attach の解決提案

### 要望
- マークダウン添付に対して、TEXT entry / TEXTLOG entry への変換提案
- 同様に `.md` / `.txt` ファイルもサポート

### 現状
- `.md` / `.txt` ファイルは attachment archetype として保存される
- 添付として保存後に手動で開いて中身を見る、変換は無し

### 設計骨子
1. **MIME / 拡張子分類**: `.md` / `.txt` / MIME `text/plain` / `text/markdown`
   を `attachable-as-text` グループに認定
2. **drop 時の振る舞い分岐**: 該当ファイル drop 後に toast または modal
   で「TEXT entry として開く / TEXTLOG entry として開く / 添付として保存」
   を選択
3. **Default**: 添付として保存(現状互換)
4. **Convert action**: 既存の attachment entry に対して右クリック /
   long-press で「TEXT に変換」action を追加(EDIT_BEGUN to new entry)
5. `import-text-bundle` 経路を流用可能(text-bundle.ts に既存の TEXT
   import 機構あり)

### 依存 / 注意
- 既存の attach pipeline(PR #181-#188)の真ん中に分岐を入れる
- ユーザーが「この .md は単なる添付」と意図する場合の opt-out が必要
- import 経路を経るので大きなテキストファイルの memory 影響を再考

### サイズ: 中 ~ 大(分岐 UI + 変換 reducer + 既存 import 経路統合)

---

## 領域 4: 編集支援(indent / brackets / list)

### 要望
- 字下げ維持(改行時に前行のインデントを保つ)
- 囲み文字補完("(" → "()" のようなペア自動挿入)
- リスト改行時の自動字下げ + リスト記号插入(`- ` 行で Enter →
  次行も `- ` を自動挿入、空行で消える)
- **iPhone / iPad 入力支援**(2026-04-28 追記):バッククォート(`` ` ``)が
  iOS / iPadOS の標準キーボードで容易に入力できない(英字キーボード上
  では深い階層に隠れている)。コードブロック / インラインコード入力時
  に「バッククォート挿入」ボタン or ジェスチャーを編集ツールバーに
  用意するか、`tab` キーで fence 開始など別キー割当てを検討。

### 現状
- textarea の標準動作のみ(改行 = `\n` 一文字、補完なし)
- `quote-assist` 系の機能は markdown plugin として一部存在
- iPhone / iPad 標準キーボードはバッククォートを number-pad の long-press
  でしか入力できず、ユーザーが諦めるレベル

### 設計骨子
1. **Textarea wrapper にキーハンドラ**:
   - `Enter` 押下: 前行の indent 抽出 + リスト記号判定 + 次行に自動挿入
   - 開き括弧 `(`, `[`, `{`, `"`, `'`, `` ` `` 押下: 対応閉じ括弧を後ろに挿入
   - 閉じ括弧押下: カーソル直後に同じ閉じ括弧があればスキップ(jump-out)
2. **特殊ケース**:
   - 空のリスト行で Enter → リスト記号削除(脱出)
   - tab / shift+tab で indent / outdent
3. **設定**: ユーザーが editing-helper を toggle で off にできる
4. **iPhone / iPad キーボードツールバー**(2026-04-28 追記):
   - 編集中の textarea にフォーカス時、画面下に「``」「```」「``` 言語名」
     「[]」「{}」「<>」等のスニペット ボタンを表示
   - tap でカーソル位置に挿入 + コードブロックは複数行 + 末尾 fence 自動挿入
   - keyboardappearance に追従(または既存の編集ツールバーを mobile shell
     にも露出)
   - 候補:既存の slash-menu / 領域 7 の iPhone action bar と統合可能

### 依存 / 注意
- 既存の paste-into-textarea / asset-link 挿入と相互干渉しないよう
  キーハンドラの優先度を調整
- IME 中(`isComposing`)は無効化が必須

### iOS Safari の auto-pair 制限と緩和パス(2026-04-29 追記)

PR #198 v3 は **keydown** ベースで bracket / skip-out を実装。
Desktop では完動するが、**iPhone 実機で `(` 打鍵すると `((`
二重挿入** になる(iOS Safari は IME 有効時の keydown への
`preventDefault()` を尊重しないため、PKC2 の `()` 挿入と OS の
`(` 挿入が並走する)。

#### 試した修正と結果

- **PR #200**(close、未 merge):bracket 系を `keydown` から
  `beforeinput` に移管。iOS では beforeinput が cancelable で
  IME commit 確定後に発火する想定だったが、**iPhone 実機で auto-pair
  が一切発火しない** regression を起こし revert(close)。原因は
  `isComposing` フィルタの可能性高だが実機 debug 環境がなく仮説検証
  不能。

#### 現在の暫定方針

- iPhone / iPad の bracket auto-pair は **緩和方針**:本体側で
  直さず、**入力補助パレット**(本領域 4 末尾 + 領域 7 で計画済の
  iPhone/iPad スニペットツールバー)に bracket / fence ボタンを
  配置して palette 経由で入力 → keydown / beforeinput を経由しない
  ので OS との競合なし
- desktop は keydown 経由で従来通り動作
- 将来 iOS が preventDefault を尊重するようになったら、`beforeinput`
  への再移行を検討(`docs/development/archived/pr-findings/editor-key-helpers-pr198-findings.md`
  を更新)

### サイズ: 中

---

## 領域 5: コマンドパレット拡充 + キーボードスクロール修正

### 要望
- 編集支援コマンドの拡充(現在の slash menu / quick action の拡張)
- コマンドリストをキーボード入力のみでスクロールできない bug 修正

### 現状
- `slash-menu.ts` 風の popover はあるが、command list 全体の keyboard
  navigation は不完全(↓ / ↑ で active item を変えられても、
  list が viewport を超えると active item に scrollIntoView しない)
- 利用可能 command が少ない

### 設計骨子
1. **scrollIntoView 修正**: active item 変更時に
   `element.scrollIntoView({ block: 'nearest' })`
2. **Command 拡充**:
   - 編集系: 字下げ / 字消し、リスト変換、引用ブロック化、コードブロック化、
     見出しレベル変更、リンク化、画像挿入
   - 構造系: TODO 化、TEXTLOG 化、folder 化、tag 追加
   - View 系: 変更履歴、関連エントリ、後方リンク表示
3. **fuzzy filter** 追加でユーザーが部分入力で絞り込める

### 依存 / 注意
- 領域 4(編集支援)と一部重なる(リスト変換等)
- key event の優先度

### サイズ: 中

---

## 領域 6: マークダウン方言拡充

### 要望
- 罫線(横線、表罫線)
- テキストアライン(左 / 中央 / 右)
- 均等割付け
- 改ページ
- 図表タイトル(caption)
- 折りたたみ見出し(`<details>` のような)
- 画像のサイズと位置調整
- **下線**(2026-04-28 追記)— 現状未対応、要拡張
- **2026-04-28 追記:Word / PowerPoint へのトランス出力**を将来ビジョン
  として持つ。方言の syntax 設計時に Word/PPT primitive(段落 align、
  underline、page break、figure caption、image scale 等)に
  **1:1 で写像できる**ことを優先する
- **2026-04-28 追記:方言記法されたエントリから basic markdown だけを
  取り出す機能**(strip-dialect 経路)。dialect 構文を CommonMark に
  落とす変換器。

### 現状

emphasis 系の現状(markdown-it 標準):

| 入力 | 出力 |
|---|---|
| `**bold**` | `<strong>bold</strong>` ✓ |
| `*italic*` / `_italic_` | `<em>italic</em>` ✓ |
| `__double__` | `<strong>double</strong>` (CommonMark 規定で strong)|
| `~~strike~~` | `<s>strike</s>` ✓ |
| underline | **未対応** — CommonMark に存在しない |

- markdown-it ベース。標準の markdown 構文 + 一部 plugin
- 折りたたみ見出しは現在 unsupported
- 画像 size/位置は unsupported
- 下線、罫線、改ページ、テキスト align、caption 全て未対応

### 設計指針(2026-04-28 改訂)

ユーザー言:
> wordとpptへのトランスを実現したいので、方言を考えるときはその点を
> 考慮願います
> 方言記法されたエントリから、ベーシックなマークダウンだけを取り出す
> 機能も実装が必要です

→ **3 つの設計原則** を方言全体に適用:

1. **1:1 写像可能**:各拡張は Word / PPT の native primitive に対応
   できる構造を選ぶ:
   - underline → Word `<w:u/>` / PPT run property
   - alignment → 段落 alignment(left/center/right/justify)
   - page break → Word `<w:br w:type="page"/>` / PPT slide break
   - figure caption → Word `<w:caption>` / PPT placeholder
   - image scale → run-level inline shape size
2. **Strippable**:全ての方言マーカーを「記号削除 / 中身保持」で
   CommonMark 互換にダウングレードできる構文を選ぶ。例:
     `[text]{.center}` → strip → `text`
     `++underline++` → strip → `underline`
     `::: page-break :::` → strip → 削除 or `---`
3. **Forward-compat**: dialect が無効な reader でも壊れない(中身が
   読める)構文を優先。生 HTML タグ(`<u>`)は markdown-it html:false
   設定で escape されるため不可。

### 構文候補表(優先度順)

| 機能 | 候補構文 | Word/PPT 写像 | strip 後 |
|---|---|---|---|
| 下線 | `++text++` (Pandoc 互換) or `[text]{.underline}` | `<w:u/>` | `text` |
| 段落 align | `::: center` … `:::` fenced container | paragraph align | 中身そのまま |
| 改ページ | `\page` 行 or `::: page-break :::` | page break | 削除 or `---` |
| 折りたたみ | `>! summary` で details/summary | (Word: 通常段落)| summary + 中身 |
| 画像 size | `![alt](src){.w-200 .h-100}` | inline shape size | `![alt](src)` |
| 画像 align | `![alt](src){.center}` | paragraph align | `![alt](src)` |
| 罫線 | 既存 `---`(thematic break)| Word horizontal rule | `---` |
| caption | `![alt](src "caption")` の title attr → `<figcaption>` | Word caption | `![alt](src)` |
| 表 align | GFM `:---:`(既存)| table cell align | 既存どおり |

### 設計骨子(実装順、優先度順)

1. **画像 size / align**: `![alt](src){.w-200 .h-100 .center}`
   markdown-it-attrs 統合
2. **下線**: `++text++` を text inline rule で plugin 化
3. **折りたたみ見出し**: `>! ` prefix → `<details><summary>...</summary>`
4. **caption**: `![alt](src "caption")` の title attribute を
   `<figcaption>` に翻訳
5. **段落 align**: `::: center` ... `:::` fenced container
   (markdown-it-container)
6. **改ページ**: `\page` または `::: page-break :::`
7. **均等割付け**: `::: justify` と同じ container で

### Word / PPT export 経路(将来 PR、領域 6 完了後)

PKC2 → markdown-it AST → Word OOXML(.docx) / PPT OOXML(.pptx)変換器。
既存の export 経路(html / markdown bundle / pdf)に並列で追加。

ライブラリ:
- `docx` npm — pure JS で Word docx 生成
- `pptxgenjs` — PPT 生成
- 両方とも 単一 HTML build 制約下(IIFE)で動くか要確認

`renderMarkdown` の token stream を walk して block-level / inline-level
の primitive を docx / pptx の primitive に写像する translator を書く。

### Strip-dialect 経路(中規模、領域 6 と並走可)

新関数 `stripDialect(markdownSource: string): string`(features 層)。
PR 順:
- Phase 1:正規表現ベースで dialect マーカーを削除する純関数
  (`++` `[ ]{}` `:::` `>!` `\page` 等)
- Phase 2:export 経路に「basic markdown」モードを追加(設定 toggle)

### 依存 / 注意
- markdown 方言が増えると import / export 互換性が複雑化 → 必ず
  strip 関数 + 単独の plugin として実装し、root config から toggle
  できる構造に
- PKC1 互換 / GFM 互換のバランス
- 各拡張は 1 PR ずつ切るのが安全

### サイズ: 大(複数 PR、想定 6-10 PR)

---

## 領域 7: レンダリング操作 UI(コピーボタン + iPhone/iPad ボタン拡充)

### 要望
- 表のコピーボタン(リッチ + プレーン両方)
- コードブロックのコピーボタン(同上)
- ショートカットはあるが画面ボタンが無い操作を iPhone/iPad 向けに
  ボタン化

### 現状
- 一部のコードブロックに copy ボタンあり(textlog 等)
- 表 / 画像系には無し
- iPhone shell には back / forward 等のキーボード ショートカットが
  動かない(物理キーが無い)

### 設計骨子
1. **コードブロック / 表 hover-overlay コピーボタン**:
   - hover で表示、tap で動作
   - リッチコピー(HTML として書式保持)+ プレーンコピー(タブ区切り) 2 つ
   - clipboard.writeText / clipboard.write(html ClipboardItem)
2. **iPhone/iPad action bar**:
   - 既存の keyboard-shortcut-driven actions(undo, redo, find, save,
     etc)を一覧化
   - mobile shell の上部 / 下部 toolbar に該当ボタンを追加
   - 既存 `pointer:coarse` メディアクエリで分岐

### 依存 / 注意
- iOS Safari の clipboard.write は user-gesture 必須
- リッチクリップボードは MIME `text/html` + `text/plain` の両方を載せる

### サイズ: 中

---

## 領域 8: 番号体系 — 順序リスト + 章節項アウトライン番号(未決定)

**Status**: 未決定 / 凍結中(2026-04-29 ユーザー判断で保留)

### 要望

> 番号付きリストの末尾で改行した場合は次の番号が発行される一方、
> 途中の番号で改行すると重複番号になるし、リストを 1 行削除すると
> 番号ずれする。美しくない。
>
> 将来の Word 化を見越して章、節、項の見出し付き番号リスト —
> つまり、字下げラベルによってグローバルに続く番号、
>
> ```
> # 1.
>     ## 1.1
>     ## 1.2
>         ### 1.2.1
> # 2.
> ```
>
> のようなものも扱えるように計画してください。

### 現状

- ソース連番の不整合(途中改行で番号重複、行削除で番号ずれ)は
  CommonMark の自動採番で見た目は救われるが、source は不揃い。
- 章節項相当のアウトライン番号は markdown 標準に存在しない。
- PR #198 v3 までは Enter 改行時に「次の番号(`prev+1`)を機械的に
  insert」するだけで、後続の再採番はしていない。

### 3 層スケール設計案

| Layer | 範囲 | 複雑度 |
|---|---|---|
| **Layer 1** | 平坦な順序リストの auto-renumber + uniform-one toggle(`1. 2. 3.` 連続 / `1. 1. 1.` 統一 を選択) | 小 |
| **Layer 2** | ネストした順序リストの indent-aware 再採番(同 indent 内のみ連続、深い indent は独立カウンタ) | 小 ~ 中 |
| **Layer 3** | 見出しベースの章節項アウトライン番号(`# 1.` / `## 1.1` / `### 1.2.1`)。Word/PPT export と直結 | 大 |

### Layer 3 の方式分岐(未決)

| 案 | source | レンダリング | strip 容易性 | Word 写像 |
|---|---|---|---|---|
| A | `# 1. 序論` のように番号を実体化 | そのまま | △(番号 strip 可だが手書き) | ○ |
| B | `# 序論`(番号なし) | レンダラが付与 | ◎(レンダラ off で剥がれる) | ◎ |
| C | A/B ハイブリッド + `{# 1.}` 風アンカーで上書き許容 | 既定 B、必要時 A | ◎ | ◎ |

設計原則(領域 6)— 1:1 写像 / strip 可 / forward-compat — を満たすのは
B / C。デフォルト B、将来 C へ拡張という路線が妥当だが**判断は保留**。

### 想定スコープ刻み(未確定)

- PR-A: Layer 1 平坦 auto-renumber + uniform-one toggle(編集支援)
- PR-B: Layer 2 ネスト対応(同じ scan 関数を indent-aware 化)
- PR-C: Layer 3 案 B レンダラ(プリプロセッサ、container 設定で
  on/off)
- PR-D: Layer 3 → Word docx export 経路でのアウトライン番号 1:1 写像
- PR-E: strip-dialect 関数で番号も剥がせるように

### 依存 / 注意

- 領域 4(編集支援)とは別 PR シリーズ。PR #198 系列の単独補助には
  含めない。
- 領域 6(markdown 方言)の Word/PPT export ビジョンと密結合。
  Layer 3 は領域 6 完了 / 並走前提で計画する。
- container 設定 `system.markdown.headingNumbering` 等の追加が必要
  になる可能性。`system-settings-payload.ts` を拡張する。
- 既存ドキュメントとの後方互換: 既に手書きで `## 1.1 タイトル` と
  書かれた entry が壊れないこと。

### サイズ: 大(複数 PR、設計合意 → 実装で 2 段階)

### 再開時の判断ポイント

1. Layer 1 だけ先行で実装するか、Layer 3 含めて方針合意してから
   実装するか
2. Layer 3 は案 B(プリプロセッサ)/ 案 C(ハイブリッド)どちらか
3. container 設定への露出か、frontmatter 駆動か

---

## 提案実装順(全領域カバー想定)

| 順 | 領域 | サイズ | 依存 |
|---|---|---|---|
| 1 | iPhone textarea zoom 抑制(領域 2)| 小 | なし |
| 2 | コピーボタン拡充(領域 7 一部)| 小 | なし |
| 3 | 戻る進む / Alt+←/→(領域 1)| 中 | なし |
| 4 | .md/.txt → text/textlog 変換提案(領域 3)| 中 | 既存 attach |
| 5 | 編集支援 indent / brackets / list(領域 4)| 中 | textarea 共通 |
| 6 | コマンドパレット scrollIntoView 修正(領域 5 bug)| 小 | なし |
| 7 | コマンドパレット拡充(領域 5 機能)| 中 | 5 と並行可 |
| 8 | iPhone/iPad action bar(領域 7)| 中 | なし |
| 9 | 画像 size/align(領域 6 優先)| 中 | markdown-it config |
| 10 | 折りたたみ見出し(領域 6)| 中 | 9 と並行可 |
| 11 | その他 markdown 方言(領域 6)| 大、複数 PR | 9-10 後 |
| — | **領域 8 番号体系**(未決定) | 大、複数 PR | 設計合意 → 6 と並走可 |

## 注記

- 各領域は独立してマージ可能。PR ごとに spec doc + tests を伴う形で。
- iPhone 関連(2 / 7 一部)は実機検証が要(smoke の chromium だけだと
  zoom 挙動は再現しない)
- 領域 6 は markdown 構文の互換性議論が要。GFM / CommonMark / PKC1
  との照合を spec doc で議論してから実装に進む

## 領域 9: CSS 流用最適化 / 透過構造化 / 実行時自動生成(2026-05-03 追加)

**Status**: 未着手 / 別 PR で audit 起こし予定(2026-05-03 user direction)

### 要望(原文)

> 別件ですが、css は流用最適化できないんですか?
> 透過的な css 運用ができているかは別 PR で実施願います
> 透過的、構造的な CSS ができるなら、実行時にデータタイプや画面タイプに合わせて
> 自動生成するのも視野に入れて大胆な改革を検討してください

### 解釈

3 段階の問い:
1. **重複削減 / 流用最適化**: bundle.css 内に同パターン繰り返しが無いか棚卸し(例: shell-menu / flags-inspector overlay は backdrop + panel の同 layout を持つ — variable / mixin 化余地)
2. **透過(直交)構造化**: CSS class が「データタイプ × 画面タイプ × 状態」の直交する 3 軸で組み立てられるか。例えば `.pkc-card-widget.archetype-text.viewport-mobile.state-selected` のように属性で組み合わせる設計
3. **実行時自動生成**: 上記直交構造が確立できれば、defineFlag / `__flags__` で「palette / spacing / radius」等を per-container 切替、CSS variable で実行時 cascade を更新

### 着手前の audit 内容(別 PR で実施予定)

- 現 `src/styles/base.css` の class 一覧を category 別に分類(layout / overlay / chip / button / typography / theme / archetype-specific)
- 重複・近似 pattern の検出(例 5+ overlay の構造類似性、shell-menu / flags-inspector / shortcut-help)
- CSS variable の現使用度棚卸し(`--c-*` / `--pkc-color-tag-*` など)、未活用の axis(spacing / radius / font-size scale 等)を特定
- 実行時自動生成の可能性評価:CSS-in-JS は禁止(single-HTML 哲学)、`document.styleSheets[0].insertRule` 経由で動的 rule 追加の cost を試算
- defineFlag との結合:`theme.spacing_scale = 1.0`(数値 flag)を `--pkc-spacing-unit: calc(0.5rem * var(--pkc-spacing-scale))` に流す、等の design

### 大規模性に関する所感

「大胆な改革を検討」の意図に沿う場合、**CSS architecture redesign wave** として独立 wave 化すべき(spec → audit → migration の段階で wave 内 5+ PR、~2-3 ヶ月)。Flags wave のような methodology 確立 + 段階移行 pattern を踏襲できる。

着手前提:Flags wave(PR-β-2 / PR-γ / PR-δ / PR-ε)着地後 = 動的 toggle 基盤が完成してから。defineFlag を CSS variable 経由で消費する pipeline が前提。

### サイズ: 大(独立 wave、5+ PR、~2-3 ヶ月想定)

---

## 領域 10: 機能改修フェーズの新規要件(2026-05-04 user 追加、CSS wave 完了 → ドキュメンテーション後に着手)

CSS architecture redesign wave(領域 9)着地後にドキュメンテーションを行い、その後 main の機能改修フェーズに復帰する際に着手する 8 件。user direction(2026-05-04 chat):

> 以前に実装を保留した Split View の同期スクロール、マークダウン方言拡張、今後を見据えた内部中間表現の導入による word, ppt 向け組版と HTML レンダリングの同一内部表現からのサポート前段作業と実装、スプレッドシートエントリ、PKC-message の拡張と内部中間表現を実際の word, ppt レンダリングを担当する PKC-extension に渡す仕組みと実装、特殊なフォルダであるアルバムエントリとその表示表現としてのコンタクトシート、アプリランチャー、sandbox iframe 用ワークスペースコントローラまたはマルチウィンドウコントローラの実装

### 10-1: Split View の **block 対応ハイライト**(再開、「同期スクロール」呼称は撤回)— **着地**

過去の Split View 機能で同期スクロールが保留されていたもの(`pr-206-paused.md`)を再開、ただし **行レベル一致は markdown 仕様上 N:M 関係で原理的に不能** であることを認め、「block 対応ハイライト + caret auto-scroll」にスコープを再定義(2026-05-05、hotfix-5)。業界事例調査(VS Code 内蔵 / Joplin / Codebraid / iA Writer / Markdown-Edit 等、出典 30+ 1 次資料)で **PKC2 の方針が業界 de facto standard と一致** することを確認。詳細は `intermediate-representation-audit.md` §5。

サイズ: 中(PR 1 + PR 2 + hotfix 1〜5、計 7 commit、着地済)。

**Status(2026-05-05)**: 着地。
- **PR 1**(foundation):markdown-render に `sourceLineAnchors` opt-in、source-preview-sync helpers、unit 18 件
- **PR 2**(orchestration):⇄ toggle button、selectionchange/click/scroll listener、Playwright parity 10 件
- **hotfix-1**(real content):CSV fence anchor 消失修正、tr_open 単位 anchor、make/collectSourceLineAttrs export
- **hotfix-2〜3**:editor active-line overlay、scroll suppression、real wheel diagnostic、IR-friendly helper
- **hotfix-4**:overlay clamp→hide、line-number badge(L<n>)、on-screen debug overlay (`?pkc-debug=split-sync`)
- **hotfix-5**(現在):「同期スクロール」呼称撤回、block-center scroll 化、table layout 崩壊修正、ensureCaretVisibleInEditor、IR audit doc 起こし

**残(deferred)**: 行レベル一致は 領域 10-3 IR 導入後に Phase 4 として再評価。entry-window split editor は別 document context のため別 follow-up。

### 10-2: マークダウン方言拡張(領域 6 と統合)

§領域 6 で計画していた markdown 方言拡張を機能改修フェーズで継続。clickable image / table-of-numbers / etc. の拡張仕様を順次着地。

**Status(2026-05-08 後追い)**: **Phase 2 第 1 弾 M-7 Variables 着地**(branch `claude/wave-10-2-phase2-m7-variables-2026-05-08`)。frontmatter `vars:` block + `{{vars.x}}` 本文展開、未定義 → 赤点線下線 warning、3 surface(center / Split View / Viewer)+ Rich copy 全て対応。AI 規約書 v1 §2.12 + Manual 章 12 §12.6 も update。User direction「文体プロンプト + 宛先別 variant 生成」の延長で AI 連携の倍率が上がる効果を想定。

**Status(2026-05-08 hotfix)**: M-7 着地直後の user 報告「embed した TEXTLOG エントリで frontmatter が露出する(プレビュー表示もされていない)」を fix。embed 経路(transclusion)/ Viewer popup TEXT path / 平文 fallback の計 5 経路で `parseFrontmatter(...).body` 適用が抜けていた 3 surface 規約の取り残しを補完(branch `claude/continue-previous-session-bvaFS`)。視覚 parity smoke 1 件追加で 6 surface(center / Split View / Viewer / embed / 平文 fallback)contract 一致確認。spec doc §3.6 + Manual の status row も更新。

**Status(2026-05-08)**: **Phase 1 完成**。integration branch `claude/wave-10-2-phase1-integration-2026-05-07`(27 commits)で全 9 markup(L-1〜L-9)+ 周辺機能 + AI 書き手向け規約書 v1 を着地。実装一覧:L-1 Section break / L-2 Highlight・Ruby・Em-dot / L-3 Blockquote / L-4 Comments / L-5 Align prefix / L-6 Simple inline(em-based size + 自由値) / L-7 Figure/Table/Equation 自動採番 / L-8 空行マーカー / L-9 段落字下げ。周辺機能:iPhone snippet toolbar(20 snippet)、Rich copy で PKC 拡張を inline style 化(ONLYOFFICE / Word 互換)、CSV cell に inline markdown 適用、favicon multi-format pipeline、行頭 leading whitespace 統一許容、Viewer popup CSS + DOM 経路 mirror、Split View source-line LineMap thread、fenced code 内 marker 発火 skip。docs 2-tier:human-oriented(設計議論)+ AI 規約書 v1(構文規約)。Phase 1 残:format mapping マトリクス(Word / PPT / PDF / LaTeX / ePub)着手前 = 10-3 IR wave 後の課題、Phase 2(track changes / variables / glossary / spreadsheet embed 等)は別 wave。

サイズ: 大(wave、6-10 PR)。

### 10-3: 内部中間表現(IR)導入 — word / ppt 組版と HTML レンダリングを同一 IR から派生

**戦略的な前段作業**。HTML / word / ppt 三系統のレンダリングが現在は経路バラバラ(html は markdown-it 経由、export 系は別 path)。AST レベルの「PKC document IR」を定義して、HTML レンダラ / word renderer / ppt renderer / strip-dialect が同じ IR を入力にするよう統合。

**Status(2026-05-05)**: audit draft 起こし済み(`docs/development/intermediate-representation-audit.md`)。領域 10-1 hotfix-5 を契機に、行レベル sync 不能の根本理由整理 + IR 経由でしか解けない問題の明文化が完了。Q1〜Q7 オープンクエスチョン待ち、user 方針合意後 Phase 1 spec へ。業界事例調査(audit §5)で「IR 真面目運用は Codebraid Preview のみ、ROI は限定的」「markdown-it token 直接利用 vs IR 専用層」の設計判断が必要、と判明。

サイズ: 大(独立 wave、~3 ヶ月)。前提:
- (a) 領域 6 markdown 方言の正規化(IR の input 形式が安定してから着手)
- (b) IR spec 起こし(audit doc 完了、spec doc 起こし待ち)
- (c) HTML renderer を IR 経由に切替(現状の markdown-it path は維持しつつ adapter 層を挟む)
- (d) word / ppt renderer を IR から起こす(extension 経由、後述 10-5)
- (e) 領域 10-1 を IR 上で再構築(Phase 4)— 行レベル sync を諦めずに済むかの再評価

### 10-4: スプレッドシートエントリ(新 archetype)

新 archetype `spreadsheet`(または類似名)。Container schema に追加、body は表形式 JSON。renderer 専用 presenter で grid UI。CSV / xlsx import / export を含むかは別議論。

サイズ: 大(spec → reducer → renderer → editor → import/export、~5+ PR)。前提: archetype 拡張の影響(import / export / textlog 等から参照する場合の link 経路)。

### 10-5: PKC-Message 拡張 + IR を PKC-extension に渡す機構

PKC-Message v2(`docs/development/pkc-message-v2-open-questions-decisions-2026-05.md`)を拡張し、内部中間表現(10-3 IR)を **PKC-extension**(word / ppt renderer 担当の外部ワーカー / iframe / WASM)に dispatch する経路を実装。`record.offer.ir` 等の新 method を仕様化。

サイズ: 大(PKC-Message v2.1 / v2.2 で段階的、~4 PR)。前提: 10-3 IR が安定してから。

### 10-6: Filer view + book/youtube/album subset(発展版、**ζ'' wave 完成 2026-05-05**)

**Status: 16 stacked PR(#260〜#275)で wave 完成**(2026-05-05、PR #258 audit doc 起こし → 同日中に Phase 1〜5 + Phase 3c-A〜E 全部実装)。Manual 章 `docs/manual/10_filer_と_graph_と_inventory.md` + 11 枚 screenshot 取込済(`docs/manual/images/M01〜M08*.png`)、PKC-extension manual に統合済。残課題は `wave-10-6-ux-evaluation-2026-05.md` 参照(U1〜U8、~70 LOC で潰せる磨き込み + folder-default-as-filer 切替の別 wave 議論)。


原案「アルバムエントリ + コンタクトシート」を発展させ、**center pane の第 4 view-mode `filer`** を新設、subset profile(explorer / contact-sheet / book-base / youtube-base / graph)で多様な「カード型コレクション」を統一的に扱う wave。詳細は [`filer-view-and-folder-display-profile-audit-2026-05.md`](./filer-view-and-folder-display-profile-audit-2026-05.md)(PR #258 で landing)。

**確定形 ζ''**: TEXT atom(archetype 増設禁止)+ Hybrid Z data model(frontmatter / tag / relation の責務 3 分離)+ vanilla TS graph view(PKC1 force config 流用)+ 入力負担減 sub-wave(ISBN/oEmbed auto-fill で book 追加 ~90% 短縮)。

2026-05-05 user direction(Phase 3a-r1 リファクタ):**book/youtube 個別の subset 設計から URL + filetype 分類による generic な classifier**にリファクタ。Amazon / 楽天 / niconico / 小説家になろう / カクヨム / 青空文庫 等の主要サイトに対応した URL host map を `src/features/classification/url-host.ts` に追加、attachment は MIME / 拡張子で分類(`filetype.ts`)。現状の subset:`book-base` / `video-base`(旧 youtube-base、リネーム)/ `novel-base`(新規)。

**Bookmarklet 計画(2026-05-05、deferred)**:閲覧中のサイト(Amazon 商品 / niconico 動画 / 小説 1 話など)を **スナップショット的に PKC2 へ取り込む** ためのブックマークレットを将来的に実装。設計案:
  - URL + ページタイトル + 選択テキスト or 全文を JSON で encode
  - PKC2 を別タブで開く / クリップボード経由で取り込み
  - frontmatter に kind + url + provider + captured_at を auto-fill
  - 大規模なページは抜粋のみ + 元 URL 参照 / 小規模は full-snapshot
  - Amazon の場合は商品メタ(著者 / 価格 / レビュー)も抽出予定

サイズ: 大 wave、~12 PR / ~3 ヶ月、5 phase 構成:
1. filer view 第 4 view-mode + explorer subset(中、~2 PR)
2a. YAML mini frontmatter parser + 表示(小、~1 PR)
2b. graph view(vanilla TS、PKC1 config 流用、~5-8 KB)(中、~2 PR)
3a. subset profile via frontmatter+tag query(book-base / youtube-base / contact-sheet)(中、~2 PR)
3b. 入力負担減: ISBN/DOI/oEmbed auto-fill + smart paste(中、~2 PR)
4. folder ZIP export 拡張(subgraph reachability、archetype filter 撤廃、manifest v2)(中、~1 PR)
5. inventory query UI(Bases 風 filter / sort / group)(中、~2 PR)

PKC2 invariants 6/6 整合、dep ゼロ、bundle.js +0.5%、archetype / schema 不変。前提: 既存 W1 Tag / Relation kind / build-subset.ts / image-optimize-worker(全完了済)。

### 10-7: アプリランチャー

PKC2 単一 HTML 内に複数の「アプリ」(別目的の view / mode)を切替できる launcher UI。具体例:Editor / Calendar / Kanban / 新規 Spreadsheet (10-4) / Album (10-6) を入口で選択する dashboard 的位置付け。Shell menu の上位概念。

サイズ: 中(spec → state slice → presenter + parity test、~3 PR)。前提: 既存 view-mode (`detail` / `calendar` / `kanban`)の概念整理 + 新 archetype 着地状況。

### 10-8: Sandbox iframe ワークスペースコントローラ / マルチウィンドウコントローラ

attachment sandbox(既存)の延長で、複数 iframe を「workspace」として束ねる controller。または OS native のマルチウィンドウを管理する controller。詳細仕様は user 議論待ち。

サイズ: 大(spec audit が必要)。前提: 既存 sandbox / detached window / postMessage transport の整理。

### 10-9: Stabilization 連続 hotfix wave(2026-05-07、**Wave 完了**)

**Status: 🏁 完了**(2026-05-07、122 commits / 100 PR の stack で着地、user 判断「いくつかのバグ挙動はあるが締める」で wave クローズ)。

領域 10-6 wave 着地後の連続 hotfix wave。user 実機テストで挙がった修正指示 1〜10 + wave 中追加報告(Galaxy / Venn / rubber band / Ctrl+click / 楕円選択 / 右クリック menu 等)を Δ1〜Δ34 として 1 stack PR(#363)に集約。

**主な改修 8 領域**:

1. **filer** — 行ピクセルズレ(delta 0px、Δ7) / column drag-resize(Δ2) / multi-select + bulk operations(checkbox + Shift range、Δ3 + Δ5)/ 一括操作 UI を Filer 内へ(Δ25)
2. **graph 描画** — canvas aspect uniform scale + letterbox(Δ1) / node 過密改善(Δ4) / Galaxy 3D perspective + starfield + halo(Δ22 + Δ26) / Venn 真の集合 hull(Δ21) / time-proximity hash jitter(Δ28)
3. **graph 操作** — region 矩形 → 楕円(Δ31) / Ctrl+click multi-select(Δ32) / drag rubber band physics(Δ33) / 右クリック context menu(Δ34) / 左クリック誤操作防止(Δ34)
4. **inline-calc** — indent + list marker 14 ケース matrix(Δ8 + Δ8-fix2)
5. **ZIP import** — streaming + progress + base64 chunked(Δ23 + Δ27、OOM/hang 撃退)
6. **popup sync** — caret indicator + split block sync + ⇄ toggle button(Δ12)
7. **multi-select** — `includeAnchor` flag で sidebar/Filer/graph 独立(Δ16)
8. **Flags caption** — FLAGS_CHANGED microtask 再 render で即時反映(Δ29)

**残バグ(持越し)**:bundle.css 98 KB → 146 KB(budget 超過、次 wave Phase 2c で吸収)/ rubber band drag 2-hop 止まり / drag 後 position 永続化なし / 既存 lint 警告 2 件。詳細は [`wave-10-9-stabilization-summary.md`](./wave-10-9-stabilization-summary.md) §4。

**着地後の docs**:
- [`wave-10-9-stabilization-summary.md`](./wave-10-9-stabilization-summary.md)(NEW、wave 全体サマリ)
- [`codespaces-merge-playbook-wave-10-9.md`](./codespaces-merge-playbook-wave-10-9.md)(NEW、merge 戦略 3 option)
- [`../release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md)(Δ5〜Δ34 1 ブロック追記)

サイズ: stabilization wave、~122 commit / 100 PR / 2 日。

### 着手順序の所感(2026-05-04 時点、user 議論前の draft)

| 段階 | wave | 理由 |
|---|---|---|
| 0 | 領域 9 残 phase(Phase 1b / 1c / 3 / 4) | 現 wave 完了 |
| 1 | **ドキュメンテーション pass** | user direction 通り、機能改修前に CHANGELOG / spec 更新 |
| 2 | 10-1 Split View 同期スクロール | 保留解除、影響範囲狭い |
| 3 | 10-2 markdown 方言拡張 wave | 10-3 IR の input 形式安定化が前提 |
| 4 | 10-3 内部 IR audit + 段階導入 | 戦略的前段、3 ヶ月 wave |
| 5 | 10-4 スプレッドシート archetype | 独立性高い、IR とは別軸で進められる |
| 6 | 10-5 PKC-Message + extension 連携 | 10-3 IR の安定後 |
| 7 | 10-6 アルバム / コンタクトシート | 独立、image 既存資産で着手可 |
| 8 | 10-7 アプリランチャー | 10-4 / 10-6 が揃うと意味が増す |
| 9 | 10-8 sandbox / multi-window controller | 仕様議論先行が必要 |
| ✅ | **10-9 stabilization wave**(2026-05-07 完了) | 領域 10-6 後の連続 hotfix、122 commit / 100 PR で着地 |

実際の順序は user 判断 + 着手前の grep discipline(本書 + INDEX + ledger)で再確定する。

### サイズ集計(粗い目算)

- 中 サイズ × 4 件(10-1 / 10-6 / 10-7 / 10-8 の小規模解釈)≈ 12 PR
- 大 サイズ × 4 件(10-2 / 10-3 / 10-4 / 10-5)≈ 18-22 PR、計 ~6-9 ヶ月

---

## 参照

- 直近の perf wave 振り返り: `docs/development/archived/singletons/perf-wave-pr176-pr193-retrospective.md`
- 過去 wave の優先度議論: `docs/development/next-feature-prioritization-after-relations-wave.md`
- iPhone shell 既存実装: `tests/smoke/iphone-push-pop.spec.ts` 参照
- Flags wave(領域 9 の前提となる動的 toggle 基盤): `docs/development/const-discipline-2026-05.md` + `docs/spec/flags-protocol-v1-minimum-scope.md`
