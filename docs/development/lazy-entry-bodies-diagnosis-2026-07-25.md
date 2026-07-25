# `persistence.lazy_entry_bodies` 既定 ON 可否の診察(2026-07-25)

> user の問い(2026-07-25):「`persistence.lazy_entry_bodies` は既定オンにしたほうがいいの?
> そこらへんのパフォーマンステストやったっけ? 試しに診察してみてよ」

**結論: 既定 ON にしてはいけない。いま ON にしても何も起きないか、起きたときは
安全策(移行前バックアップ ZIP)が外れた状態で切り替わる。**

判断の根拠は 3 つ。以下、順に証拠を置く。

| # | 所見 | 重さ |
|---|---|---|
| 1 | **この flag は単独では完全な no-op**。`lazyBodies()` は `saveDiff` の中でしか読まれず、`differential_save` が既定 OFF なので `save()`(inline)しか呼ばれない | 🔴 前提が崩れている |
| 2 | **この flag の性能テストは一度も存在しない**。handoff doc の「cold 11s → 16ms 級」は**別物の計測**(300MB asset の base64 vs Blob プロトタイプ) | 🔴 判断材料が無い |
| 3 | **既定 ON にすると移行前バックアップ ZIP ゲートが一度も発火しない**。ゲートは `FLAGS_CHANGED` の OFF→ON エッジ専用で、既定値には反応しない | 🔴 安全策が外れる |

加えて、実測しても **boot が速くなる証拠は出なかった**(§2)。

---

## 1. flag 単独では storage 形式が一切変わらない

読まれる場所は 1 箇所しかない。

```
src/adapter/platform/idb-store.ts:603   const lazyBodies = opts?.lazyEntryBodies ?? (() => lazyEntryBodiesEnabled());
src/adapter/platform/idb-store.ts:720     const wantSplitBodies = lazyBodies();   ← saveDiff() の中
```

`lazyBodies` closure の参照は 720 行の 1 箇所だけで、その 720 行は `saveDiff()` の
本体にある。そして呼び出し側は:

```
src/adapter/platform/persistence.ts:258   if (differentialSaveEnabled()) {
                                    260     await store.saveDiff(container, prev);
                                    264   } else {
                                    265     await store.save(container);      ← 既定はこちら
                                          }
src/adapter/platform/persistence.ts:117   differential_save の既定 = false(#958 で ON から撤回)
```

