# PKC2 VSCode 級全面刷新 — 設計 master doc(2026-05-23)

**Status**:design master(docs-only、実装 wave は本書から派生)
**Created**:2026-05-23(user direction「破壊的に vscode 並みの過剰クオリティの
マークダウン系ツールにしたい、全コードベースの大半書き換え期待」)
**Audience**:本書全体は **PKC2 中級〜玄人 user + Claude(継続開発者)** 向け
の master spec。各 wave の具体 spec は `vscode-grade-overhaul-2026-05/` 配下に
sub-doc で起こす(本書がその index 兼。総体としては段階的にこの 1 doc を
中心に PKC2 v3.x line の方向を確定する)。
**実装 scope**:エントリ data 型(`Container` / `Entry` / `Relation` /
`Revision` / `assets`)は **不変**。それ以外(UI / interaction / shell /
keyboard / DnD / multi-window / visual / canvas+wasm 経路準備)は **コード
ベースの大半を書き換える前提**。
**main 着地禁止 invariant**(本書全期間):本 master doc 配下の実装 PR は
**1 件も main に着地させない**。pgc スタック上で wave を積み続け、user が
品質に満足するまで stack 着地のみ。最終的に 1 PR squash merge で main 着地
する見込みだが、それは user 判断 trigger のみ。
**自律性方針**(user direction 2026-05-23):意思確認は極力減らす。私
(Claude)が理由づけと最良判断を続け、user は **使い手の哲学 / 美意識** を
都度示す(本書は user の都度発話を §2 に逐次集積する live doc)。

---

## §0 motivation / 本書の役割

### §0.1 なぜ書くか

`render-surface-parity-audit-2026-05.md`(pgc-77)が S1〜S5 の **生成差** を
棚卸し、`multi-window-vscode-extension-spec-2026-05.md`(pgc-67〜76)が
**window orchestration** を整理した。両者は **既存基盤の上の修正提案**だが、
2026-05-23 の user direction は **「既存基盤そのものを破壊的に書き換える」
方向** を要求している。差分修正(surface mirror、Gap 解消)を続けても、
user 体感の根本(「VSCode 級の過剰クオリティ」「気持ち良さ」)には届かない。

本書は **PKC2 v3.x line の全面 redesign master**。pgc-77 / pgc-67 を補完
ではなく **包含し再構成する**(両 audit / spec の Gap 解消 PR roadmap も
本書 wave map に組み込む)。

### §0.2 本書の位置づけ

- **`pkc2-vision-modern-emacs-2026-05.md`**(2026-05-07):long-term vision
  (org-mode + AI 一級市民 + 非プログラマ)── 本書はこの vision の **UI/UX 軸
  での具体化**
- **`v3-architecture-proposals-2026-05-18.md`** + Phase β plan 群:Group A/B/C
  の改修方向 ── 本書はその全 group を **横断的に再統合**(別書きで分裂して
  いた spec を 1 master に集約)
- **`render-surface-parity-audit-2026-05.md`**(pgc-77):surface 別 Gap
  inventory ── 本書 §5 で **「Gap を埋める」発想を捨て canonical 1 本に
  集約する」発想** に格上げ
- **`multi-window-vscode-extension-spec-2026-05.md`**(pgc-67):window
  orchestration ── 本書 §5 で **「多窓 + main は対等な surface、user の
  動線多様化を歓迎」** という user 哲学を加える

### §0.3 invariants(全 wave で死守する)

| # | invariant | 理由 |
|---|---|---|
| I1 | `Container` / `Entry` / `Relation` / `Revision` / `assets` の data 型は不変 | user 既存データの互換 + bookmarklet / export HTML の前方後方互換 |
| I2 | `SCHEMA_VERSION = 1` のまま | I1 の必然 |
| I3 | export HTML(`dist/pkc2.html`)を単一 artifact として維持 | single-HTML deliver は PKC2 の核 |
| I4 | core / features 層は **browser API 非依存 pure** | canvas+wasm 経路(§8.4)で再利用可能 |
| I5 | main = 唯一の dispatcher / IDB writer | spec §2-1、multi-window で死守 |
| I6 | Tier 0 flag で gate、default OFF で出荷 | 段階 rollout、急進破壊回避 |
| I7 | main 着地禁止(本書 wave 全期間)| user 品質判断まで stack |

---

## §1 投資調査結果(現状の UX 棚卸し、2026-05-23 Playwright + code reading)

### §1.1 5 surface の visual 確認

**Tooling**:`PKC_PRE_INSTALLED_CHROMIUM=/opt/pw-browsers/chromium-1194/
chrome-linux/chrome npm run test:smoke` で本環境の Playwright が動く(pgc-78)。
本調査では headless chromium で main + entry-window(editor / viewer /
monitor)を 4 popup window として同時駆動、screenshot + DOM dump 採取。

#### S1 = main center pane(canonical)— `r5-comp-0.png`

- 全 PKC dialect 装飾完備:
  - `:::section{role=tip}` 緑 callout / `{role=warning}` 橙 / 他 6 role ✓
  - `:::details` 折りたたみ ✓
  - `:::figure` caption + 採番 ✓
  - `> 引用 ^^em-dot^^ ==hl==` 全部 visible ✓
  - `{{vars.x}}` 展開、未定義の `{{vars.undefined}}` は dotted underline 警告 ✓
  - `_5` blank-line marker は 5em の空白 ✓
  - 見出しに `▼` fold icon、native `<details>` で折りたたみ可能 ✓
- 右 meta pane:**Properties**(frontmatter 編集 UI)、**Contents**(本文 TOC
  miniature)、Tags / Categorical / Folder / History / Revision / REFERENCES /
  Outgoing relations / Backlinks / Outgoing links / Backlinks(重複!) /
  Broken links / Add Relation ── 縦に **13+ section**
- 下 action bar:`Edit | Inline | Window | Delete | More...`(後ろは閉じている)

#### S2 = Viewer popup(rendered viewer)— `r5-comp-2.png`

- viewport 800×700
- 左 TOC sidebar(`Contents`)、右 本文(viewer-body article)、下 status bar
- 本文 render:
  - **frontmatter `vars.x: HELLO` が `<hr>+text+<hr>` として literal**(Gap-6)
  - 見出し `別窓 UX 検証 **{{vars.x}}**` ── vars 展開されず literal(Gap-6)
  - `:::section{role=tip}` が **plain text** ── 装飾無し(Gap-13)
  - 段落 / 見出し階層は OK
- footer:`text` badge + `× Close` のみ ── 印刷 / HTML download button は
  toolbar 内にあるはずだが viewport から外/隠れている可能性

#### S3 = Split View preview(center pane edit 中)— `r5-comp-0.png` の edit 状態(`a01-text-main.png` も併用)

- canonical に近いが:
  - `extractDocumentGlobals`(縦書き / RTL)は反映しない設計判断(Gap-4)
  - `expandTransclusions` / `hydrateCardPlaceholders` / `applyHeadingFold` は
    呼ばない(Gap-5)── 「編集中に他 entry が混ざると caret 同期が壊れる」
    という設計判断
