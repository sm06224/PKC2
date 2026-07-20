# 洗練度リサーチ 2026-07(UX 導線 / もっさり / I/O / スクロール / メモリ)

user 指示(2026-07-20):「今の機能で洗練化できるところを探索して。導線不足・マウス移動量・メモリ・もっさり。コンテナ肥大時の重さはディスク I/O が重いのだと思う(実環境は OneDrive 同期やリアルタイムウイルス保護がある)。スクロールがついてこない不具合も緩和したがまだ発生。徹底的にリサーチして」

**調査のみ・実装なし**。5 軸(I/O / スクロール / レンダリング / メモリ / UX)で棚卸しし、§6 の優先度付きバックログに集約した。着手は user の優先度判断を待つ。

## §1 ストレージ I/O — 仮説検証:肥大 container の重さはディスク書込量

**user 仮説はほぼ的中。しかも増幅要因が 2 つ重なっている。**

1. **inline 保存の write amplification**: 既定の `save()` は編集 1 回(debounce 300ms)ごとに container 全体 JSON を書き直す。5000 entries ≈ 4MB/回。todo チェック 1 つでも 4MB。
   - 差分保存(`persistence.differential_save`、opt-in)で O(1) 化済み(実測 13.5ms→1.4ms、`differential-save-benchmark-2026-07.md`)
2. **🔴 最重要発見 — 保存のたびに常駐 asset を全 put し直す**: `idb-store.ts putAssets()` は `container.assets`(= working-set、**最大 48MB 常駐**)の**全 key を毎回 put** する(additive-only 設計の「冪等だから無害」という前提)。クリーン環境では無害でも(IDB 100×100KB=10MB put ≈ 72ms)、書込バイト数がそのまま実環境の増幅対象になる。**画像を閲覧した直後は、無関係な 1 編集で最大 48MB の書込**が走る。差分保存 ON でも `saveDiff` は同じ `putAssets` を通るため未解決。
3. **実環境の増幅係数**: Windows のリアルタイムウイルス保護は書込バイト数に概ね比例して介入する(2〜10 倍相当)。OneDrive はブラウザプロファイル(IDB/OPFS)を同期しないため通常は無関係だが、**FSA モードで OneDrive 配下フォルダを選ぶと「保存ごとに per-record ファイル書込 → AV スキャン → OneDrive アップロード」の最悪経路**になる(fs-directory-adapter は per-record file。`storage-backend-benchmark-2026-07.md` §1b で clean 環境でも IDB の 5 倍)。

**対策候補(効果順)**:
- **asset dirty-tracking**(未実装・本丸): 保存時に「新規 / 変更 asset だけ」put する。hydrate 済み(= store 由来)は clean、PASTE / import / 録音由来だけ dirty。定常保存の asset 書込が 48MB → 0 になる
- **差分保存の既定 ON**(判断材料提示済み)または「大規模 container + flag OFF」検出時の一回きり案内 toast
- FSA + クラウド同期フォルダの組合せに対する manual の注意書き(IDB/OPFS 推奨、同期は export で)

## §2 スクロールがついてこない — 残存する構造原因

現行の緩和(2026-06-13: スクロール中は hydrate を凍結、静定 160ms 後に flush。`textlog-hydrator.ts`)は「つまみだけ動いて視界が進まない」空回りを止めたが、**根本のジオメトリ不安定が残っている**:

- placeholder は固定 min-height 160px、実体 article は数十〜数千 px。flush のたびに総高さとつまみ位置が跳ねる
- 連続スクロール中は hydrate ゼロ = **止まるまで中身が白い**(「ついてこない」の現在の主成分)
- full re-render の scroll 復元(render-continuity)も placeholder 高さ基準なので位置ドリフトする

