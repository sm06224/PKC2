# `persistence.lazy_entry_bodies` の処遇 ── 廃止すべきか(2026-07-25)

> ⚠ **2026-07-25 追記(実測による自己訂正)**: 本 doc §5 の問題提起「畳むべきは
> split v1 の書き手ではないか」と §6 で私が推した「一本化する」は、
> **[`storage-write-io-bench-2026-07-25.md`](./storage-write-io-bench-2026-07-25.md) の実測により取り下げる**。
> layout 5 は boot を約 1.8 倍にする(3 回とも再現、A 自身は ±0.6%)ため、
> `differential_save` の一本化先にならない。本 doc の主結論
> 「**flag は畳むが segments 実装は残す**」は変わらないが、
> 「廃止しない」の理由が **user 指示との整合だけでなく実測の利点**
> (使用量 0.6 倍・変換コスト最小)に裏付けられた。§5/§6 を読むときは
> 必ずベンチ doc と併せて読むこと。

> user の追問(2026-07-25):「そもそも廃止した方が良いのでは? あなたの推奨に全て任せます」

前提は診察所見 [`lazy-entry-bodies-diagnosis-2026-07-25.md`](./lazy-entry-bodies-diagnosis-2026-07-25.md)。
本 doc は「では廃止するのか、するなら何をどこまで畳むのか」を、
実地調査(5 本)→ 案の設計(3 本)→ 3 軸判定 → 敵対的検証(3 本)で詰めた記録。

---

## 結論

**「廃止」する ── ただし畳むのは `persistence.lazy_entry_bodies` という
*user 導線としての単独 flag* であって、segments 実装ではない。**