- フォーマットパネル(ribbon)が左右に重い

#### S4 = Editor 別窓(entry-window)— `r5-comp-1.png`

- viewport 900×700
- title input + `text` badge top、Split View(source 左 / preview 右)、
  bottom action bar 6 button(別窓プレビュー / TOC 別窓 / Save / Cancel /
  Editing / text / × Close)
- 右 preview pane が **S1 とまったく違う劣化版**:
  - frontmatter literal(Gap-6)
  - vars 未展開(Gap-6/7)
  - `:::section{role=tip}` が plain(Gap-13)── 53 件 CSS mirror 不足の影響
  - heading-fold アイコン無し(Gap-14)
  - transclusion / card 未展開(Gap-15)
- **user 観察**(2026-05-23):「別窓 viewport 不足で操作体系が見えない萎え」
  ── 900×700 でも 6 button が辛うじて入る幅、800 以下では切れる
- **user 観察**:「Cancel 時の表示きもい」── 現状 edit→cancel で view mode
  に戻るが「微妙」と表現

#### S5 = Monitor 別窓(TOC)— `r5-comp-3.png`

- viewport 320×600、minimal panel
- heading のみ階層 indent で list
- markdown render 経路無し
- click で本文 jump できない(navigation 無)
- viewer popup が同じ TOC sidebar を持つので **重複**(comp-2 と 3 を並べると
  TOC が左右に同じものが見える)

### §1.2 archetype 別の center pane 表示

| archetype | 表示の特徴 | UX 課題 |
|---|---|---|
| text | 大きな body editor + Split View + Properties / Contents / Tags / Folder / History / Revision / REFERENCES / Outgoing relations / Backlinks (×2) / Broken links / Add Relation ── 縦長 13+ section | meta pane の REFERENCES 群 / link 群が **二重表示**、Backlinks が同名で 2 か所 |
| textlog | header + 「Begin log selection」 button + log entry textarea + 「No log entries yet. Write your first log entry above ↑」 hint + meta pane | append flow が initial state で hint されているが、log row 数増えると hint が消える ── grown state の guidance 無し |
| todo | description editor + status / date / archived field + meta pane | 普通 |
| folder | description editor(small)+ meta pane + folder contents(子 entry list、未確認) | folder の子 entry navigation が center pane?meta pane? UI が分かれていそう |
| attachment | preview card + Drop file zone | DnD は drop zone がはっきり見える ✓ |
| generic | 未確認 | placeholder |

### §1.3 長大 entry 挙動

- `a05-long-edit-mode.png` 撮影:10,000+ char content の text entry
- 観察:
  - 編集中 textarea が文字数に応じて高さ拡張(`bodyArea.rows = Math.max(15,
    lineCount + 3)`、`detail-presenter.ts:163`)── 長大 entry で textarea
    高さが画面はみ出す可能性
  - Split View の preview pane は scroll 可だが、textarea 側の caret 移動と
    sync する `sourceLineAnchors` 経路あり ✓
  - 右 meta pane の **Contents**(本文 TOC)は heading 全部出して下方に
    長く伸びる ── outline navigation OK
  - 長大 entry で scroll しても、view-mode tabs / Edit button / breadcrumb /
    meta pane が **すべて常時表示**(sticky 化されているがエリア節約は無い)

### §1.4 multi-window 構成(4 page 同時駆動)

- `r5-comp-{0,1,2,3}.png` で main + editor + viewer + monitor を同時 capture
- 観察:
  - 別窓は viewport 位置を browser が決める(中央 cascade のように重なり)
  - **window 間の自動レイアウト無し** ── user が手で並べる必要
  - `shell.window_layout_persist` flag が ON なら次回 boot 時の geometry 復元
    ボタンが出る(γ-A5-4、pgc-71)── ただし popup blocker 制約あり
  - **window 間で同じ entry の異なる surface** を見比べたい時、現状は editor
    別窓内のボタンから viewer / monitor を **追加で開く** flow しかない ──
    main から直接「viewer だけ開く」「monitor だけ開く」 動線が無い

### §1.5 右クリック context menu の現状(重大!)

- `r5-rc-center.png` / `r5-rc-sidebar.png` / `r5-rc-header.png` ── どれも
  右クリック後に PKC2 の context menu が **出ていない**
- ただし `b06-context-menu-items.json` で sidebar の `li` を右クリックすると
  20 item 出る(別 capture)── つまり **特定要素(sidebar item の row)で
  しか発火しない**
- 結果として「center pane の本文を選択して右クリックして辞書引きしたい /
  該当 entry を別窓で開きたい / コピーしたい」 のような **本文 context-aware
  操作が一切できない**
- user 哲学:「Windows は右クリック context menu の折りたたみに逃げ込んだのは
  正解」「visible button は simple か multi-menu 化、複雑な操作は context
  menu / shortcut / quick launcher に逃げる」 ── **本 audit との大ギャップ**

### §1.6 DnD 現状

- `r5-07-after-dnd.png`:DataTransfer 経由で text file を center / sidebar /
  body にそれぞれ dispatch ── attachment が作られたか scroll 状態確認
- `[data-pkc-action]` の中に `drop-` 系 1 件以上あったはず ── 既存 drop zone
  は `.pkc-attach-drop-zone`(`Drop file to attach`)に限定
- universal DnD(本文中のどこに drop しても適切な archetype に変換)経路は
  まだ無い ── pgc-60(attach-dedupe-reuse)+ pgc-59(editor-drop-anchor)で
  編集中 textarea drop は支援されたが、view mode で **本文 paragraph 上に
  drop して embed** のような操作は未実装

### §1.7 About 観察

- `b00-boot.png` ── About は「新一HTMLで動作する、ローカル＆超軽量の
  Container、メモ、メタ、関係性データ「保存ファイル」を 1 つの HTML
  ファイルにて編集、エクスポートも可能 (Rebydrate) で完全動作する。」 と
  説明 + meta 表 + Release v2.3.0 Highlights
- user 観察:**「About は味気ない、最近の変更も反映されていない、PKC-Markdown
  を dog-food して積極的にアピールしたほうがいい」**
- 現状:About は AST テキストの羅列、PKC-Markdown 機能の **デモ表示が無い**
  ── PKC2 自身の最大の差別化点を見せ場として活かしていない

### §1.8 architectural inconsistency

- main shell は **`data-pkc-action="..."` attribute** で event delegation
  (`action-binder.ts`)
- entry-window 子 document は **`id="btn-*"` + inline `onclick="..."`**
  (`entry-window.ts` 内 inline `<script>` ~3000 行)
- 2 つの interaction 規約が併存 ── inline script で features / adapter 層を
  import できないため架構的に避けられない部分はあるが、**`data-pkc-action`
  + bridge 経由の event delegation** に統一可能(本書 §5 で改修案)

### §1.9 console logs

