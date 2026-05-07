# UX 評価レポート — 領域 10-6 ζ'' wave 完成後(2026-05-05)

User direction:
> あなたもプレイライトでスクショを多角的に取得して順序感や UX に
> 疑問がないか確認してください。根源的な設計不満でも問題ない。
> ユーザー体験と哲学が融合するように評価して。

11 角度の screenshot を取得し、実際の DOM とビジュアルを **作者(私)目線ではなく、初見ユーザ目線** で再評価します。`docs/manual/images/M*.png` 参照。

> 注:本 doc は user の確認支援用の一時メモです。実装後の見直し対象が出たら修正 PR の起点にしてください。実装に未反映の評価のみここに残し、修正完了したら削除する想定。

---

## 高優先度の懸念(設計レベル)

### U1 [中] Inventory subset の filter 行が group ごとに重複表示される

**症状**:`M07b-inventory-grouped.png` を見ると、author グループ Frank Herbert / George Orwell / 村上春樹 ごとに同じ filter 入力行(「…」)が 3 回ずつ繰り返される。

**ユーザ目線**:
- どこに入力すれば全体を絞り込めるのかが直感的でない(Frank Herbert グループの filter に書いたら、その group だけ絞られると誤認しそう)
- 縦スペース消費が大きい(group が増えると header / filter row だけで 1 group = 5-6 行になる)
- ソート arrow ▲/▼ も group ごとに重複

**修正方針**:
- filter 行は inventory の最上段に **1 度だけ** 描画(toolbar と一体化)
- 各 group は header + body のみ、filter row なし
- sort arrow も group ごとに重複させず、グローバルな選択として表示

**実装影響**:`renderFilerInventory` の `renderTable(rows)` を group モードのときは header (sort arrow 付き) のみ描画、filter row は外側 toolbar に切出。~30 LOC 程度の修正。

### U2 [小〜中] Graph view の単一 folder では node が中央に固まり、見た目が貧弱

**症状**:`M06-graph-view-relations.png` の 3 ノードが SVG canvas 中央 200px 角程度に集まり、空の余白が大半を占める。

**ユーザ目線**:
- 「Graph タブをクリックしたが何も起きていない」と誤解される可能性
- 力学パラメータ(charge -180、collide 20)が PKC1 で N=数百規模を想定していたため、N=3 だと反発が伝わりきらず中央に潰れる

**修正方針(優先度に応じて選択)**:
- a) ノード数に応じて charge / collideRadius を auto-scale(N が小さいほど反発を強く)
- b) 「Empty graph(エントリーが少ない / 関係性がない)」のときに guide message を表示
- c) viewBox を bounding box にフィット(fit-to-content)させる

**最小修正案**:(c) のみを行う(SVG `viewBox` を `boundingBox(sim)` に合わせる、~10 LOC)。

### U3 [中] 5 view-mode tab の既存 detail 表示との情報密度差

**症状**:`M01-view-mode-toolbar-5tabs.png` で Detail タブと Filer / Graph タブが横並びだが、Detail はメタペイン込みで膨大な情報量、Filer / Graph はもっとシンプル。同じ "tab" なのに重みが大きく異なる。

**ユーザ目線**:Detail に戻った時の情報量で「Filer は機能不足では?」と感じる人と、Filer に居座り続けて Detail の付随情報(history / relations / outgoing links 等)に到達できない人の二極化が懸念される。

**修正方針(別 wave)**:
- folder.detail_as_filer = true 化を default にして、folder では Filer を default 表示。Detail は単一 entry の deep dive 専用に役割分離
- Detail のメタペインは inventory subset / graph subset との情報共有を強化(例:Relations セクションは Graph タブから一発 focus できるリンクを置く)

> これは要設計議論。本 wave のスコープ外。

---

## 中優先度の懸念(機能の磨き込み)

### U4 [小] `.` 行の archetype label 「カレント」の表現が独自すぎる

**症状**:`M02-filer-explorer-empty.png` の `.` 行の 種類 列に「カレント」と表示。

**ユーザ目線**:カタカナ「カレント」は web / Mac / Windows のどの explorer 文化にも存在せず、馴染みが薄い。Unix 風の `.` を使っているなら「current dir」「自身」「(self)」の方が直感的かもしれない。

**修正候補**:`.` 行 → `自身` 表示 / `..` 行 → `親` 表示 に統一 / または日本語ラベルを廃止して空欄(name 列の `.` `..` 表記だけで十分かも)。

### U5 [小] 5 つ並ぶ subset profile select が長い

**症状**:meta pane の "Filer 表示" select に 7 種(explorer / contact-sheet / book-base / video-base / novel-base / graph / inventory)が一列に並ぶ。

**ユーザ目線**:意味の分類(table / grid / network / query)が混ざっており、初見ではどれが何用か判断しにくい。

**修正候補**:ラベルを意味グルーピング:
```
[ Layout ]        Explorer (table) / Contact sheet (album)
[ Catalogue ]     Book base / Video base / Novel base
[ Network ]       Graph
[ Query ]         Inventory
```
HTML の `<optgroup>` で実装可能。