**対策候補**:
1. **実高さ memo**(本命・小工事): 一度 hydrate した article の実高さを logId → px で記憶し、以後の placeholder min-height に使う。ジオメトリが安定し、flush してもつまみが跳ねない。scroll 復元の精度も上がる
2. `overflow-anchor: none` + 自前の位置補正(anchoring との綱引きを止める)
3. **`content-visibility: auto` + `contain-intrinsic-size` 実験**(中工事): ブラウザネイティブの遅延描画に置換できれば、スクロール中も同期的に描画されカスタム hydrator の大半が不要になる。perf flag で A/B

## §3 レンダリング「もっさり」(scope 制御は 7 段階局所化済み、残りは以下)

| # | 課題 | 箇所 | 影響 |
|---|---|---|---|
| 高 | **sidebar click → SELECT_ENTRY を 250ms 遅延**(dblclick 検出窓) | action-binder.ts:1911-1922 | 全ナビゲーションが「ワンテンポ遅い」直接原因の筆頭。center/meta click は即時なので左ペインだけ遅い |
| 高 | tree 行が memo 対象外(flat 行は memo 済) | renderer.ts:5258-5307 | c-5000 で毎 full render 60-67ms |
| 高 | 検索キーストロークの sublocation 全文 scan | renderer.ts:4881 | c-5000 で p50 130ms/键 |
| 高 | render coalescing 不在(dispatch = 即 render) | dispatcher.ts:101-107 | 連射 dispatch で render 重畳 |
| 高 | calendar 月送りが full scope + 全 entry walk | render-scope.ts:225 / groupTodosByDate | 月送りごとに sidebar 全再構築 |
| 中 | `entries.some` 系の未 memo O(N) が full render に散在 | renderer.ts:1563 他 6 箇所 | filter-cache へ集約可 |
| 中 | meta pane が選択ごとに全再構築 | renderer.ts:8537 | c-5000 select で 88ms |
| 中 | full 後段の DOM 全走査(preview populate / WCAG / continuity) | main.ts:335-386 | ノード数比例 |
| 中 | split preview 500ms debounce | action-binder.ts:9432 | 意図的だが体感遅延。adaptive 化余地 |
| 低 | **list virtualization 未着手(最大の残レバレッジ)** | retrospective §8 | c-5000 dispatch 408→~50ms 見込み。大工事 |

## §4 メモリ — 概ね健全(#868 で解決済み)