- `r5-console.json`:warning 数件(主に flag-related info)、error 0 件
- 健全な production state

---

## §2 user 哲学(2026-05-23 user direction 集積)

本 session で user が示した 9 件の direction を逐次記録。本書全期間でこの list
を成長させ、各実装判断の根拠 reference として使う。

| # | 発話 | 含意 |
|---|---|---|
| U-1 | 「破壊的に vscode 並みの過剰クオリティのマークダウン系ツール」 | scope: 全面刷新、ambitious、Phase γ-A1〜A4 を超える |
| U-2 | 「使用するユーザーは急速に習熟する傾向 vs 早々に諦める傾向の 2 種類、習熟者が物足りなさ」 | target: **power user 専用**、casual を篩にかけて構わない |
| U-3 | 「3 pane は最小限の UX 保証として initial release した、私も習熟者の物足りなさを不満に感じている」 | 3 pane は **底**、ここから上方拡張 |
| U-4 | 「UI の無駄をなくす、効率の良い動線、OS の挙動を最大限、browser の挙動を app 向きに、ユーザー体験向上」 | UX 哲学 4 軸:無駄削減 / 動線効率 / OS native / browser-override |
| U-5 | 「エントリのデータ型を破壊しないレベル」 | invariant I1 |
| U-6 | 「既存ツールより筋がいいと思ったものは何でも採用」 | open source / VSCode / Obsidian / Logseq / Notion / Tana の良いとこ取り |
| U-7 | 「想像力と使い手の哲学を最大限」 | over-engineer も OK、creative direction welcome |
| U-8 | 「私への意思確認を極力減らし、自律的に理由づけ + 最良の答えを実装し続けて欲しい」 | Claude の autonomy 拡大、OQ 削減 |
| U-9 | 「全コードベースの大半を書き換え、なんなら凌駕していくことを期待」 | scope: 既存コード rewrite welcome |
| U-10 | 「別窓のレンダリングとか UX 最悪」 | S4 = 最 priority 改修対象 |
| U-11 | 「別窓 + メインウィンドウ構成、エントリごとの異なる表示内容も見て」 | 多窓 + multi-archetype 両方の観察必須 |
| U-12 | 「click / 右クリック / DnD 挙動それぞれ微妙な使いにくさ」 | interaction 全 modality 改修 |
| U-13 | 「長大エントリの挙動、不要 UI が美しくない、エントリ成長で見えてくる不満」 | growth-aware UX、長大 entry での chrome 整理 |
| U-14 | 「About は味気ない、最近変更も反映なし、PKC-Markdown を dog-food して積極アピール」 | About = showcase に格上げ、PKC-Markdown の demo を埋め込む |
| U-15 | 「何でも button 化は悪い、Windows は context menu 折りたたみが正解、shortcut / gesture / quick launcher に逃げる、visible button は simple か multi-menu」 | UI 削減哲学、interaction layering |
| U-16 | 「別窓編集中、main を render 窓として使いたい / 別窓 preview もあって良い、人による動線多様化歓迎、問題は気持ち良さ」 | multi-route OK、感性 first |
| U-17 | 「別窓 viewport 不足で操作体系が見えない萎えポイント」 | window size responsive |
| U-18 | 「canvas+wasm を推進したい」 | Phase δ 経路の前倒し意識 |
| U-19 | 「別窓 Cancel 時の表示きもい、Preview と同じ表示でいい」 | edit 終了後の view 復帰挙動 |

---

## §3 PKC2 "VSCode 級" 設計哲学(Claude synth、user 哲学からの蒸留)

### §3.1 power-user-first 不平等主義

新規 user の learning curve を **意図的に放棄**する。代わりに:
- 全機能に keyboard shortcut(ほぼ漏れ無し)
- 全 visible button に対応する command 名(Command Palette で叩ける)
- discoverability は **`?` で一覧、いつでも呼べる shortcut help**
- 「最初は分からないけど、3 回目から速い」ツールを目指す

### §3.2 minimum visible chrome + multi-layer interaction

User U-15 に従い:
- 常時表示 button は **5〜7 個 max**(create / edit / save / view-mode-cycle /
  search の core only)
- 全 advanced 操作は **3 layer に逃がす**:
  1. **Right-click context menu**:object-aware、選択 element に応じた item
     を表示(Windows / VSCode 流)
  2. **Keyboard shortcut**:全 command に shortcut 割当
  3. **Command Palette**(Ctrl+Shift+P):VSCode 流 fuzzy search 起動
- **第 4 layer = Quick Open**(Ctrl+P):entry / log / heading への高速 jump

### §3.3 OS native 最大化 / browser を app に近づける

- **clipboard** API(text / image / file)── 既に部分使用、universal 化
- **File System Access API**(opfs / showOpenFilePicker)── 単一 HTML 配布で
  もユーザー指定 path への書き出し可
- **Notification API**:reminders / save 完了 toast に
- **WakeLock API**:長文編集中の sleep 抑止
- **Share API**(mobile):entry を OS share sheet 経由で送信
- **Drag and drop**:OS から PKC2 への drop、PKC2 から OS への drop 両方向
- **Pointer Events**(touch / pen / mouse 統一)
- **Keyboard event** で **browser default override**:
  - Ctrl+P:browser print **抑制** → Quick Open
  - Ctrl+F:browser find **抑制** → in-app search
  - Ctrl+S:browser save **抑制** → entry save(既に実装)
  - Ctrl+W:tab close **抑制?**(user 判断、危険度高)
  - F1 / F11:fullscreen / help override
- **PWA manifest**:install 可能、launchQueue で file open、icon、shortcut

### §3.4 多動線歓迎(user U-16)

「main を render 窓として使う」 と 「別窓 preview」 と 「multi-cursor inline
preview」 は **共存可能**。user の動線多様化は積極的に許容する:
- main = navigation hub + edit + render(default)
- editor 別窓 = focused edit、distraction free
- viewer 別窓 = read-only render、別 monitor
- monitor 別窓 = TOC / outline / search / activity 等の常時 panel
- 同 entry が複数 surface で開いていることも OK ── ただし **書き込みは
  always single source(main dispatcher)、その先で全 surface に push**(I5)

### §3.5 growth-aware UX(user U-13)

- empty state ↔ small entry ↔ medium ↔ long ↔ giant の各段階で**UI が応答する**
- 1 件目の entry は hint だらけ、100 件目は chrome 最小
- 100 行 entry と 5000 行 entry で **minimap / outline / breadcrumb の活躍度**
  が変化、自動で UI density が上がる
- 「成長で見える不満」(U-13)を予測して回避する設計

### §3.6 気持ち良さ first(user U-16)

機能でも数字でもなく、**操作の体感** を最優先する:
- 全 interaction に instantaneous feedback(<16ms)
- transition は 80〜120ms、easing は ease-out cubic
- caret 移動は jitter なし、smooth scroll は **opt-in**(意図しない加速悪い)
- 別窓開く時の popup blocker 回避は user gesture 起点を守る
- error state は decay-out(瞬間警告 → 数秒後 fade)、modal は最小限

