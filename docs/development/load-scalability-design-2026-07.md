# 肥大化 load の抜本対策 設計(#940 Part 2、2026-07-21)

user 指示:「コンテナとアセットのロードが肥大化により遅延していく。抜本対策をしたい。**マイグレーションする可能性も含めて検討**して欲しい」

**設計検討 doc(実装なし)**。現状分析 → 選択肢 → 段階移行プラン → 判断材料の順。実装 go は user 判断。

## §1 現状の load 構造と、何が肥大で伸びるか

| 層 | 現状 | スケール特性 |
|---|---|---|
| asset bytes | **#868 で解決済み**: boot は shallow(assets={})、working-set が可視分だけ hydrate(budget 48MB・LRU)。書込側も R1(#938)で dirty-tracking 済み | boot コストは asset 総量に**依存しない**。残るのは選択時 hydrate の pop-in(prefetch 精度の問題、小) |
| container record | **boot で entries / relations / revisions を全件読む**。inline 形式 = 1 巨大 record の structured clone + JSON(5000 entries ≈ 4.3MB)。split 形式(差分保存)= per-entry record の全件 range scan | **O(全 entry バイト数)**。本文の厚い textlog / text が支配。10MB 級 container で boot の storage read + parse が数百 ms〜、実環境(AV・コールドキャッシュ)でさらに増幅 |
| メモリ | 全 entry body が JS heap に常駐 | O(全 entry バイト数)。renderer の O(n) walk(検索 / sidebar / kanban)も同じ母数で伸びる |

**結論: 次のボトルネックは「entry body の全量 boot ロード」**。asset で解決したのと同型の問題が entries に残っている。

## §2 選択肢

### 案 A: entry meta / body 分離 + body 遅延ロード(本命・抜本)

storage layout v2: per-entry record を **meta**(lid / title / archetype / dates / color / flags 等、~数百 B)と **body**(本文)に分離。boot は meta 全件 + relations だけ読む(5000 entries でも ~1MB 未満)。body は選択・描画・検索が要求した分だけ hydrate(#868 working-set と同じ manager パターン、eviction 付き)。

- **効く場所**: boot 時間(O(meta) 化)、メモリ(body working-set 化)、renderer の filter/一覧系は meta で完結
- **難所**: `entry.body` を同期参照するコードが広範(検索 sublocation / todo parse / kanban / export)。対策は 2 段:
  - **検索・派生 index**: 既存 `mountAssetMetaIndex`(段階4)と同じ「persisted 派生 index」を body にも持つ(検索用トークン / todo status / task 数)。index が無い初回は idle で backfill
  - **export / 全文操作**: 既存の「export 前に全件 hydrate」(registerExportStore)と同じ barrier を流用
- **規模感**: 大(#868 の 段階1〜5 に相当する wave)

### 案 B: 差分保存(split)既定 ON + boot の段階復元(中間・低リスク)

R6(既定 ON 判断)+ split 形式の range scan を「先頭 N 件 + 残りは idle で復元」に段階化。UI は先に出るが、**全件揃うまで検索・kanban が不完全**になる窓が生じるため、正しさの扱いが難しい。案 A の下位互換であり、単独採用は勧めない。

### 案 C: 運用分割(アーカイブ container)+ 移送 tooling(補完・小)

年次 / プロジェクト単位で container を分け、既存の workspace / container switcher に「アーカイブへ移送」導線を足す。抜本ではないが、案 A 完了後も併用価値がある(1 container を無限に太らせない運用)。

### 案 D: OPFS per-file layout(L3 North Star との合流・大)

案 A の layout v2 を OPFS の per-entry file として実装(#771 の設計と合流)。案 A の schema 設計を backend 非依存(StorageAdapter の上)にしておけば、D は A の自然な延長になる ── **A を D の前提として設計する**のが正しい順序。

## §3 マイグレーション設計(案 A 前提)

- **layout marker**: container core record に `__pkc_layout__: 2` を追加(差分保存の `__pkc_split__` marker と同じ手法)。unaware の旧ビルドから v2 storage を開くと entries が見えない ── **差分保存 opt-in と同一の互換性注意**であり、同じ説明・同じ「OFF 保存で v1 に書き戻す」双方向経路を用意する
- **前方移行**: boot で v1 検出 → 通常 boot 後、idle で background migrate(meta/body 分離書込 → marker 立て)。中断安全(marker は最後)
- **後方移行**: flag OFF → 次回保存で inline v1 へ書き戻し(差分保存の inline 復帰と同じ収束設計)
- **export 形式は不変**(単一 HTML への埋め込みは full container のまま)── 互換リスクは「旧ビルドで storage を直接開く」ケースに限定される
- **展開順**: flag opt-in(`persistence.lazy_entry_bodies`)→ 実測 → 既定 ON 判断、の 3 段(差分保存と同じ運び)

## §4 判断材料と推奨

- 実測(現状): c-5000(4.3MB)boot ~0.6s、storage read は数十 ms — **クリーン環境では体感差が小さい**。伸びて見えるのは (a) 本文の厚い実データ(bench の 800 chars/entry より大きい)、(b) 実環境の AV / コールドキャッシュ、(c) R1 以前の保存 I/O(解決済み)
- よって推奨順:
  1. **R6: 差分保存既定 ON(即決可能)** — 書込 O(1) 化 + split 形式が正になり案 A の土台になる
  2. **実データでの計測**: user 実機の container サイズ(entries 数 / 本文バイト / boot 秒数)を Storage Profile から確認(必要なら計測表示を 1 行足す)。**4MB 未満なら案 A の緊急度は低い**
  3. **案 A を wave 化して着手**(#868 の実績パターン踏襲: 段階1 meta/body 分離書込 → 段階2 boot meta-first → 段階3 body working-set → 段階4 検索 index → 段階5 bench)── 実装 go は user 判断
  4. 案 C(アーカイブ移送)は案 A と独立に小さく足せる

## §5 参照

- `refinement-research-2026-07.md` §1(I/O 分析)/ `lazy-asset-working-set-plan.md`(#868、流用するパターンの正本)
- `differential-save-2026-07.md`(marker / 双方向復帰 / opt-in 運びの前例)
- Part 1(FSA 再接続)は #940 で実装済み ── 本 doc とは独立
