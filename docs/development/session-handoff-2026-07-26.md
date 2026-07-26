# セッション引き継ぎ — 2026-07-26(ストレージ性能:実測で削り、実測で棄却した日)

前セッション(2026-07-25〜26)の状態・成果・棄却案・宿題の申し送り。
次セッションは CLAUDE.md → `v3-consolidation-and-direction-2026-06.md` → 本書の順で読む。

## 0. 🔴 最初の仕事 ── **なし。user の指示を待つ**

理由:

- 本セッションの作業は **#1020〜#1033 まで全て main に着地済み**。自分の open PR は 0 件
- 次に起きる実イベントは **user の実機移行**(「明日の 8 時には自分のデスクでこの新しい
  PKC2 に移行を済ませたい」user 表明 2026-07-26)。そこで出る**体感**が次の入力になる
- 宿題(§4)はあるが、**どれも user の指示なしに着工しない**

⚠ §4 は宿題の一覧であって**指示ではない**。「残件表を見て勝手に着工」しないこと。

## 1. 現在の状態

```
main の HEAD     : c4a6850f docs(skill): セッション引き継ぎをスキル化する (#1033)
自分の open PR   : 無し
他者の open PR   : #1007 dependabot(dompurify 3.4.11 → 3.4.12、未処理)
                   #760  2026-06 の DEV rollup(凍結中・触らない)
予約(send_later) : 無し(本日分は全て発火済みで disabled。新規の予約は残していない)
作業 branch      : claude/pkc2-dev-handoff-3ao41y(main から作り直し済み)
```

## 2. 着地したもの(全て main、実測値つき)

### 2-a. 書込量

| PR | 何を | 実測 |
|---|---|---|
| #1020 | `getRevisionCount` の O(N×M) を索引化 | boot 27,201 → **936 ms**(15000 entries / 45000 revisions / 76MB) |
| #1021 | 選択のたびにコンテナ全体を保存していたのを止めた | 選択 5,104 → **0 KB** / 編集 10,213 → 5,106 KB(半減) |
| #1022 | relations / order を core record から sidecar へ出した | 差分保存 1 編集 1,270 → **11 KB**(115 倍) |
| #1024 | 起動しただけでコンテナ全体を書いていたのを止めた | boot 書込 25,685 → **0 KB** |

⚠ **#1020 の PR 本文にある「27.2 秒 → 3.1 秒(8.7 倍)」は別ハーネス同士の比較だった。**
同一ハーネス(`tests/bench/storage-write-io.mjs`)で測り直した値が上表の 936 ms。
`docs/development/boot-cost-profile-2026-07-25.md` §訂正 に経緯を残してある。

### 2-b. 体感(メインスレッド停止)

| PR | 何を | 実測(N=5000 / M=15000、1 編集あたり) |
|---|---|---|
| #1030 | 編集の開始・終了でサイドバー全行を作り直さない | 保存なし腕 686 → **446 / 394 ms** |
| #1031 | 行 memo を container 参照でなく**派生値の指紋**で捨てる | 確定 749 → **531 ms**(Script 195 → 157 ms) |

⚠ **#1030 の PR 本文にある「保存は体感に効いていない(−16 ms)」は単発走行の noise。**
同一計器で腕を交互に測り直すと確定 − 取消 = 381 ms。#1031 で訂正済み。

### 2-c. データ消失経路(監査が挙げた S1〜S4 を全て閉じた)

| PR | 何が起きていたか |
|---|---|
| #1023 | **S1** バックアップ ZIP から添付が丸ごと落ちる ── 本文より先に asset を集めていた |
| #1025 | **S4** rev segment の復号に失敗すると、生きている segment を空で上書きしていた |
| #1027 | **S3** `save()` が pending の本文を「空」として inline 化しうる経路を塞いだ |
| #1028 | **S2** 読めなかった本文を「空の本文」として確定させない(再試行 2 回で unreadable 隔離) |

### 2-d. 測れていなかった次元を測れるようにした

`tests/bench/` に計器を追加 ── `save-write-volume.mjs`(IDB の put を直接計測)/
`storage-write-io.mjs`(/proc/diskstats)/ `storage-footprint.mjs`(生存データ vs quota)/
`gzip-core-record-cost.mjs` / `edit-main-thread-block.mjs`(long task)/
`sidebar-reuse-dom-check.mjs`。fixture generator に `--deleted=<N>`(ゴミ箱の次元)。

使い分けは `.claude/skills/perf-measurement/SKILL.md`(`/measure`)が正本。

## 3. 🔴 やらないと決めたこと ── **再発明しない**

| 案 | なぜ止めたか(全て実測) |
|---|---|
| ❌ **core record 丸ごと gzip** | サイズは 25,668 → 3,578 KB(**7.2 倍**)で最も筋が良く見える。しかし gzip が **1,193 ms / 編集**。debounce 300ms の裏で走るため、編集のたびに 1 秒超メインスレッドを塞ぐ |
| ❌ **revision の snapshot 分離** | 静的分解では core record の **66.7%**(17,132 KB)。だが実際に買えるのは **20 ms**(`structuredClone` 全体が 74 ms、revisions を事前直列化しても 54 ms) |
| ❌ **差分保存(`persistence.differential_save`)の既定 ON** | **boot が 423 → 2,532 ms(5.5 倍)**。同条件 2 回で再現 |
| ❌ **layout 5(`persistence.lazy_entry_bodies`)の既定 ON** | 効果が少なくリスクが多い。§5 の user 裁定で**退役**した |