---

## §4 全体 redesign 提案(機能カタログ)

### §4.1 Command Palette(`Ctrl+Shift+P`)

**目的**:全 command を fuzzy search で起動。VSCode の core。

**設計**:
- 起動:`Ctrl+Shift+P` / `F1`、上書き(browser print は Ctrl+P で別 Quick
  Open に振る)
- 表示:画面中央の overlay、~60% viewport 幅、~50% 高さ、command list 縦
- input field + recent 5 件 + 全 command(default >300 件想定)を fuzzy match
- command meta:
  - 名前(日本語 + 英語の bilingual、検索キー両方含む)
  - keyboard shortcut(あれば右端表示)
  - category(View / Edit / Selection / Navigation / Multi-window / Theme /
    Debug / ...)
  - context-aware filter(現 selectedLid に応じて enable/disable)
- 実装:`src/adapter/ui/command-palette.ts` + 純 features 層 `src/features/
  command/registry.ts`(command 定義 + fuzzy match)
- **Tier 0 flag**:`shell.command_palette_enabled`(default OFF in alpha、ON
  に向けて品質固める)

### §4.2 Quick Open(`Ctrl+P`)

**目的**:entry / log / heading / asset を fuzzy search で開く。VSCode の
`Ctrl+P` 相当、Obsidian の Quick Switcher 相当。

**設計**:
- 起動:`Ctrl+P`(browser print を override、`beforeprint` で抑止)
- mode prefix(Notion-style):
  - 何もなし → entry
  - `#` → tag
  - `>` → command(Command Palette と同じ)
  - `:` → heading
  - `?` → help
  - `@` → recent
  - `!` → debug
- fuzzy match:title + body の bigram + relation
- recent 履歴を上に、score で sort
- Enter で open、`Ctrl+Enter` で別窓 editor、`Shift+Enter` で別窓 viewer

### §4.3 Tab system

**目的**:現状の「1 entry 1 表示」を脱却、複数 entry を tab で同時 open。

**設計**:
- main の center pane 上部に **horizontal tab strip**
- tab には icon(archetype)+ title + close、dirty 状態は `●`(VSCode 流)
- middle-click で close、`Ctrl+W` で close、`Ctrl+Shift+T` で reopen
- 全 view-mode(detail / calendar / kanban / filer / graph / launcher)も
  個別 tab として扱える(現状の view-mode toggle は廃止、view も tab に)
- **pin** tab(`Ctrl+Shift+P` の意図と被るので別 shortcut、たとえば
  `Alt+P`)で entry を永続化(close されない)
- **split editor**(VSCode 流):tab を horizontal/vertical に split、各
  pane が独立 tab list を持つ
- 既存 entry-window(子 window)は tab と **直交**:tab は同 main 内、子
  window は別 OS window。両方利用可

### §4.4 Minimap

**目的**:長大 entry の overview navigation。

**設計**:
- center pane 右端に **minimap**(VSCode 流):
  - 全 body の miniature(20px 幅)
  - 現 viewport の枠を highlight
  - click で jump
  - heading は 色 highlight、code block は別色
- entry が `> 200 行` のとき自動表示、`< 200 行` は非表示(growth-aware §3.5)
- toggle 可:`Ctrl+Shift+M`
- canvas 描画(Phase δ canvas+wasm 経路の前駆)

### §4.5 Outline / Breadcrumb

**Outline**:
- meta pane の「Contents」を分離・強化:
  - heading だけでなく `:::section` `:::figure` `:::details` も列挙
  - filter / search
  - drag で並び替え(将来 — risk あり、phase δ?)
  - 折りたたみ
- **monitor 別窓**(γ-A5-2)の TOC kind と **重複**しないよう、monitor の
  panel 種別を `outline` に rename + 機能拡張

**Breadcrumb**:
- 現状の「Root > 別窓検証 TEXT」を進化:
  - folder 階層を完全表示(現は 1 階層のみ?)
  - 各セグメント click で folder navigation
  - 末尾の `>` で同階層の sibling popover
  - heading anchor も breadcrumb に表示(scroll 連動)── VSCode の breadcrumb
    が file path + symbol を出すのと同じ
- 実装:`src/adapter/ui/breadcrumb.ts` + `src/features/navigation/path-trail.ts`

### §4.6 Keyboard 第一主義

**現状の keyboard カタログ**:
- Ctrl+S / Escape / Ctrl+; / Ctrl+: / Ctrl+Shift+; / Ctrl+D 等(日付)
- Ctrl+? / Ctrl+\ / Ctrl+Shift+\ / Ctrl+N / Ctrl+Z / Ctrl+Y
- 矢印 / Enter / `/`(slash menu)

**追加すべき**:
- Ctrl+P:Quick Open(browser print override)
- Ctrl+Shift+P / F1:Command Palette
- Ctrl+F:in-app search(browser find override)
- Ctrl+Shift+F:全 entry across search
- Ctrl+G:go to line(text 系のみ)
- Ctrl+Shift+O:Outline jump(現 entry 内の heading 一覧 → 飛ぶ)
- Ctrl+T:new tab(blank)
- Ctrl+W:tab close
- Ctrl+Tab / Ctrl+Shift+Tab:tab cycle
- Ctrl+\\:split editor(horizontal)/ Ctrl+Shift+\\:vertical
- Ctrl+Shift+M:minimap toggle
- Ctrl+B:sidebar toggle(現 Ctrl+\\ から変更、VSCode 流)
- Ctrl+Shift+E:explorer focus(sidebar focus)
- Ctrl+Shift+G:graph focus
- Ctrl+\\,P:settings ── leader key + sub key の chord
- F11:fullscreen
- F12:debug overlay(structural mode)

**implementation**:`src/features/keymap/registry.ts` で全 keymap を declarative
定義、`src/adapter/ui/keymap-binder.ts` が listen。chord(leader key + sub
key)対応、conflict 検知、user customization 可(将来)。

### §4.7 Right-click context menu の universal 化

**現状の context menu**:sidebar item の li でのみ発火、20 item(`b06`)

**universal 化**:
- center pane 本文 / meta pane / sidebar / header どこを右クリックしても
  **context-aware menu**
- 例:
  - 本文中の link 右クリック → Open / Open in new tab / Copy link / Open in
    window
  - heading 右クリック → Copy anchor / Fold all / Unfold all / Renumber
  - paragraph 右クリック → Copy as markdown / Split / Convert to ...
  - 選択 text 右クリック → Cut / Copy / Paste / Cite / Make link / Add to ...
  - asset 右クリック → Replace / Remove / Download / Open in viewer
- **layering**:click target に応じて子 menu(submenu)を持つ ── ↑user U-15
  「Windows の context menu 折りたたみが正解」を全面採用
- implementation:`src/adapter/ui/context-menu.ts`(既存があれば拡張)、
  registry per surface

### §4.8 Mouse gestures

**目的**:trackpad / mouse の自然動作を機能に割当。