### U6 [小] Trash の「ゴミ箱を空にする」破壊的操作に確認なし

**症状**:`M05-filer-trash.png` から推測 — 「ゴミ箱を空にする」ボタンは即発火型。

**修正方針**:click 時に simple confirm() か toast 確認を挟む。または Tier 0 flag で confirmation step を opt-in。

---

## 低優先度の懸念

### U7 Inventory column の枠で frontmatter key を `kind` `year` `author` のような英語そのままで表示

ローカライズしないと外国語を覚えるしかない。frontmatter で日本語キー対応を発見的に許容しているなら、frontmatter を `著者: 村上春樹` で書ける(YAML mini parser は対応済)旨を docs に明記すると良い。

### U8 Graph mode select の label が長すぎ

`Relations(structural + semantic)` のように補足が括弧書きで select に入っており、横にはみ出る。短く `Relations` `Color tags` `Tag groups` `Folder hierarchy` で十分(現在のコードは既に近い)。

---

## 哲学レベルの評価

User の哲学(2026-05-05 chat 累積):

> ファイラビューが目指すのは俯瞰的なエントリ操作体験と閲覧体験
+
> TEXT エントリとそれらの相互リンクをグラフで表現できることが必要
+
> 最小単位以外のエントリはかなり特殊な事情がない限り産みたくない
+
> TEXTLOG=思考の道程 / TEXT=思考の整理 / TODO=マイルストーン /
> ATTACHMENT=一次資料 / FOLDER=構造的まとめ。TAG+RELATION=糊
+
> メインをモーダルにしたくない
+
> バンドル全体で 5 MB が分水嶺
+
> ガンガンスタックPRで実装を続けて

### ✅ 守れたこと

- archetype 増設ゼロ(book / video / novel は frontmatter `kind:` + URL 分類で実装、新 archetype 不要)
- modal 一切無し(image preview は PiP / 別ウィンドウ、bookmarklet 取込もモーダルなしで auto-create)
- bundle 5 MB ライン下回り(現在 18.3% / 25.9% で大幅な余裕)
- 16 stacked PR を切れ目なく投下、user の判断は webhook 通過時のみ要請
- TAG / RELATION / FRONTMATTER の責務 3 分離(Hybrid Z)
- 全層 vanilla TS / dep ゼロ / single-HTML 哲学維持(graph layout / YAML parser / fragment converters / snapshot intake すべて自前)

### △ 妥協したこと(明示)

- folder.detail_as_filer は **opt-in flag**(既存 8 件 test 破壊回避のため、default OFF)。default ON 化は別 wave
- entry-bundle の round-trip(import 経路で folder export からの attachment 復元)未着地。export はできるが import 時 skip
- Phase 3c-F user 拡張 converter プラグイン仕組みは spec のみ、実装は別 wave
- viewer extension(EPUB / CBZ / webm)= 領域 10-5 PKC-extension 範疇に sourcing

### 🤔 議論の余地

- subset profile が 7 種並ぶ重み(U5)
- Detail / Filer / Graph タブの情報量バランス(U3)
- Bookmarklet が user 自身でブックマークバーに登録する敷居(教育コスト)

---

## 修正提案サマリ

優先順位付きで、修正したい場合の修正規模見積:

| Item | 優先度 | 修正規模 | 影響 |
|---|---|---|---|
| U1 inventory filter row 重複 | 中 | ~30 LOC | UX 大幅改善 |
| U2 graph viewBox fit-to-content | 中 | ~10 LOC | 小規模 graph で視認性大幅改善 |
| U4 `.` `..` の archetype label | 小 | ~5 LOC | 直感性 |
| U5 subset profile optgroup | 小 | ~15 LOC | 選択しやすさ |
| U6 Trash purge confirm | 小 | ~5 LOC | 安全性 |
| U8 Graph mode label 短縮 | 小 | ~5 LOC | レイアウト |
| U3 detail/filer/graph 情報量整理 | 中 | 別 wave | 設計議論 |
| U7 frontmatter 日本語 key 推奨 | 小 | docs のみ | 説明 |

合計で U1, U2, U4, U5, U6, U8 を一括 fix なら ~60-70 LOC + smoke 数件追加。1 stacked PR で着地可能。

---

## 私の総括

「**ユーザ体験と哲学が融合**」の観点では、wave は **8 / 10 達成** という所感です:

- 哲学(archetype 不変 / dep ゼロ / modal なし / 5 MB)は 10/10 守れた
- 機能網羅は 10/10(audit doc Phase 1〜5 + 3c-A〜E すべて)
- ピンポイントの磨き込み(上記 U1〜U8)が積み残り、初見 UX で 6/10 程度

積み残りを 1 PR で潰すと一気に 9/10 まで持ち上がる感触です。設計レベルの不満(U3、folder default 化)は別 wave で議論する価値があります。