⚠ この 4 件は「まだ試していない案」ではなく「**測って否定した案**」。
静的分解の数字だけ見ると全部魅力的に見えるので、**再提案する前に必ず本節を読む**。
判断の経緯は `docs/development/storage-default-layout-decision-2026-07-26.md`。

## 4. まだ測っていないこと(宿題。棄却ではない)

「測って効かないと分かった」(§3)と混ぜないこと。以下は**未測定**。

- 修正後の書込量を**規模掃引**で確認する(N=1000 / 5000 / 15000。既存計測は 5000 中心)
- **削除済み entry を含む継続編集**。boot への影響は #1029 で「効かない」と確認済みだが、
  **保存側は未確認**
- #1031 後も確定に残る **531 ms の内訳**。Script 157 ms 以外がどこか(Layout / Style が
  支配的でないところまでは分かっている = 仮想化の領域ではない)
- lazy_entry_bodies を有効にしていた実データの**移行実績**(§5 の 3 ヶ月観測)

## 5. user 裁定(出典タグ付き = 不可侵)

- **`persistence.lazy_entry_bodies` は退役。3 ヶ月後に廃止**(user 裁定 2026-07-26)。
  「まずは導線の封鎖と戻し道をつけてください」「3 ヶ月の間にユーザーが一度でも上書き
  すれば、安全な道に戻る」── #1027 で `retired` として実装。UI から消え、URL でも
  container の `__flags__` でも有効化できない。**定義と読み取り経路は残す**(既存データを
  読めなくしないため)
- **機能 subtract は撤回**(user 判断 2026-07-01)。mermaid / Office export / chart.js は
  keep・むしろ強化対象。削減候補として蒸し返さない
- **性能改善から逃げない**(user 指示 2026-07-26)。「過去の実測に引っ張られたり、過去の
  資産に引っ張られて変更をしない実装を考えないなんていう結論に逃げ込むことは許さない」
  ── ただし §3 は逃げではなく、**測ったうえでの棄却**である
- **CI 待ちは 1 回の予約で。ポーリングしない**(user 指摘 2026-07-26「なんか同じところ
  ぐるぐるしてない?」)。手順は `.claude/skills/merge-on-green/SKILL.md`
- **`.claude更新` が資産更新の合図**(user 指示 2026-07-26)
- **セッション引き継ぎは専用 PR を作り、その URL を渡して完成**(user 指示 2026-07-26)

## 6. 踏んだ罠 → 資産化した先(**本書では再説明しない**)

罠は `.claude` が正本。本書はポインタに徹する(重複させると乖離の元になる)。

| 罠 | 書いた先 |
|---|---|
| 「量が多い」と「体感が悪い」は別の主張 / 単発走行で結論を出さない / 内訳は `Performance.getMetrics` で割る / 静的分解だけで採用しない / **ハーネスの ⚠ ⛔ を自分の grep で捨てない** | `.claude/skills/perf-measurement/SKILL.md` 罠 ⑦〜⑪ |
| 生成物の `.gitignore` は接頭辞まで書く(25MB を commit しかけた)/ src 未変更なら dist を commit しない | `.claude/skills/merge-on-green/SKILL.md` |
| flag を畳むときの作法(`retired` / UI を消すだけでは足りない / 定義は消さない / 戻し道の安全性を先に確かめる) | `CLAUDE.md` |
| 知見を資産へ反映する手順そのもの | `.claude/skills/knowledge-reflection/SKILL.md` |
| セッション引き継ぎの手順そのもの | `.claude/skills/session-handoff/SKILL.md` |

## 7. 次セッションへ

1. まず「現在の状態」(§1)を `git fetch --prune origin main` で照合する
   ── 本書を書いた後に main が動いている可能性がある
2. **最初の仕事は「なし」**(§0)。user の指示を待つ
3. `CLAUDE.md` と `.claude/skills/` を読む(規律はそちらが正本。本書は現況のみ)
4. 性能の話が出たら、**まず §3 を読む**。棄却済みの案を再提案しない

## 8. 申し送りプロンプト(新セッションの最初の指示に貼る)

```
PKC2 の開発を前セッションから引き継ぎます。まず次を順に読んでください:
1. CLAUDE.md(運用方針・プライム・ディレクティブ「機能を足さない」)
2. docs/development/v3-consolidation-and-direction-2026-06.md(方針正本)
3. docs/development/session-handoff-2026-07-26.md(前セッションの状態・棄却案・宿題)

会話ルール(必ず遵守): 出力は日本語 / AskUserQuestion ツール禁止・質問は会話文で /
成果物は GitHub URL(rendered)で提示 / 実装前に設計 doc → 私の裁定 → 実装の順 /
user-facing 変更はお知らせ掲載 + マニュアル反映。

PR 運用: merge は CI 全 green 確認後にあなたが squash merge(.claude/skills/
merge-on-green/SKILL.md の手順。CI 待ちは 1 回の予約で、ポーリングしない)。
branch は claude/… を main から作り直して使う。

最初の仕事は「なし」です。handoff の §3「やらないと決めたこと」を読んだうえで、
現状の要約だけ簡潔に返してください。私が次の指示を出します。
```