- 中央クリック:link → open in new tab(browser default 維持)
- Shift+wheel:horizontal scroll(自然動作)
- Ctrl+wheel:zoom in / out(text size)── browser zoom 抑止、CSS zoom 連動
- 右クリック+drag:gesture(将来):
  - 左 → 戻る
  - 右 → 進む
  - 上 → home / breadcrumb top
  - 下 → close tab
- pinch zoom(trackpad):main view zoom
- 3 finger swipe(trackpad):tab cycle

**implementation**:`src/features/gesture/recognizer.ts` + Tier 0 flag で gate

### §4.9 DnD universal

**現状**:`Drop file to attach` ゾーンに drop で attachment、editor textarea
drop で anchor 挿入(pgc-59、pgc-60)

**universal 化**:
- **本文 paragraph 上に drop**:image なら inline embed、md/txt なら convert
  to TEXT、その他は attachment + link
- **sidebar item 上に drop**:該当 entry に attach(folder なら folder 内に
  追加、text なら link 追加)
- **meta pane の "Add Relation" 上に drop**:drop した entry を relation 追加
- **graph view 上に drop**:そこに node 作成
- **browser から PKC2 外への drag**:entry / heading / log を文字列 / HTML /
  markdown として export
- **PKC2 から PKC2 内 DnD**:entry 並び替え / 関係性追加 / folder 移動 ──
  既存の sidebar drag は active ✓
- universal DnD overlay:全画面 hover で highlight + ヒント表示

---

## §5 Multi-window 全面刷新案

### §5.1 viewer 別窓 = S1 完全 parity 化

**audit pgc-77 Gap-1〜Gap-15 を埋める発想を超え、`detail-presenter.ts` を
canonical renderer として再利用する**:

**現実装**:`rendered-viewer.ts` の `buildBodyHtml` が独自 markdown render
+ inline CSS mirror 750 行 + 一部 features 層呼び出し ── canonical S1 と
**異なる経路** で常に Gap が生まれる構造的問題

**新設計**:
- 別窓を開く時、**main の document を iframe srcdoc で複製**するアプローチを
  検討(security 制約あり)
- もしくは **完成済 HTML (S1 と同じ DOM 生成パイプライン)** を main 側で
  build → 別窓に `document.write`
- inline CSS は base.css の **subset を抽出する build step** で自動生成、
  手 mirror を撤廃
- 詳細:`vscode-grade-overhaul-2026-05/render-pipeline-unification.md`(後続
  spec、本書配下に追加)

### §5.2 monitor 別窓 = 多 panel

**現状**:TOC only(`toc` kind)

**追加 panel**:
- `outline`:TOC を拡張、section / figure / details も列挙、folding 同期
- `recent`:最近編集した entry 一覧(navigation hub)
- `search`:全 entry 横断 search(常時 panel 化、Cmd+Shift+F の panel 版)
- `calendar`:日付 entry の miniature
- `relations`:graph mini view
- `activity`:tab 履歴 / event log
- `pinned`:pin した entry 一覧
- 各 panel は **plug-in style** で追加可能、`src/features/monitor/<kind>.ts`
  に纯 derive 関数を置く(VSCode の Activity Bar に近い思想)

### §5.3 editor 別窓の viewport responsive

**user 観察 U-17**「別窓 viewport 不足で操作体系見えない萎え」

**設計**:
- 別窓の bottom action bar に **`overflow: scroll-x` + 自動畳み込み**:
  - viewport `< 720px`:`別窓プレビュー` / `TOC 別窓` を `⋯ More` menu に畳む
  - viewport `< 480px`:`Save` / `Cancel` 以外も `⋯` に
  - 常時 visible は `Save` / `Cancel` / `× Close` の 3 個 floor
- top に `Outline` toggle button を追加(本文の minimap / TOC を main の meta
  pane と独立に open)
- 別窓の **dock 機能**:右上に「pin to main edge」 ボタンで OS の snap 風に
  main 隣に貼り付ける(JS で `window.moveTo` 試算 → popup 制約あり)── Phase
  γ で実装、δ で OS-native dock 連携検討

### §5.4 Cancel 時の挙動 = Preview と同じ表示(user U-19)

**現状**:editor 別窓で Cancel すると edit mode → view mode に戻るが、
display が「微妙」(user 表現)。具体的に何が悪いかは画面で確認:
- もしかすると `pkc-pending-view-notice` の表示残り、もしくは title-display と
  body-view の re-render が一拍遅れる、もしくは Split View の preview pane が
  edit mode のまま残る

**設計**:
- Cancel = edit mode 開始時の view state に **完全復元**
- transition:edit pane fade-out / view pane fade-in、~120ms
- pending notice / status 表示は cancel 完了で全部クリア
- viewer 別窓と同等の rendering を **そのまま display**(viewer の preview を
  inline で持ってくる、editor 用の渋い preview pane は廃止)
- 実装:`entry-window.ts` の `cancelEdit()` 後処理を改修

### §5.5 main を render 窓として使う動線

**user U-16**「main を render 窓として使いたいとか、別窓 preview もある」

**設計**:
- editor 別窓内に **「main を viewer に固定」** ボタン(`📌 Use main as viewer`)
- 押下後:
  - main の center pane が **read-only render** に固定(edit affordance 抑止)
  - main の view-mode は detail 固定
  - editor 別窓の操作で main center pane の表示が live update
  - editor 別窓を閉じれば main は通常モードに復帰
- 副次効果:user が monitor 数を増やしたい時、main も「もう 1 つの viewer」
  として活用できる(複数 OS monitor を持つ user に有効)

### §5.6 別窓間 layout / dock

**目標**:VSCode の WindowBus 風(spec §11.2 で構想)、ただし browser 制約内

- 別窓 open 時の geometry を **smart 配置**(現状はランダム cascade):
  - main が左にあれば editor は右に
  - editor が右にあれば viewer は更に右 / 下
  - monitor は edge に貼り付き
- `window.screen.availWidth/Height` から OS 解像度推定、main の position と
  size から空き region を計算、heuristic で smart 配置
- popup blocker 制約のため **「全部 1 click で開く」 button** を main に
  presets として用意:
  - `🪟 Open editor + viewer side by side`
  - `🪟 Open editor + outline monitor`
  - `🪟 Save layout as preset`
- layout は localStorage(`pkc2.windowLayout` 拡張)

---

## §6 main shell 刷新

### §6.1 header の不要 button 削減

**現状**(`b01-after-create-text.png`):top header に back / forward, "PKC2"
title + phase badge, 5 create archetype buttons(`📝 Text`, `📋 Log`, `☑ Todo`,
`📎 File`, `📁 Folder`), Data... ボタン(export/import details), 4 tray
toggles(sidebar / meta / focus / shell-menu)── 計 ~16 element

**削減案**:
- create button 5 → **1 個の `+ New` button**:click で archetype picker
  popover(`text/log/todo/file/folder`)
  - shortcut で直接:`Ctrl+N` → text(現)、`Ctrl+Shift+N` → picker、`Alt+T`
    → textlog 等