- working-set budget 48MB + LRU evict、未永続 bytes は evict しない安全不変条件。実測: 143-150MB 参照のワークスペースでも boot 後 JS heap ≈ 9MB(memory-footprint bench)
- blob URL 解放は scope ごとに網羅済み、明確なリークなし
- 残り(#868 段階4 未着手、実害は表示の過小のみ): storage-profile / orphan count / dedupe 検出が working-set 部分集合基準

## §5 UX 洗練度(導線不足・マウス移動量)— 構造的欠落 3 つ + 個別 20 件

**横断所見(この 3 つで個別課題の過半が解ける)**:

1. **touch 対応の構造的欠落**: hover-reveal(`opacity:0` → `:hover`)が共通パターンなのに `@media (hover:none)` フォールバックが **CSS 全体で 0 件**。launcher の ⓘ/🏷/📌、コード copy、カレンダー日別「+」、textlog ログ編集、タイル DnD 並び替え——touch では全滅
2. **哲学と実装の乖離**: 「モーダルにしない」方針(toast.ts)を掲げつつ、native `prompt`×5 / `confirm`×15+ / `alert`×5 が残存。しかも英語・日本語が箇所によりバラバラ(例: "Delete this entry?" vs 日本語 toast)
3. **universal 右クリック menu が眠っている**: 実装済み(pgc-83/84)なのに default OFF、object 種別も selection/link/image/table/heading のみ。launcher tile・添付・エントリ行を認識しないため、hover-only 操作の代替導線として機能していない

**個別課題(抜粋・優先順)**: 🏷グループ / +URL タイルの prompt 2 連発 → インラインフォーム化 / 添付リネーム prompt(英語)/ 保存検索 prompt(英語・quick-save と二重系統)/ リレーション作成が右端 3 widget + lazy select で初回空 / view 切替に keyboard なし(Ctrl+1..5 未割当)/ タブ機能が flag 裏で発見不能 / 新規作成 popover の 1 クリック過剰 / 未登録 HTML の復旧 📌 が hover-only / DnD 一本化で touch・keyboard の並び替え不能 / graph 小規模時の空ガイドなし / spreadsheet の alert 4 箇所 / popup blocked が alert / Inventory filter 行の重複(既知 U1)/ Entry Window にショートカットヘルプなし。

## §6 優先度付き改善バックログ(提案)

| # | 施策 | 軸 | 効果 | 工数感 |
|---|---|---|---|---|
| R1 | **asset dirty-tracking**(保存時、未変更 asset を再 put しない) | I/O | 定常保存の書込 最大 48MB→0。実環境(AV)の体感に直結 | 中 |
| R2 | **sidebar click の 250ms 遅延解消**(leading-edge select + dblclick 打消し) | もっさり | 全ナビの体感即応化 | 小 |
| R3 | **textlog placeholder の実高さ memo**(+ overflow-anchor 制御) | スクロール | ジオメトリ安定・つまみ跳ね解消 | 小-中 |
| R4 | **universal context menu 既定 ON + tile/添付/行の object 化** | UX | hover-only の代替導線が全面に立つ | 中 |
| R5 | **`@media (pointer:coarse)` で hover-reveal 常時表示** | UX | touch 全滅の解消(CSS 主体) | 小 |
| R6 | **差分保存の既定 ON**(または大規模時の一回きり案内) | I/O | container 書込 O(1) 化 | 判断のみ/小 |
| R7 | prompt/confirm/alert の撤去(インラインフォーム + toast、言語統一) | UX | 洗練度の底上げ。launcher 系(🏷/+URL/rename)から着手 | 中 |
| R8 | calendar 局所 scope + todo→date memo | もっさり | 月送りの full 再構築排除 | 小 |
| R9 | 検索 sublocation scan の可視件数限定 / tree 行 memo | もっさり | c-5000 検索・render の残コスト | 中 |
| R10 | view 切替 Ctrl+1..5 + タブ機能の設定メニュー昇格 | UX | 発見可能性 | 小 |
| R11 | render coalescing(microtask 集約) | もっさり | 連射 dispatch 耐性 | 中(test 影響) |
| R12 | `content-visibility: auto` 実験(flag) | スクロール | hydrator 簡素化の可能性 | 中 |
| R13 | list virtualization | もっさり | 最大レバレッジ(408→~50ms)だが大工事・a11y 注意 | 大 |
| R14 | リレーション作成の導線再設計(drag 関連付け / palette 1 アクション) | UX | 高頻度操作の多段解消 | 中 |
| R15 | FSA×クラウド同期フォルダの注意を manual へ | I/O | 事故予防(doc のみ) | 極小 |

**推奨着手順**: R1+R2+R3(実環境の重さ・体感遅延・スクロールの「三大不満」を最小工数で直撃)→ R4+R5(touch と導線の構造修理)→ R6(user 判断)→ 以降は評価しながら。

## §7 参照

- `differential-save-benchmark-2026-07.md` / `storage-backend-benchmark-2026-07.md`(実測値)
- `lazy-asset-working-set-plan.md`(#868 メモリ設計と残項目)
- `archived/singletons/perf-wave-pr176-pr193-retrospective.md` §8(virtualization / coalescing の保留判断)
- `wave-10-6-ux-evaluation-2026-05.md`(U1-U3 既知 UX 残項目)
- `src/adapter/platform/idb-store.ts` `putAssets`(§1-2 の根拠)/ `src/adapter/ui/textlog-hydrator.ts`(§2)
