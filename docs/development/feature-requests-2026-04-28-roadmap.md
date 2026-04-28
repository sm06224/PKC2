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

### 現状
- markdown-it ベース。標準の markdown 構文 + 一部 plugin
- 折りたたみ見出しは現在 unsupported
- 画像 size/位置は unsupported

### 設計骨子(優先度順)
1. **画像 size 調整**: `![alt](asset:k){.large}` のような attribute 拡張
   または `![alt](asset:k =200x100)` 構文(よくある markdown 拡張)
2. **画像 align**: `![alt](asset:k){.center}` または `> ![alt](...)`
   風 wrapper
3. **折りたたみ見出し**: `<details><summary>...</summary>...</details>`
   を許容、または `>! ` (spoiler ライク)プレフィックス
4. **罫線(rules)**: 既存 `---` で水平線サポート確認、表罫線は GFM table で
5. **caption**: `![alt](src "caption")` の title attribute → `<figcaption>`
6. **align / 均等割付け**: GFM table の `:---:` 構文があるが、本文段落
   の center / right / justify は CSS class または `::: center {}` 風 fence
7. **改ページ(印刷時)**: CSS `page-break-before` を発動する fence /
   class

### 依存 / 注意
- markdown 方言が増えると import / export 互換性が複雑化
- PKC1 互換 / GFM 互換のバランス
- 各拡張は 1 PR ずつ切るのが安全

### サイズ: 大(複数 PR)

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

## 注記

- 各領域は独立してマージ可能。PR ごとに spec doc + tests を伴う形で。
- iPhone 関連(2 / 7 一部)は実機検証が要(smoke の chromium だけだと
  zoom 挙動は再現しない)
- 領域 6 は markdown 構文の互換性議論が要。GFM / CommonMark / PKC1
  との照合を spec doc で議論してから実装に進む

## 参照

- 直近の perf wave 振り返り: `docs/development/perf-wave-pr176-pr193-retrospective.md`
- 過去 wave の優先度議論: `docs/development/next-feature-prioritization-after-relations-wave.md`
- iPhone shell 既存実装: `tests/smoke/iphone-push-pop.spec.ts` 参照