- back / forward は **breadcrumb 内 ⇐ ⇒ アイコン** に統合
- Data... は **Shell Menu** に統合
- tray toggle 4 → 3(focus は keyboard `F11`、それで shell menu / sidebar /
  meta が tray toggle)

→ 結果 header は:
- `[⇐ ⇒]` `Root > ... > 現在 entry`(breadcrumb)── 中央
- `[+ New]`(右寄せ)
- `[⌘]`(Quick Open trigger)
- `[≡]`(Command Palette / Shell Menu)

### §6.2 sidebar の機能集約

**現状**:filer / tree / outline がそれぞれ別 mode、切替 button あり

**集約**:
- sidebar は **mode 切替廃止、tab strip** に:
  - `📁 Explorer`(filer / tree 統合 = 階層 + flat 切替 toggle)
  - `🔍 Search`(search 結果リスト)
  - `📊 Outline`(現 entry の outline)
  - `🔗 Relations`(graph mini)
  - `📜 Recent`(履歴)
  - `📌 Pinned`(pin した entry)
- ── これは VSCode の Activity Bar + Side Bar の関係
- 各 tab で keyboard shortcut(Ctrl+Shift+E / F / O / G / R / P)
- sidebar 自体は `Ctrl+B` で toggle、`Ctrl+Shift+B` で側変更(左/右)

### §6.3 meta pane の整理

**現状の問題**(`a01-text-main.png` 右側):
- Properties / Contents / Tags / Categorical / Folder / History / Revision /
  REFERENCES / Outgoing relations / Backlinks / Outgoing links / Backlinks
  (重複!) / Broken links / Add Relation ── 13+ section
- **`Backlinks` が 2 か所**(`REFERENCES` 内の `Outgoing relations` group と
  独立 group)── 視覚的重複
- 縦に長い、scroll が必要、必要な情報が下まで埋もれる

**整理案**:
- 「**Inspector**(VSCode の右 panel 相当)」 として再構成
- **Tab strip** で section を切替:
  - `📋 Properties`(frontmatter + meta + tags + categorical + folder)
  - `🔗 References`(全 relation / outgoing / incoming / broken 統合 ── 1 か所)
  - `📜 History`(revisions + diff)
  - `🎨 Style`(該当 entry の theme override?将来)
  - `🧠 AI`(将来:AI assist panel)
- 既定で `Properties` tab、tab は keyboard shortcut(`Ctrl+Alt+1〜5`)で切替
- mete pane 自体は `Ctrl+Shift+B`(現状の toggle-meta 別名)

### §6.4 format panel(ribbon)= context-aware

**現状**(`a01-text-main.png` 編集中):
- 縦 ribbon 風、6 section(Font / 段落 / リスト・番号 / 表 / 挿入 / 検索)、
  ~40 button、常時 visible

**問題**:
- user U-15「何でも button 化は悪い」 該当
- 常時表示なので長大 entry 編集中も常に画面占有
- 多くの button は keyboard で十分

**設計**:
- **default 非表示**、`Ctrl+R` で toggle(または selection があるときだけ
  浮動 inline toolbar)