| | 処遇 |
|---|---|
| `persistence.lazy_entry_bodies` flag | **廃止**(Flags Inspector から撤去、マニュアルから撤去) |
| segments(layout 3/4/5)の**読み**経路 | **恒久維持**(不変条件 5) |
| segments の**書き**経路 | **残す** ── ただし到達経路は `differential_save` 1 本に畳む |
| split v1(`__entry__:` per-record)の**書き**経路 | **畳む候補**(#958 の地雷そのもの。§5) |
| 移行ゲート / segments 孤児 | **今日 hotfix**(裁定と無関係に実在する欠陥) |

**user 裁定が要る点が 1 つだけある** ── §6 に分離した。

---

## 1. なぜ「segments ごと廃止」ではないのか ── 3 つの決定打

### 決定打 A: user 出典タグ付き指示と正面衝突する

`storage-v3-redesign-2026-07.md` §A.7:

> user 指示「**ディスク I/O に負荷をかけたくない。ゆるいストリーミング圧縮と
> チャンクパックはスケールのために必須**」

| 方式 | wall | 保存後サイズ | 実ディスク書込 |
|---|---|---|---|
| per-record | 2.4s | 44.6MB | 77.6MB |
| チャンクパック(1MB) | 3.4s | 23.4MB | 24.6MB(1/3.2) |
| **パック + gzip ストリーミング圧縮** | 6.9s | 14.6MB | **15.8MB(1/4.9)** |

→ 同 doc :276-278「**これを v3 の必須構成要素とする**」

CLAUDE.md「資産の自己免疫整備」は **user 出典タグ付き記述を不可侵**とし、
「削除はもちろん、希釈・要約・言い換えによる骨抜きも禁止。変更できるのは
user の明示裁定のみ」と定める。segments はこの指示の唯一の実装であり、
architecture doc の原理③「集約」/ 課題 C3 / C6(履歴 587×)の解も同一実装。代替は無い。

**今回 user が委任したのは「flag を廃止すべきか」であって、
「user 自身が必須と指示した設計原理を製品から外すか」ではない。**

### 決定打 B: 私の「効果の証拠が無い」は軸を取り違えていた

診察 §2 が測ったのは **boot(読み)**。user が必須と指示したのは **書込 I/O**。
segments には後者の実測(1/4.9)がある。**別の軸で測って「効かない」と言っていた。**

「1000/5000 エントリで boot が速くならない」は真だが、
それは「segments に意味が無い」を意味しない。

### 決定打 C: 削除の実利を実測したら微小だった

敵対的検証の 1 本が、最も過激な案(flag + 書き手 + 遅延本文機構をすべて削除、
src -700 行 / tests -570 行)を **実際に worktree へ適用して計測**した:

```
npx tsc --noEmit    → 1 件のみ(未使用 bodyKey)。消せば exit 0
npx eslint src/ tests/ → 0 件
npx vitest run      → 647 files / 10875 passed、落ちたテスト 0
npm run build:bundle → 5,980,160 → 5,972,277 byte(-7.9KB)
```

**bundle -7.9KB = 0.13%。** 依存パッケージは 1 つも減らない
(gzip は native `CompressionStream`、`idb-store.ts:324-345`)。

プライム・ディレクティブの「削る」は**肥大への対処**である。
7.9KB のために user 指示由来の資産を捨てるのは、目的と手段が転倒している。

---

## 2. 検討した 3 案と判定

| 案 | 内容 | 規模 |
|---|---|---|
| **案 1(最大限に削る)** | flag + segments 書き手 + **遅延本文機構(body-working-set / bodiesPending)** まで削除。boot は eager read 一本化 | L(src -700 / tests -570) |
| **案 2(畳まず繋ぐ)** | 廃止しない。`persistence.ts:258` を `differential_save \|\| lazy` の union にして単独 no-op を解消 + ゲート作り直し + 孤児掃除 + ベンチ追加 | M |
| **案 3(スイッチ撤去)** | user 導線を撤去、read は永久保証、writer は test 専用 seam へ降格。孤児掃除を同 PR で必須化 | M |

**3 軸判定**: 後方互換 → 案 3(9/10)/ 保守負債 → 案 1 / 指令整合 → 案 1

**敵対的検証**: 得票トップの案 1 は **3 本中 2 本が論破**(`survives: false`)

| 検証 | 判定 | 決め手 |
|---|---|---|
| データ消失 | **論破** | 案 1 の無 guard `dropSegments` が「読めなかった本文」の `''` を確定させ、直後に唯一の実体を削除する。読み経路は不読・破損・索引 stale を**すべて沈黙で `''` / 欠落に変換**する(`gunzipSegment` は失敗時 null、`loadBodyPack` は `{}`、`loadRevSegments` は skip)。案 1 は保存抑止 `persistence.ts:221-224` を削除するため、部分読み 1 回で本文と履歴が不可逆に消える |
| 実装破綻 | **論破できず** | 上記の実測(tsc / eslint / vitest / build すべて通過) |
| 将来の後悔 | **論破** | 決定打 A。加えて案 1 の「読み手は 1 行も削らない」は事実に反する(`loadDefaultMetaShallow` / `loadBodiesFor` / `loadBodies` は read API で、architecture doc が C2 の解として明記した「meta 単一小レコード 1 read + 需要読み」そのもの) |

案 2 は負債を全部潰せるが、**union 配線 / ゲート作り直し / layout 表示 / ベンチ追加**と
**足す**方向の作業が M 規模。プライム・ディレクティブに逆行する。

⇒ **案 3 の骨格(user 導線を撤去、read は永久)を採り、
案 2 から「孤児掃除」と「ゲート作り直し」を接ぎ木する。**
ただし案 3 の「writer を production から外す」部分は §6 の裁定に係る。

---

## 3. 今日 hotfix すべき欠陥(裁定と無関係・実在する)

### 3-1. 🔴 移行前バックアップ ZIP ゲートが素通りできる

`FLAGS_CHANGED` を emit するのは `SET_FLAG` / `RESET_FLAG` / `RESET_ALL_FLAGS`
(= **Flags Inspector の編集**)だけ(`app-state.ts:2783 / 2794 / 2803`)。

- URL `?pkc-flag=persistence.lazy_entry_bodies=1`
- container `__flags__` にすでに入っている値

はどちらも `primeFlagsFromContainer()` → `setContainerFlagSource()` を直接叩き、
コード自身が「**No reducer dispatch required.**」と書いている(`main.ts:1317-1327`)。

⇒ **この 2 経路ではバックアップ ZIP なしで layout 5 へ移行する。**
`debug-via-url-flag-protocol.md` は user に URL flag を使わせる導線であり、
**診察スペック自身がこの経路を通っていた**。

**直し方**: ゲートを「flag のエッジ検出」ではなく
**「実 storage layout と目標 layout の不一致検出」**にする。
この形なら URL / prime / 将来の既定 ON の 3 経路を同じ 1 箇所で捕まえられる。

### 3-2. segments 孤児

`save()` の掃除(`idb-store.ts:674-686`)も `saveDiff()` の掃除(`:840-850`)も
`containers` bucket の prefix しか見ていない。segments の削除は `del()`(`:1109-1116`)と
layout 5 再構築パス(`:500-503`)にしかない。

⇒ **layout 5 → OFF 収束で gzip Blob(本文・履歴の実体サイズ相当)が回収されない。**

**直し方**: 両方の掃除に segments prefix を足す。ただし **guard 必須** ──
削除は core record 書込みの**後**、かつ `bodyPending` が false のときだけ。
順序を誤ると「唯一の実体を、本文が空で焼き付いた後に消す」= 全損になる
(敵対的検証が案 1 を論破した理由そのもの)。

---

## 4. flag 廃止で実際に消えるもの

| 対象 | file:line |
|---|---|
| flag 定義 | `idb-store.ts:11-36` |
| `lazyBodies` closure | `idb-store.ts:611` |
| 移行ゲート(3-1 で作り直す先に統合) | `migration-gate.ts` 全体 + その test |
| マニュアル 07 の該当節 | `docs/manual/07_保存と持ち出し.md:12 / 318-333` |
| Flags Inspector 一覧の 1 項目 | (registry 由来。個別の記述なし) |

**残すもの**: `reassembleSplit` の layout 2/3/4/5 分岐(`:899-945`)、
`loadBodySegmentsFor`(`:456-480`)、`loadRevSegments`(`:590-602`)、
`gunzipSegment`(`:334-345`)、`bodySegIndexOf` / `loadBodiesFor` / `loadBodies`、
`loadDefaultMetaShallow`、`del()` / `clearAll()` の掃除、`DB_VERSION = 3`、
`segments` object store。

⚠ **`DB_VERSION` は 3 のまま**。上げると旧ビルドが `VersionError` →
`idb-adapter.ts:112` reject → `main.ts:1128-1131` で「ブラウザ保存なし」boot に落ちる。
`deleteObjectStore` は `onupgradeneeded` でしか呼べないので、
**segments store は空のまま残置するのが唯一の後方互換安全策**。「完全な廃止」は原理的に不可能。

---

## 5. 見つかった逆立ち ── 畳むべきは split v1 のほうではないか

`saveDiff` の分岐(`idb-store.ts:728-734`)を追うと:

| 設定 | 書かれる形式 |
|---|---|
| 差分保存 ON + lazy OFF | **split v1**(`__entry__:` / `__rev__:` の per-record) |
| 差分保存 ON + lazy ON | **layout 5**(meta 単一 record + segments) |

そして #958 で差分保存の既定 ON が撤回された理由は
「**split 形式が数千 record の分散読みになって boot が極端に遅い**」── これは
**split v1 の欠陥**であり、layout 5(meta 単一 record)は**まさにその問題を解いた後継**。

⇒ **いま差分保存だけを ON にすると、#958 で刺さった旧形式が書かれる。
それを治した形式は、no-op になっている 2 本目の flag を追加で ON にしないと使えない。**
配線が逆立ちしている。

「削る・選る」に忠実に読むなら、畳むべきは **劣った旧形式(split v1)の書き手**であって、
user 指示由来の後継形式ではない。ただしこれは §6 の裁定に係る。

---

## 6. 🔴 user 裁定が要る 1 点

**`differential_save` ON の保存形式を、split v1(現状)から layout 5 へ一本化するか。**

- **する場合**: flag は 2 本 → 1 本。no-op の組み合わせが消滅。#958 の地雷(split v1 の
  書き手)が製品から消える。segments は差分保存の唯一の形式に昇格し、user 指示とも整合。
  ただし **差分保存 ON の既存環境を layout 5 へ動かす behavior change**であり、
  **layout 5 が #958 の症状を実際に治すかは未測定**
