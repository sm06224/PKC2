# PKC2 v2.5.0 — Release notes

**Release date**: 2026-07-14
**Schema**: 1(変更なし — additive-only)
**Previous release**: v2.4.0

v2.5.0 は 2026-06 中旬〜2026-07 中旬の約 1 ヶ月・73 commit の集約です。主題は 5 本:① **ストレージ大改修**(OPFS / ローカルフォルダ backend、workspace 層、差分保存)、② **メモリ working-set 化**(#868 段階 1-5 完遂 — アセットを遅延ロードし数百 MB 級ワークスペースの heap を平坦化)、③ **PKC-Extension host の書込み解禁と AI 整理プラン連携**(#830 R2-R8 + 構成コマンド体験 #905)、④ **WCAG アクセシビリティ**(同系色 shift の全描画面適用 + テーマ balance + おすすめ掲示)、⑤ **依存とツールチェーンの近代化**(#687 — vite 8 / TS 6 / eslint 10 / node 24、HIGH advisory 2 件解消)。schema breaking はなく、既存 container は v2.4.0 と完全互換です(差分保存のみ opt-in・下記留意)。

---

## Highlights

<!-- この直下の flat bullet だけが About エントリに転記される(parse-changelog.ts)。
     コード例の `- ` 行も拾われるため、詳細な語りは「## Highlights 詳細」以降に置くこと。 -->

- **ストレージ backend の選択制**: 既定の IndexedDB に加えて **OPFS(ブラウザ私有 FS)** と **ローカルフォルダ(File System Access)** を追加。Storage Profile から明示切替でき、切替は非破壊移行(#771 / #842-#846)
- **workspace 層**: 複数コンテナを束ねる workspace の作成 / 切替 / 命名 UI。同一オリジン内の container 列挙・切替も追加(#773 / #847-#854)
- **差分保存(opt-in)**: `persistence.differential_save` ON で自動保存が「コンテナ丸ごと」→「変更 entry / revision だけ」になり、数千 entries でも編集ごとの保存コストが一定に(#912)
- **ストレージ実測ベンチ + 使い分け指針**: IDB / OPFS / FSA を大量エントリで比較 — 速度なら IDB、置き場所・可搬性要件なら OPFS / FSA(#904 / #906)
- **メモリ working-set 化(#868 段階 1-5)**: アセットの遅延ロード + additive-only save + 常駐メタ索引で、アセット数百 MB 級でも boot heap が本文分だけに。実機 heap-bound 検証済み(#867 / #870-#873)
- **構成コマンド(AI 整理プラン)**: ツリーを DSL 語彙説明つきテキストで export → AI が書いた mv / mkdir / rename コマンド列を dry-run プレビュー付きで一括適用。`as @名前` で新規フォルダを同一プラン内から参照可(#905 / #908 / #911)
- **AI 整理プラン連携の自動化**: pkc-ext 拡張チャネルに structure / structure-plan を追加 — 拡張の AI が提案し、適用は必ずユーザーが確認モーダルで(silent apply なし)(#913 / #914)
- **PKC-Extension 書込み語彙の拡充(#830 R2-R8)**: set-todo-status / rename / unfile / delete・restore(trash 開放)/ propose(新規 entry 作成、同意 banner 経由)/ 孤児アセット可視化 + 一括掃除(#832-#836)
- **WCAG 同系色 shift の全面展開**: 本文に加え mermaid / Viewer popup / entry-window にも自動コントラスト補正を既定適用。アプリテーマ自体の balance は opt-in(事前計算キャッシュ)+ アクセシビリティおすすめ掲示(#888 / #890 / #891 / #898 / #899)
- **編集体験**: 章フォーカス編集(1 節だけ開いて書き換え)/ text への追記・章差し挟み / modifier+click で突いた行から編集開始 / 見出し右クリック「この章を編集」(#862 / #863 / #887 / #878)
- **Split View 同期の作り直し**: source↔preview を anchor-pair scroll 写像方式で再構築し、entry-window popup にも移植。保存・選択後の全消し再描画と二重スクロールも解消(#884-#886)
- **表の右クリックコピー / エクスポート**: TSV(Excel / Sheets 貼付用)・CSV・Markdown コピー + BOM 付き CSV / TSV ダウンロード(#902 / #907)
- **ミニマップ(既定 OFF)**: center pane 右端に抽象化バーのスクロール概観。`shell.minimap_enabled` で有効化(#903 / #909)
- **レンダリング修正**: textlog / entry-window view の mermaid が SVG 化されない問題、表セル内 `<br>`、反対テーマでの TOC / mermaid / 検索マーク視認不能、書式パネルで編集中テキストが消える問題などを修正(#900 / #910 / #859 / #888 / #837)
- **依存・ツールチェーン近代化(#687)**: vite 6→8(esbuild HIGH advisory 恒久解消)/ markdown-it ReDoS HIGH 解消 / TypeScript 6 / eslint 10 flat config / CI actions + node 24。size budget は 5.75 MB に更新(#875 / #880 / #892-#897)
- **メディア viewer の操作変更**: コードブロック / 画像の別ウィンドウ表示がシングルクリック → **ダブルクリック**に(テキスト選択と衝突しないように)(#901)
- **ユーザーマニュアル更新**: 上記の全 user 向け機能を manual 各章に反映し、`pkc2-manual.html` を再生成(#915)

## Highlights 詳細

### ① ストレージ大改修(North Star L3 の実装解禁、#771 / #773)

- **OPFS adapter**(#842)+ backend 配線 / 明示切替 pref / IDB→OPFS 移行(#844)
- **FSA ローカルフォルダ backend**(#846)— OPFS と adapter 実装を共有(fs-directory-adapter)
- **Storage Profile の明示的 backend 切替 UI**(#845)+ スイッチャ CSS 仕上げ(#854)
- **container 列挙 + active 切替 primitive**(#847)→ 同一オリジン container 切替 UI(#848)
- **workspace 層**: store CRUD(#851)→ workspace-aware container ops(#852)→ 作成 / 切替 / 命名 UI(#853)
- backend 切替の reload 前に保留保存を flush(切替時データ消失バグ修正、#866)
- 実測ベンチ + ユースケース別指針 doc(#906): container 級書込みは IDB が 2〜4 倍速、asset 多数書込みは約 5 倍速。boot 体感差なし → モード選択は運用要件で
- **差分保存 split 形式 v1**(#912): entry / revision を個別 record 化し参照比較の差分だけ書く。opt-in flag、inline ⇄ split 双方向自己回復、順序リストで配列順を忠実復元
- 設計 doc: OPFS storage adapter 設計(#840)/ workspace + container 分離 設計(#841)

### ② メモリ working-set 化(#868 段階 1-5)

- 実測 + 画像遅延デコード + 段階計画(#867)
- save() を additive-only 化 + 明示 purge 経路(#870)— 部分 working-set の保存が未ロード asset を消せない不変条件
- working-set 遅延ロード本体 + export 時の全件ロード(#871)
- asset-metadata 常駐索引で storage / orphan / dedup の lazy degrade を解消(#872)
- 大規模ワークスペースの heap-bound 実機検証 + #868 クローズ(#873)
- 関連 perf: live wordcount debounce(#860)/ data URI 画像を貼付時に asset 化して本文軽量化(#861)

### ③ PKC-Extension host 拡充 + 構成コマンド体験

- **#830 R2-R8 write 語彙**: set-todo-status(#832)/ rename + unfile(#834)/ propose で create 解禁 + R6 gap 恒久解(#833)/ soft-delete・restore の trash 開放(#835)/ 孤児アセット可視化 + 一括掃除(#836)
- **render-service seam**: 拡張へレンダリングコアを貸す features 層 `renderForExtension`(#849 設計 / #855 実装)
- **構成コマンド体験(#905)**: tree export(DSL 語彙説明つき)+ mv / mkdir / rename の dry-run 付き一括適用 modal + palette コマンド(#908)、DSL v2 `as @名前` alias(#911)
- **AI 整理プラン連携(改善バッチ⑤)**: pkc-ext に structure / structure-plan / structure-plan-result を additive 追加(設計 #913 → 実装 #914)。データ最小化(構成はタイトルと階層のみ・本文なし)、readonly 拒否、pending 同時 1 件
- 拡張 window / 別窓を新規 open 時に前面化(#843)

### ④ WCAG アクセシビリティ + テーマ

- 反対テーマで TOC / mermaid / 検索マークが視認不能になる問題を修正(#888)
- mermaid レンダリングに WCAG 同系色 shift(#890)、popup 描画面(Viewer / entry-window)にも既定適用(#891)
- アプリテーマ(--c-* トークン)自体の WCAG balance を **opt-in** 導入 — テーマ単位に事前計算・キャッシュ(#898)
- アクセシビリティ推奨掲示: 乱視ハレーション注意(純黒背景 × 純白文字)+ balance 提案を Flags Inspector に表示(#899)

### ⑤ 編集・レンダリング体験

- 章フォーカス編集(#863)/ text への追記 + 章への差し挟み(#862)/ modifier+click で source line から編集開始(#887)
- textlog ログ行編集の修飾クリックを cross-platform 化(Alt / Ctrl / ⌘、#874)
- context-menu 拡充(#869): 見出し / TOC 右クリック「この章を編集(別ウィンドウ)」(#878)/ TEXT「末尾に追記」(#879)/ SendTo を「送る ▸」折りたたみに集約(#877)
- Split View source↔preview 同期を scroll 写像方式で再構築(#885)→ entry-window popup へ移植(#886)/ 保存・選択後の全消し再描画と二重スクロール解消(#884)
- 表セル内 `<br>` を改行として render(#859)/ 本文埋め込み画像の自動サムネ表示を廃止(frontmatter 指定時のみ、#864)/「○○へ移動」候補リストの安定整列 + ASSETS 除外(#865)
- launcher の lazy-load 起動時に HTML アプリが初回 click で開けない回帰を修正(#882)/ 書式パネルを開くと編集中テキストが消える不具合修正(#837)
- メディア viewer(コードブロック / 画像)をダブルクリック表示化(#901)/ ミニマップ(#909)/ textlog・entry-window の mermaid hydrate 修正(#900 / #910)

### ⑥ 依存・CI・供給網(#687 主権モード)

- **HIGH advisory 2 件解消**: markdown-it 14.2.0 + linkify-it 5.0.1(ReDoS、#875)/ vite 6→8 + esbuild 0.28.1(#880)
- dompurify 3.4.11(#857)/ js-yaml 4.3.0(#881)/ dev 依存 10 件 minor・patch(#892)/ runtime 3 件 + **size budget 5.75 MB** + smoke apt hotfix(#893)
- CI 近代化: checkout v7 / setup-node v6 / cache v6 / **node 24**(#894)+ gitleaks v3 / renovatebot v46(#895)
- **TypeScript 5→6**(#896)/ **eslint 8→10 + flat config**(#897)

### ⑦ ドキュメント・方針

- bundle 機能 subtract の撤回を記録(2026-07-01 user 判断: mermaid / Office export / chart.js は keep・強化対象、#883)
- OKF(Open Knowledge Format)相互運用の設計 doc(設計のみ・実装凍結、#839)
- ユーザーマニュアルへ 2026-07 着地分を一括反映 + manual HTML 再生成(#915)
- storage / container 切替の doc・delete smoke・manual 追記(#850)

## Bundle / test

- bundle.js ≈ 5.85 MB(size budget 5.75 MB は gzip 換算で管理 — #893 の budget 定義参照)、dist/pkc2.html ≈ 2.7 MB(gzip+base64)
- vitest 593 files / 10,400+ tests green。Smoke Tier-A(PR gate)+ Tier-B(nightly)構成は継続

## Backward compatibility

- schema 1 のまま。既存 container は無変更で読める
- pkc-ext チャネルへの追加(structure 系 / #830 write 語彙)はすべて additive — 旧拡張はそのまま動く
- **唯一の留意 = 差分保存(opt-in・既定 OFF)**: ON で保存したストレージを本機能を知らない旧ビルドで開くと entries が空に見える(データは残存。新ビルドで開けば戻る)。旧ビルドへ戻す前に OFF で一度保存するか export すること

## Known Limitations

- 差分保存は opt-in(既定 OFF)。ON のまま旧ビルドで開くと entries が空に見える(上記 Backward compatibility 参照)
- ミニマップは既定 OFF(`shell.minimap_enabled` で有効化。既定 ON 化は実機評価待ち)
- アプリテーマの WCAG balance は opt-in(ON は「テーマ色をそのまま受け入れない」宣言のため既定 OFF)
- ローカルフォルダ(FSA)backend は Chromium 系のみ。フォルダの許可はセッションごとに切れることがあり再許可が要る
- 表エクスポートの xlsx ネイティブ出力は見送り(exceljs 同梱は size budget 超過。TSV 貼付 + BOM 付き CSV で代替)
- AI 整理プラン連携はホスト側チャネルのみ提供 — AI を載せた拡張本体(PKC2-Extensions 側)は別途必要
- OKF 相互運用 / render-service の全面開放など L3 設計 doc 群は設計のみ(実装は凍結、user go 待ち)