- 選択時の **inline popover**(Notion / Medium 流):
  - 選択 text の上に floating toolbar `B I S U ` + (more)`
  - more は context menu に折りたたみ
- 表 row / column 操作は **表 element 上に hover 時だけ表示**
- 全 format 操作は keyboard / Command Palette / context menu からも到達可
- 「Format Panel pin」 toggle で常時表示モードに切替(power user 用)

### §6.5 view-mode tabs の再考

**現状**(`a01` 上部):`Detail | Calendar | Kanban | Filer | Graph | Launcher`
の 6 tabs ── entry を select した状態でしか出ない

**問題**:
- 6 tabs 全部常時表示は redundancy。Calendar / Kanban / Filer / Graph /
  Launcher は **entry に紐づかない workspace-level view**、Detail だけが
  entry-level
- title の **上** に view-mode tabs があるのは 操作順序的に逆(まず entry を
  選ぶ → view を選ぶ、なのに目で見る順は view → title)

**設計**:
- view-mode は **center pane の tab system** に統合(§4.3)
- `Detail` は entry-level tab、entry を開く度に新 tab
- `Calendar` / `Kanban` / `Filer` / `Graph` / `Launcher` は workspace-level
  tab、 default 開かない、Command Palette / sidebar からのみ open
- `Launcher` view は **Quick Open** の重複 ── 廃止または統合(後述 §6.5.1)

#### §6.5.1 Launcher view の扱い

現 `Launcher` view が何かは未確認。code を読んで確定する(後続 sub-doc)。
おそらく:
- favorite shortcut / pinned entry の dashboard
- or app entry point of empty state

→ 設計:
- 廃止して Quick Open + 新 `Home view`(workspace overview)に統合

---

## §7 archetype 別 UX 刷新

### §7.1 text archetype

**追加機能**:
- **Multi-cursor**(VSCode 流):`Ctrl+D` で次の同一 selection 追加、
  `Alt+Click` で個別 cursor 追加
- **Column selection**:`Alt+Shift+Drag` で矩形選択
- **Minimap**:§4.4
- **Outline** sidebar(§4.5)
- **Word count**(footer 表示、optional)
- **Reading mode**:meta pane / format panel / tabs を全部畳んで本文だけ
  ── `F11 → reading`
- **Folding**:現 heading-fold(`▼`)に加え、`:::section` / `:::details` /
  list の任意 nesting で fold(VSCode の `Ctrl+Shift+[` / `]`)
- **Find/Replace** in entry:`Ctrl+F` / `Ctrl+H`(in-app、browser find override)
- **Find/Replace** all entries:`Ctrl+Shift+F` / `Ctrl+Shift+H`

### §7.2 textlog archetype

**追加**:
- **Quick append**:`Ctrl+Enter` を append、入力 box が常時 focus 可能
- **Day grouping** の collapse / expand(現は all expand)
- **Day jump**(Outline で日付一覧)
- **Per-log keyboard shortcut**:今日 / 昨日 / 過去日付に切替
- **Inline timer**:textlog で時間計測 entry(将来)

### §7.3 todo archetype

**追加**:
- **Calendar view 統合**:`set-view-mode-calendar` を todo の date field と
  自然連動、calendar の cell を click → todo 直接編集
- **Kanban DnD**:カラム間 drag は ✓、order の persistence は ?(未確認)
- **Sub-tasks**(将来):todo の description 内 `- [ ]` を inline checkbox
  化、main todo + subtask の 2 階層
- **Reminders**:date 越えで Notification API 発火、tab title に `(!)` 印

### §7.4 form archetype

**現状**:`name / checked / note` の 3 field

**設計**:
- 構造化 field を維持(JSON schema 持っているはず)、validation 強化
- form の **template**:同じ form を repeat で作る時、template として複製

### §7.5 folder archetype

**追加**:
- **inline list of children**:folder を open すると子 entry list が center
  pane に出る ── 現状あるかも、要確認
- **DnD**:folder に entry を drop → move、folder 外に drop → unmove
- **Folder description editor** は **markdown 完全対応**(audit S1 parity 既)

### §7.6 attachment archetype

**追加**:
- **Inline edit**:image なら crop / rotate / annotate(将来、canvas 経路)
- **PDF**:ページ移動 keyboard、TOC 抽出
- **Audio / Video**:時間 marker、`#t=10s` fragment ref(`fragment-reference-
  ir-spec` と連動)

### §7.7 generic / opaque

**現状**:escape hatch / hidden

**設計**:
- generic は plain markdown editor、archetype 不明 / 未対応データの安全 viewer
- opaque は **完全 hidden**(リスト / search で出さない、folder count にも
  含めない)── 既存挙動?確認要

---

## §8 visual layer 刷新

### §8.1 About を PKC-Markdown showcase 化(user U-14)

**現状**:plain な about text + meta + Highlights

**設計**:
- About を **`opaque` archetype の特殊 entry** として配信(build 時生成)
- 内容を **PKC-Markdown 完全 demo**:
  - `:::section{role=tip}` / `{role=warning}` 等 9 種 callout
  - `:::details` 折りたたみ:What's new / Roadmap / Credits
  - `:::figure` で screenshot 埋め込み
  - `{{vars.version}}` で build 時注入された version 表示
  - `==highlight==` `^^em-dot^^` ruby など inline modifier 多用
  - `_5` blank-line で section 間スペース
  - `[@fig-x]` で figure ref、`[^a]` で footnote、`:::quote{author=...}` で
    credit
  - heading-fold で structure
- 結果:About を見るだけで PKC-Markdown 機能 70% が体験できる
- 副次:CHANGELOG / release note も同 PKC-Markdown で書いて About に統合
  (現 `aboutMarkdown` 系の build script を強化)

### §8.2 theme

**現状**:Light / Dark / System、accent color / border / background / ui-text
/ body-text / preferred-font / language / timezone を shell menu で調整可

**追加 / 改修**:
- **Theme preset**:VSCode の theme 流、`Solarized Light` / `Dracula` /
  `Nord` / `Monokai` 等 5-10 preset
- **Theme JSON**:user が JSON で theme を書ける(将来)、上記 preset も同
  JSON で実装
- **CRT scanline effect** は既にある(`set-scanline`)── 維持
- **Reduce motion** 設定:user が transition / animation を OFF できる

### §8.3 motion / animation 哲学

- **default は subtle**(120ms ease-out cubic 限定)
- **macro animation** は OPT-IN(view-mode 切替時の slide、tab open の grow
  等)
- **caret indicator** は既に `position: fixed` で全体描画されている(2026-05-05
  hotfix-7 follow-up-2)── 維持、ただし motion が user に jarring なら
  reduce

### §8.4 canvas + wasm 経路(user U-18、Phase δ 前駆)

**user の意向**「canvas+wasm を推進したい」

**v3.0 のコア thesis**(`v3-architecture-proposals-2026-05-18.md` Group D
+ multi-window spec §11):
- editor + parser core を wasm 化
- rendering surface を canvas 化
- DOM は **chrome のみ**(side bar / tab strip / context menu)
- main content 描画は canvas

**v2.x 段階の前駆作業**(本書 wave で進める):
- core / features 層を完全 pure(I4)、wasm 移行時に丸ごと持っていける
- minimap を **canvas 描画で実装**(§4.4)── 体験的に canvas 描画の
  feasibility を確認
- syntax highlight も canvas に moveable な構造に
- text rendering の **gpu texture 化** 検討(Phase δ 本番)

---

## §9 implementation roadmap

### §9.1 wave 構造

**全体**:**5 wave、~100 PR**(規模感、user mandate「コードベースの大半
書き換え」 から逆算)。各 wave 内は pgc-NN stack 継続、wave 移行で sub-doc
を分離。

| wave | 名称 | scope | 規模 | sub-doc |
|---|---|---|---|---|
| **α** | foundation | Command Palette + Quick Open + keyboard registry + context menu universal + tab system 骨格 | 25-30 PR | `wave-alpha-foundation.md` |
| **β** | multi-window unify | viewer / monitor / editor の canonical S1 化(audit pgc-77 Gap-1〜15 を含む)+ 別窓 dock / responsive / Cancel 改修 | 20-25 PR | `wave-beta-multi-window.md` |
| **γ** | shell redesign | header / sidebar / meta pane 集約 + format panel context-aware + view-mode tab 統合 + DnD universal + About PKC-Markdown 化 | 20-25 PR | `wave-gamma-shell.md` |
| **δ** | archetype polish | text(multi-cursor / minimap / outline)/ textlog / todo / form / folder / attachment 個別 UX | 15-20 PR | `wave-delta-archetype.md` |
| **ε** | canvas prep | core / features の wasm 移行準備 + minimap canvas 化 + gpu render PoC | 10 PR(Phase δ への bridge) | `wave-epsilon-canvas-prep.md` |

### §9.2 wave-α PR roadmap(直近 25 PR)

| PR | scope | size |
|---|---|---|
| pgc-79 | **本書(master design doc)docs-only**(本 PR)| 大(docs) |
| pgc-80 | Command Palette POC:registry + overlay 骨格 + Ctrl+Shift+P / F1 起動、`?pkc-flag=shell.command_palette=1` で gate | 中 |
| pgc-81 | Quick Open POC:`Ctrl+P` 起動 + browser print 抑止 + entry fuzzy + recent | 中 |
| pgc-82 | keyboard registry:全 shortcut を declarative 化、chord 対応、conflict 検知 | 中〜大 |
| pgc-83 | Context Menu universal:center / sidebar / meta / header どこを右クリックしても context menu、object-aware | 中 |
| pgc-84 | Context Menu items:link / heading / paragraph / selection / asset / entry の context-aware item set 各 ~10 件 | 中 |
| pgc-85 | Tab system 骨格:center pane の上部 tab strip、tab state, open/close、`Ctrl+W` 等 | 大 |
| pgc-86 | Tab + entry navigation:同 entry 重複 open 防止、tab restoration on reload | 中 |
| pgc-87 | Tab + view-mode 統合:Calendar / Kanban / Filer / Graph も tab 化 | 中 |
| pgc-88 | Tab pin:`Ctrl+K Ctrl+W` で pin、close 抑止 | 小 |
| pgc-89 | Split editor:Tab を horizontal / vertical split、各 pane に独立 tab list | 大 |
| pgc-90 | Browser shortcut override:Ctrl+P / Ctrl+F / Ctrl+Shift+P / F1 / F11 全部 PKC2 に grab | 中 |
| pgc-91 | Mouse gestures POC:Shift+wheel / Ctrl+wheel / 3 finger swipe | 中 |
| pgc-92 | Minimap canvas POC:`Ctrl+Shift+M` で toggle、200 行以上で auto-show | 中 |
| pgc-93 | Outline sidebar:現 meta pane Contents を sidebar tab 化、`Ctrl+Shift+O` で jump | 中 |
| pgc-94 | Breadcrumb 拡張:folder path 全表示 + sibling popover | 中 |
| pgc-95 | Find/Replace in entry:`Ctrl+F` / `Ctrl+H`(browser find override 上で) | 中 |
| pgc-96 | Find/Replace all entries:`Ctrl+Shift+F` / `Ctrl+Shift+H`、preview + apply | 大 |
| pgc-97 | Reading mode:`F11` で chrome 全部畳む | 中 |
| pgc-98 | Word count footer + reading time(text 系のみ) | 小 |
| pgc-99 | Multi-cursor POC:`Ctrl+D` / `Alt+Click` で text 系 entry に多 cursor | 大 |
| pgc-100 | Folding extension:`:::section` / `:::details` / list の任意 nesting で fold | 中 |
| pgc-101 | DnD universal:本文 paragraph drop / sidebar drop / meta pane drop の各 destination で archetype-aware action | 大 |
| pgc-102 | wave-α 締め:visual parity test + flag default ON 判断(`shell.command_palette` 等 7 flag)| 中 |
| pgc-103 | wave-α 反省 doc + wave-β 起点 | docs |

### §9.3 wave-β PR roadmap(概略)

audit pgc-77 の Gap-1〜Gap-15 + 別窓 redesign:

| PR | scope |
|---|---|
| pgc-104 | render-pipeline-unification spec(canonical renderer を viewer / editor 別窓 / split view から call する設計、`buildBodyHtml` を廃止する経路) |
| pgc-105〜115 | 各 surface を canonical に寄せる(audit Gap-1〜15 を rewrite として吸収) |
| pgc-116〜120 | monitor 別窓多 panel 化(outline / recent / search / calendar / activity)|
| pgc-121〜125 | 別窓 layout / dock / responsive |
| pgc-126 | wave-β 締め |

### §9.4 wave-γ / δ / ε

詳細は wave 直前に sub-doc で起こす。

### §9.5 stack 規律

- 全 PR `pgc-NN` 連番
- base は **直前 PR の頂点**(本 PR は pgc-78)
- main 着地禁止(invariant I7)
- 各 PR で `npm run check:docs` / `typecheck` / 触った範囲の test + visual
  parity test(Playwright 復活したので default 添付化、wave-10 規律)
- CHANGELOG 1 行追記
- INDEX 同 commit 登録

---

## §10 invariants 再掲 + 自律性方針

### §10.1 invariants(全期間 hold)

I1〜I7(§0.3)を全 wave で hold。violation は immediate rollback。

### §10.2 自律性方針(user U-8)

- Claude は **autonomy 拡大**、user への OQ は最小限
- OQ を立てる基準:
  - data 型変更(I1 抵触)── 必須 OQ
  - default theme / accent color の根本変更 ── OQ
  - main 着地判断 ── 必須 OQ
  - keyboard shortcut の conflict(VSCode 既定と衝突する shortcut の採否)── OQ
- 上記以外は **Claude が決断 → 実装 → user が見て fb** loop
- user が「これは違う」と感じた時、user は本書 §2 に追記、Claude が次 PR で
  反映

### §10.3 user 哲学の蓄積場所

§2 を live doc として育てる。新 user 発言があれば本書 §2 に追記、各 wave 設計
判断の根拠 reference として使う。

---

## §11 関連 doc / 参照

### §11.1 既存 doc(本書が継承 / 包含 / 上書き)

- `pkc2-vision-modern-emacs-2026-05.md`(2026-05-07):long-term vision ── 本書が UI/UX 軸具体化
- `v3-architecture-proposals-2026-05-18.md`(2026-05-18):8 案 ── 本書が UI/UX 観点で再統合
- `phase-beta-plan-2026-05-19.md` / Group A/B/C spec 3 件 ── 本書が横断統合
- `phase-gamma-implementation-wave-map-2026-05.md`:既存 wave map ── 本書 §9 が再構成
- `multi-window-vscode-extension-spec-2026-05.md`(pgc-67):window
  orchestration spec ── 本書 §5 が拡張
- `render-surface-parity-audit-2026-05.md`(pgc-77):surface Gap audit ──
  本書 §5.1 が「Gap を埋める」発想を「canonical 1 本化」に超克
- `markdown-render-scope.md`:archetype × markdown contract ── I1 で保護
- `markdown-dialect-extensions-spec-2026-05.md`:PKC-Markdown 仕様 ──
  About showcase(§8.1)の素材

### §11.2 PKC-Markdown 仕様(I1 保護 + showcase 素材)

- `notation-redesign-2026-05/00-overview-and-principles.md` 〜 `11`:12 章 set
- `../spec/markdown-dialect-for-ai-authors-v2.md`:AI 書き手向け規約

### §11.3 reform doctrine(本書も従う)

- `CLAUDE.md` §9(surface 別 dual-render path)── 本書 §5 が unify で超克を狙う
- `CLAUDE.md` §10(preprocessor LineMap thread)── 維持
- `CLAUDE.md` §11(fence 内 preprocessor skip)── 維持
- `pr-review-checklist.md` 8 項目自己監査 ── 全 PR で hold
- `visual-state-parity-testing.md`:parity test methodology ── pgc-78 で
  本環境 Playwright 復旧後、default 添付

### §11.4 関連 sub-doc(本書から派生、後続 wave で起こす)

- `vscode-grade-overhaul-2026-05/wave-alpha-foundation.md`(pgc-80 着手前)
- `vscode-grade-overhaul-2026-05/wave-beta-multi-window.md`
- `vscode-grade-overhaul-2026-05/wave-gamma-shell.md`
- `vscode-grade-overhaul-2026-05/wave-delta-archetype.md`
- `vscode-grade-overhaul-2026-05/wave-epsilon-canvas-prep.md`
- `vscode-grade-overhaul-2026-05/render-pipeline-unification.md`(pgc-104 着手前)

---

## §12 progress / history

| date | event |
|---|---|
| 2026-05-23 | 本書起稿。user direction(2026-05-23 11 件、§2 U-1〜U-19 集積)を起点に PKC2 v3.x line の全面刷新 master design を起こす。pgc-77(surface audit)+ pgc-67(window orchestration spec)を包含し再構成、5 wave × ~100 PR の roadmap を §9 に提示。invariants I1〜I7(§0.3)で data 型 / single-HTML / Tier 0 flag / main 着地禁止を死守、I7 = main 着地禁止は本書全期間 hold。自律性方針(§10.2)で OQ を最小化、Claude が autonomous 判断、user が哲学を §2 に都度追記する live loop に。Playwright 投資調査(本 PR 直前)で 4 surface 同時 capture + archetype 別 + 長大 entry + DnD + 右クリック inventory を採取、user U-19 まで全件 §2 に反映。wave-α(foundation、25 PR)着手は pgc-80 から、本書(pgc-79)合意後に着手 |