- **しない場合**: 案 3 どおり production は常に従来形式を書き、segments writer は
  test seam に降格。user 導線は消えるが、**production が segments を書かなくなる** ──
  これは §1 決定打 A の user 指示に部分的に抵触する。#967 が OPEN のまま裁定を待っている

**どちらも #967「Storage v3 再設計」(OPEN・user 判断待ち)の領域に入る。**
しかも #967 は user 指示(2026-07-22)由来でありながら、
**裁定される前に P2(#983–#988)の実装だけが先に landed している**という順序の乱れがある。

⇒ **§3 の hotfix 2 件は先に着地させ、§4〜§5 は #967 の裁定に紐づける。**

---

## 参照

- 診察所見: [`lazy-entry-bodies-diagnosis-2026-07-25.md`](./lazy-entry-bodies-diagnosis-2026-07-25.md)
- 設計正本: [`storage-v3-architecture-2026-07.md`](./storage-v3-architecture-2026-07.md)
- user 指示の出典: [`storage-v3-redesign-2026-07.md`](./storage-v3-redesign-2026-07.md) §A.7
- 差分保存の撤回経緯: [`differential-save-benchmark-2026-07.md`](./differential-save-benchmark-2026-07.md) / #958
- flag 撤去の前例: #919(`editor.html_paste_to_markdown`)