つまり **`lazy_entry_bodies` は `differential_save` が ON のときだけ意味を持つ**。
差分保存は 2026-07-22 に既定 ON へ昇格した当日、user 実機報告(#958)で撤回され、
以後 OFF のまま。したがって現状の既定環境で lazy だけを ON にしても、

- 保存経路は `save()`(inline 全件書込み)のまま
- storage layout は 1 のまま、segments bucket は空のまま
- boot の読み方も変わらない

**「lazy を既定 ON」は、実質「差分保存も一緒に既定 ON」を意味する。**
差分保存の既定 ON は実機で撤回済みなので、この提案は撤回済みの判断を
裏口から通すことになる。

実測でもそのとおりだった(§2 の B 腕)。

## 2. 実測 ── 診察スキルで実データを積んで起動した

計測スペック: `.claude/skills/shinsatsu/specs/02-lazy-entry-bodies.visual.js`
(実 Chromium / CDP 直結。boot 所要はハーネスの wall clock ではなく、
`window.PKC.bootReady` の resolve 時刻をページ内 `performance.now()` で取る)

3 腕を比べた。各腕は **その flag で 1 回保存して layout を変換してから** 測る。

| 腕 | flags | 保存後の storage |
|---|---|---|
| A | 両方 OFF(現行の既定) | layout **1** / segments 0 / core 内 entries 1001(本文あり 951) |
| B | lazy だけ ON | layout **1**(A から変化なし)/ segments 0 ← **§1 の裏取り** |
| C | lazy + differential_save | layout **5** / segments 3 / core 内 **本文あり 0** |

**B は対照群である。** storage が A と完全に同一なのだから、B と A の boot 差は
「本来 0 であるはずの差」= この測定のノイズ床そのもの。C を A と比べるだけでは
速い遅いを語る資格が無い。

### 結果(boot 中央値、warmup 2 回を捨てて 9 回の中央値)

| fixture | A 既定 | B lazy だけ(対照群) | C 両方 ON |
|---|---|---|---|
| 1000 エントリ | 357 ms | 323 ms(**-9.6%**) | 344 ms(-3.7%) |
| 5000 エントリ・1 回目 | 620 ms | 604 ms(**-2.6%**) | 740 ms(+19.2%) |
| 5000 エントリ・2 回目 | 812 ms | 688 ms(**-15.3%**) | 623 ms(-23.2%) |

読み方:

- **1000 件**: C の -3.7% は、ノイズ床(B の -9.6%)より小さい。**差は無い**
- **5000 件**: 同じ条件で 2 回まわしたら **C の符号が逆転した**(+19.2% ↔ -23.2%)。
  しかも対照群 B 自体が -2.6% ↔ -15.3% と振れている。**この手法では効果を分離できない**

したがって **1000 / 5000 エントリ規模では boot の改善は実証されていない**。
「遅くなる」と断定するのも同様にできない。**わかったのは「わからない」ということ**で、
既定を変える根拠としては不足している。

### 併せて確認できた良い所見(ON にしても壊れてはいない)

- ✅ ON でもサイドバー全件が描画される
- ✅ ON でも本文が読める(layout 5 で core 内の本文が 0 でも、開けば segments から復元される)
- ✅ layout 1 ⇄ 5 の往復で container が壊れない

つまり **「危ないから OFF」ではなく「効くと言える証拠がまだ無いから OFF」**。

## 3. 「パフォーマンステストやったっけ?」への答え ── やっていない

- `tests/bench/` 配下に `lazy_entry_bodies` / `lazyEntryBodies` を触るベンチは **1 件も無い**
  (`differential-save.bench.ts` はあるが差分保存側)
- handoff doc の「P2 セグメントログ … **実測: cold 11s → 16ms 級**」
  (`session-handoff-2026-07-24.md:12`)は、`storage-v3-architecture-2026-07.md:172`
  の表を引いたもの。その表は **`tests/bench/storage-arch-bench/`(300MB・asset 中心)で
  「単一 JSON + base64 asset」対「IDB + Blob」を比べたプロトタイプ計測**であって、
  **本番コード経路の `lazy_entry_bodies` を測ったものではない**

数字自体は正しい計測だが、**別の質問に対する答え**である。この flag の既定 ON 可否は
その表からは導けない。

## 4. 既定 ON にすると安全ゲートが外れる(設計上の副作用)

```
src/adapter/ui/migration-gate.ts:45-53
  if (event.type !== 'FLAGS_CHANGED') return;
  ...
  if (!now || was || running) return;   // OFF→ON の立ち上がりのみ
```

移行前バックアップ ZIP は **flag が OFF から ON に変わったイベント**でしか走らない。
既定を ON にすると、新規・既存を問わず「立ち上がりイベント」が発生しないので、
**ゲートは一度も発火しないまま layout 5 への移行が始まる**。

お知らせにも「切替を ON にすると切替前に完全なバックアップ ZIP を自動生成する」と
掲示済み(`startup-notice.ts:99`)。既定 ON はこの掲示と実挙動を食い違わせる。

既定 ON をやるなら、ゲートを「エッジ検出」から「**実 storage layout と目標 layout の
不一致検出**」へ作り直すのが先。これは別 issue。

## 5. マニュアルの記述が実態と食い違っている(本 PR で修正)

`docs/manual/07_保存と持ち出し.md` の「まず結論」表は、

- 🧪 **実験的だが十分ベスト候補** … `lazy_entry_bodies` をオン → 「起動がほぼ一瞬になります」

と書いていたが、**`differential_save` も同時に ON にしなければ何も起きない**ことに
触れていない。同じ表の別の行では差分保存を「⚠️ 推奨しない」に置いているので、
読者は「推奨しない設定が前提の推奨設定」という不可能な指示を受け取る。

同様に `idb-store.ts` の flag 説明は「案 A 段階1 / storage layout **v2** /
`__body__` record」のままだが、実装は段階 2〜4 まで進んで **layout 5(segments bucket
の gzip パック)** を書く。Flags Inspector に出る説明文が実態と違う。

いずれも本 PR で事実に合わせて直した(自己免疫整備)。

## 6. ついでに見つけた不具合(別 issue 化を推奨・本 PR では直さない)

**layout 5 → OFF 復帰で segments が孤児になる。**

`save()`(inline 復帰)の掃除は `containers` bucket の prefix しか見ていない:

```
src/adapter/platform/idb-store.ts:665-675
  const stale = [
    ...(await containers.getKeysByPrefix(splitEntryPrefix(cid))),
    ...(await containers.getKeysByPrefix(splitRevPrefix(cid))),
    ...(await containers.getKeysByPrefix(bodyPrefix(cid))),
  ];
```

`segments` bucket の掃除はここに無い。segments の削除は
`del()`(コンテナごと削除、`idb-store.ts:1101-1107`)と、
layout 5 の再構築パス(`writeBodySegments` 内 `idb-store.ts:500-503`)にしか無い。
よって **v5 で保存 → flag を OFF に戻す → inline に収束、の経路で segments の
gzip Blob が回収されずに残る**。

- 正しさは壊れない(layout 1 の load は segments を参照しない)
- しかし容量は食い続け、そのコンテナを削除するまで回収されない
- 「双方向に安全」を謳っている以上、片道分のゴミが残るのは仕様の穴

## 推奨

1. **`persistence.lazy_entry_bodies` は既定 OFF のまま据え置く**(本 doc の結論)
2. 既定 ON を将来もう一度検討するなら、順序は
   ① migration-gate をエッジ検出から layout 不一致検出へ作り直す
   → ② segments 孤児の掃除を `save()` に足す
   → ③ **`differential_save` の既定 ON 可否**を先に決める(lazy はその従属変数)
   → ④ ①〜③ が済んでから、user 実環境規模(数百 MB 級)での実測
3. 本 doc の測定手法(対照群を必ず置く)は今後の perf 判断の型として残す。
   **対照群の振れ幅より小さい差を「改善」と呼ばない**

## 参照

- 計測スペック: `.claude/skills/shinsatsu/specs/02-lazy-entry-bodies.visual.js`
- 診察ハーネス: `.claude/skills/shinsatsu/SKILL.md`(#1016)
- 設計正本: [`storage-v3-architecture-2026-07.md`](./storage-v3-architecture-2026-07.md)
- 差分保存の撤回経緯: [`differential-save-benchmark-2026-07.md`](./differential-save-benchmark-2026-07.md) / #958
- 直近申し送り: [`session-handoff-2026-07-24.md`](./session-handoff-2026-07-24.md)
